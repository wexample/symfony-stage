// Where things stand on a stage, and how they meet. Pure functions over plain
// boxes, so that a stage, a test or a server-side layout read them alike.

export interface StageBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface StagePoint {
  x: number;
  y: number;
}

// How far down its box each end of a link stands — a port of the box, from
// its top —; an end not given stands in the middle of its edge.
export interface StageLinkAnchors {
  from?: number;
  to?: number;
}

// A value brought to the nearest step of the grid; a grid of 0 or less is no
// grid at all.
export function stageGeometrySnap(value: number, grid: number): number {
  return grid > 0 ? Math.round(value / grid) * grid : value;
}

// The box drawn between two corners, whichever way it was drawn.
export function stageGeometryBoxFromCorners(a: StagePoint, b: StagePoint): StageBox {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}

// Whether two boxes share any room — what a selection rectangle picks.
export function stageGeometryIntersects(a: StageBox, b: StageBox): boolean {
  return a.x < b.x + b.width
    && b.x < a.x + a.width
    && a.y < b.y + b.height
    && b.y < a.y + a.height;
}

// The box holding all the given ones, or null for none.
export function stageGeometryBounds(boxes: StageBox[]): StageBox | null {
  if (!boxes.length) {
    return null;
  }

  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));

  return { x: left, y: top, width: right - left, height: bottom - top };
}

// The path through given points — a route drawn by the page or read from a
// file —, straight from one to the next.
export function stageGeometryPolyline(points: [number, number][]): string {
  return points.map(([x, y], index) => `${index ? 'L' : 'M'} ${x} ${y}`).join(' ');
}

// Where a label of a line through these points stands: the middle of its
// longest stretch, which is where there is room for a word.
export function stageGeometryLabelPoint(points: [number, number][]): StagePoint {
  let best = { x: points[0][0], y: points[0][1] };
  let longest = -1;

  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1];
    const [bx, by] = points[i];
    const length = Math.hypot(bx - ax, by - ay);

    if (length > longest) {
      longest = length;
      best = { x: (ax + bx) / 2, y: (ay + by) / 2 };
    }
  }

  return best;
}

// How long a line through these points is.
export function stageGeometryLength(points: [number, number][]): number {
  return points.slice(1).reduce((sum, [x, y], i) => sum + Math.hypot(x - points[i][0], y - points[i][1]), 0);
}

// The point halfway along a line through these points, by its length: what
// stands between its two ends — a handle on a link, centred between the boxes
// it joins however close they stand.
export function stageGeometryMidPoint(points: [number, number][]): StagePoint {
  const lengths = points.slice(1).map(([x, y], i) => Math.hypot(x - points[i][0], y - points[i][1]));
  let left = stageGeometryLength(points) / 2;

  for (let i = 0; i < lengths.length; i++) {
    if (left <= lengths[i] && lengths[i] > 0) {
      const ratio = left / lengths[i];

      return {
        x: points[i][0] + (points[i + 1][0] - points[i][0]) * ratio,
        y: points[i][1] + (points[i + 1][1] - points[i][1]) * ratio,
      };
    }

    left -= lengths[i];
  }

  return { x: points[0][0], y: points[0][1] };
}

// The path of a link read left to right — a step leading to the next, as on
// a timeline: out of the right edge of one box, into the left edge of the
// other, bent so that it leaves and arrives level. Going backwards, it loops
// round rather than cutting through the boxes.
export function stageGeometryLinkPath(from: StageBox, to: StageBox, anchors: StageLinkAnchors = {}): string {
  const [start, end] = stageGeometryLinkEnds(from, to, anchors);
  const reach = Math.max(Math.abs(end.x - start.x) / 2, 40);

  return `M ${start.x} ${start.y} C ${start.x + reach} ${start.y}, ${end.x - reach} ${end.y}, ${end.x} ${end.y}`;
}

// Where a link leaves a box and where it arrives: on the right edge of the
// one, on the left edge of the other, at their anchors or in their middle.
export function stageGeometryLinkEnds(from: StageBox, to: StageBox, anchors: StageLinkAnchors = {}): [StagePoint, StagePoint] {
  return [
    { x: from.x + from.width, y: from.y + (anchors.from ?? from.height / 2) },
    { x: to.x, y: to.y + (anchors.to ?? to.height / 2) },
  ];
}

// The corners of a link drawn square, as a wiring diagram draws it: out of
// the right edge of one box, halfway to the other, then down or up, then into
// its left edge. A box standing behind the one it comes from — its left edge
// further left than the other's right one — is reached round them, `gap` out
// of each, through the room between them when one stands
// over the other, under both otherwise, so the line never crosses a box.
export function stageGeometryStepPoints(from: StageBox, to: StageBox, gap = 24, anchors: StageLinkAnchors = {}, turn: number | null = null): [number, number][] {
  const [start, end] = stageGeometryLinkEnds(from, to, anchors);

  // Ahead, however close: straight across the room between them — turning
  // where it is told (`turn`, stageGeometryFanTurns), halfway otherwise. Only
  // one standing behind is reached round.
  if (end.x >= start.x) {
    const middle = turn ?? Math.round((start.x + end.x) / 2);

    return [[start.x, start.y], [middle, start.y], [middle, end.y], [end.x, end.y]];
  }

  const out = start.x + gap;
  const back = end.x - gap;
  const fromBottom = from.y + from.height;
  const toBottom = to.y + to.height;
  let across: number;

  if (fromBottom + gap <= to.y) {
    across = Math.round((fromBottom + to.y) / 2);
  } else if (toBottom + gap <= from.y) {
    across = Math.round((toBottom + from.y) / 2);
  } else {
    across = Math.max(fromBottom, toBottom) + gap;
  }

  return [[start.x, start.y], [out, start.y], [out, across], [back, across], [back, end.y], [end.x, end.y]];
}

// A line through these points, its corners rounded — each by at most `radius`,
// and never past half of the shorter stretch it joins.
export function stageGeometryRoundedPath(points: [number, number][], radius = 8): string {
  if (points.length < 3) {
    return stageGeometryPolyline(points);
  }

  let path = `M ${points[0][0]} ${points[0][1]}`;

  for (let i = 1; i < points.length - 1; i++) {
    const [ax, ay] = points[i - 1];
    const [bx, by] = points[i];
    const [cx, cy] = points[i + 1];
    const before = Math.hypot(bx - ax, by - ay);
    const after = Math.hypot(cx - bx, cy - by);
    const r = Math.min(radius, before / 2, after / 2);

    if (!r) {
      path += ` L ${bx} ${by}`;
      continue;
    }

    const inX = bx - ((bx - ax) / before) * r;
    const inY = by - ((by - ay) / before) * r;
    const outX = bx + ((cx - bx) / after) * r;
    const outY = by + ((cy - by) / after) * r;

    path += ` L ${inX} ${inY} Q ${bx} ${by} ${outX} ${outY}`;
  }

  const [lx, ly] = points[points.length - 1];

  return `${path} L ${lx} ${ly}`;
}

export type StageFanLink = {
  id: string | number;
  start: StagePoint;
  end: StagePoint;
};

export type StageFanTurn = {
  // Where the link goes up or down.
  turn: number;
  // The end it shares with others, where its handle would sit among theirs.
  shared: 'start' | 'end' | null;
};

// Where the square links leaving one port — or reaching one — turn, so that
// each stands apart instead of all running down the same line: spaced
// `spacing` apart around their halfway point, the one going farthest turning
// first on the way out — last on the way in —, up and down apart. Ordered so,
// the links of one fan never cross. Links sharing no end keep their halfway
// turn.
export function stageGeometryFanTurns(links: StageFanLink[], spacing = 6): Map<string | number, StageFanTurn> {
  const turns = new Map<string | number, StageFanTurn>();
  const key = (point: StagePoint) => `${Math.round(point.x)}:${Math.round(point.y)}`;
  const ahead = links.filter((link) => link.end.x >= link.start.x);

  for (const link of ahead) {
    turns.set(link.id, { turn: Math.round((link.start.x + link.end.x) / 2), shared: null });
  }

  const spread = (group: StageFanLink[], side: 'start' | 'end') => {
    for (const direction of [-1, 1]) {
      // Those going up, then those going down; a level one has no turn.
      const bent = group
        .filter((link) => Math.sign(link.end.y - link.start.y) === direction)
        .sort((a, b) => Math.abs(b.end.y - b.start.y) - Math.abs(a.end.y - a.start.y));

      bent.forEach((link, rank) => {
        const centred = (rank - (bent.length - 1) / 2) * spacing;
        const offset = side === 'start' ? centred : -centred;
        const halfway = (link.start.x + link.end.x) / 2;
        // Never so far as to turn before leaving or after arriving.
        const turn = Math.round(Math.min(link.end.x - spacing, Math.max(link.start.x + spacing, halfway + offset)));

        turns.set(link.id, { turn, shared: side });
      });
    }
  };

  const byEnd = (side: 'start' | 'end') => {
    const groups = new Map<string, StageFanLink[]>();

    for (const link of ahead) {
      const point = link[side];
      groups.set(key(point), [...(groups.get(key(point)) ?? []), link]);
    }

    return [...groups.values()].filter((group) => group.length > 1);
  };

  // Fanning out first; a link fanning in alone is spread there.
  for (const group of byEnd('start')) {
    spread(group, 'start');
  }

  for (const group of byEnd('end')) {
    spread(group.filter((link) => turns.get(link.id)?.shared === null), 'end');
  }

  return turns;
}

// Where a square link's handle stands: on the stretch it has alone — after
// its turn when it shares where it leaves, before it when it shares where it
// arrives —, halfway along it otherwise, or when that stretch is too short to
// hold it.
export function stageGeometryHandlePoint(points: [number, number][], shared: 'start' | 'end' | null, minLength = 24): StagePoint {
  if (points.length === 4 && shared) {
    const [[ax, ay], [bx, by]] = shared === 'start' ? [points[2], points[3]] : [points[0], points[1]];

    if (Math.hypot(bx - ax, by - ay) >= minLength) {
      return { x: (ax + bx) / 2, y: (ay + by) / 2 };
    }
  }

  return stageGeometryMidPoint(points);
}


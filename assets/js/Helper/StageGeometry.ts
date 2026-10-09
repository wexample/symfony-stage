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

// The path of a link read left to right — a step leading to the next, as on
// a timeline: out of the right edge of one box, into the left edge of the
// other, bent so that it leaves and arrives level. Going backwards, it loops
// round rather than cutting through the boxes.
export function stageGeometryLinkPath(from: StageBox, to: StageBox): string {
  const start = { x: from.x + from.width, y: from.y + from.height / 2 };
  const end = { x: to.x, y: to.y + to.height / 2 };
  const reach = Math.max(Math.abs(end.x - start.x) / 2, 40);

  return `M ${start.x} ${start.y} C ${start.x + reach} ${start.y}, ${end.x - reach} ${end.y}, ${end.x} ${end.y}`;
}

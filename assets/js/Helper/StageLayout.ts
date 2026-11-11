// Where the items of a stage stand when the page does not say: a layout, a
// pure function of the items — each with the size it takes — giving each its
// place. Handed to the stage (`layout`), which measures its items and calls it
// again whenever one changes size.

export type StageLayoutItem = { id: string; width: number; height: number; column?: number };
export type StageLayoutLink = { from: string; to: string };
export type StageLayoutPlace = { x: number; y: number };
export type StageLayout = (items: StageLayoutItem[]) => Map<string, StageLayoutPlace>;

export type StageLayoutFlowOptions = {
  // The links the flow follows, from a step to the next.
  links: StageLayoutLink[];
  // Room between two columns, and between two rows.
  gapX?: number;
  gapY?: number;
  // Where the first column and the first row start.
  originX?: number;
  originY?: number;
};

/**
 * How deep each item stands in a flow: one fed by none at 0, any other one
 * past the deepest item feeding it; a loop cut where it closes. What the
 * layouts below read the columns from, and a page may too (the column a
 * step's elements go under).
 */
export function stageLayoutDepths(items: { id: string }[], links: StageLayoutLink[]): Map<string, number> {
  const ids = new Set(items.map((item) => item.id));
  const feeders = new Map<string, string[]>(items.map((item) => [item.id, []]));

  links
    .filter((link) => ids.has(link.from) && ids.has(link.to) && link.from !== link.to)
    .forEach((link) => feeders.get(link.to)!.push(link.from));

  const depth = new Map<string, number>();
  const visiting = new Set<string>();
  const depthOf = (id: string): number => {
    if (depth.has(id)) {
      return depth.get(id)!;
    }

    if (visiting.has(id)) {
      return 0;
    }

    visiting.add(id);
    const value = feeders.get(id)!.reduce((deepest, feeder) => Math.max(deepest, depthOf(feeder) + 1), 0);
    visiting.delete(id);
    depth.set(id, value);

    return value;
  };
  items.forEach((item) => depthOf(item.id));

  return depth;
}

export type StageLayoutRowsOptions = StageLayoutFlowOptions & {
  // A row stands right under what is above it in the columns it runs
  // through, not under the tallest step of the row above: a step opened tall
  // in one column leaves the branches of the other columns where they were.
  compact?: boolean;
};

export type StageLayoutColumnsOptions = StageLayoutFlowOptions & {
  // What the page adds after the flow — a block asking for the next step —:
  // in a column of its own, after the last.
  trailing?: string[];
};

/**
 * A flow read from left to right as columns: each item in the column of its
 * depth — or the one it says (`column`) —, the items of a column one under
 * the other in the order given, each column as wide as its widest. Where the
 * flow layout keeps a branch on a row of its own across the columns, this
 * stacks it under what shares its column: tighter when the items differ in
 * height, and the way a column of a step's elements is read.
 */
export function stageLayoutColumns({ links, gapX = 64, gapY = 24, originX = 0, originY = 0, trailing = [] }: StageLayoutColumnsOptions): StageLayout {
  return (items) => {
    const after = new Set(trailing);
    const depths = stageLayoutDepths(items.filter((item) => !after.has(item.id)), links);
    const columnOf = new Map<string, number>(items.filter((item) => !after.has(item.id)).map((item) => [item.id, item.column ?? depths.get(item.id) ?? 0]));
    const last = Math.max(-1, ...columnOf.values());
    items.filter((item) => after.has(item.id)).forEach((item) => columnOf.set(item.id, last + 1));

    const widths: number[] = [];
    items.forEach((item) => {
      const column = columnOf.get(item.id)!;
      widths[column] = Math.max(widths[column] ?? 0, item.width);
    });

    const bottoms: number[] = [];

    return new Map(items.map((item) => {
      const column = columnOf.get(item.id)!;
      const y = bottoms[column] ?? originY;
      bottoms[column] = y + item.height + gapY;

      return [item.id, {
        x: originX + widths.slice(0, column).reduce((sum, width) => sum + (width ?? 0) + gapX, 0),
        y
      }];
    }));
  };
}

/**
 * A flow with branches and no loop, read from left to right: each step in the
 * column of its depth — one past the deepest step feeding it —; the trunk on
 * the first row; a step's first follower on its row, each other one starting
 * a row of its own under the rows already taken, hooked to the step it
 * leaves — its followers in the order the items are given in. Columns as wide as their widest step, rows as tall as their tallest:
 * a step opened in place pushes the columns after it and the rows under it.
 * `compact`: a row stands under what is above it in its own columns only —
 * from its first step to its last —, each step of a row still on one line.
 * A loop, were there one, is cut where it closes.
 */
export function stageLayoutFlow({ links, gapX = 64, gapY = 48, originX = 0, originY = 0, compact = false }: StageLayoutRowsOptions): StageLayout {
  return (items) => {
    const ids = new Set(items.map((item) => item.id));
    const kept = links.filter((link) => ids.has(link.from) && ids.has(link.to) && link.from !== link.to);
    const followers = new Map<string, string[]>();
    const feeders = new Map<string, string[]>();

    items.forEach((item) => {
      followers.set(item.id, []);
      feeders.set(item.id, []);
    });
    kept.forEach((link) => {
      followers.get(link.from)!.push(link.to);
      feeders.get(link.to)!.push(link.from);
    });

    // A step's followers in the order the items are given in, not the one
    // their links were drawn in: the page orders the branches by ordering
    // its items.
    const order = new Map(items.map((item, index) => [item.id, index]));
    followers.forEach((next) => next.sort((a, b) => order.get(a)! - order.get(b)!));

    const depth = stageLayoutDepths(items, kept);

    // Rows: walked from the roots in the order given, a step's first follower
    // on its row, any other on the next free row.
    const row = new Map<string, number>();
    let rows = 0;
    const place = (id: string, at: number) => {
      if (row.has(id)) {
        return;
      }

      row.set(id, at);
      followers.get(id)!
        .filter((next) => !row.has(next))
        .forEach((next, index) => place(next, index === 0 ? at : rows++));
    };

    items.filter((item) => !feeders.get(item.id)!.length).forEach((root) => place(root.id, rows++));
    // What a loop left unreached.
    items.forEach((item) => place(item.id, rows++));

    // Columns as wide as their widest, rows as tall as their tallest.
    const widths: number[] = [];
    const heights: number[] = [];
    items.forEach((item) => {
      const column = depth.get(item.id)!;
      const line = row.get(item.id)!;
      widths[column] = Math.max(widths[column] ?? 0, item.width);
      heights[line] = Math.max(heights[line] ?? 0, item.height);
    });

    const start = (sizes: number[], index: number, gap: number, origin: number) =>
      origin + sizes.slice(0, index).reduce((sum, size) => sum + (size ?? 0) + gap, 0);

    // Where each row starts. Compact: the rows laid in their order, each
    // under the lowest of what its columns hold already — from its first
    // step to its last, the columns its links cross between them counted as
    // tall as its shortest step.
    const tops: number[] = [];

    if (compact) {
      const bottoms: number[] = [];

      heights.forEach((_, line) => {
        const steps = items.filter((item) => row.get(item.id) === line);

        if (!steps.length) {
          return;
        }

        const columns = steps.map((item) => depth.get(item.id)!);
        const first = Math.min(...columns);
        const last = Math.max(...columns);
        const shortest = Math.min(...steps.map((item) => item.height));
        let top = originY;

        for (let column = first; column <= last; column++) {
          top = Math.max(top, bottoms[column] ?? originY);
        }

        tops[line] = top;

        for (let column = first; column <= last; column++) {
          bottoms[column] = top + shortest + gapY;
        }

        steps.forEach((item) => {
          bottoms[depth.get(item.id)!] = top + item.height + gapY;
        });
      });
    }

    return new Map(items.map((item) => [item.id, {
      x: start(widths, depth.get(item.id)!, gapX, originX),
      y: compact ? tops[row.get(item.id)!] : start(heights, row.get(item.id)!, gapY, originY)
    }]));
  };
}

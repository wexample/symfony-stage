// Where the items of a stage stand when the page does not say: a layout, a
// pure function of the items — each with the size it takes — giving each its
// place. Handed to the stage (`layout`), which measures its items and calls it
// again whenever one changes size.

export type StageLayoutItem = { id: string; width: number; height: number };
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
 * A flow with branches and no loop, read from left to right: each step in the
 * column of its depth — one past the deepest step feeding it —; the trunk on
 * the first row; a step's first follower on its row, each other one starting
 * a row of its own under the rows already taken, hooked to the step it
 * leaves. Columns as wide as their widest step, rows as tall as their tallest:
 * a step opened in place pushes the columns after it and the rows under it.
 * A loop, were there one, is cut where it closes.
 */
export function stageLayoutFlow({ links, gapX = 64, gapY = 48, originX = 0, originY = 0 }: StageLayoutFlowOptions): StageLayout {
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

    // Depth: one past the deepest feeder, a loop cut where it closes.
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

    return new Map(items.map((item) => [item.id, {
      x: start(widths, depth.get(item.id)!, gapX, originX),
      y: start(heights, row.get(item.id)!, gapY, originY)
    }]));
  };
}

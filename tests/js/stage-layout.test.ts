// The flow layout: steps in the column of their depth, the trunk on the first
// row, a branch on a row of its own, columns and rows as large as their
// largest step.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stageLayoutColumns, stageLayoutDepths, stageLayoutFlow } from '../../assets/js/Helper/StageLayout.ts';

const box = (id: string, width = 100, height = 40) => ({ id, width, height });

test('a trunk on one row, a branch under it, each step in the column of its depth', () => {
  const layout = stageLayoutFlow({
    links: [{ from: 'url', to: 'fetch' }, { from: 'fetch', to: 'strip' }, { from: 'strip', to: 'split' }, { from: 'fetch', to: 'store' }],
    gapX: 20,
    gapY: 10
  });
  const places = layout([box('url'), box('fetch'), box('strip'), box('split'), box('store')]);

  assert.deepEqual(places.get('url'), { x: 0, y: 0 });
  assert.deepEqual(places.get('fetch'), { x: 120, y: 0 });
  assert.deepEqual(places.get('strip'), { x: 240, y: 0 });
  assert.deepEqual(places.get('split'), { x: 360, y: 0 });
  // The second follower of `fetch`: one column on, a row of its own.
  assert.deepEqual(places.get('store'), { x: 240, y: 50 });
});

test('a step opened in place pushes the columns after it and the rows under it', () => {
  const layout = stageLayoutFlow({ links: [{ from: 'a', to: 'b' }, { from: 'a', to: 'c' }], gapX: 20, gapY: 10 });
  const places = layout([box('a', 300, 200), box('b'), box('c')]);

  assert.deepEqual(places.get('b'), { x: 320, y: 0 });
  assert.deepEqual(places.get('c'), { x: 320, y: 210 });
});

test('compact: a branch stands under what its own columns hold, not under a tall step of another column', () => {
  const links = [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }, { from: 'a', to: 'd' }, { from: 'a', to: 'e' }];
  const places = stageLayoutFlow({ links, gapX: 20, gapY: 10, compact: true })([box('a', 100, 300), box('b'), box('c'), box('d', 100, 60), box('e')]);

  // The trunk on one line, whatever its steps' heights.
  assert.deepEqual([places.get('a')!.y, places.get('b')!.y, places.get('c')!.y], [0, 0, 0]);
  // `d` under `b`, not under the 300 of `a`; `e` under `d`.
  assert.deepEqual(places.get('d'), { x: 120, y: 50 });
  assert.deepEqual(places.get('e'), { x: 120, y: 120 });
});

test('a step fed by two lands one past the deepest; a loop is cut, not followed', () => {
  const places = stageLayoutFlow({ links: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }, { from: 'a', to: 'c' }], gapX: 0, gapY: 0 })([box('a'), box('b'), box('c')]);
  assert.equal(places.get('c')!.x, 200);

  const looped = stageLayoutFlow({ links: [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }], gapX: 0, gapY: 0 })([box('a'), box('b')]);
  assert.equal(looped.size, 2);
});

test('depths: a root at 0, each other one past its deepest feeder', () => {
  const depths = stageLayoutDepths([box('a'), box('b'), box('c'), box('d')], [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }, { from: 'a', to: 'c' }]);

  assert.deepEqual([...depths], [['a', 0], ['b', 1], ['c', 2], ['d', 0]]);
});

test('columns: a branch stacked under what shares its column, each column as wide as its widest', () => {
  const layout = stageLayoutColumns({ links: [{ from: 'a', to: 'b' }, { from: 'a', to: 'c' }], gapX: 20, gapY: 10 });
  const places = layout([box('a'), box('b', 100, 30), box('c', 140)]);

  assert.deepEqual(places.get('a'), { x: 0, y: 0 });
  assert.deepEqual(places.get('b'), { x: 120, y: 0 });
  // Under its sibling, not on a row of its own.
  assert.deepEqual(places.get('c'), { x: 120, y: 40 });
});

test('columns: an item saying its column stands there; a trailing one in a column after the last', () => {
  const layout = stageLayoutColumns({ links: [{ from: 'a', to: 'b' }], gapX: 20, gapY: 10, trailing: ['add'] });
  const places = layout([box('a'), box('b'), { ...box('x'), column: 1 }, box('add', 50)]);

  assert.deepEqual(places.get('x'), { x: 120, y: 50 });
  assert.deepEqual(places.get('add'), { x: 240, y: 0 });
});

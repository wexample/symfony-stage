// The flow layout: steps in the column of their depth, the trunk on the first
// row, a branch on a row of its own, columns and rows as large as their
// largest step.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stageLayoutFlow } from '../../assets/js/Helper/StageLayout.ts';

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

test('a step fed by two lands one past the deepest; a loop is cut, not followed', () => {
  const places = stageLayoutFlow({ links: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }, { from: 'a', to: 'c' }], gapX: 0, gapY: 0 })([box('a'), box('b'), box('c')]);
  assert.equal(places.get('c')!.x, 200);

  const looped = stageLayoutFlow({ links: [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }], gapX: 0, gapY: 0 })([box('a'), box('b')]);
  assert.equal(looped.size, 2);
});

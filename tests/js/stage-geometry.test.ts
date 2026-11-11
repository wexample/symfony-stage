// Where a square link's handle stands: on a level stretch of its own, halfway
// along it; on its drop when neither stretch can hold it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stageGeometryHandlePoint } from '../../assets/js/Helper/StageGeometry.ts';

// Out of a box at (0, 10), turning at x = 100, down to y = 200, into a box at x = 120.
const branch: [number, number][] = [[0, 10], [100, 10], [100, 200], [120, 200]];

test('on the longer level stretch, not on the drop the length would put it on', () => {
  assert.deepEqual(stageGeometryHandlePoint(branch, null), { x: 50, y: 10 });
});

test('on the stretch it has alone when it shares where it leaves — unless too short', () => {
  assert.deepEqual(stageGeometryHandlePoint([[0, 10], [100, 10], [100, 200], [200, 200]], 'start'), { x: 150, y: 200 });
  // The stretch after the turn is 20 long: on the drop, between the turns.
  assert.deepEqual(stageGeometryHandlePoint(branch, 'start'), { x: 100, y: 105 });
});

test('on the stretch before its turn when it shares where it arrives', () => {
  assert.deepEqual(stageGeometryHandlePoint(branch, 'end'), { x: 50, y: 10 });
});

test('any other line, halfway along it by its length', () => {
  assert.deepEqual(stageGeometryHandlePoint([[0, 0], [100, 0]], null), { x: 50, y: 0 });
});

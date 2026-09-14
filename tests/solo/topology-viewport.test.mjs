import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitTopologyBounds, resizeTopologyDrawer } from '../../src/solo/topology-viewport.js';

test('fit centers the actual bounds, including a graph far from the origin', () => {
  for (const bounds of [{ x: 10000, y: -4000, width: 1200, height: 600 }, { x: -20000, y: -20000, width: 40000, height: 40000 }, { x: -50, y: -130, width: 250, height: 900 }]) {
    for (const [width, height] of [[900, 440], [320, 600], [600, 240]]) {
      const { x, y, k } = fitTopologyBounds(bounds, width, height);
      assert.ok(bounds.x * k + x >= 27.99);
      assert.ok(bounds.y * k + y >= 27.99);
      assert.ok((bounds.x + bounds.width) * k + x <= width - 27.99);
      assert.ok((bounds.y + bounds.height) * k + y <= height - 27.99);
    }
  }
});
test('fit recomputes after a canvas resize and rejects unavailable viewports', () => {
  const bounds = { x: 10, y: 20, width: 800, height: 700 };
  assert.ok(fitTopologyBounds(bounds, 900, 700).k > fitTopologyBounds(bounds, 900, 300).k);
  assert.equal(fitTopologyBounds(bounds, 0, 300), null);
  assert.equal(fitTopologyBounds({ ...bounds, x: NaN }, 900, 300), null);
});
test('dragging the list divider down frees canvas space and dragging up preserves a usable canvas', () => {
  assert.equal(resizeTopologyDrawer(180, 80, 600), 100);
  assert.equal(resizeTopologyDrawer(180, 300, 600), 0);
  assert.equal(resizeTopologyDrawer(0, -200, 600), 200);
  assert.equal(resizeTopologyDrawer(180, -500, 600), 360);
  assert.equal(resizeTopologyDrawer(180, 0, 180), 0);
});

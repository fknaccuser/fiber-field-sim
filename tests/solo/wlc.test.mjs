import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WLC_TEMPLATES, gradeWlc, clone } from '../../src/solo/wlc/model.js';
import { branchById } from '../../src/solo/tree/ccna.js';
import { deskLights } from '../../src/solo/tree/progress.js';

for (const t of WLC_TEMPLATES) {
  test(`${t.kind}: starts undone, its own solution scores 100 with nothing extra, and seeds vary`, () => {
    const texts = new Set();
    for (let seed = 1; seed <= 40; seed += 1) {
      const o = t.make(seed);
      const start = clone(o.controller);
      const fresh = gradeWlc(o, start, clone(start));
      assert.deepEqual(fresh.reqs.filter(r => r.ok).map(r => r.id), [], `${t.kind} seed ${seed} starts partly done`);
      const done = clone(start);
      o.solve(done);
      const g = gradeWlc(o, start, done);
      assert.deepEqual(g.reqs.filter(r => !r.ok).map(r => r.id), [], `${t.kind} seed ${seed}`);
      assert.deepEqual(g.extras, [], `${t.kind} seed ${seed} extras`);
      assert.equal(g.pct, 100);
      texts.add(JSON.stringify(o.notes));
    }
    assert.ok(texts.size >= 20, `${t.kind} has little variety`);
    for (const b of t.lights) {
      assert.ok(branchById(b)?.tiers.includes('do'), `${b} has no Do tier`);
      assert.ok(deskLights(b, 'do'), `${b} is not lit by the WLC orders`);
    }
  });
}

test('touching the corporate WLAN nobody asked about costs a point, named', () => {
  const t = WLC_TEMPLATES.find(x => x.kind === 'wlc-psk');
  const o = t.make(7);
  const start = clone(o.controller);
  const done = clone(start);
  o.solve(done);
  done.wlans[1].qos = 'platinum';
  const g = gradeWlc(o, start, done);
  assert.equal(g.extras.length, 2, 'the old line removed and the new one added');
  assert.ok(g.pct < 100);
});

test('a WPA2 WLAN left on TKIP, or PSK on an 802.1X order, fails its security line', () => {
  const t = WLC_TEMPLATES.find(x => x.kind === 'wlc-dot1x');
  const o = t.make(3);
  const start = clone(o.controller);
  const done = clone(start);
  o.solve(done);
  const w = Object.values(done.wlans).find(x => x.id !== 1);
  w.akm = 'psk'; w.psk = 'shared-key-123';
  assert.equal(gradeWlc(o, start, done).reqs.find(r => r.id === 'sec').ok, false);
});

test('the API work order: its own solution scores 100, nothing typed scores 0, and the broken payload never parses', async () => {
  const { JSON_TEMPLATES, gradeJson, parseJson } = await import('../../src/solo/json/work.js');
  const t = JSON_TEMPLATES[0];
  const seen = new Set();
  for (let seed = 1; seed <= 40; seed += 1) {
    const o = t.make(seed);
    assert.equal(parseJson(o.broken).ok, false, `seed ${seed} broken payload parses`);
    assert.equal(gradeJson(o, o.solution).pct, 100, `seed ${seed}`);
    assert.equal(gradeJson(o, { fix: o.broken }).got, 0, `seed ${seed} starts partly done`);
    seen.add(o.broken);
  }
  assert.ok(seen.size > 30);
  const o = t.make(5);
  const asString = JSON.parse(o.solution.body);
  asString.vlan.id = String(asString.vlan.id);
  assert.equal(gradeJson(o, { ...o.solution, body: JSON.stringify(asString) }).reqs.find(r => r.id === 'body').ok, false, 'a VLAN id in quotes is a string, not a number');
  for (const b of t.lights) assert.ok(branchById(b)?.tiers.includes('do'), b);
});

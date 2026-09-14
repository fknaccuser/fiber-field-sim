import { test } from 'node:test';
import assert from 'node:assert/strict';
import { campusDesign, validateDesign, deleteDevice, collapsedDesign } from '../../src/solo/design-model.js';
import { guidanceLevel, nextGuidance } from '../../src/solo/guidance.js';

test('campus design round-trips all six sites and 32 devices without changing scored network contracts', () => {
  const doc = campusDesign();
  assert.equal(doc.devices.length, 32);
  assert.equal(doc.devices.filter(d => d.kind === 'router').length, 7);
  assert.deepEqual(validateDesign(JSON.parse(JSON.stringify(doc))), doc);
});
test('removing equipment also removes every dangling cable and preserves the input for undo', () => {
  const doc = campusDesign(), result = deleteDevice(doc, 'CORE');
  assert.equal(doc.devices.length, 32);
  assert.equal(result.devices.length, 31);
  assert.ok(result.links.every(l => l.a !== 'CORE' && l.b !== 'CORE'));
  assert.doesNotThrow(() => validateDesign(result));
});
test('collapsed sites retain external connectivity and expanding recovers every device and link', () => {
  const doc = campusDesign(), collapsed = collapsedDesign(doc, new Set(['hq']));
  assert.equal(collapsed.devices.length, 28);
  assert.ok(collapsed.links.some(l => l.a === 'CORE' && l.b === 'site:hq'));
  assert.ok(!collapsed.links.some(l => l.a === 'hq-R' || l.b === 'hq-R'));
  assert.equal(collapsedDesign(doc).links.length, doc.links.length);
  assert.equal(collapsedDesign(doc).devices.length, 32);
});
test('import rejects dangling endpoints, duplicate IDs, non-finite coordinates, and excessive size', () => {
  const doc = campusDesign();
  assert.throws(() => validateDesign({ ...doc, links: [...doc.links, { id: 'bad', a: 'absent', b: 'CORE', label: '' }] }));
  assert.throws(() => validateDesign({ ...doc, devices: [...doc.devices, doc.devices[0]] }));
  assert.throws(() => validateDesign({ ...doc, devices: doc.devices.map(d => ({ ...d, position: [NaN, 0] })) }));
  assert.throws(() => validateDesign({ ...doc, devices: Array(201).fill(doc.devices[0]) }));
});
test('guided learning fades through completed repairs; repeated assisted work is not mastery', () => {
  const run = { mode: 'repair', assisted: true, recipes: ['P1'] };
  assert.equal(guidanceLevel({ completedRuns: [] }), 'guided');
  assert.equal(guidanceLevel({ completedRuns: Array(3).fill({ mode: 'configure' }) }), 'guided');
  assert.equal(guidanceLevel({ completedRuns: Array(3).fill(run) }), 'coached');
  assert.equal(guidanceLevel({ completedRuns: Array(12).fill(run) }), 'coached');
  assert.equal(guidanceLevel({ completedRuns: Array.from({ length: 8 }, (_, i) => ({ ...run, assisted: false, recipes: [['P1', 'I1', 'V1', 'D1'][i % 4]] })) }), 'independent');
});
test('guidance follows observed work and offers verification only after a change', () => {
  assert.equal(nextGuidance({ events: [] }).step, 1);
  assert.equal(nextGuidance({ events: [{ kind: 'inspection' }] }).step, 2);
  assert.equal(nextGuidance({ events: [{ kind: 'inspection' }, { kind: 'test' }] }).step, 3);
  assert.equal(nextGuidance({ events: [{ kind: 'inspection' }, { kind: 'test' }, { kind: 'change' }] }).step, 4);
});

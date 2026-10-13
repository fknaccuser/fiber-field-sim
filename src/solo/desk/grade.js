// Building a work order's network, and grading the result the way an exam
// simulation does: each requirement and acceptance test is a point, and any
// configuration line nobody asked for costs one, named exactly.

import { makeWorld, makeSwitch, makePc, makeDevice, save, freshElections } from '../labs/world.js';
import { createSession, execute, runningConfig } from '../labs/ios.js';

const G3 = ['GigabitEthernet0/0', 'GigabitEthernet0/1', 'GigabitEthernet0/2'];

export function buildWorld(order) {
  const make = (d) => (d.kind === 'switch' ? makeSwitch(d.id, { mac: order.macs?.[d.id] ?? null })
    : d.kind === 'pc' ? makePc(d.id, d.pc ?? {}) : makeDevice(d.id, G3));
  const world = makeWorld(order.devices.map(make), order.links);
  for (const [id, lines] of Object.entries(order.setup ?? {})) {
    const s = createSession(world, id);
    for (const l of ['enable', 'configure terminal', ...lines, 'end']) execute(s, l);
  }
  for (const id of order.saved ?? []) save(world, id);
  freshElections(world);
  world.seq = 0;
  world.learned = {};
  world.notices = {};
  return world;
}

// The running configuration as a set of "section|line" entries, plus the
// VLAN database (which lives in vlan.dat, not the running config).
export function configEntries(dev) {
  const out = new Set();
  if (dev.kind === 'pc') {
    const nic = dev.config.interfaces.FastEthernet0;
    out.add(`pc|address ${nic.ip} ${nic.mask}`);
    out.add(`pc|gateway ${dev.config.gateway}`);
    return out;
  }
  let header = 'global';
  for (const line of runningConfig(dev).split('\n').slice(3)) {
    if (line === '!' || line === 'end' || !line.trim()) continue;
    if (/^\S/.test(line)) {
      if (/^(interface|line|router|ip dhcp pool|ip access-list) /.test(line)) { header = line; out.add(`${header}|`); } else { header = 'global'; out.add(`global|${line}`); }
    } else out.add(`${header}|${line.trim()}`);
  }
  for (const [v, x] of Object.entries(dev.config.vlans ?? {})) out.add(`vlan|${v} ${x.name}`);
  return out;
}

export function baselineOf(world) {
  return Object.fromEntries(Object.values(world.devices).map(d => [d.id, configEntries(d)]));
}

// Lines that change nothing about how the network behaves.
const HARMLESS = [/\|description /, /^global\|banner /, /\|exec-timeout /, /^global\|service password-encryption$/, /\|(enable )?password 7 /, /\|logging synchronous/];

export const showEntry = (e) => {
  const [head, line] = [e.slice(0, e.indexOf('|')), e.slice(e.indexOf('|') + 1)];
  if (head === 'global') return line;
  if (head === 'vlan') return `vlan ${line}`;
  if (!line) return head;
  return `${head} › ${line}`;
};

export function extrasOf(order, world, baseline) {
  const extras = [];
  for (const [d, before] of Object.entries(baseline)) {
    const dev = world.devices[d];
    if (!dev || dev.kind === 'pc') continue;
    const now = configEntries(dev);
    const owned = (e) => order.requirements.some(r => (r.owns?.[d] ?? []).some(re => re.test(e))) || HARMLESS.some(re => re.test(e));
    const added = [...now].filter(e => !before.has(e) && !owned(e));
    const touched = new Set(added.map(e => e.slice(0, e.indexOf('|'))));
    const removed = [...before].filter(e => !now.has(e) && !owned(e) && !touched.has(e.slice(0, e.indexOf('|'))));
    for (const e of added) extras.push({ device: d, entry: e, text: showEntry(e), kind: 'added' });
    for (const e of removed) extras.push({ device: d, entry: e, text: `no ${showEntry(e)}`, kind: 'removed' });
  }
  return extras;
}

const safe = (fn, w) => { try { return Boolean(fn(w)); } catch { return false; } };

export const requirementStates = (order, world) => order.requirements.map(r => ({ id: r.id, ok: safe(r.check, world) }));

export function grade(order, world, baseline, { elapsedMs = 0 } = {}) {
  const reqs = order.requirements.map(r => ({ id: r.id, text: r.text, ok: safe(r.check, world), hint: r.hint, show: r.show }));
  const tests = order.tests.map(t => ({ id: t.id, text: t.text, ok: safe(t.check, world) }));
  const extras = extrasOf(order, world, baseline);
  const total = reqs.length + tests.length;
  const got = reqs.filter(r => r.ok).length + tests.filter(t => t.ok).length;
  const pct = Math.max(0, Math.round((100 * (got - extras.length)) / total));
  return { reqs, tests, extras, total, got, pct, elapsedMs, over: elapsedMs > order.minutes * 60000 };
}

// A copy of the world to try things in without touching the learner's.
export const cloneWorld = (world) => JSON.parse(JSON.stringify(world));

// JSON work orders: read what a controller's REST API returns, write the
// body for a change, and repair a payload that will not parse. The exam
// asks for exactly this reading and writing; nothing here runs Python.
//
// Pure. The screen in screen.js edits the answers; grade() checks them.

import { rngOf, int, pick, sample } from '../study/gen/kit.js';

const SITES = ['Harbor Clinic', 'Elm Street Branch', 'Northgate Office', 'Mesa Warehouse', 'Riverside Annex', 'Pine Ridge School'];
const REQUESTERS = ['Network Automation', 'IT Service Desk', 'Platform Team', 'Network Operations'];
const VLAN_NAMES = ['SALES', 'ENG', 'HR', 'FINANCE', 'GUEST', 'LAB', 'OPS', 'CAMERAS'];

// parseJson(text) -> { ok, value } or { ok: false, error, line, col }
export function parseJson(text) {
  try { return { ok: true, value: JSON.parse(text) }; } catch (e) {
    const m = /position (\d+)/.exec(String(e.message));
    let line = null, col = null;
    if (m) {
      const at = Number(m[1]);
      const before = String(text).slice(0, at).split('\n');
      line = before.length; col = before[before.length - 1].length + 1;
    }
    return { ok: false, error: String(e.message).replace(/^JSON\.parse: /, ''), line, col };
  }
}

const same = (a, b) => JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map(k => [k, sortKeys(v[k])]));
  return v;
}

// The ways a hand-typed payload goes wrong. Each touches its own line of
// the four-key port object, so any two can be combined.
//   lines: 0 {  1 "interface"  2 "description"  3 "vlan"  4 "enabled"  5 }
const BREAKS = [
  { id: 'single', what: 'single quotes around a string', apply: (L) => { L[2] = L[2].replace(/: "(.*)",$/, ": '$1',"); } },
  { id: 'trailing', what: 'a comma after the last item', apply: (L) => { L[4] = `${L[4]},`; } },
  { id: 'bare', what: 'a key without quotes', apply: (L) => { L[3] = L[3].replace('"vlan"', 'vlan'); } },
  { id: 'missing', what: 'a missing comma between items', apply: (L) => { L[1] = L[1].replace(/,$/, ''); } },
];

export const JSON_TEMPLATES = [
  {
    kind: 'json-api',
    title: 'Make a change through the controller API',
    minutes: 10,
    lights: ['t6-json', 't6-rest'],
    make(seed) {
      const rnd = rngOf(seed);
      const f = { number: `CHG${int(rnd, 10000, 99999)}`, site: pick(rnd, SITES), requester: pick(rnd, REQUESTERS), priority: pick(rnd, ['P3', 'P4']), kind: this.kind };
      const sw = pick(rnd, ['ACC1', 'SW1', 'FLOOR2', 'IDF3']);
      // A GET response to read.
      const ports = Array.from({ length: 5 }, (_, k) => ({
        name: `GigabitEthernet1/0/${k + 1}`,
        enabled: true,
        oper_status: 'up',
        vlan: pick(rnd, [10, 20, 30]),
        description: pick(rnd, ['desk', 'printer', 'AP', 'camera', 'phone']),
      }));
      const downs = sample(rnd, [0, 1, 2, 3, 4], int(rnd, 1, 2));
      for (const k of downs) { ports[k].oper_status = 'down'; if (rnd() < 0.5) ports[k].enabled = false; }
      const response = { device: sw, count: ports.length, interfaces: ports };
      const askVlan = pick(rnd, [10, 20, 30]);
      const inVlan = ports.filter(p => p.vlan === askVlan).length;
      // A body to write.
      const vid = pick(rnd, [40, 50, 60, 70, 110, 120]);
      const vname = pick(rnd, VLAN_NAMES);
      const shut = rnd() < 0.5;
      const body = { vlan: { id: vid, name: vname, shutdown: shut } };
      // A payload to repair.
      const target = { interface: `GigabitEthernet1/0/${int(rnd, 6, 24)}`, description: `${pick(rnd, ['Lobby', 'Kiosk', 'Badge reader', 'Conf room'])} ${int(rnd, 1, 9)}`, vlan: pick(rnd, [10, 20, 30]), enabled: true };
      const good = JSON.stringify(target, null, 2);
      const breaks = sample(rnd, BREAKS, 2);
      const lines = good.split('\n');
      for (const b of breaks) b.apply(lines);
      const broken = lines.join('\n');

      const reqs = [
        { id: 'down', kind: 'answer', text: `From the GET response: which interface${downs.length > 1 ? 's are' : ' is'} down? (short names, like Gi1/0/3${downs.length > 1 ? ', separated by commas' : ''})`,
          check: (a) => {
            const want = new Set(downs.map(k => `gi1/0/${k + 1}`));
            const got = String(a.down ?? '').toLowerCase().split(/[\s,]+/).filter(Boolean).map(x => x.replace(/^gigabitethernet/, 'gi'));
            return got.length === want.size && got.every(x => want.has(x));
          },
          hint: 'Read oper_status in each object of the interfaces array. "enabled": false means someone shut it; oper_status says whether the link is up.' },
        { id: 'count', kind: 'answer', text: `How many interfaces in the response are in VLAN ${askVlan}?`,
          check: (a) => /^\d+$/.test(String(a.count ?? '').trim()) && Number(String(a.count).trim()) === inVlan,
          hint: 'Count the objects whose "vlan" key is that number. The "count" key at the top is the total, not this.' },
        { id: 'body', kind: 'json', field: 'body', text: `Write the POST body that creates VLAN ${vid} named ${vname}, ${shut ? 'shut down' : 'not shut down'}. Same shape as the example.`,
          check: (a) => { const p = parseJson(a.body ?? ''); return p.ok && same(p.value, body); },
          hint: 'Numbers and true/false go without quotes; strings take double quotes; keys always take double quotes. "id": "40" is a string, not a number.' },
        { id: 'fix', kind: 'json', field: 'fix', text: 'Repair the PUT payload so it parses, without changing what it says.',
          check: (a) => { const p = parseJson(a.fix ?? ''); return p.ok && same(p.value, target); },
          hint: `It has ${breaks.length} problems: ${breaks.map(b => b.what).join(' and ')}. The parser's message gives the line and column of the first one.` },
      ];
      return {
        ...f, title: this.title, minutes: this.minutes, lights: this.lights,
        summary: `${f.site}'s switches are managed through the controller's REST API. Check ${sw}'s ports from the API's answer, then prepare two changes: a new VLAN and a port description someone started by hand.`,
        notes: [`GET /api/v1/devices/${sw}/interfaces returned 200 OK`, `POST /api/v1/devices/${sw}/vlans creates a VLAN`, `PUT /api/v1/devices/${sw}/interfaces updates one port`],
        device: sw, askVlan, response, example: { vlan: { id: 10, name: 'USERS', shutdown: false } }, broken,
        requirements: reqs,
        solution: { down: downs.map(k => `Gi1/0/${k + 1}`).join(', '), count: String(inVlan), body: JSON.stringify(body, null, 2), fix: good },
      };
    },
  },
];

export const jsonTemplateOf = (kind) => JSON_TEMPLATES.find(t => t.kind === kind) ?? null;

export function gradeJson(order, answers) {
  const reqs = order.requirements.map(r => ({ id: r.id, text: r.text, hint: r.hint, ok: (() => { try { return Boolean(r.check(answers)); } catch { return false; } })() }));
  const got = reqs.filter(r => r.ok).length;
  return { reqs, extras: [], got, total: reqs.length, pct: Math.round((100 * got) / reqs.length) };
}

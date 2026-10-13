import { makeOrder } from './src/solo/desk/jobs.js';
import { buildWorld, baselineOf, grade } from './src/solo/desk/grade.js';
import { createSession, execute } from './src/solo/labs/ios.js';
for (const k of ['build-access','build-ssh','build-vlans','build-uplink','build-bundle','build-edge']) {
  let t = Date.now();
  const order = makeOrder(k, 5);
  const w = buildWorld(order); const t1 = Date.now()-t;
  const b = baselineOf(w);
  const S = Object.fromEntries(order.devices.map(d => [d.id, createSession(w, d.id)]));
  let n=0; for (const r of order.requirements) for (const [d, ls] of Object.entries(r.show)) for (const l of ls) { execute(S[d], l); n++; }
  const t2 = Date.now()-t;
  const g = grade(order, w, b);
  console.log(k, 'build', t1, 'solve', t2, 'cmds', n, 'grade', Date.now()-t, g.pct, g.extras.map(e=>e.text), g.reqs.filter(r=>!r.ok).map(r=>r.id), g.tests.filter(r=>!r.ok).map(r=>r.id));
}

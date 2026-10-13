// Which questions a drill should serve next.
//
// history[id] = { right, seen, last: { ok, at } } as the exam prep screen
// saves it. A drill takes, in order: a few missed questions that are due
// again, then questions never seen, then the rest of the due misses, then
// correct ones whose rest is over, then whatever was seen longest ago.
// Pure: the random source and the clock are passed in.

export const MISS_AGAIN_MS = 2 * 86400000;
export const RIGHT_REST_MS = 10 * 86400000;
const LEAD_MISSES = 5;

function shuffled(list, rnd) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function rotate(pool, history = {}, { now = Date.now(), count = 15, rnd = Math.random } = {}) {
  const unseen = [], dueMiss = [], dueRight = [], resting = [];
  for (const q of pool) {
    const h = history[q.id];
    const last = h?.last;
    if (!h || !h.seen) { unseen.push(q); continue; }
    const age = last?.at ? now - last.at : Infinity;
    if (last && last.ok === false) (age >= MISS_AGAIN_MS ? dueMiss : resting).push(q);
    else (age >= RIGHT_REST_MS ? dueRight : resting).push(q);
  }
  const misses = shuffled(dueMiss, rnd);
  const ageOf = (q) => history[q.id]?.last?.at ?? 0;
  const order = [
    ...misses.slice(0, LEAD_MISSES),
    ...shuffled(unseen, rnd),
    ...misses.slice(LEAD_MISSES),
    ...shuffled(dueRight, rnd),
    ...[...resting].sort((a, b) => ageOf(a) - ageOf(b)),
  ];
  return order.slice(0, count);
}

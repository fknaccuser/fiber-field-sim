// Generated console questions. Each template builds a complete question
// from a seed: new addresses, ports, VLANs and a new fault every time.
//
// The bank holds one stand-in per template (seed 1), so pools, coverage and
// the bank checks see them like any other question. When a deck starts,
// freshen() swaps each stand-in for a newly seeded build.

import { rngOf } from './kit.js';
import { ROUTING_TEMPLATES } from './routing.js';
import { ADDRESSING_TEMPLATES } from './addressing.js';
import { SWITCHING_TEMPLATES } from './switching.js';
import { SERVICES_TEMPLATES } from './services.js';

export const TEMPLATES = [...ROUTING_TEMPLATES, ...ADDRESSING_TEMPLATES, ...SWITCHING_TEMPLATES, ...SERVICES_TEMPLATES];
const BY_ID = new Map(TEMPLATES.map(t => [t.id, t]));

// instantiate(template, seed) -> a full question, tagged with its template
// and seed. The id stays the template id, so practice history follows the
// skill rather than one set of numbers.
export function instantiate(template, seed) {
  const q = template.make(rngOf(seed));
  return { ...q, gen: template.id, seed };
}

export const GENERATED_BANK = TEMPLATES.map(t => instantiate(t, 1));

let counter = 0;
const freshSeed = () => ((Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) + (counter += 7919)) >>> 0;

// freshen(question) -> the same question, or a new build if it is generated.
export function freshen(q, seed = freshSeed()) {
  const t = q?.gen ? BY_ID.get(q.gen) : null;
  return t ? instantiate(t, seed) : q;
}

// The question bank: schema, filtering, and weighted exam sampling.
//
// Pure and DOM-free. Shuffling goes through an injected random source so a
// test can pin an exact draw, the same way the subnet drill does.

// CCNA 200-301 v1.1 domains with Cisco's published weights. The weights are
// load-bearing: a mock exam samples to them, so IP Connectivity supplies a
// quarter of the paper and Automation a tenth.
export const DOMAINS = [
  { id: 'NF', label: 'Network Fundamentals', weight: 20 },
  { id: 'NA', label: 'Network Access', weight: 20 },
  { id: 'IPC', label: 'IP Connectivity', weight: 25 },
  { id: 'IPS', label: 'IP Services', weight: 10 },
  { id: 'SECF', label: 'Security Fundamentals', weight: 15 },
  { id: 'AUTO', label: 'Automation and Programmability', weight: 10 },
];

export const DOMAIN_IDS = DOMAINS.map(d => d.id);
export const domainById = (id) => DOMAINS.find(d => d.id === id) ?? null;

// How each question fares under blueprint v2.0, announced May 2026 and live
// February 2027. Writing the tag at authoring time makes the migration a
// filter change rather than a rewrite.
//   same    carries over unchanged
//   deeper  survives, but v2.0 raises the verb, so it needs a harder companion
//   dropped gone from the v2.0 blueprint
//   v2only  new in v2.0, off-blueprint for the exam live today
export const V2_TAGS = ['same', 'deeper', 'dropped', 'v2only'];

export const FORMATS = ['single', 'multi', 'match', 'order'];

// v1 hides what is not on today's exam; v2 hides what today's exam will lose.
export const BLUEPRINTS = ['v1', 'v2', 'both'];

export function inBlueprint(question, blueprint = 'v1') {
  if (blueprint === 'both') return true;
  if (blueprint === 'v1') return question.v2 !== 'v2only';
  return question.v2 !== 'dropped';
}

export function filter(bank, { domains, blueprint = 'v1', formats } = {}) {
  const wanted = domains ? new Set(domains) : null;
  const forms = formats ? new Set(formats) : null;
  return bank.filter(q =>
    (!wanted || wanted.has(q.domain))
    && (!forms || forms.has(q.format))
    && inBlueprint(q, blueprint));
}

function shuffled(list, rnd) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// How many questions each domain contributes to an exam of this size.
// Rounding each weight on its own overshoots: at 50 questions the six weights
// round to 51. This takes the whole number of each quota, then hands the
// leftover seats to the largest fractional remainders, so the parts always
// sum to exactly count. Ties go to the heavier domain.
export function quotas(count = 50) {
  const exact = DOMAINS.map(d => ({ domain: d.id, weight: d.weight, want: (count * d.weight) / 100 }));
  const seats = exact.map(e => ({ ...e, want: Math.floor(e.want), remainder: e.want - Math.floor(e.want) }));
  let left = count - seats.reduce((a, s) => a + s.want, 0);
  const order = [...seats].sort((a, b) => (b.remainder - a.remainder) || (b.weight - a.weight));
  for (const seat of order) {
    if (left <= 0) break;
    seat.want += 1;
    left -= 1;
  }
  return seats.map(({ domain, want }) => ({ domain, want }));
}

// Draws a mock exam to the domain weights rather than evenly. Where a domain
// cannot fill its share the shortfall is reported rather than silently
// backfilled from elsewhere, because a misweighted mock that looks complete
// is worse than one that admits the gap.
export function sampleExam(bank, { count = 50, blueprint = 'v1', rnd = Math.random } = {}) {
  const questions = [];
  const shortfalls = [];
  for (const { domain, want } of quotas(count)) {
    const pool = shuffled(filter(bank, { domains: [domain], blueprint }), rnd);
    questions.push(...pool.slice(0, want));
    if (pool.length < want) shortfalls.push({ domain, want, have: pool.length });
  }
  return { questions: shuffled(questions, rnd), shortfalls };
}

// What a bank can currently support, for showing the gap rather than hiding it.
export function coverage(bank, { count = 50, blueprint = 'v1' } = {}) {
  const byDomain = Object.fromEntries(quotas(count).map(q => [q.domain, q.want]));
  return DOMAINS.map(domain => {
    const want = byDomain[domain.id];
    const have = filter(bank, { domains: [domain.id], blueprint }).length;
    return { domain: domain.id, label: domain.label, weight: domain.weight, want, have, short: Math.max(0, want - have) };
  });
}

// Presentation order for a single question, so the right answer does not sit
// in the same slot every time. Returned rather than applied, leaving the
// question itself immutable.
export function presentation(question, rnd = Math.random) {
  if (question.format === 'match') {
    return { rightOrder: shuffled(question.pairs.map((_, i) => i), rnd) };
  }
  if (question.format === 'order') {
    return { shownOrder: shuffled(question.steps.map((_, i) => i), rnd) };
  }
  return { choiceOrder: shuffled(question.choices.map((_, i) => i), rnd) };
}

export function isCorrect(question, answer) {
  if (question.format === 'order') {
    return Array.isArray(answer)
      && answer.length === question.steps.length
      && answer.every((v, i) => v === i);
  }
  if (question.format === 'match') {
    return Array.isArray(answer)
      && answer.length === question.pairs.length
      && answer.every((v, i) => v === i);
  }
  const want = question.choices.map((c, i) => (c.correct ? i : null)).filter(i => i !== null);
  const got = Array.isArray(answer) ? [...answer].sort((a, b) => a - b) : [answer];
  return got.length === want.length && want.every((v, i) => v === got[i]);
}

// How many selections the question expects, for a view to enforce before
// letting the trainee submit.
export function expectedSelections(question) {
  if (question.format === 'multi') return question.choices.filter(c => c.correct).length;
  if (question.format === 'single') return 1;
  return null;
}

// Structural problems that would break a deck or teach something wrong. Run
// over the whole bank in tests, so bad content fails the build rather than
// appearing mid-session.
export function problems(bank) {
  const found = [];
  const seenIds = new Set();
  const seenText = new Set();
  const note = (q, msg) => found.push(`${q.id ?? '(no id)'}: ${msg}`);

  for (const q of bank) {
    if (!q.id) found.push('a question has no id');
    else if (seenIds.has(q.id)) note(q, 'duplicate id');
    else seenIds.add(q.id);

    if (!DOMAIN_IDS.includes(q.domain)) note(q, `unknown domain ${q.domain}`);
    if (!V2_TAGS.includes(q.v2)) note(q, `v2 tag is ${q.v2 ?? 'missing'}`);
    if (!FORMATS.includes(q.format)) note(q, `unknown format ${q.format}`);
    if (!q.prompt) note(q, 'no prompt');
    if (!q.explain) note(q, 'no explanation');
    else if (q.explain.length < 120) note(q, `explanation is only ${q.explain.length} characters`);

    const key = `${q.scenario ?? ''}||${q.prompt}`;
    if (seenText.has(key)) note(q, 'duplicate scenario and prompt');
    seenText.add(key);

    if (q.format === 'match') {
      if (!q.pairs || q.pairs.length < 3) note(q, 'too few pairs to be a real match');
      else {
        q.pairs.forEach((p, i) => { if (!p.left || !p.right) note(q, `pair ${i} is missing a side`); });
        if (new Set(q.pairs.map(p => p.right)).size !== q.pairs.length) note(q, 'two pairs share a right-hand answer');
      }
    } else if (q.format === 'order') {
      if (!q.steps || q.steps.length < 3) note(q, 'too few steps to order');
      else if (new Set(q.steps).size !== q.steps.length) note(q, 'duplicate step');
    } else {
      const choices = q.choices ?? [];
      if (choices.length < 2) note(q, `only ${choices.length} choices`);
      const right = choices.filter(c => c.correct).length;
      if (q.format === 'single' && right !== 1) note(q, `${right} correct answers on a single-answer question`);
      if (q.format === 'multi' && right < 2) note(q, `${right} correct answers on a multi-select question`);
      choices.forEach((c, i) => {
        if (!c.text) note(q, `choice ${i} has no text`);
        if (!c.why) note(q, `choice ${i} has no explanation`);
      });
    }
  }
  return found;
}

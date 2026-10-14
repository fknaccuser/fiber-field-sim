// Authoring helpers for the question bank files in this folder.
//
// Q(id, domain, branch, prompt, choices, explain, options)
//   choices  [[text, correct, why], ...]; more than one correct makes it multi-select
//   options  { scenario, exhibit, console, v2 }
// X(text, ...marks) builds a console exhibit; see ../exhibit.js for marks.
//
// A question with an exhibit, or flagged console, is a console question: it
// joins the Console drill as well as every check and exam.

export const X = (text, ...marks) => ({ text: text.replace(/^\n/, '').replace(/\n\s*$/, ''), marks });

export const Q = (id, domain, branch, prompt, choices, explain, o = {}) => {
  const list = choices.map(([text, correct, why]) => ({ text, correct: Boolean(correct), why }));
  return {
    id, domain, branch,
    v2: o.v2 ?? 'same',
    format: list.filter(c => c.correct).length > 1 ? 'multi' : 'single',
    ...(o.scenario ? { scenario: o.scenario } : {}),
    ...(o.exhibit ? { exhibit: o.exhibit } : {}),
    ...(o.console || o.exhibit ? { console: true } : {}),
    prompt,
    choices: list,
    explain,
  };
};

// Drag-and-drop items. Each takes the same id, domain and branch as Q.
//   M  match: [[left, right], ...]; every right side distinct
//   O  order: steps, already in the right order
//   S  sort into buckets: buckets, then [[item, bucketIndex], ...]
const dnd = (id, domain, branch, format, prompt, body, explain, o = {}) => ({
  id, domain, branch, v2: o.v2 ?? 'same', format,
  ...(o.scenario ? { scenario: o.scenario } : {}),
  prompt, ...body, explain,
});
export const M = (id, domain, branch, prompt, pairs, explain, o) => dnd(id, domain, branch, 'match', prompt, { pairs: pairs.map(([left, right]) => ({ left, right })) }, explain, o);
export const O = (id, domain, branch, prompt, steps, explain, o) => dnd(id, domain, branch, 'order', prompt, { steps }, explain, o);
export const S = (id, domain, branch, prompt, buckets, items, explain, o) => dnd(id, domain, branch, 'sort', prompt, { buckets, items: items.map(([text, bucket]) => ({ text, bucket })) }, explain, o);

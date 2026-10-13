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

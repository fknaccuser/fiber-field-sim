// Mastery: the collection a trainee builds, and the line between having
// read about something and having used it under pressure.
//
// Three states per concept:
//   unseen     nothing yet
//   practiced  drilled in the farm, or fixed in the Field with help
//   earned     fixed in the Field without help, or a job passed cleanly
//
// Earned is the one that matters, and it is only reachable in the Field.
// You cannot flashcard your way to it. That is deliberate: the collection
// should record what a technician can do, not what they have seen.
//
// Pure. Everything is derived from data the app already keeps, so there is
// no second ledger to fall out of step with the profile.

import { CONCEPTS, conceptsForRecipes, conceptsForJob } from './concepts.js';

export const STATES = ['unseen', 'practiced', 'earned'];

// practice: { questions: {id: {right, seen}}, cards: {id: {right, seen}} }
// Either side may be missing. Card entries share the recall schedule's shape.
function practicedIds(practice) {
  const hit = (table) => Object.entries(table ?? {})
    .filter(([, record]) => (record?.right ?? 0) > 0)
    .map(([id]) => id);
  return {
    questions: new Set(hit(practice?.questions)),
    cards: new Set(hit(practice?.cards)),
  };
}

export function masteryOf({ completedRuns = [], jobsPassed = [], practice = {} } = {}) {
  const earnedBy = new Map();
  const fieldAssisted = new Set();

  for (const run of completedRuns) {
    if (run?.mode !== 'repair') continue;
    for (const concept of conceptsForRecipes(run.recipes)) {
      if (run.assisted) fieldAssisted.add(concept.id);
      else if (!earnedBy.has(concept.id)) earnedBy.set(concept.id, 'ticket');
    }
  }
  for (const jobId of jobsPassed) {
    for (const concept of conceptsForJob(jobId)) {
      if (!earnedBy.has(concept.id)) earnedBy.set(concept.id, 'job');
    }
  }

  const seen = practicedIds(practice);
  return CONCEPTS.map(concept => {
    const drilled = concept.questions.filter(id => seen.questions.has(id)).length
      + concept.cards.filter(id => seen.cards.has(id)).length;
    let state = 'unseen';
    if (earnedBy.has(concept.id)) state = 'earned';
    else if (fieldAssisted.has(concept.id) || drilled > 0) state = 'practiced';
    return {
      id: concept.id,
      label: concept.label,
      state,
      earnedBy: earnedBy.get(concept.id) ?? null,
      assistedInField: fieldAssisted.has(concept.id),
      drilled,
      material: concept.questions.length + concept.cards.length,
    };
  });
}

export function collectionSummary(rows) {
  const count = (state) => rows.filter(r => r.state === state).length;
  return { total: rows.length, earned: count('earned'), practiced: count('practiced'), unseen: count('unseen') };
}

// What to study after a ticket. A ticket fixed without help needs nothing
// more; one fixed with help, or failed, points at the exact drill, cards and
// questions for the concepts involved.
export function studyAfterTicket({ recipes = [], assisted = false, solved = true } = {}) {
  const concepts = conceptsForRecipes(recipes);
  if (solved && !assisted) {
    return { needed: false, concepts: concepts.map(c => c.id), questions: [], cards: [], drill: null };
  }
  const questions = [...new Set(concepts.flatMap(c => c.questions))];
  const cards = [...new Set(concepts.flatMap(c => c.cards))];
  const drill = concepts.find(c => c.drill)?.drill ?? null;
  return { needed: true, concepts: concepts.map(c => c.id), questions, cards, drill };
}

// Recall practice: flashcards on a spaced schedule, and typed answers.
//
// Pure and DOM-free. Time is always passed in as milliseconds, never read
// from the clock here, so a schedule can be tested across days in one run.

const DAY = 24 * 60 * 60 * 1000;

// Leitner boxes. A card moves up one box when you get it right and drops to
// the first box when you miss, so what you know gets out of the way and what
// you do not keeps coming back. Box 1 is due again in the same session.
export const BOXES = [
  { box: 1, wait: 0 },
  { box: 2, wait: 1 * DAY },
  { box: 3, wait: 3 * DAY },
  { box: 4, wait: 7 * DAY },
  { box: 5, wait: 16 * DAY },
];
export const TOP_BOX = BOXES[BOXES.length - 1].box;

const waitFor = (box) => BOXES.find(b => b.box === box)?.wait ?? 0;

export function freshCard() {
  return { box: 1, due: 0, seen: 0, right: 0 };
}

export function review(card = freshCard(), correct, now) {
  const box = correct ? Math.min(TOP_BOX, card.box + 1) : 1;
  return {
    box,
    due: now + waitFor(box),
    seen: card.seen + 1,
    right: card.right + (correct ? 1 : 0),
  };
}

// Cards due now, most overdue first, with never-seen cards after anything
// already in rotation so a session reviews before it introduces.
export function dueCards(ids, schedule, now) {
  const seen = [];
  const fresh = [];
  for (const id of ids) {
    const card = schedule[id];
    if (!card) fresh.push(id);
    else if (card.due <= now) seen.push(id);
  }
  seen.sort((a, b) => schedule[a].due - schedule[b].due);
  return [...seen, ...fresh];
}

export function nextDue(ids, schedule, now) {
  const upcoming = ids
    .map(id => schedule[id]?.due)
    .filter(due => due !== undefined && due > now);
  return upcoming.length ? Math.min(...upcoming) : null;
}

export function summarise(ids, schedule) {
  const counts = Object.fromEntries(BOXES.map(b => [b.box, 0]));
  let fresh = 0;
  for (const id of ids) {
    const card = schedule[id];
    if (!card) fresh += 1;
    else counts[card.box] += 1;
  }
  return { fresh, boxes: counts, mastered: counts[TOP_BOX] };
}

// Typed answers. Case, surrounding space, repeated spaces and trailing
// punctuation never make an answer wrong; the words themselves do.
export function normaliseTyped(value) {
  return String(value ?? '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.!]+$/, '')
    .replace(/^['"]|['"]$/g, '');
}

export function checkTyped(card, value) {
  const given = normaliseTyped(value);
  if (!given) return { correct: false, empty: true };
  const accepted = [card.answer, ...(card.accept ?? [])].map(normaliseTyped);
  return { correct: accepted.includes(given), empty: false };
}

// Question/card session logic (S16.md; MASTER_DESIGN.md §9). Pure content
// selection and grading over the copied STUDY_PACK — no DOM, no Date.now
// except as an overridable default the same way app.js's timer functions
// take one, so tests can supply a fixed value.

import { STUDY_PACK } from './content.js';

export const STUDY_FAMILIES = ['P', 'I', 'V', 'D'];

export function lessonsForFamily(family) {
  if (!family || family === 'all') return STUDY_PACK.lessons;
  return STUDY_PACK.lessons.filter((lesson) => lesson.family === family);
}

export function lessonById(lessonId) {
  return STUDY_PACK.lessons.find((lesson) => lesson.id === lessonId) ?? null;
}

export function questionsForLesson(lessonId) {
  return STUDY_PACK.questions.filter((question) => question.lessonId === lessonId);
}

export function cardsForLesson(lessonId) {
  return STUDY_PACK.cards.filter((card) => card.lessonId === lessonId);
}

// Grading is table data, never inferred: the chosen option's own `correct`
// flag decides (MASTER_DESIGN.md §9: "Reveal explanations on submission").
export function gradeAnswer(questionId, optionId) {
  const question = STUDY_PACK.questions.find((q) => q.id === questionId);
  const option = question?.options.find((o) => o.id === optionId);
  return { correct: option?.correct === true, question, option };
}

// Records the latest answer for a question, replacing any earlier attempt at
// it (MASTER_DESIGN.md §9: "No timed assessment or confidence tracking" —
// only current state matters, not a full attempt history; S15.md's
// acceptance "Quiz correctness is not a prerequisite gate" means this never
// blocks anything, it only informs Progress-adjacent review).
export function recordStudyAnswer(profile, questionId, optionId, now = Date.now()) {
  const { correct } = gradeAnswer(questionId, optionId);
  const entry = { questionId, optionId, correct, answeredAt: new Date(now).toISOString() };
  const studyAnswers = [...profile.studyAnswers.filter((a) => a.questionId !== questionId), entry];
  return { ...profile, studyAnswers };
}

// Records the latest self-assessment for a card (MASTER_DESIGN.md §9:
// "Flashcards use reveal + Got it / Review again").
export function recordCardReview(profile, cardId, remembered, now = Date.now()) {
  const entry = { cardId, remembered: Boolean(remembered), reviewedAt: new Date(now).toISOString() };
  const cardReviews = [...profile.cardReviews.filter((r) => r.cardId !== cardId), entry];
  return { ...profile, cardReviews };
}

export function answerForQuestion(profile, questionId) {
  return profile.studyAnswers.find((a) => a.questionId === questionId) ?? null;
}

export function reviewForCard(profile, cardId) {
  return profile.cardReviews.find((r) => r.cardId === cardId) ?? null;
}

// Case-insensitive substring search across title/body (S16.md: "searchable
// in-app reference"). An empty query returns every entry.
export function searchReference(entries, query) {
  const q = query.trim().toLowerCase();
  if (!q) return entries;
  return entries.filter((entry) => entry.title.toLowerCase().includes(q) || entry.body.toLowerCase().includes(q));
}

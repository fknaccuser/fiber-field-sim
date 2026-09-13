import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  attemptStartMission,
  createInitialState,
  createInitialProfile,
  requestHint,
  currentHintRecipeId,
  isRecipeRepaired,
  showCauseCount,
  showHarmlessDetail,
  pauseMissionTimer,
  resumeMissionTimer,
  openReference,
  openStudy,
  closeStudy,
  selectStudyFamily,
  openLesson,
  closeLesson,
  revealCard,
} from '../../src/solo/app.js';
import { applyAction } from '../../src/solo/actions.js';
import { applyRecipe } from '../../src/solo/generate.js';
import { createHealthyLayout } from '../../src/solo/layouts.js';
import { deriveRequirements } from '../../src/solo/layouts.js';
import { HINTS, CUSTOMER_FACTS, HARMLESS_DETAILS, STUDY_PACK, REFERENCE_ENTRIES } from '../../src/solo/content.js';
import { executeCommand, createTerminalSession } from '../../src/solo/cli.js';
import {
  lessonsForFamily,
  questionsForLesson,
  cardsForLesson,
  gradeAnswer,
  recordStudyAnswer,
  recordCardReview,
  answerForQuestion,
  reviewForCard,
  searchReference,
} from '../../src/solo/study.js';

const REPAIR_ACTIONS = {
  P1: { type: 'setLinkConnected', linkId: 'L1', connected: true },
  P2: { type: 'setPortAdmin', portId: 'SW1:Gi0/1', adminUp: true },
  V1: { type: 'setAccessVlan', portId: 'SW1:Gi0/1', vlanId: 10 },
  V2: { type: 'setTrunkAllowedVlans', portId: 'SW1:Gi0/24', vlans: [10, 20] },
};
function repairActionFor(recipeId, x, host) {
  switch (recipeId) {
    case 'I1':
      return { type: 'setClientAddress', deviceId: 'PC1', ip: `10.${x}.10.${host}`, prefix: 24 };
    case 'I2':
      return { type: 'setClientGateway', deviceId: 'PC1', gateway: `10.${x}.10.1` };
    case 'D1':
      return { type: 'setClientDns', deviceId: 'PC1', dns: `10.${x}.30.53` };
    case 'D2':
      return { type: 'setDnsRecord', serverId: 'S1', name: 'portal.northline.test', address: `10.${x}.30.53` };
    default:
      return REPAIR_ACTIONS[recipeId];
  }
}

test('isRecipeRepaired correctly flags every one of the eight recipes broken, then repaired', () => {
  const x = 71;
  const host = 136;
  for (const recipeId of ['P1', 'P2', 'I1', 'I2', 'V1', 'V2', 'D1', 'D2']) {
    const healthy = createHealthyLayout('BR', x, host);
    const faulted = applyRecipe(healthy, recipeId, x, host);
    const mission = { network: faulted, requirements: deriveRequirements(healthy), targetClientId: 'PC1', targetName: 'portal.northline.test' };
    assert.equal(isRecipeRepaired(mission, recipeId), false, `${recipeId} should read as broken`);
    const repaired = applyAction(faulted, repairActionFor(recipeId, x, host)).state;
    assert.equal(
      isRecipeRepaired({ ...mission, network: repaired }, recipeId),
      true,
      `${recipeId} should read as repaired after its real fix`,
    );
  }
});

function stateWithProfile() {
  return { ...createInitialState(), profile: createInitialProfile() };
}

function startTier(layout, tier, family, seed) {
  return attemptStartMission(stateWithProfile(), `TF1-${layout}-${tier}-${family}-${seed}`);
}

test('content.js has hint copy and customer facts for all eight recipes', () => {
  for (const recipeId of ['P1', 'P2', 'I1', 'I2', 'V1', 'V2', 'D1', 'D2']) {
    assert.ok(HINTS[recipeId], recipeId);
    assert.ok(HINTS[recipeId].nudge && HINTS[recipeId].clue && HINTS[recipeId].step, recipeId);
    assert.ok(CUSTOMER_FACTS[recipeId], recipeId);
  }
  assert.equal(HARMLESS_DETAILS.length, 3);
});

test('tier1/2 show cause count; tier3/4 hide it', () => {
  const tier1 = startTier('HM', 1, 'P', 'a');
  const tier2 = startTier('BR', 2, 'I', 'b');
  const tier3 = startTier('BR', 3, 'V', 'c');
  const tier4 = startTier('BR', 4, 'M', 'd');
  assert.equal(showCauseCount(tier1.mission), true);
  assert.equal(showCauseCount(tier2.mission), true);
  assert.equal(showCauseCount(tier3.mission), false);
  assert.equal(showCauseCount(tier4.mission), false);
});

test('tier3 starts without a cause label: no cause count and no recipe id leak into the brief-facing content', () => {
  const started = startTier('BR', 3, 'D', 'e');
  assert.equal(showCauseCount(started.mission), false);
  // The customer-facing facts/harmless details never mention a recipe ID.
  for (const text of [...Object.values(CUSTOMER_FACTS).flatMap((f) => Object.values(f)), ...HARMLESS_DETAILS]) {
    assert.doesNotMatch(text, /\b[PIVD][12]\b/);
  }
});

test('tier3 shows exactly one harmless detail; other tiers show none', () => {
  const tier1 = startTier('HM', 1, 'P', 'f');
  const tier3 = startTier('BR', 3, 'I', 'g');
  assert.equal(showHarmlessDetail(tier1.mission), false);
  assert.equal(showHarmlessDetail(tier3.mission), true);
  assert.equal(typeof tier3.mission.detail, 'number');
});

test('hints remain available at tier4', () => {
  const started = startTier('BR', 4, 'M', 'h');
  const withHint = requestHint(started);
  assert.equal(withHint.mission.assisted, true);
  const recipeId = currentHintRecipeId(withHint.mission);
  assert.equal(withHint.mission.hintLevels[recipeId], 1);
});

test('requesting a hint sets assisted; ordinary CLI ? does not', () => {
  const started = startTier('HM', 1, 'P', 'i');
  assert.equal(started.mission.assisted, false);

  const terminal = createTerminalSession('PC1', 'client');
  const helpResult = executeCommand(started, terminal, '?', false);
  assert.equal(helpResult.state.mission.assisted, false);

  const hinted = requestHint(started);
  assert.equal(hinted.mission.assisted, true);
});

const TIER4_PAIRS = ['P1+D1', 'P2+I2', 'I1+D1', 'V1+D1', 'V2+I2', 'V2+D1'];

for (const pairText of TIER4_PAIRS) {
  test(`tier4 pair ${pairText}: hints progress to the remaining fault after the first is repaired`, () => {
    const [first, second] = pairText.split('+');
    const x = 88;
    const host = 133;
    const healthy = createHealthyLayout('BR', x, host);
    let faulted = applyRecipe(healthy, first, x, host);
    faulted = applyRecipe(faulted, second, x, host);
    const mission = {
      network: faulted,
      requirements: deriveRequirements(healthy),
      targetClientId: 'PC1',
      targetName: 'portal.northline.test',
      recipeIds: [first, second],
    };
    assert.equal(currentHintRecipeId(mission), first);

    const repairedNetwork = applyAction(faulted, repairActionFor(first, x, host)).state;
    const afterFirstRepair = { ...mission, network: repairedNetwork };
    assert.equal(currentHintRecipeId(afterFirstRepair), second, `after repairing ${first}, hints move to ${second}`);
  });
}

test('paused app time does not increase active elapsed time', () => {
  const started = startTier('HM', 1, 'P', 'k');
  const t0 = started.sessionResumedAt;
  const paused = pauseMissionTimer(started, t0 + 5000);
  assert.equal(paused.mission.elapsedMs, 5000);
  assert.equal(paused.sessionResumedAt, null);

  // Time passes while paused — must not be counted.
  const stillPaused = pauseMissionTimer(paused, t0 + 60000);
  assert.equal(stillPaused.mission.elapsedMs, 5000, 'a no-op pause (already paused) adds nothing');

  const resumed = resumeMissionTimer(stillPaused, t0 + 60000);
  const pausedAgain = pauseMissionTimer(resumed, t0 + 63000);
  assert.equal(pausedAgain.mission.elapsedMs, 8000, '5000 active + 3000 active, the 55000ms paused gap excluded');
});

// --- S16: study pack schema ---

const RECIPES = ['P1', 'P2', 'I1', 'I2', 'V1', 'V2', 'D1', 'D2'];

test('study pack schema: exact counts, unique IDs, one correct option and an explanation for every option', () => {
  assert.equal(STUDY_PACK.schema, 1);
  assert.equal(STUDY_PACK.lessons.length, 8);
  assert.equal(STUDY_PACK.questions.length, 24);
  assert.equal(STUDY_PACK.cards.length, 24);

  assert.equal(new Set(STUDY_PACK.lessons.map((l) => l.id)).size, 8, 'lesson ids unique');
  assert.equal(new Set(STUDY_PACK.questions.map((q) => q.id)).size, 24, 'question ids unique');
  assert.equal(new Set(STUDY_PACK.cards.map((c) => c.id)).size, 24, 'card ids unique');

  const lessonIds = new Set(STUDY_PACK.lessons.map((l) => l.id));
  for (const recipeId of RECIPES) {
    assert.equal(STUDY_PACK.lessons.filter((l) => l.recipeId === recipeId).length, 1, `one lesson for ${recipeId}`);
    assert.equal(STUDY_PACK.questions.filter((q) => q.recipeId === recipeId).length, 3, `three questions for ${recipeId}`);
    assert.equal(STUDY_PACK.cards.filter((c) => c.recipeId === recipeId).length, 3, `three cards for ${recipeId}`);
  }

  for (const question of STUDY_PACK.questions) {
    assert.ok(lessonIds.has(question.lessonId), `${question.id} references a real lesson`);
    assert.equal(question.options.length, 4, `${question.id} has four options`);
    assert.deepEqual(question.options.map((o) => o.id), ['A', 'B', 'C', 'D']);
    const correctOptions = question.options.filter((o) => o.correct === true);
    assert.equal(correctOptions.length, 1, `${question.id} has exactly one correct option`);
    for (const option of question.options) {
      assert.equal(typeof option.explanation, 'string');
      assert.ok(option.explanation.length > 0, `${question.id} option ${option.id} has an explanation`);
    }
  }

  for (const card of STUDY_PACK.cards) {
    assert.ok(lessonIds.has(card.lessonId), `${card.id} references a real lesson`);
    assert.ok(card.front.length > 0 && card.back.length > 0);
  }
});

// --- S16: study.js session logic ---

test('lessonsForFamily filters correctly; "all" and unset return everything', () => {
  assert.equal(lessonsForFamily('P').length, 2); // P1, P2
  assert.equal(lessonsForFamily('I').length, 2);
  assert.equal(lessonsForFamily('all').length, 8);
  assert.equal(lessonsForFamily(undefined).length, 8);
});

test('questionsForLesson/cardsForLesson return exactly that lesson\'s three each', () => {
  const lesson = STUDY_PACK.lessons.find((l) => l.recipeId === 'V1');
  assert.equal(questionsForLesson(lesson.id).length, 3);
  assert.equal(cardsForLesson(lesson.id).length, 3);
});

test('gradeAnswer reads correctness from the option table, never inferred', () => {
  const question = STUDY_PACK.questions[0];
  const correctOption = question.options.find((o) => o.correct);
  const wrongOption = question.options.find((o) => !o.correct);
  assert.equal(gradeAnswer(question.id, correctOption.id).correct, true);
  assert.equal(gradeAnswer(question.id, wrongOption.id).correct, false);
});

test('recordStudyAnswer replaces an earlier attempt at the same question, and quiz correctness gates nothing', () => {
  const question = STUDY_PACK.questions[0];
  const correctOption = question.options.find((o) => o.correct);
  const wrongOption = question.options.find((o) => !o.correct);
  let profile = createInitialProfile();

  profile = recordStudyAnswer(profile, question.id, wrongOption.id, 1000);
  assert.equal(profile.studyAnswers.length, 1);
  assert.equal(answerForQuestion(profile, question.id).correct, false);

  // A wrong answer is not a gate: nothing here blocks anything, and a later
  // (even a correct) re-answer just replaces the stored entry.
  profile = recordStudyAnswer(profile, question.id, correctOption.id, 2000);
  assert.equal(profile.studyAnswers.length, 1, 'replaces, does not accumulate a history');
  assert.equal(answerForQuestion(profile, question.id).correct, true);
});

test('recordCardReview tracks Got it / Review again per card, replacing earlier reviews', () => {
  const card = STUDY_PACK.cards[0];
  let profile = createInitialProfile();
  profile = recordCardReview(profile, card.id, false, 1000);
  assert.equal(reviewForCard(profile, card.id).remembered, false);
  profile = recordCardReview(profile, card.id, true, 2000);
  assert.equal(profile.cardReviews.length, 1);
  assert.equal(reviewForCard(profile, card.id).remembered, true);
});

// --- S16: reference sheet ---

test('reference entries cover every supported CLI command with a deviceKind and one example', () => {
  assert.ok(REFERENCE_ENTRIES.length > 0);
  assert.equal(new Set(REFERENCE_ENTRIES.map((e) => e.id)).size, REFERENCE_ENTRIES.length, 'unique ids');
  const cliEntries = REFERENCE_ENTRIES.filter((e) => e.deviceKind);
  for (const entry of cliEntries) {
    assert.ok(['switch', 'router', 'client', 'server'].includes(entry.deviceKind), entry.id);
    assert.match(entry.body, /Example/, `${entry.id} names a valid example`);
  }
  const conceptEntries = REFERENCE_ENTRIES.filter((e) => !e.deviceKind);
  assert.ok(conceptEntries.length >= 4, 'link-up/service-up, IP/DNS, access/trunk, config/verification');
});

test('searchReference matches title or body case-insensitively; empty query returns everything', () => {
  const results = searchReference(REFERENCE_ENTRIES, 'vlan');
  assert.ok(results.length > 0);
  assert.ok(results.every((e) => e.title.toLowerCase().includes('vlan') || e.body.toLowerCase().includes('vlan')));
  assert.equal(searchReference(REFERENCE_ENTRIES, '').length, REFERENCE_ENTRIES.length);
  const nslookupResults = searchReference(REFERENCE_ENTRIES, 'NSLOOKUP');
  assert.ok(nslookupResults.some((e) => e.id === 'ref-client-nslookup'));
});

// --- S16: opening the reference during repair sets assisted; returning preserves mission state ---

test('opening the reference during an active repair mission marks it assisted without otherwise touching the mission', () => {
  const started = startTier('HM', 1, 'P', 'ref1');
  assert.equal(started.mission.assisted, false);
  const opened = openReference(started);
  assert.equal(opened.mission.assisted, true);
  assert.equal(opened.mission.id, started.mission.id, 'same mission, not replaced');
  assert.equal(opened.mission.network, started.mission.network, 'network untouched');
  assert.equal(opened.selectedDeviceId, started.selectedDeviceId);
  assert.equal(opened.screen, started.screen, 'app.js does not change screen; navigation is main.js\'s job');
  const assistanceEvent = opened.mission.events.find((e) => e.kind === 'assistance' && e.details.type === 'reference');
  assert.ok(assistanceEvent);
});

test('opening the reference outside an active repair mission (no mission, or configure mode) is a no-op', () => {
  const noMission = createInitialState();
  assert.equal(openReference(noMission), noMission);

  const configureState = { ...createInitialState(), profile: createInitialProfile() };
  const started = startTier('HM', 1, 'P', 'ref2');
  const configureMission = { ...started.mission, mode: 'configure' };
  const withConfigure = { ...started, mission: configureMission };
  const opened = openReference(withConfigure);
  assert.equal(opened.mission.assisted, false, 'configure mode never gains assisted from the reference');
});

// --- S16: Study screen navigation ---

test('openStudy/selectStudyFamily/openLesson/closeLesson/closeStudy manage studySession without touching profile or mission', () => {
  const state = stateWithProfile();
  let s = openStudy(state);
  assert.equal(s.screen, 'study');
  assert.deepEqual(s.studySession, { family: 'all', lessonId: null, revealedCardIds: [] });

  s = selectStudyFamily(s, 'V');
  assert.equal(s.studySession.family, 'V');
  assert.equal(s.studySession.lessonId, null);

  const lesson = STUDY_PACK.lessons.find((l) => l.family === 'V');
  s = openLesson(s, lesson.id);
  assert.equal(s.studySession.lessonId, lesson.id);

  s = closeLesson(s);
  assert.equal(s.studySession.lessonId, null);
  assert.equal(s.studySession.family, 'V', 'closing a lesson keeps the family filter');

  s = closeStudy(s);
  assert.equal(s.screen, 'home');
  assert.equal(s.studySession, null);
  assert.equal(s.profile, state.profile, 'study navigation never touches the profile');
});

test('revealCard tracks revealed flashcards transiently, reset on a new lesson', () => {
  const state = stateWithProfile();
  const lesson = STUDY_PACK.lessons[0];
  let s = openStudy(state);
  s = openLesson(s, lesson.id);
  const card = cardsForLesson(lesson.id)[0];
  s = revealCard(s, card.id);
  assert.deepEqual(s.studySession.revealedCardIds, [card.id]);
  s = revealCard(s, card.id); // idempotent
  assert.deepEqual(s.studySession.revealedCardIds, [card.id]);

  s = closeLesson(s);
  assert.deepEqual(s.studySession.revealedCardIds, [], 'closing the lesson clears reveal state');
});

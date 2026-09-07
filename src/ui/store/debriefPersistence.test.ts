import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { getScenario, instantiateScenario } from '../../scenarios';
import { resolveProfileSet } from '../../profiles';
import { perform, startSession } from '../../session/runner';
import { scoreSession } from '../../scoring/score';
import { _useDatabase, getSession, saveSession } from './persistence';
import { loadDebriefSession } from './sessionStore';

it('rebuilds a legacy debrief without changing its historical score or stored row', async () => {
  _useDatabase('legacy-teaching-report');
  const def = getScenario('t1-dark-ont-vista-court');
  const { world, meta } = instantiateScenario(def, 1);
  let state = startSession(world, resolveProfileSet(def.profiles), meta);
  for (const step of meta.referenceSolution.steps) state = perform(state, step).state;
  const report = scoreSession(state);
  delete report.debrief;
  report.total = 73;
  await saveSession({ id: 'legacy', traineeId: 'trainee', startedAt: '2026-01-01T00:00:00Z' }, state, report);
  const upgraded = await loadDebriefSession('legacy');
  expect(upgraded?.report?.total).toBe(73);
  expect(upgraded?.report?.debrief?.verdict).toBe('correct');
  expect(upgraded?.report?.debrief?.walkthrough).toHaveLength(3);
  expect((await getSession('legacy'))?.report?.debrief).toBeUndefined();
});

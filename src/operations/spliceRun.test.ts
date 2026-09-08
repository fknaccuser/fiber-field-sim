import { describe, expect, it } from 'vitest';
import {
  applyIntervention,
  attemptSplice,
  CONDITION_LABEL,
  intervention,
  INTERVENTIONS,
  nextRibbon,
  pace,
  RUN_MAX_DB,
  SHIFT_SECONDS,
  startRun,
  type Condition,
  type RunState,
} from './spliceRun';

function withConditions(conditions: Condition[], over: Partial<RunState> = {}): RunState {
  return { ...startRun(1), conditions, ribbonFault: null, attemptsOnRibbon: 0, ...over };
}

describe('the shift', () => {
  it('is deterministic for a seed', () => {
    expect(startRun(42)).toEqual(startRun(42));
  });

  it('often starts with the machine already against you', () => {
    // A shared splicer arrives how the last technician left it.
    let dirty = 0;
    for (let s = 1; s <= 60; s++) if (startRun(s).conditions.length > 0) dirty++;
    expect(dirty).toBeGreaterThan(30);
  });

  it('gives a real shift to work in', () => {
    expect(startRun(1).secondsLeft).toBe(SHIFT_SECONDS);
  });
});

describe('the symptom is the diagnosis, and it is never named', () => {
  it('an uncalibrated arc lifts every fibre together', () => {
    const { result } = attemptSplice(withConditions(['arc-uncalibrated']));
    expect(result.symptom).toBe('uniform-high');
    expect(result.completed).toBe(false);
    const spread = Math.max(...result.lossDb) - Math.min(...result.lossDb);
    expect(spread).toBeLessThan(0.15);
  });

  it('a worn blade takes a scattered few and leaves the rest normal', () => {
    const { result } = attemptSplice(withConditions(['dull-blade']));
    expect(result.symptom).toBe('scattered-high');
    expect(Math.min(...result.lossDb)).toBeLessThan(0.1);
  });

  it('an uneven matrix takes the outer fibres only', () => {
    const { result } = attemptSplice(withConditions([], { ribbonFault: 'uneven-matrix' }));
    expect(result.symptom).toBe('edges-high');
  });

  it('debris on the pads breaks fibre instead of producing readings at all', () => {
    const { result } = attemptSplice(withConditions(['dirty-pads']));
    expect(result.symptom).toBe('fibres-breaking');
    expect(result.lossDb).toEqual([]);
    expect(result.message).toMatch(/broke in the cleaver/i);
  });

  it('dust in the grooves makes the machine refuse, and it names the fibres', () => {
    const { result } = attemptSplice(withConditions(['dirty-vgrooves']));
    expect(result.symptom).toBe('offset-refused');
    expect(result.message).toMatch(/offset of fibre exceeds/i);
    expect(result.message).toMatch(/fibres \d+ and \d+/i);
  });

  it('never tells the trainee the cause in the message', () => {
    // The message reports what the machine saw. Naming the cause would remove the job.
    for (const c of ['arc-uncalibrated', 'dull-blade', 'dirty-pads', 'dirty-vgrooves'] as Condition[]) {
      const { result } = attemptSplice(withConditions([c]));
      expect(result.message.toLowerCase()).not.toContain('arc test');
      expect(result.message.toLowerCase()).not.toContain('blade');
      expect(result.message.toLowerCase()).not.toContain('v-groove');
      expect(result.message.toLowerCase()).not.toContain('pads');
    }
  });

  it('splices cleanly when nothing is wrong', () => {
    const { result, state } = attemptSplice(withConditions([]));
    expect(result.completed).toBe(true);
    expect(result.symptom).toBe('clean');
    expect(Math.max(...result.lossDb)).toBeLessThanOrEqual(RUN_MAX_DB);
    expect(state.done).toBe(1);
  });
});

describe('interventions cost time whether or not they help', () => {
  it('the right one clears the condition', () => {
    const before = withConditions(['dirty-vgrooves']);
    const after = applyIntervention(before, 'clean-vgrooves');
    expect(after.conditions).not.toContain('dirty-vgrooves');
  });

  it('the wrong one costs the same minutes and fixes nothing', () => {
    const before = withConditions(['dirty-vgrooves']);
    const wrong = applyIntervention(before, 'rotate-blade');
    expect(wrong.conditions).toContain('dirty-vgrooves');
    expect(wrong.secondsLeft).toBeLessThan(before.secondsLeft);
  });

  it('makes the arc test the expensive way to be wrong', () => {
    const arc = intervention('arc-test');
    for (const other of INTERVENTIONS.filter((i) => i.id !== 'arc-test')) {
      expect(arc.seconds).toBeGreaterThan(other.seconds);
    }
  });

  it('re-prepping clears the ribbon but not the machine', () => {
    const before = withConditions(['dull-blade'], { ribbonFault: 'contaminated' });
    const after = applyIntervention(before, 're-prep');
    expect(after.ribbonFault).toBeNull();
    expect(after.conditions).toContain('dull-blade');
  });

  it('and the symptom comes back if you fixed the wrong thing', () => {
    let state = withConditions(['dull-blade']);
    const first = attemptSplice(state).result.symptom;
    state = applyIntervention(state, 'clean-vgrooves');
    expect(attemptSplice(state).result.symptom).toBe(first);
  });

  it('throws on an unknown intervention rather than silently doing nothing', () => {
    expect(() => intervention('polish-it')).toThrow(/unknown intervention/);
  });
});

describe('the clock is the whole pressure', () => {
  it('every attempt and every intervention spends it', () => {
    const a = withConditions([]);
    expect(attemptSplice(a).state.secondsLeft).toBeLessThan(a.secondsLeft);
    expect(applyIntervention(a, 'retry').secondsLeft).toBeLessThan(a.secondsLeft);
  });

  it('ends the shift when it runs out, and never goes negative', () => {
    const nearly = withConditions([], { secondsLeft: 30 });
    const after = applyIntervention(nearly, 'arc-test');
    expect(after.secondsLeft).toBe(0);
    expect(after.finished).toBe(true);
  });

  it('reports the pace a foreman would ask for', () => {
    const state = { ...withConditions([]), done: 6, secondsLeft: SHIFT_SECONDS - 3600 };
    expect(pace(state)).toBe(6);
    expect(pace(withConditions([]))).toBe(0);
  });
});

describe('the case wears as you work it', () => {
  it('can introduce new conditions between ribbons', () => {
    let introduced = 0;
    for (let s = 1; s <= 80; s++) {
      const state = { ...startRun(s), conditions: [] as Condition[], done: 3 };
      if (nextRibbon(state).conditions.length > 0) introduced++;
    }
    expect(introduced).toBeGreaterThan(0);
  });

  it('sometimes hands you a bad ribbon rather than a bad machine', () => {
    let faults = 0;
    for (let s = 1; s <= 80; s++) {
      const state = { ...startRun(s), conditions: [] as Condition[], done: 2 };
      if (nextRibbon(state).ribbonFault) faults++;
    }
    expect(faults).toBeGreaterThan(0);
  });

  it('never removes a condition just by moving on', () => {
    const state = { ...startRun(5), conditions: ['dull-blade'] as Condition[], done: 1 };
    expect(nextRibbon(state).conditions).toContain('dull-blade');
  });
});

describe('the conditions are nameable, for the debrief', () => {
  it('labels every one', () => {
    for (const c of ['arc-uncalibrated', 'dirty-vgrooves', 'dull-blade', 'dirty-pads'] as Condition[]) {
      expect(CONDITION_LABEL[c].length).toBeGreaterThan(10);
    }
  });
});

describe('cause and effect stay legible', () => {
  it('a condition ALWAYS produces its symptom, so a wrong fix never looks like it worked', () => {
    for (let i = 0; i < 30; i++) {
      const pads = withConditions(['dirty-pads'], { done: i });
      expect(attemptSplice(pads).result.symptom).toBe('fibres-breaking');
      const grooves = withConditions(['dirty-vgrooves'], { done: i });
      expect(attemptSplice(grooves).result.symptom).toBe('offset-refused');
    }
  });

  it('layers two faults: the breakage hides the offset until you clear it', () => {
    let state = withConditions(['dirty-pads', 'dirty-vgrooves']);
    expect(attemptSplice(state).result.symptom).toBe('fibres-breaking');
    state = applyIntervention(state, 'clean-pads');
    expect(attemptSplice(state).result.symptom).toBe('offset-refused');
    state = applyIntervention(state, 'clean-vgrooves');
    expect(attemptSplice(state).result.completed).toBe(true);
  });
});

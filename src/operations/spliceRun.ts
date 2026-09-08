/**
 * The splice run: work the case, not the checklist.
 *
 * The first version of this bench listed the procedure and offered "do it properly" beside
 * "take the shortcut". That is a compliance test, not training — the right answer is
 * printed on the button, nothing is hidden, and no judgement is required.
 *
 * The real job is the opposite shape. You are thirty-six ribbons into a case with a clock
 * running, the machine reports something wrong, and you have to work out WHICH of half a
 * dozen causes it is from the shape of the evidence. Every guess costs minutes you do not
 * get back.
 *
 * So the machine carries hidden CONDITIONS. They persist until you actually fix them, they
 * produce distinguishable symptoms, and the whole skill is reading the symptom and picking
 * the cheapest intervention that could explain it:
 *
 *   every fibre up together .... the arc, or contamination on this ribbon
 *   a scattered few high ....... the cleaver blade
 *   the outer fibres only ...... the glue matrix on this ribbon
 *   fibres breaking, not loss .. debris on the cleaver pads
 *   machine refuses on offset .. dust in the V-grooves
 *
 * Those five are the same signatures the loss model already produced. This module finally
 * asks the trainee to use them.
 *
 * Pure and seeded: the same shift plays out identically for the same seed.
 */
import { createRng, deriveSeed, type Rng } from '../world';

/** Faults that live in the machine or the kit and persist until fixed. */
export type Condition =
  | 'arc-uncalibrated'
  | 'dirty-vgrooves'
  | 'dull-blade'
  | 'dirty-pads';

/** Faults that belong to the ribbon in front of you and clear when you re-prep it. */
export type RibbonFault = 'contaminated' | 'uneven-matrix';

export const CONDITION_LABEL: Record<Condition, string> = {
  'arc-uncalibrated': 'Arc never calibrated for these conditions',
  'dirty-vgrooves': 'Dust in the V-grooves',
  'dull-blade': 'Cleaver blade worn at this position',
  'dirty-pads': 'Debris on the cleaver pads',
};

export interface Intervention {
  id: string;
  label: string;
  /** What it costs you off the shift. */
  seconds: number;
  /** Conditions it actually clears. */
  fixes: Condition[];
  /** True if it re-preps the ribbon, clearing anything wrong with this ribbon alone. */
  repsRibbon: boolean;
  hint: string;
}

/**
 * Everything you can do about a symptom, with what it costs.
 *
 * The arc test is deliberately brutal at ten minutes. It is the correct answer to exactly
 * one symptom and an expensive way to be wrong about any other — which is the trade-off a
 * splicer actually weighs at the machine.
 */
export const INTERVENTIONS: readonly Intervention[] = [
  {
    id: 'clean-vgrooves', label: 'Clean the V-grooves', seconds: 60,
    fixes: ['dirty-vgrooves'], repsRibbon: false,
    hint: 'Brush, or run cleaved scrap through at an angle.',
  },
  {
    id: 'rotate-blade', label: 'Rotate the cleaver blade', seconds: 45,
    fixes: ['dull-blade'], repsRibbon: false,
    hint: 'Advance to an unused position on the blade.',
  },
  {
    id: 'clean-pads', label: 'Clean the cleaver pads', seconds: 90,
    fixes: ['dirty-pads'], repsRibbon: false,
    hint: 'Debris on the pads chips fibre before the blade ever touches it.',
  },
  {
    id: 'arc-test', label: 'Run an arc test', seconds: 600,
    fixes: ['arc-uncalibrated'], repsRibbon: false,
    hint: 'Ten minutes of the shift. Right once; expensive every other time.',
  },
  {
    id: 're-prep', label: 'Re-prep this ribbon', seconds: 240,
    fixes: [], repsRibbon: true,
    hint: 'Strip, clean, tap, cleave again. Fixes the ribbon, not the machine.',
  },
  {
    id: 'retry', label: 'Just try it again', seconds: 90,
    fixes: [], repsRibbon: false,
    hint: 'Costs a minute and a half and changes nothing. Sometimes that is the right call.',
  },
];

export function intervention(id: string): Intervention {
  const i = INTERVENTIONS.find((x) => x.id === id);
  if (!i) throw new Error(`unknown intervention: ${id}`);
  return i;
}

export type Symptom =
  | 'clean'
  | 'uniform-high'
  | 'scattered-high'
  | 'edges-high'
  | 'fibres-breaking'
  | 'offset-refused';

export interface AttemptResult {
  symptom: Symptom;
  /** Per-fibre readings, empty when the machine refused or the fibre broke. */
  lossDb: number[];
  /** What the machine actually says, in its own words. */
  message: string;
  /** True when the ribbon is spliced and you can move on. */
  completed: boolean;
  /** Seconds this attempt consumed. */
  seconds: number;
}

export interface RunState {
  seed: number;
  /** Ribbons finished. */
  done: number;
  target: number;
  secondsLeft: number;
  conditions: Condition[];
  ribbonFault: RibbonFault | null;
  /** Attempts spent on the ribbon currently in the machine. */
  attemptsOnRibbon: number;
  /** Interventions performed, for the debrief. */
  actions: string[];
  finished: boolean;
}

export const SHIFT_SECONDS = 6 * 60 * 60;

/**
 * Open a case. Some shifts start with the machine already against you — an arc that was
 * never run, a blade left where the last technician stopped — because that is how a shared
 * splicer arrives.
 */
export function startRun(seed: number, target = 12): RunState {
  const rng = createRng(deriveSeed(seed, 'splice-run'));
  const conditions: Condition[] = [];
  // The arc is the common one: nobody calibrated before starting.
  if (rng.next() < 0.7) conditions.push('arc-uncalibrated');
  if (rng.next() < 0.25) conditions.push('dull-blade');
  if (rng.next() < 0.2) conditions.push('dirty-vgrooves');

  return {
    seed,
    done: 0,
    target,
    secondsLeft: SHIFT_SECONDS,
    conditions,
    ribbonFault: null,
    attemptsOnRibbon: 0,
    actions: [],
    finished: false,
  };
}

function losses(rng: Rng, conditions: readonly Condition[], fault: RibbonFault | null): number[] {
  let uniform = 0.03;
  let edges = 0;
  let scattered = 0;
  if (conditions.includes('arc-uncalibrated')) uniform += 0.12;
  if (conditions.includes('dirty-vgrooves')) uniform += 0.05;
  if (conditions.includes('dull-blade')) scattered += 0.22;
  if (fault === 'contaminated') uniform += 0.22;
  if (fault === 'uneven-matrix') edges += 0.18;

  const out: number[] = [];
  for (let i = 0; i < 12; i++) {
    let v = uniform + rng.next() * 0.035;
    if (edges > 0 && (i === 0 || i === 11)) v += edges;
    if (scattered > 0 && rng.next() < 0.3) v += scattered;
    out.push(Math.round(v * 1000) / 1000);
  }
  return out;
}

/** The acceptance line the run is worked against. */
export const RUN_MAX_DB = 0.20;
export const RUN_MEAN_DB = 0.10;

/**
 * Try to splice the ribbon in the machine.
 *
 * Order matters: the machine cannot report loss on a ribbon it refused to align, and it
 * cannot align a fibre that broke in the cleaver. Those two produce their own symptoms and
 * are the ones a trainee most often mistakes for "a bad splicer".
 */
export function attemptSplice(state: RunState): { state: RunState; result: AttemptResult } {
  const rng = createRng(deriveSeed(state.seed, 'attempt', String(state.done), String(state.attemptsOnRibbon)));

  // Debris on the pads chips the fibre before the blade is even the question.
  //
  // Deterministic, not intermittent. Real dirty grooves do fail on and off, but an
  // intermittent symptom means a WRONG fix is sometimes followed by a good splice — which
  // teaches that the wrong fix worked. The causal link is the thing being trained, so it is
  // kept clean: while the condition is there, the symptom is there.
  if (state.conditions.includes('dirty-pads')) {
    const result: AttemptResult = {
      symptom: 'fibres-breaking',
      lossDb: [],
      message: 'Fibre broke in the cleaver. Two of the twelve are chipped short.',
      completed: false,
      seconds: 150,
    };
    return { state: spend(state, 150, false), result };
  }

  // Dust in the grooves stops it aligning, and the machine names the fibres. Checked after
  // the pads, so a machine with both faults is a layered problem: clear the breakage first,
  // and only then does the offset become visible.
  if (state.conditions.includes('dirty-vgrooves')) {
    const which = [1 + rng.int(0, 4), 6 + rng.int(0, 5)];
    const result: AttemptResult = {
      symptom: 'offset-refused',
      lossDb: [],
      message: `Offset of fibre exceeds the allowable limit — fibres ${which.join(' and ')}. Splice not performed.`,
      completed: false,
      seconds: 90,
    };
    return { state: spend(state, 90, false), result };
  }

  const lossDb = losses(rng, state.conditions, state.ribbonFault);
  const worst = Math.max(...lossDb);
  const mean = lossDb.reduce((a, b) => a + b, 0) / lossDb.length;
  const spread = worst - Math.min(...lossDb);
  const passes = worst <= RUN_MAX_DB && mean <= RUN_MEAN_DB;

  if (passes) {
    return {
      state: spend({ ...state, done: state.done + 1, ribbonFault: null, attemptsOnRibbon: -1 }, 210, true),
      result: {
        symptom: 'clean', lossDb, completed: true, seconds: 210,
        message: `Spliced. Mean ${mean.toFixed(3)} dB, worst ${worst.toFixed(3)} dB.`,
      },
    };
  }

  // Failed. The SHAPE is the diagnosis, and the message deliberately does not give it away.
  const edgesHigh = (lossDb[0] > RUN_MAX_DB || lossDb[11] > RUN_MAX_DB) && Math.max(...lossDb.slice(1, -1)) < RUN_MEAN_DB;
  const symptom: Symptom = edgesHigh ? 'edges-high' : spread > 0.15 ? 'scattered-high' : 'uniform-high';

  return {
    state: spend(state, 210, false),
    result: {
      symptom, lossDb, completed: false, seconds: 210,
      message: `Rejected. Mean ${mean.toFixed(3)} dB, worst ${worst.toFixed(3)} dB against a ${RUN_MAX_DB.toFixed(2)} dB limit.`,
    },
  };
}

function spend(state: RunState, seconds: number, completed: boolean): RunState {
  const left = state.secondsLeft - seconds;
  return {
    ...state,
    secondsLeft: Math.max(0, left),
    attemptsOnRibbon: completed ? 0 : state.attemptsOnRibbon + 1,
    finished: left <= 0 || (completed && state.done >= state.target),
  };
}

/**
 * Do something about it.
 *
 * Wrong interventions are not punished with a message — they simply do not fix anything,
 * and the same symptom comes back on the next attempt having cost you the time. That is
 * how it goes at the machine, and it is the part that makes reading the symptom worth
 * learning.
 */
export function applyIntervention(state: RunState, id: string): RunState {
  const iv = intervention(id);
  const conditions = state.conditions.filter((c) => !iv.fixes.includes(c));
  const left = state.secondsLeft - iv.seconds;
  return {
    ...state,
    conditions,
    ribbonFault: iv.repsRibbon ? null : state.ribbonFault,
    secondsLeft: Math.max(0, left),
    actions: [...state.actions, id],
    finished: left <= 0,
  };
}

/**
 * Wear, and the next ribbon.
 *
 * A blade dulls with use and a fresh ribbon can arrive contaminated or badly glued. Both
 * are seeded off the ribbon number, so a shift is reproducible and a trainee can be shown
 * the same case twice.
 */
export function nextRibbon(state: RunState): RunState {
  const rng = createRng(deriveSeed(state.seed, 'ribbon', String(state.done)));
  const conditions = [...state.conditions];
  if (!conditions.includes('dull-blade') && rng.next() < 0.16) conditions.push('dull-blade');
  if (!conditions.includes('dirty-pads') && rng.next() < 0.14) conditions.push('dirty-pads');
  if (!conditions.includes('dirty-vgrooves') && rng.next() < 0.12) conditions.push('dirty-vgrooves');

  let fault: RibbonFault | null = null;
  const roll = rng.next();
  if (roll < 0.12) fault = 'contaminated';
  else if (roll < 0.2) fault = 'uneven-matrix';

  return { ...state, conditions, ribbonFault: fault, attemptsOnRibbon: 0 };
}

/** Ribbons per hour actually achieved — the number a foreman would ask for. */
export function pace(state: RunState): number {
  const used = SHIFT_SECONDS - state.secondsLeft;
  if (used <= 0) return 0;
  return Math.round((state.done / (used / 3600)) * 10) / 10;
}

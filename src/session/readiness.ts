/**
 * What you did — or did not — do before you left the yard.
 *
 * Half of being good at this job is the pre-trip. The simulator teaches that by letting it
 * go wrong: some mornings you reach the truck and the VFL is on the bench, or the OTDR did
 * not get charged. Seeded, so a day is reproducible, and deliberately bounded — a readiness
 * failure never takes a tool the job actually needs, so it can cost you time and composure
 * but can never make a work order unsolvable.
 */
import { createRng, deriveSeed } from '../world';
import type { Intent } from './types';
import { ROLE_POLICY, type Role } from './roles';

/**
 * Note the absence of a dirty-probe-tip morning. It was written, and removed again: it took
 * nothing off the truck, no instrument read differently because of it, and there was no
 * action to clean the tip with — so it announced a consequence that never arrived. A
 * readiness fault has to be visible somewhere real or it is a lie to the trainee. Put it
 * back when `scopeInspect` can be told about it and the shelf can offer a cleaning stick.
 */
export type ReadinessFault = 'forgot-vfl' | 'forgot-scope' | 'flat-otdr-battery' | 'no-cleaning-kit';

export interface Readiness {
  fault: ReadinessFault | null;
  /** Inventory strings to strip from the truck. */
  removes: string[];
  /** What the trainee sees on the shelf. */
  headline: string;
  /** Shown to junior grades only: the habit that would have prevented it. */
  coaching: string | null;
}

const NONE: Readiness = { fault: null, removes: [], headline: '', coaching: null };

/** How likely a morning goes wrong, by grade. Seniors are not immune, they just get no warning. */
const CHANCE: Record<Role, number> = { l1: 0.28, l2: 0.24, l3: 0.18, senior: 0.14, manager: 0.1 };

const DETAIL: Record<ReadinessFault, { removes: string[]; needs: string[]; headline: string; coaching: string }> = {
  'forgot-vfl': {
    removes: ['vfl'],
    needs: ['vfl'],
    headline: 'The VFL is not on the truck. It is still on the bench where you tested it.',
    coaching: 'Run the pre-trip before you leave the yard: every instrument out of the case and back in it.',
  },
  'forgot-scope': {
    removes: ['inspection-scope'],
    needs: ['inspection-scope'],
    headline: 'No inspection scope. It never made it back from the last job.',
    coaching: 'Count the kit back in at the end of a job, not the start of the next one.',
  },
  'flat-otdr-battery': {
    removes: ['otdr'],
    needs: ['otdr'],
    headline: 'The OTDR is dead. It has been sitting off the charger since Friday.',
    coaching: 'Put the tester on charge overnight. A flat OTDR is a wasted truck roll.',
  },
  'no-cleaning-kit': {
    removes: ['cleaning-kit'],
    needs: [],
    headline: 'No cleaning supplies on the truck.',
    coaching: 'Restock consumables the night before: cleaning sticks, sleeves, spare jumpers.',
  },
};

const ORDER: ReadinessFault[] = ['forgot-vfl', 'forgot-scope', 'flat-otdr-battery', 'no-cleaning-kit'];

/** Inventory strings the reference solution genuinely depends on. */
export function toolsRequiredBy(steps: readonly Intent[]): Set<string> {
  const needed = new Set<string>();
  for (const step of steps) {
    if (step.type === 'otdr-shot') needed.add('otdr');
    else if (step.type === 'power-meter') needed.add('power-meter');
    else if (step.type === 'vfl') needed.add('vfl');
    else if (step.type === 'scope') needed.add('inspection-scope');
  }
  return needed;
}

/**
 * Decides the morning. `referenceSteps` is used only to guarantee the failure never removes
 * something the job needs — it is never surfaced to the trainee.
 */
export function readinessFor(seed: number, role: Role, referenceSteps: readonly Intent[]): Readiness {
  const rng = createRng(deriveSeed(seed, 'readiness', role));
  if (rng.next() > CHANCE[role]) return NONE;

  const required = toolsRequiredBy(referenceSteps);
  const safe = ORDER.filter((f) => DETAIL[f].needs.every((tool) => !required.has(tool)));
  if (safe.length === 0) return NONE;

  const fault = safe[rng.int(0, safe.length - 1)];
  const detail = DETAIL[fault];
  return {
    fault,
    removes: detail.removes,
    headline: detail.headline,
    // Junior grades are coached. From L3 up the same morning happens with no warning.
    coaching: ROLE_POLICY[role].guidance === 'guided' || ROLE_POLICY[role].guidance === 'answers' ? detail.coaching : null,
  };
}

/** The truck as it actually leaves the yard. */
export function applyReadiness(inventory: readonly string[], readiness: Readiness): string[] {
  return inventory.filter((item) => !readiness.removes.includes(item));
}

/**
 * The pre-trip.
 *
 * Half of being good at this job happens before you turn the key, and the simulator kept
 * asserting that in coaching text while giving the trainee no way to act on it: readiness
 * was decided by seed alone, so "run the pre-trip before you leave the yard" was advice
 * about a thing that did not exist.
 *
 * It exists now, and it is deliberately a *choice*. You never get to check everything —
 * `prepChecks` is always fewer than this list, and shrinks as you rise — so the question is
 * not "will you prepare" but "what can you least afford to be wrong about on this job".
 * That is the decision a real technician makes at six in the morning.
 *
 * Pure: no React. What you checked rides in the URL, so a run stays reproducible.
 */
import type { ReadinessFault } from '../../session/readiness';
import { ROLE_POLICY, type Role } from '../../session/roles';

export interface PrepItem {
  /** The morning this check rules out. */
  id: ReadinessFault;
  label: string;
  /** What you are actually doing. */
  action: string;
  /** What it costs you if you skip it and the morning goes that way. */
  consequence: string;
}

export const PREP_ITEMS: readonly PrepItem[] = [
  {
    id: 'flat-otdr-battery',
    label: 'OTDR',
    action: 'Put the tester on the charger overnight.',
    consequence: 'A flat OTDR is a wasted truck roll — you cannot put a distance on anything.',
  },
  {
    id: 'forgot-vfl',
    label: 'VFL',
    action: 'Pen back in the case after you test it on the bench.',
    consequence: 'No red light means no finding a bend or a break by eye.',
  },
  {
    id: 'forgot-scope',
    label: 'Inspection scope',
    action: 'Count the kit back in at the end of the last job.',
    consequence: 'You cannot inspect an end-face you cannot look at.',
  },
  {
    id: 'dirty-scope-tip',
    label: 'Probe tip',
    action: 'Clean the tip before it goes back in the case.',
    consequence: 'A dirty tip prints the same debris on every connector, and you condemn a good one.',
  },
  {
    id: 'no-cleaning-kit',
    label: 'Consumables',
    action: 'Restock cleaning sticks, sleeves and spare jumpers.',
    consequence: 'Nothing to clean with when you find something dirty in the field.',
  },
];

/** How many of the list this grade gets through before it has to leave. */
export function checksAllowed(role: Role): number {
  return Math.max(0, Math.min(ROLE_POLICY[role].prepChecks, PREP_ITEMS.length - 1));
}

function isFault(value: string): value is ReadinessFault {
  return PREP_ITEMS.some((i) => i.id === value);
}

/**
 * Read the checked items back off a URL. Unknown ids are dropped and the list is capped at
 * the grade's allowance, so a hand-edited link cannot buy a perfect morning.
 */
export function parsePrep(param: string | null, role: Role): ReadinessFault[] {
  if (!param) return [];
  const seen = new Set<ReadinessFault>();
  for (const raw of param.split(',')) {
    const id = raw.trim();
    if (isFault(id)) seen.add(id);
  }
  return [...seen].slice(0, checksAllowed(role));
}

export function serializePrep(prepared: readonly ReadinessFault[]): string {
  return prepared.join(',');
}

/** Whether another box can still be ticked. */
export function canCheckMore(prepared: readonly ReadinessFault[], role: Role): boolean {
  return prepared.length < checksAllowed(role);
}

/** Ticking is a toggle, bounded by the allowance. */
export function togglePrep(prepared: readonly ReadinessFault[], id: ReadinessFault, role: Role): ReadinessFault[] {
  if (prepared.includes(id)) return prepared.filter((p) => p !== id);
  return canCheckMore(prepared, role) ? [...prepared, id] : [...prepared];
}

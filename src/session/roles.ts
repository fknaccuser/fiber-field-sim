/**
 * Who you are today. Role is orthogonal to scenario tier: tier shapes *the fault*, role
 * shapes *your day* — how much guidance you get, how many hints, how many truck rolls you
 * can justify, how much clock you have, and how hard the phone rings.
 *
 * A pure policy table, in the same spirit as HINT_POLICY. Nothing here reaches into the
 * world; the runner and the scorer read it.
 */
export type Role = 'l1' | 'l2' | 'l3' | 'senior' | 'manager';

export type Guidance = 'guided' | 'answers' | 'confirms' | 'none';
export type InformationRichness = 'full' | 'normal' | 'sparse';

export interface RolePolicy {
  id: Role;
  displayName: string;
  /** One line of what the day feels like, shown at dispatch. */
  blurb: string;
  hints: { max: number; cost: number };
  /** Rolls you can justify. Infinity for the junior grades. */
  truckRollBudget: number;
  /** Above the budget, a senior grade is refused rather than merely penalised. */
  truckRollHardCap: boolean;
  /** Scales the scenario's own time budget. */
  timeBudgetMultiplier: number;
  /** Actions beyond this start costing efficiency. */
  actionSoftCap: number;
  guidance: Guidance;
  informationRichness: InformationRichness;
  /** 0 quiet, 3 relentless. Drives the event scheduler. */
  commsIntensity: 0 | 1 | 2 | 3;
  /** Whether some incoming comms block until answered. */
  mustAnswerComms: boolean;
  /** Sessions at or above this many completed before the role is suggested. */
  unlockAfterSessions: number;
}

export const ROLE_POLICY: Record<Role, RolePolicy> = {
  l1: {
    id: 'l1',
    displayName: 'Level 1 Technician',
    blurb: 'Dispatch walks you through it. Every step is on the board and hints are free.',
    hints: { max: Number.POSITIVE_INFINITY, cost: 0 },
    truckRollBudget: Number.POSITIVE_INFINITY,
    truckRollHardCap: false,
    timeBudgetMultiplier: 1.6,
    actionSoftCap: Number.POSITIVE_INFINITY,
    guidance: 'guided',
    informationRichness: 'full',
    commsIntensity: 0,
    mustAnswerComms: false,
    unlockAfterSessions: 0,
  },
  l2: {
    id: 'l2',
    displayName: 'Level 2 Technician',
    blurb: 'The method is named, not the instrument. Three hints, and the phone starts ringing.',
    hints: { max: 3, cost: 5 },
    truckRollBudget: Number.POSITIVE_INFINITY,
    truckRollHardCap: false,
    timeBudgetMultiplier: 1.25,
    actionSoftCap: Number.POSITIVE_INFINITY,
    guidance: 'answers',
    informationRichness: 'full',
    commsIntensity: 1,
    mustAnswerComms: false,
    unlockAfterSessions: 3,
  },
  l3: {
    id: 'l3',
    displayName: 'Level 3 Technician',
    blurb: 'No step list. Dispatch will only confirm what you have already seen, and calls must be answered.',
    hints: { max: 2, cost: 10 },
    truckRollBudget: 3,
    truckRollHardCap: false,
    timeBudgetMultiplier: 1,
    actionSoftCap: 28,
    guidance: 'confirms',
    informationRichness: 'normal',
    commsIntensity: 2,
    mustAnswerComms: true,
    unlockAfterSessions: 8,
  },
  senior: {
    id: 'senior',
    displayName: 'Senior Technician',
    blurb: 'You are the one others call. No hints, a tight board, and other techs asking for advice mid-job.',
    hints: { max: 0, cost: 0 },
    truckRollBudget: 2,
    truckRollHardCap: true,
    timeBudgetMultiplier: 0.85,
    actionSoftCap: 20,
    guidance: 'none',
    informationRichness: 'normal',
    commsIntensity: 3,
    mustAnswerComms: true,
    unlockAfterSessions: 15,
  },
  manager: {
    id: 'manager',
    displayName: 'Manager / NOC Lead',
    blurb: 'One vague line to start from, the tightest clock on the board, and an executive who wants a status.',
    hints: { max: 0, cost: 0 },
    truckRollBudget: 1,
    truckRollHardCap: true,
    timeBudgetMultiplier: 0.7,
    actionSoftCap: 16,
    guidance: 'none',
    informationRichness: 'sparse',
    commsIntensity: 3,
    mustAnswerComms: true,
    unlockAfterSessions: 25,
  },
};

export const ROLE_ORDER: readonly Role[] = ['l1', 'l2', 'l3', 'senior', 'manager'];

export const DEFAULT_ROLE: Role = 'l1';

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLE_ORDER as readonly string[]).includes(value);
}

/**
 * Hint allowance is the stricter of the scenario's tier policy and the role's, so choosing
 * a junior role can never make a hard scenario easier than its tier intends, and choosing a
 * senior role always tightens it.
 */
export function effectiveHintPolicy(role: Role, tierPolicy: { max: number; cost: number }): { max: number; cost: number } {
  const rolePolicy = ROLE_POLICY[role].hints;
  return { max: Math.min(rolePolicy.max, tierPolicy.max), cost: Math.max(rolePolicy.cost, tierPolicy.cost) };
}

/** Roles unlock by demonstrated work, but nothing is ever hard-gated — a trainee may reach past their grade. */
export function unlockedRoles(completedSessions: number): Record<Role, boolean> {
  return Object.fromEntries(ROLE_ORDER.map((r) => [r, completedSessions >= ROLE_POLICY[r].unlockAfterSessions])) as Record<Role, boolean>;
}

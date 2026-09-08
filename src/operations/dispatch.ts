/**
 * The other half of the job.
 *
 * The simulator began as a fault-diagnosis trainer, and diagnosis is what a technician does
 * on the bad days. Most days are construction and maintenance: splicing a closure, building
 * a hub, dressing trays, testing what you built, and calling in locates for next week.
 * Those jobs are where the habits are formed that decide whether the bad day is short.
 *
 * A work order here is scheduled, not just described. It knows what kit it needs, what
 * grade can hold it alone, what has to happen before it can start, and — for anything that
 * breaks ground — that a locate ticket has to have been served days earlier. That last
 * dependency is the one that teaches planning, because it cannot be solved on the morning.
 *
 * Pure and seeded, in the same spirit as the rest of the engine.
 */
import { createRng, deriveSeed } from '../world';
import type { Role } from '../session/roles';
import { canExcavate, type LocateTicket } from './digalert';

export type JobKind =
  | 'ribbon-splice'
  | 'closure-dress'
  | 'fdh-build'
  | 'idf-build'
  | 'pop-equipment'
  | 'acceptance-test'
  | 'locate-request'
  | 'outage';

export interface JobTemplate {
  kind: JobKind;
  title: string;
  /** What the job is for, in the terms a foreman would use assigning it. */
  brief: string;
  /** Planned duration before anything goes wrong, in minutes. */
  minutes: number;
  /** Inventory strings that must be on the truck. */
  kit: string[];
  /** Lowest grade that can hold this job without supervision. */
  minRole: Role;
  /** True when the job breaks ground and therefore needs a served locate. */
  breaksGround: boolean;
  /** Skills the job exercises — a manager assigns partly to build these. */
  domains: string[];
}

/**
 * Ordered the way this crew ranked them: splicing first, outages, hub builds, dressing,
 * testing, locates. Ordering here is priority-of-practice, not scheduling order.
 */
export const JOB_TEMPLATES: readonly JobTemplate[] = [
  {
    kind: 'ribbon-splice',
    title: 'Ribbon splice — mid-span closure',
    brief: 'Open the closure, ribbonize from the tube, mass-fusion splice the set and prove it before you seal.',
    minutes: 240,
    kit: ['mass-fusion-splicer', 'mass-cleaver', 'heat-jacket-stripper', 'ribbonizing-jig', 'cleaning-kit', 'otdr'],
    minRole: 'l2',
    breaksGround: false,
    domains: ['splicing', 'testing'],
  },
  {
    kind: 'outage',
    title: 'Service outage — customers dark',
    brief: 'Find it, prove it, fix it. The clock is the customer’s, not yours.',
    minutes: 180,
    kit: ['otdr', 'power-meter', 'vfl', 'laptop'],
    minRole: 'l1',
    breaksGround: false,
    domains: ['diagnosis', 'testing'],
  },
  {
    kind: 'fdh-build',
    title: 'Build out an FDH cabinet',
    brief: 'Set the cabinet, terminate the feeder, populate the splitter shelves and label every port before anything is live.',
    minutes: 480,
    kit: ['mass-fusion-splicer', 'mass-cleaver', 'cleaning-kit', 'otdr', 'power-meter', 'labels'],
    minRole: 'l3',
    breaksGround: true,
    domains: ['construction', 'splicing', 'records'],
  },
  {
    kind: 'idf-build',
    title: 'Prepare an IDF',
    brief: 'Rack, ground, terminate and dress. An IDF someone else has to work in is judged on the dressing.',
    minutes: 420,
    kit: ['hand-tools', 'labels', 'power-meter', 'laptop'],
    minRole: 'l3',
    breaksGround: false,
    domains: ['construction', 'records'],
  },
  {
    kind: 'pop-equipment',
    title: 'POP equipment turn-up',
    brief: 'Install and configure the OLT or switch, bring the uplinks up, and prove the path before handing it over.',
    minutes: 360,
    kit: ['laptop', 'console-cable', 'power-meter'],
    minRole: 'senior',
    breaksGround: false,
    domains: ['configuration', 'construction'],
  },
  {
    kind: 'closure-dress',
    title: 'Dress and re-seal a closure',
    brief: 'Route to the radius limiters, store real slack, label the trays, and seal it so the next flood is somebody else’s problem.',
    minutes: 180,
    kit: ['hand-tools', 'labels', 'cleaning-kit'],
    minRole: 'l2',
    breaksGround: false,
    domains: ['splicing', 'records'],
  },
  {
    kind: 'acceptance-test',
    title: 'Acceptance testing',
    brief: 'Bidirectional OTDR, power readings, continuity and fibre identification. Produce the package, not just the numbers.',
    minutes: 240,
    kit: ['otdr', 'power-meter', 'launch-cable-500m', 'laptop'],
    minRole: 'l2',
    breaksGround: false,
    domains: ['testing', 'records'],
  },
  {
    kind: 'locate-request',
    title: 'Call in locates for next week',
    brief: 'Ticket the dig sites now. Two working days of notice cannot be bought back on the morning.',
    minutes: 45,
    kit: ['laptop'],
    minRole: 'l1',
    breaksGround: false,
    domains: ['planning'],
  },
];

/**
 * What a construction rig actually carries.
 *
 * Complete for splicing and testing, because that is what this truck is for. The console
 * cable is deliberately not on it — that lives with the network team, and a POP turn-up
 * therefore blocks on kit rather than on willingness. A readiness gate that never fires
 * teaches nothing, and this is the honest reason one of them does.
 */
export const STANDARD_RIG: readonly string[] = [
  'mass-fusion-splicer', 'mass-cleaver', 'heat-jacket-stripper', 'ribbonizing-jig',
  'cleaning-kit', 'otdr', 'power-meter', 'vfl', 'inspection-scope',
  'launch-cable-500m', 'laptop', 'labels', 'hand-tools',
];

export function templateFor(kind: JobKind): JobTemplate {
  const t = JOB_TEMPLATES.find((x) => x.kind === kind);
  if (!t) throw new Error(`unknown job kind: ${kind}`);
  return t;
}

export interface WorkOrder {
  ticket: string;
  kind: JobKind;
  title: string;
  brief: string;
  location: string;
  minutes: number;
  kit: string[];
  minRole: Role;
  breaksGround: boolean;
  domains: string[];
  /** The locate ticket covering this site, if one has been raised. */
  locate: LocateTicket | null;
}

export type BlockReason = 'kit' | 'locate' | 'grade';

export interface Readiness {
  ready: boolean;
  blocked: BlockReason[];
  /** One line per blocker, in the order a technician would hit them. */
  reasons: string[];
}

const ROLE_RANK: Record<Role, number> = { l1: 0, l2: 1, l3: 2, senior: 3, manager: 4 };

/**
 * Can this job actually start today?
 *
 * Three independent gates, reported together rather than one at a time, because a
 * technician standing at the truck wants the whole list — discovering the second blocker
 * after driving out is exactly the wasted roll this trainer exists to prevent.
 */
export function readiness(order: WorkOrder, role: Role, truckInventory: readonly string[], now: Date): Readiness {
  const blocked: BlockReason[] = [];
  const reasons: string[] = [];

  const missing = order.kit.filter((k) => !truckInventory.includes(k));
  if (missing.length > 0) {
    blocked.push('kit');
    reasons.push(`Not on the truck: ${missing.join(', ')}.`);
  }

  if (ROLE_RANK[role] < ROLE_RANK[order.minRole]) {
    blocked.push('grade');
    reasons.push(`This job is held at ${order.minRole.toUpperCase()} or above; you are ${role.toUpperCase()}. Take it with someone, or escalate.`);
  }

  if (order.breaksGround) {
    const dig = canExcavate(order.locate, now);
    if (!dig.allowed) {
      blocked.push('locate');
      reasons.push(dig.reason);
    }
  }

  return { ready: blocked.length === 0, blocked: blocked, reasons: reasons };
}

const STREETS = [
  'Antonio Pkwy @ Cow Camp',
  'Camino Alto @ Paseo Vista',
  'Crown Valley @ Marguerite',
  'Oso Pkwy handhole 14',
  'Los Patrones @ Chiquita',
  'Vista Montana cabinet pad',
];

/**
 * A day's construction board.
 *
 * Deterministic from the seed, and deliberately weighted: splicing and outages dominate,
 * because they dominate the real week. Anything that breaks ground is issued with its
 * locate already raised or deliberately missing — the missing case is the lesson.
 */
export function buildConstructionDay(daySeed: number, now: Date, count = 3): WorkOrder[] {
  const rng = createRng(deriveSeed(daySeed, 'construction-day'));
  const weighted: JobKind[] = [
    'ribbon-splice', 'ribbon-splice', 'ribbon-splice',
    'outage', 'outage',
    'closure-dress', 'closure-dress',
    'acceptance-test',
    'fdh-build',
    'idf-build',
    'pop-equipment',
    'locate-request',
  ];

  const orders: WorkOrder[] = [];
  for (let i = 0; i < count; i++) {
    const kind = weighted[rng.int(0, weighted.length - 1)];
    const t = templateFor(kind);

    // A ground-breaking job either has a served ticket or does not. Two thirds of the time
    // the planning was done; the rest is the morning a trainee learns what §4216 costs.
    let locate: LocateTicket | null = null;
    if (t.breaksGround && rng.next() < 0.66) {
      const requestedDaysAgo = 4 + rng.int(0, 6);
      const requestedAt = new Date(now.getTime() - requestedDaysAgo * 86400000);
      locate = {
        id: `USA-${100000 + rng.int(0, 899999)}`,
        requestedAt: requestedAt,
        validFrom: new Date(requestedAt.getTime() + 2 * 86400000),
        expiresAt: new Date(requestedAt.getTime() + 28 * 86400000),
      };
    }

    orders.push({
      ticket: `WO-${10000 + rng.int(0, 89999)}`,
      kind: kind,
      title: t.title,
      brief: t.brief,
      location: STREETS[rng.int(0, STREETS.length - 1)],
      minutes: t.minutes,
      kit: t.kit.slice(),
      minRole: t.minRole,
      breaksGround: t.breaksGround,
      domains: t.domains.slice(),
      locate: locate,
    });
  }
  return orders;
}

/** Planned minutes on the board, for the shift panel. */
export function committedMinutes(orders: readonly WorkOrder[]): number {
  return orders.reduce((sum, o) => sum + o.minutes, 0);
}

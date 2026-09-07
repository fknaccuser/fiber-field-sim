/**
 * A shift's worth of work. Given one day seed, this deterministically builds the queue a
 * technician is dispatched to: which jobs, in which order, how long each is expected to
 * take, and what the day as a whole feels like.
 *
 * Pure and seeded, so reloading returns you to the same shift, and a day can be shared or
 * replayed exactly like a single scenario. Every order resolves to a real
 * `scenarioId + seed` that the existing `/run/:scenarioId?seed=N` route already plays.
 */
import { createRng, deriveSeed } from '../../world';
import { generatedId, getScenario, listScenarios } from '../../scenarios';
import type { GeneratorFocus, GeneratorSize, GeneratorTier } from '../../scenarios';

export type Priority = 'P1' | 'P2' | 'P3';
export type WorkKind = 'plant' | 'network' | 'customer';

export interface WorkOrder {
  /** Ticket number shown on the card, e.g. WO-37699. Derived from the seed, never random. */
  ticket: string;
  scenarioId: string;
  seed: number;
  tier: number;
  priority: Priority;
  title: string;
  /** Where the job starts, from the scenario's own topology. */
  location: string;
  summary: string;
  estMinutes: number;
  kind: WorkKind;
}

export interface DayCharacter {
  tag: string;
  headline: string;
  blurb: string;
}

export interface Day {
  seed: number;
  orders: WorkOrder[];
  character: DayCharacter;
  /** Length of the shift in simulated minutes. */
  shiftMinutes: number;
}

export const SHIFT_MINUTES = 480;

/** The focus areas a generated job can be drawn from, paired with how the ticket reads. */
const FOCUS_KIND: Record<string, WorkKind> = {
  cpe: 'customer',
  drop: 'customer',
  plant: 'plant',
  network: 'network',
  compliance: 'plant',
};

function ticketFor(seed: number): string {
  return `WO-${String(10000 + (seed % 89999))}`;
}

/** Priority follows real impact: more customers down, higher priority. */
function priorityFor(tier: number, kind: WorkKind): Priority {
  if (tier >= 4) return 'P1';
  if (kind === 'network' || tier === 3) return 'P2';
  return 'P3';
}

function characterFor(orders: WorkOrder[]): DayCharacter {
  const p1 = orders.filter((o) => o.priority === 'P1').length;
  const kinds = new Set(orders.map((o) => o.kind));
  if (p1 >= 2) {
    return { tag: 'MULTIPLE OUTAGES', headline: 'Two majors on the board.', blurb: 'More than one P1 is open. Scope both before you commit a truck roll to either.' };
  }
  if (p1 === 1) {
    return { tag: 'ACTIVE OUTAGE', headline: 'One major, and the rest can wait.', blurb: 'A P1 is holding subscribers down. Clear it first unless something proves otherwise.' };
  }
  if (kinds.size > 1) {
    return { tag: 'MIXED LOAD', headline: 'Normal operations. Stay sharp.', blurb: 'Customer-impact and plant work are both in the queue. Prioritize before you roll.' };
  }
  return { tag: 'ROUTINE', headline: 'Light board today.', blurb: 'No majors open. Good day to be thorough and cite your evidence properly.' };
}

/** The start location's own label, so the card says where you are actually going. */
function locationOf(scenarioId: string, seed: number): { location: string; title: string; summary: string; tier: number; estMinutes: number } {
  const def = getScenario(scenarioId, seed);
  const start = def.topology.nodes.find((n) => n.id === def.startLocationNodeId);
  const label = start?.label ?? def.startLocationNodeId;
  // A yard start tells the trainee nothing; name the work instead.
  const location = start?.kind === 'yard' ? `${label} · dispatch` : label;
  return {
    location,
    title: def.title,
    summary: def.description.trim().replace(/\s+/g, ' '),
    tier: def.tier,
    estMinutes: def.timeBudgetMinutes ?? 45,
  };
}

const TIERS: GeneratorTier[] = [1, 2, 3, 4, 5];
const SIZES: GeneratorSize[] = ['small', 'medium', 'large'];
const FOCUSES: GeneratorFocus[] = ['cpe', 'drop', 'plant', 'network', 'compliance'];

export function buildDay(daySeed: number): Day {
  const rng = createRng(deriveSeed(daySeed, 'dispatch-day'));
  const authored = listScenarios();
  const orders: WorkOrder[] = [];

  // Two or three jobs. One is drawn from the authored teaching set when the day is short,
  // so a trainee still meets the hand-built scenarios rather than only generated ones.
  const count = rng.int(2, 3);
  const authoredSlot = rng.int(0, count - 1);

  for (let i = 0; i < orders.length + count; i++) {
    if (orders.length >= count) break;
    const seed = rng.int(1, 999_999);
    let scenarioId: string;
    let kind: WorkKind;

    if (i === authoredSlot && authored.length > 0) {
      const pick = authored[rng.int(0, authored.length - 1)];
      scenarioId = pick.id;
      kind = pick.tier >= 4 ? 'plant' : 'customer';
    } else {
      const tier = TIERS[rng.int(0, TIERS.length - 1)];
      const focus = FOCUSES[rng.int(0, FOCUSES.length - 1)];
      const size = SIZES[rng.int(0, SIZES.length - 1)];
      scenarioId = generatedId({ tier, focus, size });
      kind = FOCUS_KIND[focus] ?? 'plant';
    }

    const meta = locationOf(scenarioId, seed);
    orders.push({
      ticket: ticketFor(seed),
      scenarioId,
      seed,
      tier: meta.tier,
      priority: priorityFor(meta.tier, kind),
      title: meta.title,
      location: meta.location,
      summary: meta.summary,
      estMinutes: meta.estMinutes,
      kind,
    });
  }

  // Majors first, then longest job, so the board reads the way a dispatcher would order it.
  const rank: Record<Priority, number> = { P1: 0, P2: 1, P3: 2 };
  orders.sort((a, b) => rank[a.priority] - rank[b.priority] || b.estMinutes - a.estMinutes);

  return { seed: daySeed, orders, character: characterFor(orders), shiftMinutes: SHIFT_MINUTES };
}

/** Committed load across the queue, for the "time remaining" readout. */
export function committedMinutes(day: Day): number {
  return day.orders.reduce((sum, o) => sum + o.estMinutes, 0);
}

/**
 * How healthy the plant looks from the dispatcher's chair: every open job is service risk.
 * A P1 weighs more than a P3 because more subscribers are behind it.
 */
export function networkStability(day: Day, closedTickets: readonly string[]): number {
  const weight: Record<Priority, number> = { P1: 14, P2: 7, P3: 3 };
  const open = day.orders.filter((o) => !closedTickets.includes(o.ticket));
  return Math.max(0, 100 - open.reduce((sum, o) => sum + weight[o.priority], 0));
}

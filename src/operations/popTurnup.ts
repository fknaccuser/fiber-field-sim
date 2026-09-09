/**
 * Turning up equipment in a POP.
 *
 * The last of the four jobs the crew named, and the one whose mistakes look least like
 * mistakes. Nothing here is difficult; everything here is skippable; and every one of them is
 * invisible on the day you do it and expensive on a day you are not there.
 *
 * WHAT THIS IS ABOUT. Redundancy you paid for and did not get. A chassis with two power
 * supplies is not redundant if both of them are on the same feed — it is one feed and a
 * spare power supply, which is not the thing that was bought. Two uplinks down the same
 * conduit are one uplink with extra fibre in it: whatever takes the conduit takes both. And a
 * chassis that is not bonded works perfectly until the first storm, at which point it is a
 * warranty argument nobody can win.
 *
 * So this is judged as a plan, like the cut-in and the restoration, for the same reason:
 * every decision is made standing in front of the rack with nothing installed yet, and every
 * one of them is free to change then and a change order afterwards.
 *
 * ON THE NUMBERS. Breaker ratings, the 80% continuous-load rule and conductor sizing are
 * electrical-code territory and this project is not a source for them. What is encoded is the
 * *shape* — a circuit has a rating, continuous load is derated against it, and a feed that is
 * already carrying somebody else's equipment has less left than the label says. `DERATE` and
 * the load figures carry that caveat. An electrician sizes the circuit; a technician has to
 * know enough not to land four kilowatts on whatever was nearest.
 *
 * Pure and seeded. No renderer, no storage.
 */

/**
 * Continuous-load derating: the fraction of a breaker's rating a continuously-running load may
 * draw. 80% is the long-standing figure and it is what this teaches.
 *
 * It is here as the shape of the rule, not as an authority on it. Anything actually being
 * installed is sized by somebody qualified against the code in force.
 */
export const DERATE = 0.8;

export interface PowerFeed {
  id: string;
  label: string;
  /** Breaker rating, in amps. */
  ratingA: number;
  /** What is already on this circuit, in amps. */
  existingLoadA: number;
  /** Feeds that share an upstream source are not diverse however far apart the breakers are. */
  source: string;
}

export interface UplinkPath {
  id: string;
  label: string;
  /** Two uplinks in the same duct are one uplink. */
  duct: string;
}

export interface PopBuild {
  id: string;
  siteLabel: string;
  equipmentLabel: string;
  /** Number of power supplies the chassis has. Two is the whole point of the question. */
  supplies: number;
  /** What each supply draws continuously, in amps. */
  supplyDrawA: number;
  feeds: PowerFeed[];
  paths: UplinkPath[];
}

export type Bonding =
  /** Chassis bonded straight to the ground bar. What the install guide asks for. */
  | 'to-ground-bar'
  /** Bonded to the rack, and the rack to the bar. Acceptable when the rack bond is sound. */
  | 'to-rack'
  /** Not bonded. Works perfectly until it does not. */
  | 'none';

export interface TurnupPlan {
  /** Feed id per power supply, in order. */
  supplyFeeds: string[];
  bonding: Bonding;
  /** Whether the rack itself is bonded to the ground bar. */
  rackBonded: boolean;
  /** Path id per uplink. */
  uplinkPaths: string[];
  labelled: boolean;
}

export type TurnupSeverity =
  /** The redundancy that was paid for does not exist. Nothing shows it until the day it matters. */
  | 'not-redundant'
  /** Wrong now: it will not pass inspection or it will not come up. */
  | 'blocking'
  /** Costs somebody time later. */
  | 'workmanship';

export interface TurnupIssue {
  severity: TurnupSeverity;
  code: string;
  where: string;
  detail: string;
}

export interface TurnupVerdict {
  accepted: boolean;
  notRedundant: number;
  blocking: number;
  workmanship: number;
  issues: TurnupIssue[];
  summary: string;
}

/** Headroom left on a feed after derating, in amps. */
export function headroomA(feed: PowerFeed): number {
  return Math.round((feed.ratingA * DERATE - feed.existingLoadA) * 10) / 10;
}

export function feedById(build: PopBuild, id: string): PowerFeed | undefined {
  return build.feeds.find((f) => f.id === id);
}

export function pathById(build: PopBuild, id: string): UplinkPath | undefined {
  return build.paths.find((p) => p.id === id);
}

/**
 * Judge a turn-up plan.
 *
 * Diversity is checked on the *source* and the *duct*, not on the labels. Two breakers in
 * different panels fed from one transfer switch are one feed with two labels, and that is
 * precisely the arrangement that reads as diverse on a drawing and is not.
 */
export function judgeTurnup(build: PopBuild, plan: TurnupPlan): TurnupVerdict {
  const issues: TurnupIssue[] = [];

  // --- Power ---
  const chosen = plan.supplyFeeds.map((id) => feedById(build, id));
  const missing = plan.supplyFeeds.filter((id) => !feedById(build, id));
  for (const id of missing) {
    issues.push({
      severity: 'blocking',
      code: 'no-such-feed',
      where: build.siteLabel,
      detail: `${id} is not a circuit in this room. Check the panel schedule before anybody lands a cord.`,
    });
  }

  if (plan.supplyFeeds.length < build.supplies) {
    issues.push({
      severity: 'blocking',
      code: 'supply-unfed',
      where: build.equipmentLabel,
      detail: `${build.supplies} power supplies and ${plan.supplyFeeds.length} circuit${plan.supplyFeeds.length === 1 ? '' : 's'} assigned. An unfed supply is an alarm from the moment it comes up.`,
    });
  }

  const present = chosen.filter((f): f is PowerFeed => !!f);
  if (build.supplies > 1 && present.length === build.supplies) {
    const sources = new Set(present.map((f) => f.source));
    if (sources.size === 1) {
      const sameBreaker = new Set(present.map((f) => f.id)).size === 1;
      issues.push({
        severity: 'not-redundant',
        code: 'no-power-diversity',
        where: build.equipmentLabel,
        detail: sameBreaker
          ? `Both supplies on ${present[0].label}. That is one circuit and a spare power supply, which is not what a dual-supply chassis is for.`
          : `${present.map((f) => f.label).join(' and ')} are different breakers off the same source (${present[0].source}). It reads as diverse on the drawing and it is not: whatever takes that source takes both.`,
      });
    }
  }

  // Load, per circuit, against what is already on it.
  const loadPerFeed = new Map<string, number>();
  for (const feed of present) loadPerFeed.set(feed.id, (loadPerFeed.get(feed.id) ?? 0) + build.supplyDrawA);
  for (const [id, load] of loadPerFeed) {
    const feed = feedById(build, id)!;
    if (load > headroomA(feed)) {
      issues.push({
        severity: 'blocking',
        code: 'circuit-overloaded',
        where: feed.label,
        detail: `${load} A onto a ${feed.ratingA} A circuit already carrying ${feed.existingLoadA} A. Continuous load derates to ${Math.round(feed.ratingA * DERATE * 10) / 10} A, so there is ${headroomA(feed)} A left. This trips, and it trips under load rather than while you are standing there.`,
      });
    }
  }

  // --- Bonding ---
  if (plan.bonding === 'none') {
    issues.push({
      severity: 'not-redundant',
      code: 'unbonded-chassis',
      where: build.equipmentLabel,
      detail: 'Chassis not bonded. It works perfectly and it keeps working until the first storm, and then it is a dead card and an argument about whose warranty it was.',
    });
  } else if (plan.bonding === 'to-rack' && !plan.rackBonded) {
    issues.push({
      severity: 'blocking',
      code: 'bonded-to-nothing',
      where: build.equipmentLabel,
      detail: 'Bonded to a rack that is not itself bonded to the ground bar. That is a bond to a large metal object, which is not the same thing as a ground.',
    });
  }

  // --- Uplinks ---
  const paths = plan.uplinkPaths.map((id) => pathById(build, id));
  for (const [i, path] of paths.entries()) {
    if (!path) {
      issues.push({
        severity: 'blocking',
        code: 'no-such-path',
        where: `uplink ${i + 1}`,
        detail: `${plan.uplinkPaths[i]} is not a route out of this building.`,
      });
    }
  }
  const realPaths = paths.filter((p): p is UplinkPath => !!p);
  if (realPaths.length > 1) {
    const ducts = new Set(realPaths.map((p) => p.duct));
    if (ducts.size === 1) {
      issues.push({
        severity: 'not-redundant',
        code: 'no-path-diversity',
        where: 'uplinks',
        detail: `Both uplinks down ${realPaths[0].duct}. Whatever takes that duct takes both of them, and a backhoe does not care that they are on different cards.`,
      });
    }
  }
  if (plan.uplinkPaths.length < 2) {
    issues.push({
      severity: 'not-redundant',
      code: 'single-uplink',
      where: 'uplinks',
      detail: 'One uplink assigned. The site is up, and it is up on one thing.',
    });
  }

  if (!plan.labelled) {
    issues.push({
      severity: 'workmanship',
      code: 'unlabelled',
      where: build.siteLabel,
      detail: 'Circuits, ports and fibres not labelled. Costs nothing today and costs the next person an hour with a tone probe in a room where everything looks the same.',
    });
  }

  const notRedundant = issues.filter((i) => i.severity === 'not-redundant').length;
  const blocking = issues.filter((i) => i.severity === 'blocking').length;
  const workmanship = issues.filter((i) => i.severity === 'workmanship').length;

  let summary: string;
  if (blocking > 0) {
    summary = `${blocking} thing${blocking === 1 ? '' : 's'} will stop this coming up, or stop it passing inspection.`;
  } else if (notRedundant > 0) {
    summary = 'This comes up and works. It is not redundant, and nothing will say so until the day it matters.';
  } else if (workmanship > 0) {
    summary = `Sound. ${workmanship} thing${workmanship === 1 ? '' : 's'} the next person will pay for.`;
  } else {
    summary = 'Clean turn-up. Diverse power, diverse paths, bonded and labelled.';
  }

  return { accepted: notRedundant === 0 && blocking === 0, notRedundant, blocking, workmanship, issues, summary };
}

// --- Generating a turn-up --------------------------------------------------------------------

const SITES = ['POP 1 — Antonio', 'POP 2 — Crown Valley', 'POP 4 — Los Patrones', 'Vista Montana hut'];
const GEAR = ['OLT chassis, 8 line cards', 'Aggregation switch, 32×100G', 'OLT chassis, 4 line cards', 'Core router, 2 RE'];

export interface TurnupJob {
  build: PopBuild;
}

/**
 * Build a turn-up.
 *
 * The room always contains a correct answer: two circuits on genuinely different sources with
 * headroom for the load, and two ducts. It also always contains the trap — a third circuit
 * that looks like a second source and is not, because that is the mistake this teaches and a
 * room without it is a room where you cannot make it.
 */
export function generateTurnupJob(seed: number, rng: { next(): number; int(a: number, b: number): number }): TurnupJob {
  const supplies = 2;
  const supplyDrawA = 8 + rng.int(0, 10);
  // Both good feeds have headroom for one supply each, so the correct plan always exists.
  const need = supplyDrawA;
  /**
   * Size the circuit for what it has to carry, then load it up to leave the intended spare.
   *
   * The first version picked a rating at random and worked the existing load backwards, which
   * happily produced a 20 A breaker asked to carry an 18 A continuous supply -- physically
   * impossible, and the judge correctly refused every plan on those rooms. A circuit is sized
   * for its load; the generator has to do that too or it deals hands that cannot be played.
   */
  const STANDARD_RATINGS = [20, 30, 40, 50, 60];
  const mk = (id: string, label: string, source: string, spare: number): PowerFeed => {
    const wanted = need + spare;
    const ratingA = STANDARD_RATINGS.find((r) => r * DERATE >= wanted) ?? STANDARD_RATINGS[STANDARD_RATINGS.length - 1];
    const existingLoadA = Math.max(0, Math.round(ratingA * DERATE - wanted));
    return { id, label, ratingA, existingLoadA, source };
  };

  const feeds: PowerFeed[] = [
    mk('a1', 'Panel A, breaker 11', 'utility feed A', 2 + rng.int(0, 6)),
    mk('b1', 'Panel B, breaker 4', 'utility feed B', 2 + rng.int(0, 6)),
    // The trap: a different panel, a different breaker number, the same thing behind it.
    mk('a2', 'Panel A2, breaker 7', 'utility feed A', 2 + rng.int(0, 6)),
    // And a circuit with nothing left on it, for the load question.
    { id: 'c1', label: 'Panel C, breaker 2', ratingA: 20, existingLoadA: 14, source: 'utility feed B' },
  ];

  const paths: UplinkPath[] = [
    { id: 'e', label: 'East vault', duct: 'east duct' },
    { id: 'w', label: 'West vault', duct: 'west duct' },
    // Two entrances, one duct: the drawing shows two routes and the ground has one.
    { id: 'e2', label: 'East vault, inner bore', duct: 'east duct' },
  ];

  return {
    build: {
      id: `pop-${seed}`,
      siteLabel: SITES[rng.int(0, SITES.length - 1)],
      equipmentLabel: GEAR[rng.int(0, GEAR.length - 1)],
      supplies,
      supplyDrawA,
      feeds,
      paths,
    },
  };
}

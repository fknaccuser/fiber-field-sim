/**
 * Emergency restoration: putting a cable back after something has hit it.
 *
 * This is the other half of the job the crew named. `backbone.ts` plans a cut-in on a cable
 * that is whole; this one starts with a cable that is not, usually because somebody dug
 * where a locate said it was safe — which is the same failure the locate bench exists to
 * prevent, arriving from the other direction.
 *
 * THE DECISION THAT DECIDES THE JOB. Damage extends past what you can see. A backhoe tooth
 * does not make a clean cut: it drags, and the sheath twenty inches back looks fine while the
 * glass inside it is stressed. Splice onto that and the job tests perfectly, gets signed off,
 * and fails in six months for somebody else, on a night shift, with no obvious cause. So the
 * whole task is one number — how far back you cut — pulled in two directions:
 *
 *  - Cut back too little and you splice onto damaged fibre. There is no test on the day that
 *    reliably catches it, which is exactly why it is the expensive one.
 *  - Cut back too much and the ends will not reach each other. Then you are not making one
 *    splice, you are inserting a replacement section and making two closures where there was
 *    none, which is hours and a permanent extra pair of joints in the span.
 *
 * The correct answer is not "cut back a lot". It is: find out how far the damage goes, cut
 * past that, and if that exceeds the slack you have, insert a section on purpose rather than
 * discovering it half way through.
 *
 * ON THE NUMBERS. How far each kind of damage travels past the visible break is INFERENCE.
 * The ordering is sound — a dragged backhoe tooth reaches further than a rodent bite, water
 * wicks along a buffer tube further than either — and the shape is what this teaches. The
 * metre figures themselves are not measured, and `DAMAGE_REACH` says so on every line. If the
 * crew has real figures they replace this table and nothing else changes.
 *
 * Pure and seeded. No renderer, no storage.
 */

export type DamageCause =
  | 'dig-in'
  | 'water-ingress'
  | 'vehicle-strike'
  | 'rodent'
  | 'gunshot';

/**
 * How far past the visible damage the fibre is compromised, in metres.
 *
 * Every one of these is an estimate. They are ordered by how far the mechanism actually
 * carries — that ordering is the lesson — and the magnitudes are placeholders carrying their
 * own provenance so nobody quotes them at a foreman.
 */
export const DAMAGE_REACH: Record<DamageCause, { reachM: number; why: string }> = {
  'dig-in': {
    reachM: 6,
    why: 'A tooth drags before it tears. The sheath looks sound well past where the glass was stressed, and nothing you can see marks the end of it.',
  },
  'water-ingress': {
    reachM: 12,
    why: 'Water wicks along the buffer tube, well beyond the breach, and freezes and thaws there. The wet length is the damaged length and it is longer than the hole.',
  },
  'vehicle-strike': {
    reachM: 4,
    why: 'The shock runs out along the span from the impact. The far side of the pole can be fine and the near side stressed for metres.',
  },
  rodent: {
    reachM: 1,
    why: 'Local. It chewed where it chewed — but check for more than one site before you assume you have found it all.',
  },
  gunshot: {
    reachM: 2,
    why: 'Mostly local, but the sheath spalls either side of the entry and the outer fibres take it worst.',
  },
};

export type CircuitPriority = 'critical' | 'business' | 'residential';

/** Restoration order is decided by what is on each tube, so the tube carries the priority. */
export interface DamagedTube {
  color: string;
  circuits: number;
  priority: CircuitPriority;
  serves: string;
}

export interface DamageReport {
  id: string;
  cause: DamageCause;
  cableLabel: string;
  /** Where the OTDR puts the event, metres from the access point. */
  distanceM: number;
  /** Length of cable you can see is wrecked. What a technician measures on arrival. */
  visibleDamageM: number;
  /** Stored slack available to pull in, each side, in metres. */
  slackAM: number;
  slackBM: number;
  tubes: DamagedTube[];
}

export type RestorationMethod =
  /** Cut out the damage and splice the two ends together. One closure, if the ends reach. */
  | 'splice-through'
  /** Pull in a replacement length. Two closures, two sets of splices, hours longer. */
  | 'insert-section';

export interface RestorationPlan {
  method: RestorationMethod;
  /** How far past the visible damage you cut, each side, in metres. */
  cutBackM: number;
  /** Which tube goes back first. */
  restoreFirst: string;
  /**
   * Whether the exposed fibre was checked before splicing onto it.
   *
   * Costs time and is the only thing standing between a short cut-back and a fault nobody
   * finds for six months.
   */
  verifiedExposedFibre: boolean;
}

export type RestorationSeverity =
  /** It will fail later, and nothing on the day will say so. */
  | 'latent'
  /** Wrong now, and it stops the job. */
  | 'blocking'
  /** Costs hours or somebody's goodwill, not the splice. */
  | 'workmanship';

export interface RestorationIssue {
  severity: RestorationSeverity;
  code: string;
  where: string;
  detail: string;
  meters?: number;
}

export interface RestorationVerdict {
  accepted: boolean;
  latent: number;
  blocking: number;
  workmanship: number;
  /** Cable removed in total, in metres: the visible damage plus both cut-backs. */
  removedM: number;
  /** Slack you have to pull the ends together with. */
  availableSlackM: number;
  /** Can the two ends actually reach each other after this much is removed? */
  endsReach: boolean;
  issues: RestorationIssue[];
  summary: string;
}

/** How far past the visible damage the fibre is actually compromised, for this report. */
export function damagedReachM(report: DamageReport): number {
  return DAMAGE_REACH[report.cause].reachM;
}

/** Total cable removed by a plan: the wrecked length plus what you take off each end. */
export function removedLengthM(report: DamageReport, plan: RestorationPlan): number {
  return report.visibleDamageM + plan.cutBackM * 2;
}

/**
 * Which tube should go back first.
 *
 * Highest priority wins; a tie goes to the one carrying more circuits, because when two
 * things are equally urgent the tiebreak is how many people are behind them.
 */
export function shouldRestoreFirst(report: DamageReport): DamagedTube {
  const rank: Record<CircuitPriority, number> = { critical: 3, business: 2, residential: 1 };
  return [...report.tubes].sort(
    (a, b) => rank[b.priority] - rank[a.priority] || b.circuits - a.circuits || a.color.localeCompare(b.color),
  )[0];
}

/**
 * Judge a restoration plan.
 *
 * Judged before the splicer goes on, for the same reason the cut-in is: every mistake here is
 * decided by a number chosen on the tailgate, and all of them are cheaper to catch now.
 */
export function judgeRestoration(report: DamageReport, plan: RestorationPlan): RestorationVerdict {
  const issues: RestorationIssue[] = [];
  const reach = damagedReachM(report);
  const removedM = removedLengthM(report, plan);
  const availableSlackM = report.slackAM + report.slackBM;
  const endsReach = removedM <= availableSlackM;

  // 1. The one that does not show up on the day.
  if (plan.cutBackM < reach) {
    issues.push({
      severity: 'latent',
      code: 'spliced-onto-damaged-fibre',
      where: report.cableLabel,
      meters: Math.round((reach - plan.cutBackM) * 10) / 10,
      detail: `Cut back ${plan.cutBackM} m where this damage reaches about ${reach} m. ${DAMAGE_REACH[report.cause].why} The splice will read fine, pass acceptance and be signed off, and it is somebody else's night shift in six months.`,
    });
  }

  // 2. The one that stops the job in front of you.
  if (plan.method === 'splice-through' && !endsReach) {
    issues.push({
      severity: 'blocking',
      code: 'ends-will-not-reach',
      where: report.cableLabel,
      meters: Math.round((removedM - availableSlackM) * 10) / 10,
      detail: `Removing ${removedM} m with ${availableSlackM} m of slack on the two ends. They do not meet. You find this out after the cable is cut, which is the worst moment to find it out — plan the section now.`,
    });
  }

  if (plan.method === 'insert-section' && endsReach) {
    issues.push({
      severity: 'workmanship',
      code: 'unnecessary-section',
      where: report.cableLabel,
      detail: `The ends reach with ${Math.round((availableSlackM - removedM) * 10) / 10} m to spare. Inserting a section anyway buys a second closure and a second set of splices in this span, permanently, for nothing.`,
    });
  }

  // 3. Not checking is only free when you happened to be right.
  if (!plan.verifiedExposedFibre) {
    issues.push({
      severity: plan.cutBackM < reach ? 'blocking' : 'workmanship',
      code: 'unverified-exposed-fibre',
      where: report.cableLabel,
      detail:
        plan.cutBackM < reach
          ? 'The exposed fibre was never checked before splicing onto it. It is damaged, and checking is the only thing that would have said so.'
          : 'The exposed fibre was never checked. It happens to be sound this time. That is luck, and luck does not carry to the next one.',
    });
  }

  // 4. What goes back first.
  const first = shouldRestoreFirst(report);
  if (plan.restoreFirst !== first.color) {
    const chosen = report.tubes.find((t) => t.color === plan.restoreFirst);
    issues.push({
      severity: 'workmanship',
      code: 'restored-out-of-order',
      where: `${plan.restoreFirst} tube`,
      detail: `${first.color} carries ${first.circuits} ${first.priority} circuit${first.circuits === 1 ? '' : 's'} (${first.serves}) and goes back first. ${chosen ? `${plan.restoreFirst} is ${chosen.priority}.` : 'That tube is not in this cable.'} Everything gets restored either way; the order decides who waits.`,
    });
  }

  // 5. Cutting back far past what the damage needed, when slack is what you are short of.
  const overcut = plan.cutBackM - reach;
  if (overcut > 8 && !endsReach) {
    issues.push({
      severity: 'workmanship',
      code: 'over-cut',
      where: report.cableLabel,
      meters: Math.round(overcut * 10) / 10,
      detail: `${Math.round(overcut)} m past what this damage needed, on a cable that is now short of slack. Cutting back is free until it is the reason you are inserting a section.`,
    });
  }

  const latent = issues.filter((i) => i.severity === 'latent').length;
  const blocking = issues.filter((i) => i.severity === 'blocking').length;
  const workmanship = issues.filter((i) => i.severity === 'workmanship').length;

  let summary: string;
  if (latent > 0) {
    summary = 'This restoration will pass every test you can run on it today and fail later. Do not work it.';
  } else if (blocking > 0) {
    summary = `${blocking} thing${blocking === 1 ? '' : 's'} will stop you on site. Fix the plan before the cable is cut.`;
  } else if (workmanship > 0) {
    summary = `Sound. ${workmanship} thing${workmanship === 1 ? '' : 's'} that cost${workmanship === 1 ? 's' : ''} hours rather than the splice.`;
  } else {
    summary = 'Clean restoration. Past the damage, the ends reach, and the right people are back first.';
  }

  return {
    accepted: latent === 0 && blocking === 0,
    latent,
    blocking,
    workmanship,
    removedM: Math.round(removedM * 10) / 10,
    availableSlackM: Math.round(availableSlackM * 10) / 10,
    endsReach,
    issues,
    summary,
  };
}

// --- Generating a callout -------------------------------------------------------------------

const CAUSE_STORY: Record<DamageCause, string> = {
  'dig-in': 'Contractor put a backhoe through it. They had a ticket; the marks were short.',
  'water-ingress': 'Closure took on water over the winter and nobody opened it until the loss climbed.',
  'vehicle-strike': 'Vehicle took the pole out at the corner. The span came down with it.',
  rodent: 'Ground squirrels in the conduit. Sheath chewed through in two places.',
  gunshot: 'Aerial span shot through. It happens out here more than anybody writes down.',
};

/**
 * What is on a tube, by how urgent it is.
 *
 * Tied to the priority rather than drawn independently, because the two have to agree: a
 * trainee deciding what goes back first is reading the description, not the label. A tube
 * marked CRITICAL that says it feeds a residential block teaches them the label is arbitrary
 * and the description is decoration, which is the opposite of the lesson.
 */
const SERVES: Record<CircuitPriority, readonly string[]> = {
  critical: ['the urgent care clinic', 'the fire station and its dispatch', 'the water district SCADA', 'the high school'],
  business: ['two business parks', 'the retail centre', 'the logistics yard', 'a data centre cross-connect'],
  residential: ['the Vista Court blocks', 'Camino Alto residential', 'the Paseo Vista tract', 'Via Ladera homes'],
};

/** Where the cable runs. A backbone is named for its route, not for one thing on it. */
const ROUTES = ['Antonio Pkwy', 'Camino del Avion', 'Crown Valley', 'Los Patrones', 'Oso Pkwy', 'Via Ladera'];

/** Draw without replacement, so no two tubes claim to feed the same thing. */
function drawDistinct<T>(pool: readonly T[], count: number, rng: { int(a: number, b: number): number }): T[] {
  const left = [...pool];
  const out: T[] = [];
  for (let i = 0; i < count && left.length > 0; i++) out.push(left.splice(rng.int(0, left.length - 1), 1)[0]);
  return out;
}

export interface RestorationJob {
  report: DamageReport;
  story: string;
}

/**
 * Build a callout.
 *
 * Slack is generated so that a correct plan is *sometimes* a splice-through and sometimes
 * genuinely needs a section. Both have to happen: a trainee who learns that the answer is
 * always splice-through has learned a habit rather than a decision.
 */
export function generateRestorationJob(seed: number, rng: { next(): number; int(a: number, b: number): number }): RestorationJob {
  const causes: DamageCause[] = ['dig-in', 'water-ingress', 'vehicle-strike', 'rodent', 'gunshot'];
  const cause = causes[rng.int(0, causes.length - 1)];
  const reach = DAMAGE_REACH[cause].reachM;
  const visibleDamageM = 1 + rng.int(0, 5);

  // Enough slack for a correct splice-through, or deliberately not enough. Both are real
  // mornings, and the plan that fits is different.
  const needed = visibleDamageM + reach * 2;
  const generous = rng.next() < 0.55;
  const total = generous ? needed + 4 + rng.int(0, 10) : Math.max(4, needed - 2 - rng.int(0, 8));
  const slackAM = Math.round(total / 2);
  const slackBM = total - slackAM;

  const tubeColors = ['blue', 'orange', 'green', 'brown'];
  // Exactly one tube is critical, so "what goes back first" always has one right answer and
  // the trainee has to read the cable rather than count colours.
  const criticalTube = rng.int(0, tubeColors.length - 1);
  const taken: Record<CircuitPriority, string[]> = {
    critical: drawDistinct(SERVES.critical, tubeColors.length, rng),
    business: drawDistinct(SERVES.business, tubeColors.length, rng),
    residential: drawDistinct(SERVES.residential, tubeColors.length, rng),
  };
  const used: Record<CircuitPriority, number> = { critical: 0, business: 0, residential: 0 };

  const tubes: DamagedTube[] = tubeColors.map((color, i) => {
    const priority: CircuitPriority = i === criticalTube ? 'critical' : rng.next() < 0.5 ? 'business' : 'residential';
    return {
      color,
      circuits: 4 + rng.int(0, 20),
      priority,
      serves: taken[priority][used[priority]++] ?? taken[priority][0],
    };
  });

  return {
    story: CAUSE_STORY[cause],
    report: {
      id: `dmg-${seed}`,
      cause,
      cableLabel: `${tubes.length * 12}f backbone — ${ROUTES[rng.int(0, ROUTES.length - 1)]}`,
      distanceM: 200 + rng.int(0, 2600),
      visibleDamageM,
      slackAM,
      slackBM,
      tubes,
    },
  };
}

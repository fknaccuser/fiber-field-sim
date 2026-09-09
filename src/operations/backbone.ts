/**
 * Cutting a new terminal into an existing backbone.
 *
 * The splice bench already teaches the twenty-two steps and the tray bench teaches the
 * dressing. Neither of them teaches the part that happens before anybody opens a splicer,
 * and it is the part that takes customers down: deciding how you get into a cable that is
 * carrying service, and which fibres out of it belong to the new terminal.
 *
 * THE THREE DECISIONS, in the order they cost money:
 *
 *  1. **How you get in.** A backbone with live fibres in it is opened with a mid-span window
 *     — the sheath is opened, the tube you want is brought out, the rest is left alone and
 *     stays up the whole time. Cutting the cable through is faster and it takes down every
 *     circuit in it, including the ones nobody told you about. On a dead cable a full cut is
 *     fine and quicker; the mistake is not knowing which cable you are standing at.
 *  2. **Which fibres.** A live fibre is somebody's service. Splicing it into a new terminal
 *     disconnects them, it fuses perfectly while doing so, and nothing about the splice
 *     reading tells you. This is the most expensive mistake available here for the same
 *     reason the crew named it on the splice bench: it is invisible and it is instant.
 *  3. **How many.** A terminal needs a fibre per port. Short and you are back out here with
 *     another crew; long and you have burned spares somebody was keeping for the next build.
 *
 * ON THE CONVENTIONS. Taking fibres in colour order from the start of the tube is house
 * convention, not physics — a scattered set splices exactly as well and reads as a mess for
 * the next twenty years. It is reported as workmanship, which is what it is. Everything
 * scored as service-affecting is physics: light either arrives or it does not.
 *
 * Pure, seeded, no renderer.
 */

/** Standard fibre and buffer-tube colour order. The first twelve, in the order they are used. */
export const COLOR_ORDER: readonly string[] = [
  'blue', 'orange', 'green', 'brown', 'slate', 'white',
  'red', 'black', 'yellow', 'violet', 'rose', 'aqua',
];

export type FibreStatus =
  /** Carrying service right now. Touch it and somebody goes dark. */
  | 'live'
  /** Spliced through and dark, but assigned to a build that has not happened yet. */
  | 'reserved'
  /** Dark and unassigned. This is what a new terminal is supposed to be built on. */
  | 'spare';

export interface BackboneFibre {
  color: string;
  status: FibreStatus;
  /** What it carries or is held for, as the records name it. */
  note?: string;
}

export interface BackboneTube {
  color: string;
  fibres: BackboneFibre[];
}

export interface BackboneCable {
  id: string;
  label: string;
  /** True when anything in the cable is carrying service, which is what decides the method. */
  tubes: BackboneTube[];
}

export interface TerminalSpec {
  id: string;
  label: string;
  /** Distribution ports the new terminal will hand off. */
  ports: number;
}

export type AccessMethod =
  /** Open the sheath, bring out one tube, leave the rest up. */
  | 'mid-span-window'
  /** Cut the cable through. Everything in it goes down until it is spliced back. */
  | 'full-cut';

export interface CutInPlan {
  method: AccessMethod;
  tubeColor: string;
  /** Which fibres out of that tube, by colour. */
  fibreColors: string[];
  /** Assignment written into the records before anybody fuses anything. */
  recorded: boolean;
}

export type CutInSeverity =
  /** Somebody loses service. */
  | 'service-affecting'
  /** Wrong, and it will be found, but nobody goes dark over it. */
  | 'defect'
  /** Passes today and costs somebody else later. */
  | 'workmanship';

export interface CutInIssue {
  severity: CutInSeverity;
  code: string;
  where: string;
  detail: string;
  /** Circuits taken down by this, where that is the point of it. */
  circuits?: number;
}

export interface CutInVerdict {
  accepted: boolean;
  serviceAffecting: number;
  defects: number;
  workmanship: number;
  /** How many live circuits the plan interrupts. The number the foreman asks for first. */
  circuitsDown: number;
  issues: CutInIssue[];
  summary: string;
}

export function tubeOf(cable: BackboneCable, color: string): BackboneTube | undefined {
  return cable.tubes.find((t) => t.color === color);
}

/** Every fibre in the cable that is carrying service right now. */
export function liveFibres(cable: BackboneCable): Array<{ tube: string; fibre: BackboneFibre }> {
  return cable.tubes.flatMap((t) => t.fibres.filter((f) => f.status === 'live').map((fibre) => ({ tube: t.color, fibre })));
}

/** Is this cable in service at all? Decides whether a full cut is a shortcut or an outage. */
export function isLive(cable: BackboneCable): boolean {
  return liveFibres(cable).length > 0;
}

/**
 * Judge a cut-in plan, before a splicer is switched on.
 *
 * Deliberately judged as a *plan*. Everything here is knowable from the records and the
 * cable in front of you, and every one of these mistakes is cheaper to catch now than after
 * thirty-six splices.
 */
export function judgeCutIn(cable: BackboneCable, terminal: TerminalSpec, plan: CutInPlan): CutInVerdict {
  const issues: CutInIssue[] = [];
  const tube = tubeOf(cable, plan.tubeColor);
  let circuitsDown = 0;

  if (!tube) {
    issues.push({
      severity: 'defect',
      code: 'no-such-tube',
      where: cable.label,
      detail: `${plan.tubeColor} is not a tube in ${cable.label}. Check the sheath record before you open anything.`,
    });
  }

  // 1. How you got in.
  if (plan.method === 'full-cut' && isLive(cable)) {
    const live = liveFibres(cable).length;
    circuitsDown += live;
    issues.push({
      severity: 'service-affecting',
      code: 'cut-a-live-cable',
      where: cable.label,
      circuits: live,
      detail: `${cable.label} is carrying ${live} live circuit${live === 1 ? '' : 's'} and the plan cuts it through. Every one of them is down from the moment the saw goes in until the last splice is made. A mid-span window brings out the tube you want and leaves the rest up.`,
    });
  }

  // 2. Which fibres.
  const chosen = (tube?.fibres ?? []).filter((f) => plan.fibreColors.includes(f.color));
  const takenLive = chosen.filter((f) => f.status === 'live');
  if (takenLive.length > 0) {
    circuitsDown += takenLive.length;
    issues.push({
      severity: 'service-affecting',
      code: 'spliced-a-live-fibre',
      where: `${plan.tubeColor} tube`,
      circuits: takenLive.length,
      detail: `${takenLive.map((f) => f.color).join(', ')} ${takenLive.length === 1 ? 'is' : 'are'} in service${takenLive[0].note ? ` (${takenLive[0].note})` : ''}. Splicing them into the terminal disconnects those customers, the fusion reads perfectly while it happens, and nothing on the splicer will tell you.`,
    });
  }

  const takenReserved = chosen.filter((f) => f.status === 'reserved');
  if (takenReserved.length > 0) {
    issues.push({
      severity: 'defect',
      code: 'took-reserved-fibre',
      where: `${plan.tubeColor} tube`,
      detail: `${takenReserved.map((f) => f.color).join(', ')} ${takenReserved.length === 1 ? 'is' : 'are'} held for work already planned${takenReserved[0].note ? ` (${takenReserved[0].note})` : ''}. Dark today, somebody else's next month.`,
    });
  }

  // 3. How many.
  if (plan.fibreColors.length < terminal.ports) {
    issues.push({
      severity: 'defect',
      code: 'short-count',
      where: terminal.label,
      detail: `${plan.fibreColors.length} fibre${plan.fibreColors.length === 1 ? '' : 's'} for a ${terminal.ports}-port terminal. The ports you cannot feed are a second trip with a second crew.`,
    });
  } else if (plan.fibreColors.length > terminal.ports) {
    issues.push({
      severity: 'workmanship',
      code: 'over-count',
      where: terminal.label,
      detail: `${plan.fibreColors.length} fibres spliced for ${terminal.ports} ports. The extras are burned: they are in a terminal now, not in the backbone for the next build.`,
    });
  }

  // Convention, and reported as such.
  if (tube && plan.fibreColors.length > 0) {
    const wanted = COLOR_ORDER.slice(0, plan.fibreColors.length);
    const inOrder = plan.fibreColors.length === wanted.length && wanted.every((c) => plan.fibreColors.includes(c));
    if (!inOrder) {
      issues.push({
        severity: 'workmanship',
        code: 'scattered-assignment',
        where: `${plan.tubeColor} tube`,
        detail: 'Fibres taken out of colour order. It splices exactly as well and it reads as a mess to everyone who opens this closure for the next twenty years.',
      });
    }
  }

  if (!plan.recorded) {
    issues.push({
      severity: 'workmanship',
      code: 'unrecorded-assignment',
      where: terminal.label,
      detail: 'Assignment not written down before splicing. The colour code is only a record if somebody wrote which fibre went to which port.',
    });
  }

  const serviceAffecting = issues.filter((i) => i.severity === 'service-affecting').length;
  const defects = issues.filter((i) => i.severity === 'defect').length;
  const workmanship = issues.filter((i) => i.severity === 'workmanship').length;

  let summary: string;
  if (serviceAffecting > 0) {
    summary = `${circuitsDown} circuit${circuitsDown === 1 ? '' : 's'} go dark on this plan. Do not work it.`;
  } else if (defects > 0) {
    summary = `${defects} problem${defects === 1 ? '' : 's'} with the plan. Nobody loses service, but this is not ready to cut.`;
  } else if (workmanship > 0) {
    summary = `Workable. ${workmanship} thing${workmanship === 1 ? '' : 's'} the next crew will pay for.`;
  } else {
    summary = 'Clean plan. Nothing in service is touched and the assignment reads itself.';
  }

  return {
    accepted: serviceAffecting === 0 && defects === 0,
    serviceAffecting,
    defects,
    workmanship,
    circuitsDown,
    issues,
    summary,
  };
}

/**
 * Build a cut-in job.
 *
 * Seeded like everything else. The one editorial choice is how much of the backbone is
 * already in service, and it is set so a plan can always be made cleanly — there is always a
 * tube with enough spare fibres in it. A generator that could produce an impossible job would
 * teach a trainee that the correct answer is sometimes to give up.
 */
export interface CutInJob {
  cable: BackboneCable;
  terminal: TerminalSpec;
  /** Which tube the records say is free. The trainee still has to check it. */
  suggestedTube: string;
}

const STREETS = ['Camino del Avion', 'Via Ladera', 'Paseo Vista', 'Cow Camp', 'Los Patrones'];

export function generateCutInJob(seed: number, rng: { next(): number; int(a: number, b: number): number }): CutInJob {
  const tubeCount = 4 + rng.int(0, 2);
  const ports = [4, 6, 8, 12][rng.int(0, 3)];
  // One tube is guaranteed to hold enough spares for the job; the rest are whatever they are.
  const freeIndex = rng.int(0, tubeCount - 1);

  const tubes: BackboneTube[] = [];
  for (let t = 0; t < tubeCount; t++) {
    const fibres: BackboneFibre[] = COLOR_ORDER.slice(0, 12).map((color, f) => {
      if (t === freeIndex) {
        // Spare across the whole span the terminal needs, so a clean plan always exists.
        if (f < ports) return { color, status: 'spare' as const };
        return { color, status: rng.next() < 0.3 ? ('reserved' as const) : ('spare' as const), note: 'held for a planned build' };
      }
      const roll = rng.next();
      if (roll < 0.55) return { color, status: 'live' as const, note: `feeds ${STREETS[rng.int(0, STREETS.length - 1)]}` };
      if (roll < 0.7) return { color, status: 'reserved' as const, note: 'held for a planned build' };
      return { color, status: 'spare' as const };
    });
    tubes.push({ color: COLOR_ORDER[t], fibres });
  }

  return {
    cable: {
      id: `bb-${seed}`,
      label: `${tubeCount * 12}f backbone — ${STREETS[rng.int(0, STREETS.length - 1)]}`,
      tubes,
    },
    terminal: {
      id: `nap-${seed}`,
      label: `New NAP ${String.fromCharCode(65 + rng.int(0, 5))}-${rng.int(1, 20)}`,
      ports,
    },
    suggestedTube: COLOR_ORDER[freeIndex],
  };
}

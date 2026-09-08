/**
 * Ribbon splicing, modelled as the procedure it is.
 *
 * The point of simulating this is not a progress bar after clicking "splice". It is that
 * fibre work punishes you *later*: almost every mistake on this list is invisible at the
 * moment you make it and only surfaces when the splicer reports loss, or when the OTDR is
 * shot from the far end, or when someone re-enters the closure a year later and finds the
 * slack was never there.
 *
 * The sequence is this crew's own: the fibres come out of a Hexatronic tube loose, get
 * bonded with the glue method, and are only then stripped as a unit with the heat jacket
 * tool, cleaved, and mass-fusion spliced. Ribbonizing before stripping is what makes the
 * whole thing one operation instead of twelve.
 *
 * Pure and deterministic: same seed and same choices, same splice losses.
 */
import { createRng, deriveSeed } from '../world';

export type StepId =
  | 'stage-sleeves'
  | 'open-closure'
  | 'anchor-cable'
  | 'strip-tube'
  | 'clean-fibres'
  | 'ribbonize'
  | 'heat-strip'
  | 'clean-bare'
  | 'cleave'
  | 'load-splicer'
  | 'fuse'
  | 'inspect-loss'
  | 'shrink-sleeve'
  | 'route-tray'
  | 'dress-slack'
  | 'label'
  | 'close-closure';

/**
 * Which fibres of the ribbon a defect touches. This is the diagnostic signature, and it is
 * the reason the model bothers to distinguish them: a contaminated end face lifts the whole
 * set uniformly, a tired cleaver blade takes a scattered few, and an uneven glue matrix
 * takes the outer fibres because those are the ones sitting proud in the holder. Told
 * apart, those three point at three different tools. Averaged together, they are just
 * "high loss" and teach nothing.
 */
export type Affects = 'all' | 'edges' | 'scattered';

export interface Mistake {
  id: string;
  label: string;
  /** What actually goes wrong, and when you find out. */
  consequence: string;
  /** Added splice loss in dB, if it degrades rather than fails outright. */
  addedLossDb?: number;
  /** Which fibres carry that loss. Defaults to the whole set. */
  affects?: Affects;
  /** Whether the fibre has to be cut back and the step redone. */
  rework: boolean;
  /** Extra simulated seconds if it does force rework. */
  reworkSeconds?: number;
}

export interface Step {
  id: StepId;
  title: string;
  /** The teaching line: why this step exists at all. */
  why: string;
  tool: string;
  seconds: number;
  /** Steps that must already be complete. */
  after: StepId[];
  mistakes: Mistake[];
}

/**
 * Canonical order. `after` encodes the hard dependencies rather than the list position,
 * because several steps are genuinely order-free (labelling can happen before dressing)
 * and a trainer that marks a correct-but-different order wrong teaches superstition.
 */
export const PROCEDURE: readonly Step[] = [
  {
    id: 'stage-sleeves',
    title: 'Slide the splice sleeves on first',
    why: 'A sleeve cannot be fitted after the fusion. Forget it and the only fix is to cut the splice out and start the fibre again — the most expensive minute on the job, and the one every technician loses at least once.',
    tool: 'sleeves',
    seconds: 60,
    after: [],
    mistakes: [
      {
        id: 'no-sleeve',
        label: 'Sleeves not staged before splicing',
        consequence: 'Discovered at the moment of fusion. The splice has to be cut out, the fibre re-stripped, re-cleaved and re-spliced.',
        rework: true,
        reworkSeconds: 420,
      },
    ],
  },
  {
    id: 'open-closure',
    title: 'Open and clean the closure',
    why: 'Grit inside a closure ends up on an end face. Opening it dirty guarantees you will chase a loss you introduced yourself.',
    tool: 'hands',
    seconds: 180,
    after: [],
    mistakes: [
      { id: 'dirty-shell', label: 'Shell not wiped out', consequence: 'Debris migrates onto end faces during handling; losses drift up across the whole tray.', addedLossDb: 0.04, rework: false },
    ],
  },
  {
    id: 'anchor-cable',
    title: 'Anchor the cable strength member',
    why: 'The strength member takes the load, not the fibre. An unanchored cable transfers every future tug straight onto your splices.',
    tool: 'hands',
    seconds: 240,
    after: ['open-closure'],
    mistakes: [
      { id: 'unanchored', label: 'Strength member not clamped', consequence: 'Passes today. Fails months later when the cable is disturbed and the splices take the strain.', rework: false },
    ],
  },
  {
    id: 'strip-tube',
    title: 'Open the tube and free the fibres',
    why: 'The tube is opened well back from the tray so the fibres inside reach their position with slack to spare.',
    tool: 'tube cutter',
    seconds: 300,
    after: ['anchor-cable'],
    mistakes: [
      { id: 'short-tube', label: 'Tube opened too short', consequence: 'Fibres will not reach their tray without tension. Found at routing, when it is too late to add length.', rework: true, reworkSeconds: 600 },
      { id: 'nicked-fibre', label: 'Fibre nicked by the tube cutter', consequence: 'A nicked fibre may survive the splice and break later under handling.', rework: true, reworkSeconds: 300 },
    ],
  },
  {
    id: 'clean-fibres',
    title: 'Clean the gel off the fibres',
    why: 'Filling compound left on a fibre will contaminate the cleaver and the splicer V-grooves, so the fault spreads to every splice after it.',
    tool: 'lint-free wipes + IPA',
    seconds: 300,
    after: ['strip-tube'],
    mistakes: [
      { id: 'gel-left', label: 'Gel not fully removed', consequence: 'Contaminates the cleaver blade and V-grooves; loss climbs steadily across the tray rather than failing one splice.', addedLossDb: 0.08, rework: false },
    ],
  },
  {
    id: 'ribbonize',
    title: 'Ribbonize with the glue method',
    why: 'Twelve loose fibres become one unit. The matrix has to be flat and evenly spaced, because the mass-fusion splicer aligns the ribbon as a whole — a fibre sitting proud is a fibre that will not align.',
    tool: 'ribbonizing jig + adhesive',
    seconds: 600,
    after: ['clean-fibres'],
    mistakes: [
      { id: 'uneven-matrix', label: 'Uneven or twisted matrix', consequence: 'Outer fibres sit proud in the holder. The splicer reports offset on the edge fibres of the ribbon and leaves the middle alone.', addedLossDb: 0.16, affects: 'edges', rework: false },
      { id: 'wrong-order', label: 'Fibre colour order not kept', consequence: 'The ribbon splices cleanly and connects the wrong fibres. Only found on continuity testing, or by the customer.', rework: true, reworkSeconds: 900 },
    ],
  },
  {
    id: 'heat-strip',
    title: 'Strip the ribbon with the heat jacket tool',
    why: 'Heat softens the coating so the whole ribbon strips as one at the same length. Stripping cold, or one fibre at a time, is how you crack a fibre and ruin the flatness you just built.',
    tool: 'heat jacket stripper',
    seconds: 240,
    after: ['ribbonize'],
    mistakes: [
      { id: 'cold-strip', label: 'Stripped without heat', consequence: 'Coating tears rather than releases; micro-cracks in the glass that survive the splice and fail later.', addedLossDb: 0.12, rework: false },
      { id: 'wrong-length', label: 'Strip length does not match the holder', consequence: 'The ribbon will not seat in the splicer holder; re-strip and lose length off the slack you planned.', rework: true, reworkSeconds: 240 },
    ],
  },
  {
    id: 'clean-bare',
    title: 'Clean the bare fibre',
    why: 'The last chance to remove coating residue. Anything still on the glass goes into the cleaver, then into the arc.',
    tool: 'lint-free wipes + IPA',
    seconds: 120,
    after: ['heat-strip'],
    mistakes: [
      { id: 'skip-clean', label: 'Bare fibre not cleaned', consequence: 'Residue burns in the arc. Loss is visible immediately, and the splice is usually rejected.', addedLossDb: 0.25, rework: false },
      { id: 'touched-glass', label: 'Bare glass touched by hand', consequence: 'Skin oils contaminate the end face; the splice looks fine and reads high.', addedLossDb: 0.10, rework: false },
    ],
  },
  {
    id: 'cleave',
    title: 'Cleave the ribbon',
    why: 'Cleave angle is the single biggest lever on splice loss. A good ribbon cleave is square across all twelve at once, which is why a tired blade shows up as one bad fibre in the set, not all of them.',
    tool: 'mass cleaver',
    seconds: 180,
    after: ['clean-bare'],
    mistakes: [
      { id: 'dull-blade', label: 'Cleaver blade not advanced', consequence: 'Angled or hackled ends on a scattered few of the ribbon; the rest splice normally, which is what tells you it is the blade and not the prep.', addedLossDb: 0.22, affects: 'scattered', rework: false },
      { id: 'short-cleave', label: 'Cleave length wrong', consequence: 'Fibre sits short of the electrodes; the splicer refuses and the ribbon is re-prepared.', rework: true, reworkSeconds: 300 },
    ],
  },
  {
    id: 'load-splicer',
    title: 'Load the splicer',
    why: 'V-grooves and electrodes have to be clean, and the ribbon has to sit flat in both holders. Most "bad splicer" days are dirty V-grooves.',
    tool: 'mass fusion splicer',
    seconds: 120,
    after: ['cleave'],
    mistakes: [
      { id: 'dirty-grooves', label: 'V-grooves not cleaned', consequence: 'Consistent offset across the whole ribbon — the tell that it is the machine, not the fibre.', addedLossDb: 0.14, rework: false },
      { id: 'old-electrodes', label: 'Electrodes past their arc count', consequence: 'Unstable arc; losses vary run to run with no pattern in the fibre prep.', addedLossDb: 0.09, rework: false },
    ],
  },
  {
    id: 'fuse',
    title: 'Fuse',
    why: 'The machine does the work. What it reports is an estimate from image analysis, not a measurement — which is why it never replaces an OTDR from the far end.',
    tool: 'mass fusion splicer',
    seconds: 90,
    after: ['load-splicer'],
    mistakes: [],
  },
  {
    id: 'inspect-loss',
    title: 'Read the estimated loss',
    why: 'Reject before you sleeve. A splice you already shrank is a splice you have to cut out twice.',
    tool: 'mass fusion splicer',
    seconds: 60,
    after: ['fuse'],
    mistakes: [
      { id: 'accept-high', label: 'High-loss splice accepted', consequence: 'Sleeved and dressed into the tray. Found later on the OTDR, and by then the tray has to come apart.', rework: false },
    ],
  },
  {
    id: 'shrink-sleeve',
    title: 'Shrink the sleeve',
    why: 'The sleeve is the mechanical protection for bare glass. It has to be centred on the splice and fully cured, or it is decoration.',
    tool: 'splicer oven',
    seconds: 120,
    after: ['inspect-loss'],
    mistakes: [
      { id: 'off-centre', label: 'Sleeve not centred on the splice', consequence: 'Bare fibre left outside the sleeve; a break waiting for the next re-entry.', rework: false },
      { id: 'under-cured', label: 'Pulled from the oven early', consequence: 'Sleeve does not grip; it slides in the tray and the splice takes strain.', rework: false },
    ],
  },
  {
    id: 'route-tray',
    title: 'Route into the tray',
    why: 'Fibre is routed to the radius limiters, not across the tray. Bend radius is not a guideline — a tight bend adds macrobend loss immediately and can grow over years.',
    tool: 'hands',
    seconds: 420,
    after: ['shrink-sleeve'],
    mistakes: [
      { id: 'tight-bend', label: 'Bend inside the minimum radius', consequence: 'Macrobend loss that shows on the OTDR at 1550 nm before it shows at 1310 — the classic signature.', addedLossDb: 0.30, rework: false },
      { id: 'crossed-fibres', label: 'Fibres crossed over the tray', consequence: 'Passes testing. Whoever re-enters this closure cannot trace a circuit without disturbing others.', rework: false },
    ],
  },
  {
    id: 'dress-slack',
    title: 'Dress the slack',
    why: 'Slack is stored in even coils inside the tray so a future technician can lift a splice out and work on it without cutting anything.',
    tool: 'hands',
    seconds: 300,
    after: ['route-tray'],
    mistakes: [
      { id: 'no-slack', label: 'No usable slack stored', consequence: 'The next re-entry has no fibre to work with and has to re-splice to gain length.', rework: false },
      { id: 'over-stuffed', label: 'Tray over-filled', consequence: 'The lid presses on fibre. Loss appears when the closure is closed, not while it is open — maddening to diagnose.', addedLossDb: 0.18, rework: false },
    ],
  },
  {
    id: 'label',
    title: 'Label the tray and record the assignments',
    why: 'An unlabelled tray is a closure someone has to reverse-engineer with a VFL at two in the morning.',
    tool: 'labels + as-built',
    seconds: 240,
    after: ['shrink-sleeve'],
    mistakes: [
      { id: 'no-label', label: 'Tray left unlabelled', consequence: 'No consequence today. Hours lost on the next fault at this location.', rework: false },
    ],
  },
  {
    id: 'close-closure',
    title: 'Close and seal',
    why: 'The gasket and the seal are what keep water out of a handhole that will flood. A closure that fails here fails completely, later, in the rain.',
    tool: 'hands',
    seconds: 300,
    after: ['dress-slack', 'label'],
    mistakes: [
      { id: 'pinched-gasket', label: 'Gasket pinched or missing', consequence: 'Water ingress. The closure fills, and every splice in it goes eventually.', rework: false },
      { id: 'no-pressure-test', label: 'Seal not checked', consequence: 'A slow leak that passes today and takes the whole closure out in a season.', rework: false },
    ],
  },
];

export const STEP_IDS: readonly StepId[] = PROCEDURE.map((s) => s.id);

export function step(id: StepId): Step {
  const s = PROCEDURE.find((x) => x.id === id);
  if (!s) throw new Error(`unknown ribbon step: ${id}`);
  return s;
}

export interface OrderIssue {
  step: StepId;
  missing: StepId;
  reason: string;
}

/**
 * Order is judged on dependencies, not on position in the list.
 *
 * Doing a correct-but-different order — labelling before dressing, say — is not a mistake
 * and must not be reported as one. Only a genuine dependency violation is.
 */
export function validateOrder(performed: readonly StepId[]): OrderIssue[] {
  const done = new Set<StepId>();
  const issues: OrderIssue[] = [];
  for (const id of performed) {
    const s = step(id);
    for (const dep of s.after) {
      if (!done.has(dep)) {
        issues.push({ step: id, missing: dep, reason: `${s.title} was done before ${step(dep).title.toLowerCase()}` });
      }
    }
    done.add(id);
  }
  return issues;
}

/** Steps in the procedure that were never performed at all. */
export function omitted(performed: readonly StepId[]): StepId[] {
  const done = new Set(performed);
  return STEP_IDS.filter((id) => !done.has(id));
}

export interface SpliceOutcome {
  /** Per-fibre estimated loss, as the splicer would report it. */
  lossDb: number[];
  worstDb: number;
  meanDb: number;
  /** Fibres over the acceptance threshold. */
  failed: number[];
  /** Whether the set passes as a whole. */
  pass: boolean;
}

/** House acceptance: mean across the ribbon, and no single fibre over the cap. */
export const ACCEPT_MEAN_DB = 0.10;
export const ACCEPT_MAX_DB = 0.20;

/**
 * What the splicer reports, given how the ribbon was prepared.
 *
 * A clean job still varies fibre to fibre — that scatter is real and is why a single good
 * reading proves nothing about the set. Mistakes push the whole distribution, except the
 * ones that target specific fibres: an uneven glue matrix hurts the *edges* of the ribbon,
 * and a tired cleaver blade hurts an arbitrary few, which is exactly how you tell them
 * apart on a real job.
 */
export function spliceLoss(seed: number, fibreCount: number, mistakes: readonly string[]): SpliceOutcome {
  const rng = createRng(deriveSeed(seed, 'ribbon-splice', String(fibreCount), mistakes.join('+')));
  const chosen = new Set(mistakes);

  // Split the active defects by the fibres they touch, so the three signatures stay
  // distinguishable in the readings rather than collapsing into one raised average.
  let uniform = 0.03;
  let edges = 0;
  const scattered: number[] = [];
  for (const s of PROCEDURE) {
    for (const m of s.mistakes) {
      if (!chosen.has(m.id) || !m.addedLossDb) continue;
      const where: Affects = m.affects ?? 'all';
      if (where === 'all') uniform += m.addedLossDb;
      else if (where === 'edges') edges += m.addedLossDb;
      else scattered.push(m.addedLossDb);
    }
  }

  const loss: number[] = [];
  for (let i = 0; i < fibreCount; i++) {
    let v = uniform + rng.next() * 0.035;
    if (edges > 0 && (i === 0 || i === fibreCount - 1)) v += edges;
    for (const amount of scattered) {
      if (rng.next() < 0.3) v += amount;
    }
    loss.push(Math.round(v * 1000) / 1000);
  }

  const worst = Math.max(...loss);
  const mean = loss.reduce((a, b) => a + b, 0) / loss.length;
  const failed = loss.map((v, i) => (v > ACCEPT_MAX_DB ? i : -1)).filter((i) => i >= 0);

  return {
    lossDb: loss,
    worstDb: Math.round(worst * 1000) / 1000,
    meanDb: Math.round(mean * 1000) / 1000,
    failed: failed,
    pass: failed.length === 0 && mean <= ACCEPT_MEAN_DB,
  };
}

/** Total simulated time, including any rework the chosen mistakes force. */
export function elapsedSeconds(performed: readonly StepId[], mistakes: readonly string[]): number {
  const flat = new Set(mistakes);
  let total = 0;
  for (const id of performed) {
    const s = step(id);
    total += s.seconds;
    for (const m of s.mistakes) {
      if (flat.has(m.id) && m.rework) total += m.reworkSeconds ?? 0;
    }
  }
  return total;
}

/** Every mistake the procedure can produce, for the debrief to explain against. */
export function allMistakes(): Array<Mistake & { step: StepId }> {
  return PROCEDURE.flatMap((s) => s.mistakes.map((m) => ({ ...m, step: s.id })));
}

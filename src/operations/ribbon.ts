/**
 * Ribbon splicing, modelled as the procedure it is.
 *
 * The point of simulating this is not a progress bar after clicking "splice". It is that
 * fibre work punishes you *later*: most of what goes wrong here is invisible at the moment
 * you do it and only surfaces when the splicer reports loss, or when the case is tested
 * from the far end, or when somebody re-enters the closure a year later.
 *
 * SOURCE. Revised against an hour of a splicer working a 432-to-432 butt splice — 36 ribbon
 * splices, 12 fibres to a ribbon, 12 ribbons to a tray. See
 * docs/architecture/ribbon-splicing-source.md for what that audit changed and why. The
 * first version of this file was written from general practice and was wrong in one
 * structural way and about a dozen specific ones; the biggest miss was that it had no arc
 * test at all, which is the single calibration that decides whether the whole case comes
 * back clean.
 *
 * PHASES MATTER. The arc test happens once a day. The splice loop happens thirty-six times.
 * A model that flattens those into one list teaches a trainee to arc-test every ribbon, or
 * — far worse — to think a per-ribbon habit is a once-a-day one.
 *
 * Pure and deterministic: same seed and same choices, same splice losses.
 */
import { createRng, deriveSeed } from '../world';

export type StepId =
  // --- setup: once per day, or when changing from singles to ribbon ---
  | 'set-splice-mode'
  | 'arc-test'
  | 'open-closure'
  | 'anchor-cable'
  | 'strip-tube'
  | 'lay-out-ribbons'
  // --- the loop: repeated per ribbon ---
  | 'stage-sleeves'
  | 'strip-ribbon'
  | 'clean-fibre'
  | 'tap-separate'
  | 'cleave'
  | 'clean-vgrooves'
  | 'load-splicer'
  | 'fuse'
  | 'inspect-loss'
  | 'inspect-weld'
  | 'shrink-sleeve'
  | 'cool-sleeve'
  // --- closeout: once the tray is full ---
  | 'seat-in-tray'
  | 'dress-slack'
  | 'label'
  | 'close-closure';

/** When in the job a step happens, and therefore how often. */
export type Phase = 'setup' | 'per-ribbon' | 'closeout';

/**
 * Which fibres of the ribbon a defect touches. This is the diagnostic signature, and it is
 * the reason the model bothers to distinguish them: a bad arc or contamination lifts the
 * whole set uniformly, a tired cleaver blade takes a scattered few, and an uneven glue
 * matrix takes the outer fibres because those are the ones sitting proud in the holder.
 * Told apart, those point at three different tools. Averaged together they are just "high
 * loss" and teach nothing.
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
  phase: Phase;
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
 * Canonical procedure. `after` encodes the hard dependencies rather than the list position,
 * because several steps are genuinely order-free (labelling can happen before dressing) and
 * a trainer that marks a correct-but-different order wrong teaches superstition.
 */
export const PROCEDURE: readonly Step[] = [
  // ---------------------------------------------------------------- setup
  {
    id: 'set-splice-mode',
    phase: 'setup',
    title: 'Put the machine in 12-count ribbon mode',
    why: 'A splicer left in single-fibre mode will not align a ribbon. Checked before anything else, because every other setting you are about to calibrate depends on it.',
    tool: 'mass fusion splicer',
    seconds: 60,
    after: [],
    mistakes: [
      { id: 'wrong-splice-mode', label: 'Machine still set for single fibres', consequence: 'It will not align a ribbon. Caught immediately, but only if you look — otherwise you fight the machine for twenty minutes.', rework: true, reworkSeconds: 120 },
    ],
  },
  {
    id: 'arc-test',
    phase: 'setup',
    title: 'Arc test on scrap ribbon',
    why: 'Once a day, and again whenever you change from singles to ribbon. The arc is calibrated to the air you are standing in — temperature, humidity, altitude, electrode wear. Get it right once and the whole case comes back clean; skip it and you pay in re-burns across every tray.',
    tool: 'mass fusion splicer + dead ribbon',
    seconds: 600,
    after: ['set-splice-mode'],
    mistakes: [
      {
        id: 'no-arc-test',
        label: 'Never arc tested',
        consequence: 'Loss drifts up across every splice in the case with no single cause you can point at. This is the mistake that produces a tray full of re-burns.',
        addedLossDb: 0.11, affects: 'all', rework: false,
      },
      {
        id: 'arc-too-strong',
        label: 'Arc reported too strong and was not re-tested',
        consequence: 'The machine tells you outright. Splicing on it anyway burns the fibre ends and lifts loss on every splice that follows.',
        addedLossDb: 0.16, affects: 'all', rework: false,
      },
    ],
  },
  {
    id: 'open-closure',
    phase: 'setup',
    title: 'Open the case and clean it out',
    why: 'Grit inside a closure ends up on an end face. Opening it dirty guarantees you will chase a loss you introduced yourself.',
    tool: 'hands',
    seconds: 180,
    after: [],
    mistakes: [
      { id: 'dirty-shell', label: 'Shell not wiped out', consequence: 'Debris migrates onto end faces during handling; losses drift up across the whole tray.', addedLossDb: 0.04, affects: 'all', rework: false },
    ],
  },
  {
    id: 'anchor-cable',
    phase: 'setup',
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
    phase: 'setup',
    title: 'Open the tubes and bring the ribbons up',
    why: 'The tube is opened well back so every ribbon reaches its tray with slack to spare. Length you did not leave here cannot be added later.',
    tool: 'tube cutter',
    seconds: 300,
    after: ['anchor-cable'],
    mistakes: [
      { id: 'short-tube', label: 'Tube opened too short', consequence: 'Ribbons will not reach their tray without tension. Found at routing, when it is far too late.', rework: true, reworkSeconds: 600 },
      { id: 'nicked-fibre', label: 'Fibre nicked by the tube cutter', consequence: 'A nicked fibre may survive the splice and break later under handling.', rework: true, reworkSeconds: 300 },
    ],
  },
  {
    id: 'lay-out-ribbons',
    phase: 'setup',
    title: 'Lay both sides out in order and match them',
    why: 'Feed side one through six against distribution side one through six, blue orange green brown slate white, matched one to one before a single splice is made. Splicing to the wrong ribbon fuses perfectly and connects the wrong customers.',
    tool: 'hands',
    seconds: 420,
    after: ['strip-tube'],
    mistakes: [
      {
        id: 'mismatched-sides',
        label: 'Feed and distribution not matched one to one',
        consequence: 'Every splice reads perfect. The fault only appears on continuity testing, or when a customer calls, and unpicking it means cutting the tray back out.',
        rework: true, reworkSeconds: 1800,
      },
    ],
  },

  // ------------------------------------------------------------ per ribbon
  {
    id: 'stage-sleeves',
    phase: 'per-ribbon',
    title: 'Slide the heat shrink on — ceramic down, clear up',
    why: 'A sleeve cannot be fitted after the fusion. Forget it and the only fix is to cut the splice out and start again. It also goes on one way round: with the ribbon running blue up, the clear side of the sleeve is up and the ceramic strength member sits underneath.',
    tool: 'heat shrink sleeves',
    seconds: 60,
    after: ['lay-out-ribbons'],
    mistakes: [
      { id: 'no-sleeve', label: 'Sleeve not staged before splicing', consequence: 'Discovered at the moment of fusion. The splice has to be cut out, the ribbon re-stripped, re-cleaved and re-spliced.', rework: true, reworkSeconds: 420 },
      { id: 'sleeve-upside-down', label: 'Sleeve on upside down', consequence: 'Ceramic on top instead of underneath. It shrinks crooked and the splice is not supported where it needs to be.', rework: true, reworkSeconds: 240 },
    ],
  },
  {
    id: 'strip-ribbon',
    phase: 'per-ribbon',
    title: 'Thermal strip the ribbon',
    why: 'Heat softens the coating so the whole ribbon strips as one at one length. On ribbon glued up on site rather than bonded in the factory, do not clamp the stripper fully — it will pull the matrix apart and cost you ten minutes re-gluing and waiting for it to dry.',
    tool: 'thermal stripper',
    seconds: 180,
    after: ['stage-sleeves'],
    mistakes: [
      { id: 'overclamped-stripper', label: 'Clamped hard on site-glued ribbon', consequence: 'The ribbon comes apart in the tool. Re-glue, wait for it to dry, and start the ribbon again.', rework: true, reworkSeconds: 480 },
      { id: 'cold-strip', label: 'Stripped without heat', consequence: 'Coating tears rather than releases; micro-cracks in the glass that survive the splice and fail later.', addedLossDb: 0.12, affects: 'all', rework: false },
      { id: 'pulled-through', label: 'Ribbon pulled through the holder', consequence: 'Coating ends up sitting on the cleaver pads, which guarantees a bad cleave. Pull it back before cleaving instead of finding out after.', rework: true, reworkSeconds: 150 },
    ],
  },
  {
    id: 'clean-fibre',
    phase: 'per-ribbon',
    title: 'Wipe the bare fibre — wet, then dry',
    why: 'Two or three wet wipes and a dry one. Anything left on the glass goes into the cleaver and then into the arc. Too much alcohol is its own problem: the fibres cling together and will not separate — blow on it, 99% isopropyl flashes off in seconds.',
    tool: 'lint-free wipes + 99% IPA',
    seconds: 90,
    after: ['strip-ribbon'],
    mistakes: [
      { id: 'skip-clean', label: 'Bare fibre not cleaned', consequence: 'Residue burns in the arc. Loss is visible immediately and the splice is usually rejected.', addedLossDb: 0.25, affects: 'all', rework: false },
      { id: 'too-much-alcohol', label: 'Wipe too wet', consequence: 'Fibres stick together and will not separate for the cleave. Costs a moment, not a splice — blow it dry.', rework: false },
      { id: 'touched-glass', label: 'Bare glass touched by hand', consequence: 'Skin oils contaminate the end face; the splice looks fine and reads high.', addedLossDb: 0.10, affects: 'all', rework: false },
    ],
  },
  {
    id: 'tap-separate',
    phase: 'per-ribbon',
    title: 'Tap the ribbon to spread the fibres',
    why: 'Fibres crisscross after wiping. Cleaving them crossed snaps them in the tool and gives you a ragged cleave, so you do the ribbon again anyway. A few taps costs seconds and prevents that.',
    tool: 'hands',
    seconds: 30,
    after: ['clean-fibre'],
    mistakes: [
      { id: 'not-tapped', label: 'Fibres left crisscrossed', consequence: 'They break in the cleaver. Re-strip, re-clean, re-cleave — the whole ribbon back to the stripper.', rework: true, reworkSeconds: 240 },
    ],
  },
  {
    id: 'cleave',
    phase: 'per-ribbon',
    title: 'Cleave the ribbon',
    why: 'Blade forward, held firm, one smooth click through. Cleave quality is the biggest single lever on splice loss, and a ribbon cleave has to be square across all twelve at once — which is why a tired blade shows up as a few bad fibres in the set rather than all of them.',
    tool: 'mass cleaver',
    seconds: 120,
    after: ['tap-separate'],
    mistakes: [
      { id: 'dirty-cleaver-pads', label: 'Debris left on the cleaver pads', consequence: 'Chipped and broken fibres, cleave after cleave, for no visible reason. Clean the pads — this is the cause far more often than the blade.', rework: true, reworkSeconds: 300 },
      { id: 'dull-blade', label: 'Blade not advanced to a fresh position', consequence: 'Angled or hackled ends on a scattered few of the ribbon; the rest splice normally, which is what tells you it is the blade and not the prep. Rotate to a new spot.', addedLossDb: 0.22, affects: 'scattered', rework: false },
      { id: 'short-cleave', label: 'Cleave length wrong', consequence: 'Fibre sits short of the electrodes; the splicer refuses and the ribbon is re-prepared.', rework: true, reworkSeconds: 300 },
    ],
  },
  {
    id: 'clean-vgrooves',
    phase: 'per-ribbon',
    title: 'Clear the V-grooves',
    why: 'Dust in the grooves lifts a fibre out of alignment and the machine rejects it on offset, naming the fibre. A brush works; so does running the freshly cleaved scrap through the grooves at an angle to push the dust out — carefully, because bare fibre in the fingers goes everywhere.',
    tool: 'V-groove brush or cleaved scrap',
    seconds: 60,
    after: ['cleave'],
    mistakes: [
      { id: 'dirty-vgrooves', label: 'V-grooves not cleared', consequence: 'Offset errors on specific fibres, and the machine will tell you which ones. Consistent offset across the whole ribbon is the tell that it is the machine, not the fibre.', addedLossDb: 0.14, affects: 'all', rework: false },
      { id: 'old-electrodes', label: 'Electrodes past their arc count', consequence: 'Unstable arc; losses vary run to run with no pattern in the fibre prep.', addedLossDb: 0.09, affects: 'all', rework: false },
    ],
  },
  {
    id: 'load-splicer',
    phase: 'per-ribbon',
    title: 'Load it blue up, with no twist',
    why: 'Blue stays up from the transport tube all the way into the machine. A ribbon that goes in twisted splices fine and then fights the tray for the rest of its life — bends, kinks, and a closure that looks wrong to whoever opens it next. Check for a flip before it goes in, not after.',
    tool: 'mass fusion splicer',
    seconds: 90,
    after: ['clean-vgrooves'],
    mistakes: [
      { id: 'lost-blue-up', label: 'Twist between the tube and the machine', consequence: 'The splice is fine. The ribbon will not lie flat in the tray, and every future re-entry starts by undoing your twist.', rework: false },
      { id: 'crossed-in-glue', label: 'Fibres crossed when the ribbon was glued', consequence: 'A flip. Splices perfectly and connects two fibres to the wrong places — found on power metering, not here.', rework: true, reworkSeconds: 900 },
      {
        id: 'uneven-matrix',
        label: 'Glue matrix uneven — outer fibres sitting proud',
        consequence: 'Ribbon glued up on site is only as flat as you made it. Fibres standing proud will not seat level in the holder, so the machine reports offset on the OUTER fibres of the ribbon and leaves the middle alone. That shape is the tell: re-seat it, or re-glue it.',
        addedLossDb: 0.16, affects: 'edges', rework: false,
      },
    ],
  },
  {
    id: 'fuse',
    phase: 'per-ribbon',
    title: 'Fuse',
    why: 'With offsets inside the allowable limit the machine splices on its own. What it then reports is an estimate from image analysis, not a measurement — which is why it never replaces a test from the far end.',
    tool: 'mass fusion splicer',
    seconds: 60,
    after: ['load-splicer'],
    mistakes: [],
  },
  {
    id: 'inspect-loss',
    phase: 'per-ribbon',
    title: 'Read the estimated loss',
    why: 'Hundredths are what a calibrated machine on clean fibre produces. A tenth on one fibre is worth a second look before you sleeve it, because a splice you already shrank is a splice you have to cut out twice.',
    tool: 'mass fusion splicer',
    seconds: 45,
    after: ['fuse'],
    mistakes: [
      { id: 'accept-high', label: 'High reading accepted without looking', consequence: 'Sleeved and dressed into the tray. Found later on test, and by then the tray has to come apart.', rework: false },
    ],
  },
  {
    id: 'inspect-weld',
    phase: 'per-ribbon',
    title: 'Look at the weld before you accept it',
    why: 'Crack the lid and read the welds through the machine’s own camera. Clean fusions with no indents and nothing squished will hold even when the estimate reads a little high — the number is inferred, the image is not. This is the judgement that separates accepting a good splice from gambling on a bad one.',
    tool: 'mass fusion splicer',
    seconds: 45,
    after: ['inspect-loss'],
    mistakes: [
      { id: 'skipped-weld-check', label: 'Number trusted without viewing the weld', consequence: 'Either a good splice was cut out for nothing, or a squished one went into the tray. The image is the only direct evidence you have on site.', rework: false },
    ],
  },
  {
    id: 'shrink-sleeve',
    phase: 'per-ribbon',
    title: 'Shrink the sleeve',
    why: 'Keep tension on both sides coming out of the machine, centre the splice in the sleeve, and let the oven finish. Off-centre leaves bare glass outside the protection.',
    tool: 'splicer oven',
    seconds: 90,
    after: ['inspect-weld'],
    mistakes: [
      { id: 'off-centre', label: 'Sleeve not centred on the splice', consequence: 'Bare fibre left outside the sleeve; a break waiting for the next re-entry.', rework: false },
      { id: 'under-cured', label: 'Pulled from the oven early', consequence: 'Sleeve does not grip; it slides in the tray and the splice takes strain.', rework: false },
    ],
  },
  {
    id: 'cool-sleeve',
    phase: 'per-ribbon',
    title: 'Let it cool before you handle it',
    why: 'A hot sleeve is still soft. Push on it now and you break the splice inside the thing that was meant to protect it — and you will not find out until the tray is tested. When you do handle it, push on the coated ends, never the middle where the bare glass is.',
    tool: 'patience',
    seconds: 60,
    after: ['shrink-sleeve'],
    mistakes: [
      { id: 'stowed-hot', label: 'Put away while still hot', consequence: 'The sleeve deforms and the splice inside it breaks. Invisible until the tray is tested.', rework: true, reworkSeconds: 600 },
      { id: 'pushed-sleeve-centre', label: 'Pushed on the middle of the sleeve', consequence: 'That is exactly where the bare glass is. Handle it by the coated ends.', rework: true, reworkSeconds: 600 },
    ],
  },

  // ------------------------------------------------------------- closeout
  {
    id: 'seat-in-tray',
    phase: 'closeout',
    title: 'Seat the ribbons in the tray',
    why: 'Loose tube goes in first so the tray lid does not bear on it, ribbons on top. Factory ribbon comes off the reel blue-up all the way and will not lie down without a half turn — the flip that lets it sit flat instead of fighting the tray.',
    tool: 'hands',
    seconds: 300,
    after: ['cool-sleeve'],
    mistakes: [
      { id: 'no-flip', label: 'Factory ribbon seated without the flip', consequence: 'It will not lie flat. Bends and twists in a tray that should have been clean.', rework: false },
      { id: 'tube-on-top', label: 'Loose tube laid over the ribbons', consequence: 'The tray lid presses on the tube. Loss that appears when the case is closed and vanishes when it is opened.', addedLossDb: 0.18, affects: 'all', rework: false },
    ],
  },
  {
    id: 'dress-slack',
    phase: 'closeout',
    title: 'Dress the slack',
    why: 'Stored in even coils so a future technician can lift a splice out and work on it, and so there is length in hand if a splice has to be re-burned.',
    tool: 'hands',
    seconds: 300,
    after: ['seat-in-tray'],
    mistakes: [
      { id: 'no-slack', label: 'No usable slack stored', consequence: 'The next re-entry has no fibre to work with and has to re-splice to gain length.', rework: false },
      { id: 'tight-bend', label: 'Bend inside the minimum radius', consequence: 'Macrobend loss that shows at 1550 nm before it shows at 1310 nm — the classic signature.', addedLossDb: 0.30, affects: 'all', rework: false },
    ],
  },
  {
    id: 'label',
    phase: 'closeout',
    title: 'Label the tray and record the assignments',
    why: 'An unlabelled tray is a closure someone has to reverse-engineer with a VFL at two in the morning.',
    tool: 'labels + as-built',
    seconds: 240,
    after: ['seat-in-tray'],
    mistakes: [
      { id: 'no-label', label: 'Tray left unlabelled', consequence: 'No consequence today. Hours lost on the next fault at this location.', rework: false },
    ],
  },
  {
    id: 'close-closure',
    phase: 'closeout',
    title: 'Close and seal',
    why: 'The gasket is what keeps water out of a handhole that will flood. A closure that fails here fails completely, later, in the rain.',
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
export const PHASES: readonly Phase[] = ['setup', 'per-ribbon', 'closeout'];

export function step(id: StepId): Step {
  const s = PROCEDURE.find((x) => x.id === id);
  if (!s) throw new Error(`unknown ribbon step: ${id}`);
  return s;
}

export function stepsInPhase(phase: Phase): Step[] {
  return PROCEDURE.filter((s) => s.phase === phase);
}

export interface OrderIssue {
  step: StepId;
  missing: StepId;
  reason: string;
}

/**
 * Order is judged on dependencies, not on position in the list. Doing a
 * correct-but-different order — labelling before dressing, say — is not a mistake and must
 * not be reported as one. Only a genuine dependency violation is.
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
 * A clean job on a calibrated machine reads in hundredths, and still varies fibre to fibre
 * — that scatter is real and is why one good reading proves nothing about the set.
 */
export function spliceLoss(seed: number, fibreCount: number, mistakes: readonly string[]): SpliceOutcome {
  const rng = createRng(deriveSeed(seed, 'ribbon-splice', String(fibreCount), mistakes.join('+')));
  const chosen = new Set(mistakes);

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

/**
 * A whole case: the setup happens once, the loop repeats per ribbon, closeout once per
 * tray. A 432-to-432 butt splice is 36 ribbons at 12 fibres, 12 ribbons to a tray.
 */
export function caseSeconds(ribbons: number, ribbonsPerTray: number, mistakes: readonly string[] = []): number {
  const trays = Math.ceil(ribbons / ribbonsPerTray);
  const phase = (p: Phase) => elapsedSeconds(stepsInPhase(p).map((s) => s.id), mistakes);
  return phase('setup') + ribbons * phase('per-ribbon') + trays * phase('closeout');
}

/** Every mistake the procedure can produce, for the debrief to explain against. */
export function allMistakes(): Array<Mistake & { step: StepId }> {
  return PROCEDURE.flatMap((s) => s.mistakes.map((m) => ({ ...m, step: s.id })));
}

/**
 * What counts as a good splice.
 *
 * THE PROVENANCE MATTERS MORE THAN THE NUMBER. A training simulator that invents a
 * threshold teaches a trainee to argue with their foreman using a figure nobody can source.
 * So every profile here says where it came from and how much to trust it, and the crew's
 * own specification — when they get hold of it — becomes another profile rather than a
 * patch to these.
 *
 * The two published anchors:
 *
 *  - TIA-568 is the structured-cabling standard, and it is deliberately permissive:
 *    0.3 dB per splice, 0.75 dB per mated connector pair. It is a ceiling for acceptance
 *    of a premises link, not a target for a splicer on backbone.
 *  - Outside-plant carrier practice is far tighter. Fusion splices on single-mode are
 *    routinely specified around 0.10 dB mean with an individual cap in the 0.2-0.3 dB
 *    range, because a backbone route accumulates dozens of them inside one link budget.
 *
 * `OSP_TYPICAL` is the default because this crew works backbone. It is a representative
 * industry figure, NOT this employer's specification, and it says so.
 */

export type Confidence =
  /** Written in a published standard that can be cited. */
  | 'published-standard'
  /** Widely used across the industry, but varies between operators. */
  | 'industry-typical'
  /** Supplied by this crew's own employer. */
  | 'employer-specified';

export interface AcceptanceProfile {
  id: string;
  name: string;
  /** Where the numbers come from, in a form a trainee could go and check. */
  source: string;
  confidence: Confidence;
  /** Mean fusion splice loss across a ribbon set, dB. */
  spliceMeanDb: number;
  /** Any single fusion splice above this fails, dB. */
  spliceMaxDb: number;
  /** Mechanical splices are held to a looser figure than fusion, dB. */
  mechanicalMaxDb: number;
  /** One mated connector pair, dB. */
  connectorMaxDb: number;
  /** Whether loss must be proven from both directions before it is believed. */
  requireBidirectional: boolean;
  note: string;
}

export const TIA_568: AcceptanceProfile = {
  id: 'tia-568',
  name: 'TIA-568 structured cabling',
  source: 'TIA-568 series, premises cabling acceptance',
  confidence: 'published-standard',
  spliceMeanDb: 0.3,
  spliceMaxDb: 0.3,
  mechanicalMaxDb: 0.3,
  connectorMaxDb: 0.75,
  requireBidirectional: false,
  note: 'A ceiling for accepting a premises link. Passing this on backbone work is not the same as doing it well.',
};

export const OSP_TYPICAL: AcceptanceProfile = {
  id: 'osp-typical',
  name: 'Outside plant, typical carrier practice',
  source: 'Representative of common operator specifications for single-mode fusion splicing. Not this employer’s document.',
  confidence: 'industry-typical',
  spliceMeanDb: 0.10,
  spliceMaxDb: 0.20,
  mechanicalMaxDb: 0.30,
  connectorMaxDb: 0.50,
  requireBidirectional: true,
  note: 'Tighter than TIA-568 because a backbone route stacks dozens of splices inside one link budget.',
};

export const PROFILES: readonly AcceptanceProfile[] = [OSP_TYPICAL, TIA_568];
export const DEFAULT_PROFILE = OSP_TYPICAL;

export function profileById(id: string): AcceptanceProfile | undefined {
  return PROFILES.find((p) => p.id === id);
}

/**
 * The gainer.
 *
 * An OTDR does not measure splice loss. It measures backscatter, and it infers loss from
 * the step in the trace — so when the fibre after a splice scatters light back slightly
 * more efficiently than the fibre before it, the step goes the wrong way and the
 * instrument reports a *negative* loss. The splice did not amplify anything. Shot from the
 * far end, that same splice reads high by exactly as much as it read low.
 *
 * True loss is the mean of the two directions. This is the single most common way a
 * trainee is fooled by their own test set, and accepting a gainer at face value is how a
 * genuinely bad splice gets signed off.
 */
export function bidirectionalLoss(aToBDb: number, bToADb: number): number {
  return Math.round(((aToBDb + bToADb) / 2) * 1000) / 1000;
}

/** True when a single-direction reading cannot be trusted on its own. */
export function isGainer(lossDb: number): boolean {
  return lossDb < 0;
}

export type Verdict = 'pass' | 'marginal' | 'fail' | 'unproven';

export interface SpliceJudgement {
  verdict: Verdict;
  /** Plain-language reason, written for the trainee rather than the log. */
  reason: string;
}

/**
 * Judge one splice against a profile.
 *
 * `secondDirectionDb` is optional on purpose: omitting it on a profile that demands
 * bidirectional proof returns `unproven` rather than a pass, because "I only measured one
 * way" is a different situation from "it failed" and the trainee should feel the
 * difference.
 */
export function judgeSplice(
  lossDb: number,
  profile: AcceptanceProfile = DEFAULT_PROFILE,
  secondDirectionDb?: number,
): SpliceJudgement {
  if (profile.requireBidirectional && secondDirectionDb === undefined) {
    if (isGainer(lossDb)) {
      return {
        verdict: 'unproven',
        reason: 'This reads as a gain, which no splice can produce. It is a backscatter mismatch — shoot it from the other end and average the two.',
      };
    }
    return {
      verdict: 'unproven',
      reason: 'Measured from one direction only. This profile requires both directions averaged before a splice is signed off.',
    };
  }

  const loss = secondDirectionDb === undefined ? lossDb : bidirectionalLoss(lossDb, secondDirectionDb);

  if (loss > profile.spliceMaxDb) {
    return { verdict: 'fail', reason: `${loss.toFixed(3)} dB is over the ${profile.spliceMaxDb.toFixed(2)} dB limit for a single splice. Cut it out and redo it.` };
  }
  if (loss > profile.spliceMeanDb) {
    return { verdict: 'marginal', reason: `${loss.toFixed(3)} dB passes the individual limit but is above the ${profile.spliceMeanDb.toFixed(2)} dB target. Acceptable alone; not acceptable as a habit.` };
  }
  return { verdict: 'pass', reason: `${loss.toFixed(3)} dB is within the ${profile.spliceMeanDb.toFixed(2)} dB target.` };
}

export interface SetJudgement {
  verdict: Verdict;
  meanDb: number;
  worstDb: number;
  failedIndexes: number[];
  reason: string;
}

/** Judge a whole ribbon: the mean carries the set, and any one fibre can still sink it. */
export function judgeSet(lossDb: readonly number[], profile: AcceptanceProfile = DEFAULT_PROFILE): SetJudgement {
  if (lossDb.length === 0) {
    return { verdict: 'unproven', meanDb: 0, worstDb: 0, failedIndexes: [], reason: 'No readings.' };
  }
  const mean = Math.round((lossDb.reduce((a, b) => a + b, 0) / lossDb.length) * 1000) / 1000;
  const worst = Math.round(Math.max(...lossDb) * 1000) / 1000;
  const failed = lossDb.map((v, i) => (v > profile.spliceMaxDb ? i : -1)).filter((i) => i >= 0);

  if (failed.length > 0) {
    return {
      verdict: 'fail', meanDb: mean, worstDb: worst, failedIndexes: failed,
      reason: `Fibre${failed.length > 1 ? 's' : ''} ${failed.map((i) => i + 1).join(', ')} over ${profile.spliceMaxDb.toFixed(2)} dB.`,
    };
  }
  if (mean > profile.spliceMeanDb) {
    return {
      verdict: 'marginal', meanDb: mean, worstDb: worst, failedIndexes: [],
      reason: `No single fibre failed, but the set averages ${mean.toFixed(3)} dB against a ${profile.spliceMeanDb.toFixed(2)} dB target — that pattern points at the prep, not at one fibre.`,
    };
  }
  return { verdict: 'pass', meanDb: mean, worstDb: worst, failedIndexes: [], reason: `Set averages ${mean.toFixed(3)} dB.` };
}

/**
 * Macrobend has a signature too: a tight bend costs far more at 1550 nm than at 1310 nm,
 * because the longer wavelength is less tightly confined in the core and leaks first. A
 * loss that grows with wavelength is a bend. A loss that is flat across both is dirt, a bad
 * cleave, or a genuinely poor fusion — and that one comparison saves opening the closure.
 */
export function bendSignature(loss1310Db: number, loss1550Db: number): 'macrobend' | 'wavelength-flat' {
  return loss1550Db > loss1310Db + 0.15 ? 'macrobend' : 'wavelength-flat';
}

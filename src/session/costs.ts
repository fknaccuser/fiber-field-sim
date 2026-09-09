/** Simulated-clock-time costs, in seconds, per action type. Instrument shots price themselves (their own `simulatedSeconds*` field); everything else is a fixed constant here. */
export const POWER_METER_SECONDS = 60;
export const VFL_SECONDS = 120;
export const SCOPE_SECONDS = 90;
export const RECORDS_SECONDS = 60;
/**
 * One call to NOC, not one per subscriber. NOC reads you the whole alarm picture in a
 * single conversation, which is both how it goes and why calling twice buys nothing.
 */
export const NOC_CONTACT_SECONDS = 150;
export const HINT_SECONDS = 0;
export const EXCAVATE_SECONDS = 1800;
export const DIAGNOSIS_SECONDS = 0;
export const REFUSED_SECONDS = 0;

export interface HintPolicyEntry {
  /** Number.POSITIVE_INFINITY for "no limit" (tier 1). */
  max: number;
  cost: number;
}

/** Hints decay by difficulty tier: cheaper and more available at low tiers, unavailable at 5-6. */
export const HINT_POLICY: Record<1 | 2 | 3 | 4 | 5 | 6, HintPolicyEntry> = {
  1: { max: Infinity, cost: 0 },
  2: { max: 3, cost: 5 },
  3: { max: 2, cost: 10 },
  4: { max: 1, cost: 15 },
  5: { max: 0, cost: 0 },
  6: { max: 0, cost: 0 },
};

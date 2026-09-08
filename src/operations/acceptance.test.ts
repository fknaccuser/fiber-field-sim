import { describe, expect, it } from 'vitest';
import {
  bendSignature,
  bidirectionalLoss,
  DEFAULT_PROFILE,
  isGainer,
  judgeSet,
  judgeSplice,
  OSP_TYPICAL,
  profileById,
  PROFILES,
  TIA_568,
} from './acceptance';

describe('the profiles say where they came from', () => {
  it('never ships a threshold without provenance', () => {
    for (const p of PROFILES) {
      expect(p.source.length).toBeGreaterThan(20);
      expect(['published-standard', 'industry-typical', 'employer-specified']).toContain(p.confidence);
    }
  });

  it('is honest that the default is industry practice, not this employer’s document', () => {
    expect(DEFAULT_PROFILE.id).toBe('osp-typical');
    expect(DEFAULT_PROFILE.confidence).toBe('industry-typical');
    expect(DEFAULT_PROFILE.source).toMatch(/not this employer/i);
  });

  it('holds outside plant to a tighter standard than premises cabling', () => {
    expect(OSP_TYPICAL.spliceMaxDb).toBeLessThan(TIA_568.spliceMaxDb);
    expect(OSP_TYPICAL.connectorMaxDb).toBeLessThan(TIA_568.connectorMaxDb);
  });

  it('looks profiles up by id', () => {
    expect(profileById('tia-568')).toBe(TIA_568);
    expect(profileById('nonexistent')).toBeUndefined();
  });
});

describe('the gainer', () => {
  it('averages the two directions, which is what makes it disappear', () => {
    // Reads as a gain one way, high the other. The truth is in the middle.
    expect(bidirectionalLoss(-0.04, 0.24)).toBe(0.1);
    expect(bidirectionalLoss(0.08, 0.12)).toBe(0.1);
  });

  it('recognises a physically impossible reading', () => {
    expect(isGainer(-0.04)).toBe(true);
    expect(isGainer(0.04)).toBe(false);
  });

  it('refuses to sign off a one-way measurement, and says why', () => {
    const j = judgeSplice(0.06, OSP_TYPICAL);
    expect(j.verdict).toBe('unproven');
    expect(j.reason).toMatch(/both directions/i);
  });

  it('explains a gain rather than just rejecting it', () => {
    const j = judgeSplice(-0.05, OSP_TYPICAL);
    expect(j.verdict).toBe('unproven');
    expect(j.reason).toMatch(/backscatter/i);
  });

  it('passes the same splice once both directions are in', () => {
    expect(judgeSplice(-0.04, OSP_TYPICAL, 0.16).verdict).toBe('pass');
  });

  it('a profile that does not demand both directions accepts one', () => {
    expect(judgeSplice(0.2, TIA_568).verdict).toBe('pass');
  });
});

describe('judging a single splice', () => {
  it('separates pass, marginal and fail rather than collapsing to a boolean', () => {
    expect(judgeSplice(0.05, OSP_TYPICAL, 0.05).verdict).toBe('pass');
    expect(judgeSplice(0.15, OSP_TYPICAL, 0.15).verdict).toBe('marginal');
    expect(judgeSplice(0.35, OSP_TYPICAL, 0.35).verdict).toBe('fail');
  });

  it('tells the trainee what to do about a failure', () => {
    expect(judgeSplice(0.4, OSP_TYPICAL, 0.4).reason).toMatch(/cut it out/i);
  });

  it('names marginal work as a habit problem, not a defect', () => {
    expect(judgeSplice(0.15, OSP_TYPICAL, 0.15).reason).toMatch(/habit/i);
  });
});

describe('judging a ribbon set', () => {
  it('passes a clean set', () => {
    const j = judgeSet([0.04, 0.05, 0.03, 0.06], OSP_TYPICAL);
    expect(j.verdict).toBe('pass');
    expect(j.meanDb).toBeCloseTo(0.045, 3);
  });

  it('fails on one bad fibre even when the average is fine, and names it', () => {
    const j = judgeSet([0.03, 0.03, 0.44, 0.03], OSP_TYPICAL);
    expect(j.verdict).toBe('fail');
    expect(j.failedIndexes).toEqual([2]);
    expect(j.reason).toMatch(/Fibre 3/);
  });

  it('calls a set marginal when nothing failed but the average is high — the prep signature', () => {
    const j = judgeSet([0.14, 0.15, 0.16, 0.15], OSP_TYPICAL);
    expect(j.verdict).toBe('marginal');
    expect(j.reason).toMatch(/points at the prep/i);
  });

  it('reports nothing rather than passing an empty set', () => {
    expect(judgeSet([], OSP_TYPICAL).verdict).toBe('unproven');
  });
});

describe('telling a bend from everything else', () => {
  it('calls it a macrobend when the longer wavelength costs more', () => {
    expect(bendSignature(0.05, 0.42)).toBe('macrobend');
  });

  it('calls it flat when both wavelengths agree — dirt or a bad cleave, not a bend', () => {
    expect(bendSignature(0.30, 0.33)).toBe('wavelength-flat');
  });
});

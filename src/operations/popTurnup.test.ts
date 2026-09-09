import { describe, expect, it } from 'vitest';
import { createRng, deriveSeed } from '../world';
import {
  DERATE,
  generateTurnupJob,
  headroomA,
  judgeTurnup,
  type PopBuild,
  type TurnupPlan,
} from './popTurnup';

function build(over: Partial<PopBuild> = {}): PopBuild {
  return {
    id: 'pop-1',
    siteLabel: 'POP 2 — Crown Valley',
    equipmentLabel: 'OLT chassis, 8 line cards',
    supplies: 2,
    supplyDrawA: 10,
    feeds: [
      { id: 'a1', label: 'Panel A, breaker 11', ratingA: 30, existingLoadA: 10, source: 'utility feed A' },
      { id: 'b1', label: 'Panel B, breaker 4', ratingA: 30, existingLoadA: 4, source: 'utility feed B' },
      { id: 'a2', label: 'Panel A2, breaker 7', ratingA: 30, existingLoadA: 4, source: 'utility feed A' },
      { id: 'c1', label: 'Panel C, breaker 2', ratingA: 20, existingLoadA: 14, source: 'utility feed B' },
    ],
    paths: [
      { id: 'e', label: 'East vault', duct: 'east duct' },
      { id: 'w', label: 'West vault', duct: 'west duct' },
      { id: 'e2', label: 'East vault, inner bore', duct: 'east duct' },
    ],
    ...over,
  };
}

const GOOD: TurnupPlan = {
  supplyFeeds: ['a1', 'b1'],
  bonding: 'to-ground-bar',
  rackBonded: true,
  uplinkPaths: ['e', 'w'],
  labelled: true,
};

describe('headroom', () => {
  it('derates continuous load against the breaker rating', () => {
    expect(headroomA({ id: 'x', label: 'x', ratingA: 30, existingLoadA: 4, source: 's' })).toBeCloseTo(30 * DERATE - 4);
  });

  it('counts what is already on the circuit, not just the label on the breaker', () => {
    const busy = { id: 'x', label: 'x', ratingA: 20, existingLoadA: 14, source: 's' };
    expect(headroomA(busy)).toBeLessThan(3);
  });
});

describe('a turn-up that was done properly', () => {
  it('passes clean on diverse power, diverse paths, bonded and labelled', () => {
    const verdict = judgeTurnup(build(), GOOD);
    expect(verdict.issues).toEqual([]);
    expect(verdict.accepted).toBe(true);
  });

  it('accepts a chassis bonded through a rack that is itself bonded', () => {
    const verdict = judgeTurnup(build(), { ...GOOD, bonding: 'to-rack', rackBonded: true });
    expect(verdict.issues).toEqual([]);
  });
});

describe('redundancy that was paid for and not delivered', () => {
  it('catches both supplies on one breaker', () => {
    const verdict = judgeTurnup(build(), { ...GOOD, supplyFeeds: ['a1', 'a1'] });
    const issue = verdict.issues.find((i) => i.code === 'no-power-diversity');
    expect(issue?.severity).toBe('not-redundant');
    expect(issue?.detail).toContain('spare power supply');
    expect(verdict.accepted).toBe(false);
  });

  it('catches two breakers in different panels off the same source, which is the real trap', () => {
    // This is the one that reads as diverse on a drawing.
    const verdict = judgeTurnup(build(), { ...GOOD, supplyFeeds: ['a1', 'a2'] });
    const issue = verdict.issues.find((i) => i.code === 'no-power-diversity');
    expect(issue?.severity).toBe('not-redundant');
    expect(issue?.detail).toContain('same source');
  });

  it('catches two uplinks sharing a duct through two different vaults', () => {
    const verdict = judgeTurnup(build(), { ...GOOD, uplinkPaths: ['e', 'e2'] });
    const issue = verdict.issues.find((i) => i.code === 'no-path-diversity');
    expect(issue?.severity).toBe('not-redundant');
    expect(verdict.accepted).toBe(false);
  });

  it('catches a single uplink', () => {
    const verdict = judgeTurnup(build(), { ...GOOD, uplinkPaths: ['e'] });
    expect(verdict.issues.find((i) => i.code === 'single-uplink')?.severity).toBe('not-redundant');
  });

  it('catches an unbonded chassis, and says why it is invisible', () => {
    const verdict = judgeTurnup(build(), { ...GOOD, bonding: 'none' });
    const issue = verdict.issues.find((i) => i.code === 'unbonded-chassis');
    expect(issue?.severity).toBe('not-redundant');
    expect(issue?.detail).toContain('storm');
  });
});

describe('what stops the job', () => {
  it('flags a circuit that will not carry the load', () => {
    const verdict = judgeTurnup(build(), { ...GOOD, supplyFeeds: ['c1', 'b1'] });
    expect(verdict.issues.find((i) => i.code === 'circuit-overloaded')?.severity).toBe('blocking');
    expect(verdict.accepted).toBe(false);
  });

  it('adds both supplies onto one circuit before checking its headroom', () => {
    // a1 derates to 24 A and already carries 10, so 14 A is left. One supply fits; two do
    // not. The check has to sum the supplies landing on a circuit rather than looking at them
    // one at a time, which is how a doubled-up chassis passes a per-supply check.
    const verdict = judgeTurnup(build(), { ...GOOD, supplyFeeds: ['a1', 'a1'] });
    expect(verdict.issues.map((i) => i.code)).toContain('circuit-overloaded');
  });

  it('flags a bond to a rack that is not itself bonded', () => {
    const verdict = judgeTurnup(build(), { ...GOOD, bonding: 'to-rack', rackBonded: false });
    const issue = verdict.issues.find((i) => i.code === 'bonded-to-nothing');
    expect(issue?.severity).toBe('blocking');
    expect(issue?.detail).toContain('large metal object');
  });

  it('flags a supply nobody assigned a circuit to', () => {
    const verdict = judgeTurnup(build(), { ...GOOD, supplyFeeds: ['a1'] });
    expect(verdict.issues.find((i) => i.code === 'supply-unfed')?.severity).toBe('blocking');
  });

  it('names a circuit or a route that is not in the room', () => {
    const verdict = judgeTurnup(build(), { ...GOOD, supplyFeeds: ['a1', 'zz'], uplinkPaths: ['e', 'qq'] });
    expect(verdict.issues.map((i) => i.code)).toContain('no-such-feed');
    expect(verdict.issues.map((i) => i.code)).toContain('no-such-path');
  });
});

describe('labelling', () => {
  it('is workmanship, and does not stop a sound turn-up being accepted', () => {
    const verdict = judgeTurnup(build(), { ...GOOD, labelled: false });
    expect(verdict.issues.find((i) => i.code === 'unlabelled')?.severity).toBe('workmanship');
    expect(verdict.accepted).toBe(true);
  });
});

describe('generated turn-ups', () => {
  const job = (seed: number) => generateTurnupJob(seed, createRng(deriveSeed(seed, 'turnup')));

  it('are deterministic from the seed', () => {
    expect(job(3)).toEqual(job(3));
  });

  it('always admit a clean plan', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const { build: b } = job(seed);
      const verdict = judgeTurnup(b, {
        supplyFeeds: ['a1', 'b1'],
        bonding: 'to-ground-bar',
        rackBonded: true,
        uplinkPaths: ['e', 'w'],
        labelled: true,
      });
      expect(verdict.issues).toEqual([]);
    }
  });

  it('always contain the trap, or the mistake cannot be made and cannot be taught', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const { build: b } = job(seed);
      // A second circuit that looks like a second source and is not.
      const bySource = new Map<string, number>();
      for (const f of b.feeds) bySource.set(f.source, (bySource.get(f.source) ?? 0) + 1);
      expect([...bySource.values()].some((n) => n > 1)).toBe(true);
      // Two ways out that are one way out.
      const byDuct = new Map<string, number>();
      for (const p of b.paths) byDuct.set(p.duct, (byDuct.get(p.duct) ?? 0) + 1);
      expect([...byDuct.values()].some((n) => n > 1)).toBe(true);
    }
  });

  it('leave enough headroom on the two good circuits for one supply each', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const { build: b } = job(seed);
      for (const id of ['a1', 'b1']) {
        expect(headroomA(b.feeds.find((f) => f.id === id)!)).toBeGreaterThanOrEqual(b.supplyDrawA);
      }
    }
  });
});

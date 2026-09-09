import { describe, expect, it } from 'vitest';
import { ROLE_ORDER } from '../session/roles';
import { requestLocate } from './digalert';
import {
  buildConstructionDay,
  committedMinutes,
  JOB_TEMPLATES,
  readiness,
  STANDARD_RIG,
  templateFor,
  type WorkOrder,
} from './dispatch';
import { applyReadiness, readinessFor } from '../session/readiness';

const MON = new Date(2026, 8, 7); // Monday 2026-09-07
const FULL_KIT = [
  'mass-fusion-splicer', 'mass-cleaver', 'heat-jacket-stripper', 'ribbonizing-jig',
  'cleaning-kit', 'otdr', 'power-meter', 'vfl', 'laptop', 'labels', 'hand-tools',
  'console-cable', 'launch-cable-500m',
];

function order(over: Partial<WorkOrder> = {}): WorkOrder {
  const t = templateFor('ribbon-splice');
  return {
    ticket: 'WO-00001', kind: t.kind, title: t.title, brief: t.brief,
    location: 'Test St', minutes: t.minutes, kit: t.kit.slice(),
    minRole: t.minRole, breaksGround: t.breaksGround, domains: t.domains.slice(),
    locate: null, ...over,
  };
}

describe('the job catalogue', () => {
  it('covers the work this crew actually does', () => {
    const kinds = JOB_TEMPLATES.map((t) => t.kind);
    for (const k of ['ribbon-splice', 'outage', 'fdh-build', 'idf-build', 'closure-dress', 'acceptance-test', 'locate-request']) {
      expect(kinds).toContain(k);
    }
  });

  it('gives every job a brief, real kit, and a grade that can hold it', () => {
    for (const t of JOB_TEMPLATES) {
      expect(t.brief.length).toBeGreaterThan(30);
      expect(t.minutes).toBeGreaterThan(0);
      expect(ROLE_ORDER).toContain(t.minRole);
      expect(t.domains.length).toBeGreaterThan(0);
    }
  });

  it('only marks the jobs that genuinely break ground', () => {
    expect(templateFor('fdh-build').breaksGround).toBe(true);
    expect(templateFor('ribbon-splice').breaksGround).toBe(false);
    expect(templateFor('acceptance-test').breaksGround).toBe(false);
  });

  it('throws on an unknown kind instead of inventing a job', () => {
    expect(() => templateFor('not-a-job' as never)).toThrow(/unknown job kind/);
  });
});

describe('can this start today', () => {
  it('clears a fully equipped technician of the right grade', () => {
    expect(readiness(order(), 'l2', FULL_KIT, MON).ready).toBe(true);
  });

  it('names the missing kit rather than just refusing', () => {
    const r = readiness(order(), 'l2', ['otdr'], MON);
    expect(r.ready).toBe(false);
    expect(r.blocked).toContain('kit');
    expect(r.reasons.join(' ')).toMatch(/mass-fusion-splicer/);
  });

  it('holds a job above the technician’s grade, and offers the way forward', () => {
    const r = readiness(order({ minRole: 'senior' }), 'l2', FULL_KIT, MON);
    expect(r.blocked).toContain('grade');
    expect(r.reasons.join(' ')).toMatch(/escalate/i);
  });

  it('reports EVERY blocker at once, not one at a time', () => {
    // Wrong grade, no kit, and no locate — all three should come back together, because
    // finding the second one after driving out is the wasted roll.
    const r = readiness(order({ kind: 'fdh-build', minRole: 'senior', breaksGround: true }), 'l1', [], MON);
    expect(r.blocked.sort()).toEqual(['grade', 'kit', 'locate']);
    expect(r.reasons).toHaveLength(3);
  });
});

describe('breaking ground is gated on the locate, not on willingness', () => {
  it('refuses a dig with no ticket', () => {
    const r = readiness(order({ breaksGround: true }), 'senior', FULL_KIT, MON);
    expect(r.blocked).toContain('locate');
    expect(r.reasons.join(' ')).toMatch(/4216/);
  });

  it('still refuses when the ticket was raised this morning', () => {
    const r = readiness(order({ breaksGround: true, locate: requestLocate('T-1', MON) }), 'senior', FULL_KIT, MON);
    expect(r.blocked).toContain('locate');
  });

  it('clears once the notice period has run', () => {
    const WED = new Date(2026, 8, 9);
    const r = readiness(order({ breaksGround: true, locate: requestLocate('T-2', MON) }), 'senior', FULL_KIT, WED);
    expect(r.ready).toBe(true);
  });

  it('does not gate a job that never breaks ground', () => {
    expect(readiness(order({ breaksGround: false, locate: null }), 'l2', FULL_KIT, MON).ready).toBe(true);
  });
});

describe('the construction board', () => {
  it('is deterministic for a day seed', () => {
    const a = JSON.stringify(buildConstructionDay(42, MON));
    expect(a).toBe(JSON.stringify(buildConstructionDay(42, MON)));
  });

  it('builds the number of orders asked for, each fully formed', () => {
    const orders = buildConstructionDay(7, MON, 4);
    expect(orders).toHaveLength(4);
    for (const o of orders) {
      expect(o.ticket).toMatch(/^WO-\d+$/);
      expect(o.location.length).toBeGreaterThan(3);
      expect(o.minutes).toBeGreaterThan(0);
    }
  });

  it('leans on the work the crew named biggest', () => {
    // This used to assert splicing and outages alone were most of the board. The crew named
    // the big ones: ribbon splicing, DigAlerts, and building AND REPAIRING terminals off the
    // backbone -- with outages as the bad days on top. The weighting follows what they said,
    // and so does the assertion, rather than the assertion following the old weighting.
    const kinds: string[] = [];
    for (let seed = 1; seed <= 120; seed++) {
      for (const o of buildConstructionDay(seed, MON, 3)) kinds.push(o.kind);
    }
    const big = ['ribbon-splice', 'locate-mark', 'terminal-build', 'terminal-repair', 'outage'];
    const named = kinds.filter((k) => big.includes(k)).length;
    expect(named / kinds.length).toBeGreaterThan(0.5);
  });

  it('sometimes issues a dig with the locate already served, and sometimes without', () => {
    let served = 0, missing = 0;
    for (let seed = 1; seed <= 200; seed++) {
      for (const o of buildConstructionDay(seed, MON, 3)) {
        if (!o.breaksGround) continue;
        if (o.locate) served++; else missing++;
      }
    }
    expect(served).toBeGreaterThan(0);
    expect(missing).toBeGreaterThan(0);
  });

  it('adds up the planned day', () => {
    const orders = buildConstructionDay(3, MON, 3);
    expect(committedMinutes(orders)).toBe(orders.reduce((s, o) => s + o.minutes, 0));
    expect(committedMinutes([])).toBe(0);
  });
});

describe('what a week actually looks like', () => {
  it('puts DigAlert tickets on the board about as often as splices', () => {
    // The crew answers more of these than anything except splicing. A board that can go a
    // fortnight without showing one is teaching the wrong shape of week, so this asserts the
    // weighting rather than trusting it.
    const counts = new Map<string, number>();
    for (let seed = 1; seed <= 300; seed++) {
      for (const order of buildConstructionDay(seed, new Date(2026, 4, 14), 4)) {
        counts.set(order.kind, (counts.get(order.kind) ?? 0) + 1);
      }
    }
    const locates = counts.get('locate-mark') ?? 0;
    const splices = counts.get('ribbon-splice') ?? 0;
    expect(locates).toBeGreaterThan(0);
    expect(locates).toBeGreaterThan(splices * 0.6);
  });

  it('draws each order independently rather than repeating one kind down the board', () => {
    // The bar is "as varied as independent draws", not "never repeats". An earlier version
    // of this asserted that no day in 400 seeds comes up all-one-kind, which happened to be
    // true of the pool at the time and is not a property of anything -- with the current
    // weights roughly one day in 400 legitimately does. What must never happen is a
    // generator that stopped advancing its rng, which would make it every day.
    let allSame = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const kinds = new Set(buildConstructionDay(seed, new Date(2026, 4, 14), 4).map((o) => o.kind));
      if (kinds.size === 1) allSame++;
    }
    expect(allSame).toBeLessThan(8);
  });
});

describe('the kit gate, after the console cable went on the truck', () => {
  it('leaves no job permanently unworkable from a properly stocked truck', () => {
    // The console cable was deliberately absent so the gate had something to fire on. Once
    // POP turn-up had a bench, that stopped being a lesson and became a locked door: a card
    // on the board that could never be taken, ever, by anybody. Every job must be workable
    // from a full rig, or the board is advertising work that does not exist.
    for (const t of JOB_TEMPLATES) {
      const missing = t.kit.filter((k) => !STANDARD_RIG.includes(k));
      expect(missing).toEqual([]);
    }
  });

  it('still fires, because a full truck is not what leaves the yard every morning', () => {
    // The gate is alive on the mornings the readiness model is short of something -- the same
    // model, the same seeds, as a field session. A blocker that can never happen is a lie to
    // the trainee; so is a blocker that always happens.
    let blockedSomewhere = 0;
    let readySomewhere = 0;
    for (let daySeed = 1; daySeed <= 200; daySeed++) {
      const rig = applyReadiness(STANDARD_RIG, readinessFor(daySeed, 'l1', []));
      for (const order of buildConstructionDay(daySeed, new Date(2026, 4, 14), 4)) {
        if (readiness(order, 'senior', rig, new Date(2026, 4, 14)).blocked.includes('kit')) blockedSomewhere++;
        else readySomewhere++;
      }
    }
    expect(blockedSomewhere).toBeGreaterThan(0);
    expect(readySomewhere).toBeGreaterThan(blockedSomewhere);
  });
});

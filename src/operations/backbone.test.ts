import { describe, expect, it } from 'vitest';
import { createRng, deriveSeed } from '../world';
import {
  COLOR_ORDER,
  generateCutInJob,
  isLive,
  judgeCutIn,
  liveFibres,
  tubeOf,
  type BackboneCable,
  type CutInPlan,
  type TerminalSpec,
} from './backbone';

const TERMINAL: TerminalSpec = { id: 'nap-1', label: 'New NAP B-4', ports: 6 };

/** A cable with one clean tube and one carrying service, which is the ordinary case. */
function cable(): BackboneCable {
  return {
    id: 'bb-1',
    label: '48f backbone — Via Ladera',
    tubes: [
      { color: 'blue', fibres: COLOR_ORDER.slice(0, 12).map((color) => ({ color, status: 'spare' })) },
      {
        color: 'orange',
        fibres: COLOR_ORDER.slice(0, 12).map((color, i) => ({
          color,
          status: i < 4 ? 'live' : i < 6 ? 'reserved' : 'spare',
          note: i < 4 ? 'feeds Camino del Avion' : i < 6 ? 'held for a planned build' : undefined,
        })),
      },
    ],
  };
}

/** A cable nobody is using: every fibre dark and unassigned. */
function deadCable(): BackboneCable {
  return {
    id: 'bb-2',
    label: '24f backbone — abandoned',
    tubes: [{ color: 'blue', fibres: COLOR_ORDER.slice(0, 12).map((color) => ({ color, status: 'spare' })) }],
  };
}

const CLEAN: CutInPlan = {
  method: 'mid-span-window',
  tubeColor: 'blue',
  fibreColors: COLOR_ORDER.slice(0, 6),
  recorded: true,
};

describe('reading the cable', () => {
  it('finds a tube by colour and says when there is not one', () => {
    expect(tubeOf(cable(), 'orange')?.fibres).toHaveLength(12);
    expect(tubeOf(cable(), 'violet')).toBeUndefined();
  });

  it('counts what is carrying service', () => {
    expect(liveFibres(cable())).toHaveLength(4);
    expect(isLive(cable())).toBe(true);
    expect(isLive(deadCable())).toBe(false);
  });
});

describe('a plan that can be worked', () => {
  it('passes clean when nothing in service is touched and the assignment reads itself', () => {
    const verdict = judgeCutIn(cable(), TERMINAL, CLEAN);
    expect(verdict.issues).toEqual([]);
    expect(verdict.accepted).toBe(true);
    expect(verdict.circuitsDown).toBe(0);
  });

  it('allows a full cut on a cable nobody is using', () => {
    const verdict = judgeCutIn(deadCable(), TERMINAL, { ...CLEAN, method: 'full-cut' });
    expect(verdict.issues).toEqual([]);
    expect(verdict.accepted).toBe(true);
  });
});

describe('the ways a cut-in takes people down', () => {
  it('counts every circuit in a live cable that gets cut through', () => {
    const verdict = judgeCutIn(cable(), TERMINAL, { ...CLEAN, method: 'full-cut' });
    const issue = verdict.issues.find((i) => i.code === 'cut-a-live-cable');
    expect(issue?.severity).toBe('service-affecting');
    expect(issue?.circuits).toBe(4);
    expect(verdict.circuitsDown).toBe(4);
    expect(verdict.accepted).toBe(false);
  });

  it('catches splicing a fibre that is carrying service', () => {
    const verdict = judgeCutIn(cable(), TERMINAL, { ...CLEAN, tubeColor: 'orange' });
    const issue = verdict.issues.find((i) => i.code === 'spliced-a-live-fibre');
    expect(issue?.severity).toBe('service-affecting');
    // Blue, orange, green and brown in the orange tube are live; slate and white are not.
    expect(issue?.circuits).toBe(4);
    expect(verdict.accepted).toBe(false);
  });

  it('adds up both, because a plan can be wrong twice', () => {
    const verdict = judgeCutIn(cable(), TERMINAL, { ...CLEAN, method: 'full-cut', tubeColor: 'orange' });
    expect(verdict.serviceAffecting).toBe(2);
    expect(verdict.circuitsDown).toBe(8);
  });
});

describe('the ways a cut-in is merely wrong', () => {
  it('flags fibres somebody is holding for a build that has not happened', () => {
    const verdict = judgeCutIn(cable(), { ...TERMINAL, ports: 2 }, { ...CLEAN, tubeColor: 'orange', fibreColors: ['slate', 'white'] });
    expect(verdict.issues.find((i) => i.code === 'took-reserved-fibre')?.severity).toBe('defect');
    expect(verdict.circuitsDown).toBe(0);
  });

  it('flags a short count as a second trip, not as a disaster', () => {
    const verdict = judgeCutIn(cable(), TERMINAL, { ...CLEAN, fibreColors: COLOR_ORDER.slice(0, 4) });
    expect(verdict.issues.find((i) => i.code === 'short-count')?.severity).toBe('defect');
  });

  it('flags spare fibres burned on ports that do not exist', () => {
    const verdict = judgeCutIn(cable(), TERMINAL, { ...CLEAN, fibreColors: COLOR_ORDER.slice(0, 9) });
    expect(verdict.issues.find((i) => i.code === 'over-count')?.severity).toBe('workmanship');
  });

  it('names a tube that is not in the cable rather than silently judging nothing', () => {
    const verdict = judgeCutIn(cable(), TERMINAL, { ...CLEAN, tubeColor: 'violet' });
    expect(verdict.issues.find((i) => i.code === 'no-such-tube')?.severity).toBe('defect');
  });

  it('treats a scattered set as workmanship, because it splices exactly as well', () => {
    const verdict = judgeCutIn(cable(), TERMINAL, { ...CLEAN, fibreColors: ['blue', 'green', 'slate', 'red', 'yellow', 'rose'] });
    const issue = verdict.issues.find((i) => i.code === 'scattered-assignment');
    expect(issue?.severity).toBe('workmanship');
    // And it does not also read as a service problem: nothing there was live.
    expect(verdict.serviceAffecting).toBe(0);
  });

  it('flags an assignment nobody wrote down', () => {
    const verdict = judgeCutIn(cable(), TERMINAL, { ...CLEAN, recorded: false });
    expect(verdict.issues.find((i) => i.code === 'unrecorded-assignment')?.severity).toBe('workmanship');
    // Workmanship alone still leaves the plan workable.
    expect(verdict.accepted).toBe(true);
  });
});

describe('generated jobs', () => {
  it('are deterministic from the seed', () => {
    const a = generateCutInJob(7, createRng(deriveSeed(7, 'cut-in')));
    const b = generateCutInJob(7, createRng(deriveSeed(7, 'cut-in')));
    expect(a).toEqual(b);
  });

  it('always admit a clean plan, so the answer is never "give up"', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const job = generateCutInJob(seed, createRng(deriveSeed(seed, 'cut-in')));
      const verdict = judgeCutIn(job.cable, job.terminal, {
        method: 'mid-span-window',
        tubeColor: job.suggestedTube,
        fibreColors: COLOR_ORDER.slice(0, job.terminal.ports),
        recorded: true,
      });
      expect(verdict.issues).toEqual([]);
      expect(verdict.accepted).toBe(true);
    }
  });

  it('put real work in the way: most cables are carrying service', () => {
    let live = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const job = generateCutInJob(seed, createRng(deriveSeed(seed, 'cut-in')));
      if (isLive(job.cable)) live++;
    }
    expect(live).toBeGreaterThan(90);
  });
});

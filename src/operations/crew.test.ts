import { describe, expect, it } from 'vitest';
import {
  applyOutcome,
  BURNOUT_HOURS,
  competence,
  crewNotes,
  difficultyOf,
  DOMAINS,
  fitFor,
  newWeek,
  performAssignment,
  rest,
  startingCrew,
  SUSTAINABLE_HOURS,
  type Assignment,
  type Domain,
  type Technician,
} from './crew';

function tech(over: Partial<Technician> = {}): Technician {
  const base: Record<Domain, number> = {
    splicing: 50, diagnosis: 50, testing: 50, construction: 50,
    configuration: 50, records: 50, planning: 50,
  };
  const { skills, ...rest } = over;
  return {
    id: 't1', name: 'Test', grade: 'l2',
    hoursThisWeek: 0, fatigue: 0, morale: 75,
    ...rest,
    skills: { ...base, ...(skills ?? {}) },
  };
}

const job = (difficulty: number, hours = 4, domains: Domain[] = ['splicing']): Assignment =>
  ({ techId: 't1', difficulty, domains, hours });

describe('reading the fit', () => {
  it('names the four costs a manager can choose between', () => {
    const t = tech({ skills: { splicing: 50 } as never });
    expect(fitFor(t, 20, ['splicing'])).toBe('under-used');
    expect(fitFor(t, 55, ['splicing'])).toBe('comfortable');
    expect(fitFor(t, 75, ['splicing'])).toBe('stretching');
    expect(fitFor(t, 95, ['splicing'])).toBe('over-their-head');
  });

  it('averages across every domain a job exercises', () => {
    const t = tech({ skills: { splicing: 80, records: 20 } as never });
    expect(competence(t, ['splicing', 'records'])).toBe(50);
  });

  it('does not fall over on a job with no domains', () => {
    expect(competence(tech(), [])).toBe(50);
  });

  it('derives difficulty from the grade that can hold the job alone', () => {
    expect(difficultyOf('l1')).toBeLessThan(difficultyOf('l3'));
    expect(difficultyOf('l3')).toBeLessThan(difficultyOf('senior'));
  });
});

describe('assignment changes the person, which is the whole point', () => {
  it('is deterministic for a seed', () => {
    const t = tech();
    expect(performAssignment(5, t, job(70))).toEqual(performAssignment(5, t, job(70)));
  });

  it('teaches most in the stretch band, just past what they can already do', () => {
    const t = tech();
    let easy = 0, stretch = 0;
    for (let s = 1; s <= 60; s++) {
      easy += performAssignment(s, t, job(52)).skillDelta.splicing ?? 0;
      stretch += performAssignment(s, t, job(72)).skillDelta.splicing ?? 0;
    }
    expect(stretch).toBeGreaterThan(easy);
  });

  it('teaches almost nothing on work they have already mastered', () => {
    const t = tech();
    const out = performAssignment(3, t, job(22));
    expect(out.fit).toBe('under-used');
    expect(out.skillDelta.splicing ?? 0).toBeLessThan(0.5);
  });

  it('COSTS skill when a job well over their head goes wrong', () => {
    const t = tech();
    const failures = Array.from({ length: 60 }, (_, i) => performAssignment(i + 1, t, job(95)))
      .filter((o) => !o.completed);
    expect(failures.length).toBeGreaterThan(0);
    for (const f of failures) expect(f.skillDelta.splicing ?? 0).toBeLessThan(0);
  });

  it('names an over-their-head failure as an assignment problem, not a performance one', () => {
    const t = tech();
    const f = Array.from({ length: 60 }, (_, i) => performAssignment(i + 1, t, job(95)))
      .find((o) => !o.completed);
    expect(f!.note).toMatch(/assignment problem/i);
  });

  it('moves every domain the job exercised', () => {
    const out = performAssignment(2, tech(), job(70, 4, ['splicing', 'testing']));
    expect(Object.keys(out.skillDelta).sort()).toEqual(['splicing', 'testing']);
  });

  it('slows learning as a domain approaches mastery', () => {
    const novice = tech({ skills: { splicing: 20 } as never });
    const expert = tech({ skills: { splicing: 92 } as never });
    // Each measured against a job that stretches THEM, so the band is the same.
    const a = performAssignment(9, novice, job(40)).skillDelta.splicing ?? 0;
    const b = performAssignment(9, expert, job(100)).skillDelta.splicing ?? 0;
    expect(a).toBeGreaterThan(b);
  });
});

describe('condition: tired and uninterested are different problems', () => {
  it('fatigue costs completion, not what was learned from getting through it', () => {
    const fresh = tech({ fatigue: 0 });
    const spent = tech({ fatigue: 85 });
    const done = (t: Technician) =>
      Array.from({ length: 60 }, (_, i) => performAssignment(i + 1, t, job(70))).filter((o) => o.completed).length;
    expect(done(spent)).toBeLessThan(done(fresh));

    // A stretching job that was completed still teaches, tired or not.
    const a = Array.from({ length: 60 }, (_, i) => performAssignment(i + 1, fresh, job(70))).find((o) => o.completed)!;
    const b = Array.from({ length: 60 }, (_, i) => performAssignment(i + 1, spent, job(70))).find((o) => o.completed)!;
    expect(b.skillDelta.splicing).toBeCloseTo(a.skillDelta.splicing!, 5);
  });

  it('being under-used costs morale, which overwork does not automatically', () => {
    expect(performAssignment(4, tech(), job(20)).moraleDelta).toBeLessThan(0);
  });

  it('a stretch that lands is the thing that lifts morale most', () => {
    const wins = Array.from({ length: 40 }, (_, i) => performAssignment(i + 1, tech(), job(70)))
      .filter((o) => o.completed);
    expect(wins.length).toBeGreaterThan(0);
    for (const w of wins) expect(w.moraleDelta).toBeGreaterThan(0);
  });

  it('charges overtime harder than ordinary hours', () => {
    const rested = performAssignment(6, tech({ hoursThisWeek: 0 }), job(55, 8));
    const late = performAssignment(6, tech({ hoursThisWeek: SUSTAINABLE_HOURS }), job(55, 8));
    expect(late.fatigueDelta).toBeGreaterThan(rested.fatigueDelta);
  });
});

describe('applying, resting, and the week rolling over', () => {
  it('never mutates the technician it was given', () => {
    const t = tech();
    const snapshot = JSON.stringify(t);
    applyOutcome(t, job(70), performAssignment(1, t, job(70)));
    expect(JSON.stringify(t)).toBe(snapshot);
  });

  it('keeps skill inside 0–100 however long the career runs', () => {
    let t = tech({ skills: { splicing: 99 } as never });
    for (let i = 0; i < 200; i++) {
      const a = job(99);
      t = applyOutcome(t, a, performAssignment(i + 1, t, a));
    }
    expect(t.skills.splicing).toBeLessThanOrEqual(100);
    expect(t.skills.splicing).toBeGreaterThanOrEqual(0);
    expect(t.fatigue).toBeLessThanOrEqual(100);
  });

  it('recovers on a rest day', () => {
    const t = tech({ fatigue: 60, morale: 50 });
    const r = rest(t, 12);
    expect(r.fatigue).toBeLessThan(t.fatigue);
    expect(r.morale).toBeGreaterThan(t.morale);
  });

  it('resets hours on Monday but does not wipe fatigue clean', () => {
    const t = tech({ hoursThisWeek: 58, fatigue: 70 });
    const w = newWeek(t);
    expect(w.hoursThisWeek).toBe(0);
    expect(w.fatigue).toBeGreaterThan(0);
    expect(w.fatigue).toBeLessThan(t.fatigue);
  });
});

describe('what the manager should be seeing', () => {
  it('flags someone being spent', () => {
    const notes = crewNotes([tech({ id: 'a', name: 'A', hoursThisWeek: BURNOUT_HOURS + 5 })]);
    expect(notes.some((n) => n.flag === 'burning-out')).toBe(true);
  });

  it('flags overtime before it becomes burnout', () => {
    const notes = crewNotes([tech({ id: 'a', name: 'A', hoursThisWeek: SUSTAINABLE_HOURS + 3 })]);
    expect(notes.some((n) => n.flag === 'stretched-thin')).toBe(true);
  });

  it('flags stagnation as loudly as overwork, because it does not announce itself', () => {
    const notes = crewNotes([tech({ id: 'a', name: 'A', morale: 30 })]);
    const note = notes.find((n) => n.flag === 'stagnating');
    expect(note).toBeDefined();
    expect(note!.detail).toMatch(/what they have been given/i);
  });

  it('flags someone who has outgrown their grade before they leave', () => {
    const notes = crewNotes([tech({ id: 'a', name: 'A', grade: 'l1', skills: { splicing: 85 } as never })]);
    const note = notes.find((n) => n.flag === 'ready-to-step-up');
    expect(note).toBeDefined();
    expect(note!.detail).toMatch(/before somebody else does/i);
  });

  it('says nothing about a crew that is fine', () => {
    expect(crewNotes([tech({ id: 'a', name: 'A', grade: 'senior', hoursThisWeek: 32, fatigue: 20, morale: 75 })])).toEqual([]);
  });
});

describe('the starting crew', () => {
  it('is four people with distinct shapes, not four clones', () => {
    const crew = startingCrew();
    expect(crew).toHaveLength(4);
    const splicing = crew.map((t) => t.skills.splicing);
    expect(new Set(splicing).size).toBe(4);
  });

  it('gives everyone a value in every domain, so no job has an undefined fit', () => {
    for (const t of startingCrew()) {
      for (const d of DOMAINS) expect(typeof t.skills[d]).toBe('number');
    }
  });

  it('opens quiet — a manager should have to create their own problems', () => {
    expect(crewNotes(startingCrew()).filter((n) => n.flag === 'burning-out')).toEqual([]);
  });
});

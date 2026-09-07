import { describe, expect, it } from 'vitest';
import { buildDay, committedMinutes, networkStability, SHIFT_MINUTES } from './day';

describe('buildDay', () => {
  it('is deterministic: the same day seed returns the same shift', () => {
    expect(JSON.stringify(buildDay(4821))).toBe(JSON.stringify(buildDay(4821)));
  });

  it('different day seeds produce different boards', () => {
    const a = buildDay(1).orders.map((o) => `${o.scenarioId}:${o.seed}`);
    const b = buildDay(2).orders.map((o) => `${o.scenarioId}:${o.seed}`);
    expect(a).not.toEqual(b);
  });

  it('every order resolves to a real scenario and a playable seed', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const day = buildDay(seed);
      expect(day.orders.length).toBeGreaterThanOrEqual(2);
      expect(day.orders.length).toBeLessThanOrEqual(3);
      for (const o of day.orders) {
        expect(o.seed).toBeGreaterThan(0);
        expect(o.title.length).toBeGreaterThan(3);
        expect(o.summary.length).toBeGreaterThan(10);
        expect(o.estMinutes).toBeGreaterThan(0);
        expect(o.ticket).toMatch(/^WO-\d{5}$/);
      }
    }
  });

  it('orders the board by priority, majors first', () => {
    const rank = { P1: 0, P2: 1, P3: 2 } as const;
    for (let seed = 1; seed <= 15; seed++) {
      const p = buildDay(seed).orders.map((o) => rank[o.priority]);
      expect([...p].sort((x, y) => x - y)).toEqual(p);
    }
  });

  it('gives the day a character that matches what is actually on the board', () => {
    for (let seed = 1; seed <= 15; seed++) {
      const day = buildDay(seed);
      const p1 = day.orders.filter((o) => o.priority === 'P1').length;
      if (p1 >= 2) expect(day.character.tag).toBe('MULTIPLE OUTAGES');
      else if (p1 === 1) expect(day.character.tag).toBe('ACTIVE OUTAGE');
    }
  });

  it('never dispatches the same ticket twice in one day', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const tickets = buildDay(seed).orders.map((o) => o.ticket);
      expect(new Set(tickets).size).toBe(tickets.length);
    }
  });

  it('stability falls as jobs sit open and returns to 100 once the board is clear', () => {
    const day = buildDay(7);
    const allTickets = day.orders.map((o) => o.ticket);
    expect(networkStability(day, allTickets)).toBe(100);
    expect(networkStability(day, [])).toBeLessThan(100);
    // Closing the biggest job can only help.
    expect(networkStability(day, [allTickets[0]])).toBeGreaterThan(networkStability(day, []));
  });

  it('reports the committed load against a fixed shift', () => {
    const day = buildDay(3);
    expect(committedMinutes(day)).toBe(day.orders.reduce((s, o) => s + o.estMinutes, 0));
    expect(SHIFT_MINUTES).toBe(480);
  });
});

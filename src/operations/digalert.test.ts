import { describe, expect, it } from 'vitest';
import {
  addWorkingDays,
  canExcavate,
  LEGAL_BASIS,
  MARK_COLORS,
  requestLocate,
  statusAt,
  TOLERANCE_ZONE_INCHES,
} from './digalert';

/** Local-time construction, so the tests read as calendar days rather than UTC instants. */
const day = (y: number, m: number, d: number) => new Date(y, m - 1, d);

// 2026-09-07 is a Monday. The whole week is anchored off that.
const MON = day(2026, 9, 7);
const TUE = day(2026, 9, 8);
const WED = day(2026, 9, 9);
const THU = day(2026, 9, 10);
const FRI = day(2026, 9, 11);
const SAT = day(2026, 9, 12);
const SUN = day(2026, 9, 13);

describe('working days', () => {
  it('is anchored on a real Monday, so the rest of these tests mean something', () => {
    expect(MON.getDay()).toBe(1);
    expect(SAT.getDay()).toBe(6);
    expect(SUN.getDay()).toBe(0);
  });

  it('counts forward skipping weekends', () => {
    expect(addWorkingDays(MON, 2).getTime()).toBe(WED.getTime());
    expect(addWorkingDays(THU, 2).getTime()).toBe(day(2026, 9, 14).getTime()); // Fri, then Mon
  });

  it('a Friday call does not become valid on Sunday', () => {
    const got = addWorkingDays(FRI, 2);
    expect(got.getDay()).not.toBe(0);
    expect(got.getDay()).not.toBe(6);
    expect(got.getTime()).toBe(day(2026, 9, 15).getTime()); // Mon, then Tue
  });

  it('returns the same day for zero', () => {
    expect(addWorkingDays(MON, 0).getTime()).toBe(MON.getTime());
  });
});

describe('the ticket', () => {
  it('does not count the day you called', () => {
    const t = requestLocate('A-1', MON);
    expect(t.validFrom.getTime()).toBe(WED.getTime());
  });

  it('lives for the statutory window', () => {
    const t = requestLocate('A-2', MON);
    const days = Math.round((t.expiresAt.getTime() - MON.getTime()) / 86400000);
    expect(days).toBe(LEGAL_BASIS.ticketLifeDays);
  });

  it('reports the state of play on any given day', () => {
    const t = requestLocate('A-3', MON);
    expect(statusAt(t, MON)).toBe('waiting');
    expect(statusAt(t, TUE)).toBe('waiting');
    expect(statusAt(t, WED)).toBe('valid');
    expect(statusAt(t, day(2026, 10, 5))).toBe('valid');
    expect(statusAt(t, day(2026, 10, 6))).toBe('expired');
    expect(statusAt(null, MON)).toBe('not-requested');
  });
});

describe('the gate on breaking ground', () => {
  it('refuses with no ticket, and names the statute rather than scolding', () => {
    const c = canExcavate(null, MON);
    expect(c.allowed).toBe(false);
    expect(c.status).toBe('not-requested');
    expect(c.reason).toContain(LEGAL_BASIS.statute);
  });

  it('refuses during the notice period and says how long is left', () => {
    const t = requestLocate('B-1', MON);
    const c = canExcavate(t, TUE);
    expect(c.allowed).toBe(false);
    expect(c.daysToWait).toBe(1);
    expect(c.reason).toMatch(/marks may not even be down/i);
  });

  it('allows it once the notice has run', () => {
    const t = requestLocate('B-2', MON);
    const c = canExcavate(t, WED);
    expect(c.allowed).toBe(true);
    expect(c.daysToWait).toBe(0);
    // Even then it tells you to check the ground against the ticket.
    expect(c.reason).toMatch(/verify the marks/i);
  });

  it('refuses an expired ticket and explains that the ground moved on', () => {
    const t = requestLocate('B-3', MON);
    const c = canExcavate(t, day(2026, 10, 20));
    expect(c.allowed).toBe(false);
    expect(c.status).toBe('expired');
    expect(c.reason).toMatch(/renew/i);
  });

  it('a Friday afternoon call still cannot dig on Monday', () => {
    const t = requestLocate('B-4', FRI);
    expect(canExcavate(t, SAT).allowed).toBe(false);
    expect(canExcavate(t, SUN).allowed).toBe(false);
    expect(canExcavate(t, day(2026, 9, 14)).allowed).toBe(false); // Monday
    expect(canExcavate(t, day(2026, 9, 15)).allowed).toBe(true);  // Tuesday
  });
});

describe('what is painted on the ground', () => {
  it('carries the full colour code, because reading it wrong is how cables get cut', () => {
    expect(MARK_COLORS.length).toBe(8);
    for (const m of MARK_COLORS) {
      expect(m.hex).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(m.means.length).toBeGreaterThan(10);
    }
  });

  it('knows which colour is its own trade', () => {
    const orange = MARK_COLORS.find((m) => m.color === 'orange');
    expect(orange!.means).toMatch(/communications/i);
    expect(orange!.means).toMatch(/this is you/i);
  });

  it('keeps a tolerance zone, since a correct locate can still end in a cut', () => {
    expect(TOLERANCE_ZONE_INCHES).toBeGreaterThan(0);
  });
});

describe('honesty about the law', () => {
  it('names its source and admits statutes get amended', () => {
    expect(LEGAL_BASIS.statute).toMatch(/4216/);
    expect(LEGAL_BASIS.caveat).toMatch(/confirm the current text/i);
  });
});

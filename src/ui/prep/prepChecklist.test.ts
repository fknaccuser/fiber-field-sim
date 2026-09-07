import { describe, expect, it } from 'vitest';
import { readinessFor } from '../../session/readiness';
import { ROLE_ORDER } from '../../session/roles';
import type { Intent } from '../../session/types';
import { canCheckMore, checksAllowed, parsePrep, PREP_ITEMS, serializePrep, togglePrep } from './prepChecklist';

/**
 * Stated outright rather than read off a scenario's reference solution. Nothing under
 * `src/ui/` may touch the answer key — including a test, which is why the redaction guard
 * greps the whole tree — and these assertions only need *some* steps to establish which
 * tools the job depends on.
 */
const steps = (): Intent[] => [{ type: 'cli', endpoint: { kind: 'device', deviceId: 'olt-1-dev' }, command: 'show ont status' }];

describe('the pre-trip is a choice, not a formality', () => {
  it('never lets any grade cover the whole list', () => {
    for (const role of ROLE_ORDER) {
      expect(checksAllowed(role)).toBeLessThan(PREP_ITEMS.length);
      expect(checksAllowed(role)).toBeGreaterThan(0);
    }
  });

  it('gives you fewer checks as you rise', () => {
    const allowed = ROLE_ORDER.map(checksAllowed);
    for (let i = 1; i < allowed.length; i++) expect(allowed[i]).toBeLessThanOrEqual(allowed[i - 1]);
  });

  it('stops ticking at the allowance', () => {
    let picked: ReturnType<typeof togglePrep> = [];
    for (const item of PREP_ITEMS) picked = togglePrep(picked, item.id, 'manager');
    expect(picked).toHaveLength(checksAllowed('manager'));
    expect(canCheckMore(picked, 'manager')).toBe(false);
  });

  it('un-ticks, so you can change your mind', () => {
    const one = togglePrep([], 'forgot-vfl', 'l1');
    expect(one).toEqual(['forgot-vfl']);
    expect(togglePrep(one, 'forgot-vfl', 'l1')).toEqual([]);
  });
});

describe('what you checked, carried in the URL', () => {
  it('round-trips', () => {
    const picked = togglePrep(togglePrep([], 'forgot-vfl', 'l1'), 'dirty-scope-tip', 'l1');
    expect(parsePrep(serializePrep(picked), 'l1')).toEqual(picked);
  });

  it('treats a missing or empty parameter as having skipped it', () => {
    expect(parsePrep(null, 'l1')).toEqual([]);
    expect(parsePrep('', 'l1')).toEqual([]);
  });

  it('drops junk instead of trusting the link', () => {
    expect(parsePrep('forgot-vfl,nonsense,,forgot-vfl', 'l1')).toEqual(['forgot-vfl']);
  });

  it('cannot be hand-edited into a perfect morning', () => {
    const everything = PREP_ITEMS.map((i) => i.id).join(',');
    expect(parsePrep(everything, 'manager')).toHaveLength(checksAllowed('manager'));
    expect(parsePrep(everything, 'l1')).toHaveLength(checksAllowed('l1'));
  });
});

describe('checking a thing means it is right', () => {
  it('never produces the fault you guarded against', () => {
    const ref = steps();
    for (const item of PREP_ITEMS) {
      for (const role of ROLE_ORDER) {
        for (let seed = 1; seed <= 80; seed++) {
          expect(readinessFor(seed, role, ref, [item.id]).fault).not.toBe(item.id);
        }
      }
    }
  });

  it('still leaves the mornings you did not cover on the table', () => {
    const ref = steps();
    const guarded = ['forgot-vfl' as const];
    const faults = Array.from({ length: 200 }, (_, i) => readinessFor(i + 1, 'l1', ref, guarded).fault).filter(Boolean);
    expect(faults.length).toBeGreaterThan(0);
    expect(new Set(faults).has('forgot-vfl')).toBe(false);
  });

  it('is deterministic: the same choices and seed give the same morning', () => {
    const ref = steps();
    for (let seed = 1; seed <= 25; seed++) {
      expect(readinessFor(seed, 'l2', ref, ['forgot-scope'])).toEqual(readinessFor(seed, 'l2', ref, ['forgot-scope']));
    }
  });
});

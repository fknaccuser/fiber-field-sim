import { describe, expect, it } from 'vitest';
import { blocker, BLOCKER_TEXT, INITIAL_HELD, reduceHeld, type HeldState } from './deviceState';

function run(actions: Parameters<typeof reduceHeld>[1][], from: HeldState = INITIAL_HELD): HeldState {
  return actions.reduce(reduceHeld, from);
}

describe('held-device state machine', () => {
  it('starts off, capped and unplugged, and blocks on the power key first', () => {
    expect(INITIAL_HELD).toEqual({ power: 'off', capOn: true, connected: false });
    expect(blocker(INITIAL_HELD)).toBe('power-off');
  });

  it('walks the real order: power on, boot, uncap, connect', () => {
    let s = run(['press-power']);
    expect(s.power).toBe('booting');
    expect(blocker(s)).toBe('power-off');
    s = run(['boot-finished'], s);
    expect(blocker(s)).toBe('cap-on');
    s = run(['toggle-cap'], s);
    expect(blocker(s)).toBe('not-connected');
    s = run(['toggle-lead'], s);
    expect(blocker(s)).toBeNull();
  });

  it('refuses to land a connector on a capped port', () => {
    const s = run(['press-power', 'boot-finished', 'toggle-lead']);
    expect(s.connected).toBe(false);
  });

  it('refuses to re-cap a port with a lead still in it', () => {
    const s = run(['press-power', 'boot-finished', 'toggle-cap', 'toggle-lead', 'toggle-cap']);
    expect(s.capOn).toBe(false);
    expect(s.connected).toBe(true);
    const after = run(['toggle-lead', 'toggle-cap'], s);
    expect(after.capOn).toBe(true);
    expect(after.connected).toBe(false);
  });

  it('an instrument that needs no lead (a scope) is ready once it is on and uncapped', () => {
    const s = run(['press-power', 'boot-finished', 'toggle-cap']);
    expect(blocker(s, false)).toBeNull();
    expect(blocker(s, true)).toBe('not-connected');
  });

  it('powering down blocks again', () => {
    const s = run(['press-power', 'boot-finished', 'toggle-cap', 'toggle-lead', 'press-power']);
    expect(blocker(s)).toBe('power-off');
  });

  it('every blocker has trainee-facing text', () => {
    for (const k of ['power-off', 'cap-on', 'not-connected'] as const) expect(BLOCKER_TEXT[k].length).toBeGreaterThan(10);
  });
});

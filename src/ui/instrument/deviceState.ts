/**
 * The state machine every held instrument shares: it is off, its port is capped, and
 * nothing is plugged into it until the trainee does those things in order. Pure, so the
 * gating rules ("you cannot shoot with the cap on") are testable without rendering.
 */
export type PowerState = 'off' | 'booting' | 'on';

export interface HeldState {
  power: PowerState;
  /** The dust cap over the optical port. A reading through a capped port is refused. */
  capOn: boolean;
  /** A jumper (or launch cable, for the OTDR) physically connected to the equipment. */
  connected: boolean;
}

export const INITIAL_HELD: HeldState = { power: 'off', capOn: true, connected: false };

export type HeldAction = 'press-power' | 'boot-finished' | 'toggle-cap' | 'toggle-lead';

export function reduceHeld(state: HeldState, action: HeldAction): HeldState {
  switch (action) {
    case 'press-power':
      if (state.power === 'off') return { ...state, power: 'booting' };
      // Powering down drops the connection state that only means anything while it is on.
      return { ...state, power: 'off' };
    case 'boot-finished':
      return state.power === 'booting' ? { ...state, power: 'on' } : state;
    case 'toggle-cap':
      // Re-capping a connected port is not physically possible: pull the lead first.
      if (!state.capOn && state.connected) return state;
      return { ...state, capOn: !state.capOn };
    case 'toggle-lead':
      if (state.connected) return { ...state, connected: false };
      // You cannot land a connector on a capped port.
      if (state.capOn) return state;
      return { ...state, connected: true };
  }
}

export type Blocker = 'power-off' | 'cap-on' | 'not-connected' | null;

/** Why a measurement cannot be taken right now, in the order a technician would hit them. */
export function blocker(state: HeldState, needsConnection = true): Blocker {
  if (state.power !== 'on') return 'power-off';
  if (state.capOn) return 'cap-on';
  if (needsConnection && !state.connected) return 'not-connected';
  return null;
}

export const BLOCKER_TEXT: Record<Exclude<Blocker, null>, string> = {
  'power-off': 'The instrument is off. Press and hold the power key.',
  'cap-on': 'The dust cap is still over the optical port.',
  'not-connected': 'Nothing is connected to the port yet.',
};

export const BOOT_MS = 1400;

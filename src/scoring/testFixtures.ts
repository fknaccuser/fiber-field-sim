/** Shared, minimal fixtures for scoring unit tests -- these build SessionState by hand rather than through the runner, so each test can focus on the scoring math the doc specifies. */
import { createEmptyWorld } from '../world';
import type { ActiveProfileSet, WorldState } from '../world';
import { loadDefaultProfileSet } from '../profiles';
import type { ActionEvent, ScenarioMeta, SessionState } from '../session/types';

export const profiles = loadDefaultProfileSet();

export const activeProfiles: ActiveProfileSet = {
  network: 'xgs-pon-default',
  oltVendor: 'olt-calix-e7-2',
  switchVendor: 'switch-cisco-ios',
  equipment: 'hexatronic-commscope-default',
  otdrInstrument: 'otdr-exfo-maxtester-730c',
  hostShell: 'host-windows',
  region: 'ca-south-oc-digalert',
};

export function emptyWorld(): WorldState {
  return createEmptyWorld(1, activeProfiles);
}

export function baseMeta(overrides: Partial<ScenarioMeta> = {}): ScenarioMeta {
  return {
    scenarioId: 'test-scenario',
    title: 'Test scenario',
    tier: 2,
    seed: 1,
    startLocationNodeId: 'n1',
    remoteCliAccess: true,
    remoteHostAccess: true,
    positionToleranceMeters: 10,
    serviceCheckHostname: 'portal.isp.net',
    travelSeconds: { default: 300, pairs: [] },
    hints: [],
    referenceSolution: { rationales: [], steps: [], totalSeconds: 600, affectedCustomerMinutes: 0 },
    today: '2026-01-01',
    ...overrides,
  };
}

/** Builds a complete, ended SessionState. `log` should already include a trailing 'diagnosis' action -- most scoring functions require one. */
export function makeSession(opts: {
  world: WorldState;
  initialWorld?: WorldState;
  meta?: ScenarioMeta;
  log: ActionEvent[];
  clockSeconds?: number;
  endedBy?: 'diagnosis' | 'safety-strike';
}): SessionState {
  return {
    meta: opts.meta ?? baseMeta(),
    world: opts.world,
    initialWorld: opts.initialWorld ?? opts.world,
    profiles,
    clockSeconds: opts.clockSeconds ?? 0,
    locationNodeId: 'n1',
    log: opts.log,
    blobs: {},
    hintsUsed: opts.log.filter((a) => a.type === 'hint' && !a.refused).length,
    cliSessions: {},
    commsEvents: [],
    commsHandled: [],
  probeTipDirty: false,
    ended: { by: opts.endedBy ?? 'diagnosis', atSimSeconds: opts.clockSeconds ?? 0 },
  };
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** Builds one ActionEvent with an explicit id/index -- callers pick these so `evidenceActionIds` references stay stable and readable. */
export function action(id: string, index: number, partial: DistributiveOmit<ActionEvent, 'id' | 'index' | 'atSimSeconds' | 'locationNodeId'>): ActionEvent {
  return { id, index, atSimSeconds: 0, locationNodeId: 'n1', ...partial } as ActionEvent;
}

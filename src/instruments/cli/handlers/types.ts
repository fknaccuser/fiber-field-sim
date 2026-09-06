import type { HostConfig, NetworkDeviceConfig, WorldState } from '../../../world';
import type { ProfileSet, VendorProfile } from '../../../profiles';
import type { CliFact, CliSession } from '../types';

export interface HandlerContext {
  world: WorldState;
  profiles: ProfileSet;
  session: CliSession;
  vendorProfile: VendorProfile;
  device?: NetworkDeviceConfig;
  host?: HostConfig;
  /** Action index/counter for this shot, threaded into DNS jitter so repeated lookups differ deterministically. */
  attemptCounter: number;
}

export interface HandlerOutcome {
  output: string[];
  /** Present only when this handler mutated the world (already cloned by the handler itself). */
  world?: WorldState;
  session?: Partial<CliSession>;
  /** Overrides the default CLI_COMMAND_SECONDS cost for this command. */
  simulatedSeconds?: number;
  facts?: CliFact[];
}

export type Handler = (ctx: HandlerContext, params: Record<string, string>) => HandlerOutcome;

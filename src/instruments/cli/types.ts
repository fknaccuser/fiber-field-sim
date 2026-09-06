import type { WorldState } from '../../world';
import type { CliMode } from '../../profiles';

export type { CliMode };
export type Endpoint = { kind: 'device'; deviceId: string } | { kind: 'host'; hostId: string };

export interface CliSession {
  endpoint: Endpoint;
  /** Hosts are always 'user-exec'. */
  mode: CliMode;
  contextInterfaceId?: string;
  contextVlanId?: number;
}

export type CliFact =
  | { kind: 'ping'; target: string; resolvedIp: string | null; delivered: number; sent: number; failureAt?: string }
  | { kind: 'dns-lookup'; name: string; resolvedIp: string | null; serverIp: string | null; stale: boolean; serverHealth: string | null }
  | { kind: 'interface-observed'; deviceId: string; interfaceId: string }
  | { kind: 'route-table-observed'; deviceId: string }
  | { kind: 'vlan-table-observed'; deviceId: string }
  | { kind: 'mac-table-observed'; deviceId: string }
  | { kind: 'transceiver-observed'; deviceId: string; interfaceId: string; rxPowerDbm: number | null }
  | { kind: 'log-observed'; deviceId: string }
  | { kind: 'ont-status-observed'; deviceId: string; ontId: string; status: string }
  | { kind: 'host-addressing-observed'; hostId: string; state: string; reason?: string }
  | { kind: 'config-changed'; deviceId: string; summary: string };

export interface CliResult {
  /** Lines only -- no prompt, no echo (the terminal echoes the command itself). */
  output: string[];
  session: CliSession;
  /** Same reference if this command didn't change anything; a clone if a config handler mutated the world. */
  world: WorldState;
  /** The prompt for the *next* line, from the resolved vendor profile's modePrompts. */
  prompt: string;
  recognized: boolean;
  handlerId: string | null;
  /** For a syntax error: the column (in the echoed prompt+command line) under which '^' sits. */
  caretColumn: number | null;
  simulatedSeconds: number;
  /** Structured facts for scoring's evidence rules (item 4). Never rendered. */
  facts: CliFact[];
}

export interface HelpCandidate {
  token: string;
  description: string;
  isParam: boolean;
}

export interface HelpResult {
  candidates: HelpCandidate[];
}

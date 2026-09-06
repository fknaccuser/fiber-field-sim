/**
 * The CLI entry points. `execute` resolves which vendor dialect applies (from the
 * device's own vendorProfileId, or the host shell for a host endpoint), matches the
 * command against that profile's commandSet, and dispatches to a vendor-neutral
 * handler. Syntax, prompts, and error text all come from the profile; execute.ts itself
 * knows nothing vendor-specific.
 */
import { findDevice, findHost } from '../../world';
import type { HostConfig, NetworkDeviceConfig, WorldState } from '../../world';
import type { ProfileSet, VendorProfile } from '../../profiles';
import { buildHelp, matchCommand, tokenize } from './matcher';
import { HANDLERS } from './handlers';
import type { HandlerContext } from './handlers/types';
import type { CliResult, CliSession, HelpResult } from './types';

export class UnknownVendorProfileError extends Error {
  readonly code = 'UNKNOWN_VENDOR_PROFILE';
  readonly deviceId: string;
  readonly vendorProfileId: string;
  constructor(deviceId: string, vendorProfileId: string) {
    super(`Device ${deviceId} references unknown vendor profile "${vendorProfileId}"`);
    this.name = 'UnknownVendorProfileError';
    this.deviceId = deviceId;
    this.vendorProfileId = vendorProfileId;
  }
}

const CLI_COMMAND_SECONDS = 15;
const UNRECOGNIZED_SECONDS = 5;

interface ResolvedEndpoint {
  vendorProfile: VendorProfile;
  device?: NetworkDeviceConfig;
  host?: HostConfig;
}

function resolveEndpoint(world: WorldState, profiles: ProfileSet, session: CliSession): ResolvedEndpoint {
  if (session.endpoint.kind === 'device') {
    const device = findDevice(world, session.endpoint.deviceId);
    const candidate = [profiles.oltVendor, profiles.switchVendor].find((p) => p.id === device.vendorProfileId);
    if (!candidate) throw new UnknownVendorProfileError(device.id, device.vendorProfileId);
    return { vendorProfile: candidate, device };
  }
  const host = findHost(world, session.endpoint.hostId);
  return { vendorProfile: profiles.hostShell, host };
}

export function promptFor(profiles: ProfileSet, world: WorldState, session: CliSession): string {
  const { vendorProfile, device } = resolveEndpoint(world, profiles, session);
  const template = vendorProfile.modePrompts[session.mode];
  return template.replace('{hostname}', device?.hostname ?? '');
}

export function help(world: WorldState, profiles: ProfileSet, session: CliSession, partialText: string): HelpResult {
  const { vendorProfile } = resolveEndpoint(world, profiles, session);
  const withoutMark = partialText.endsWith('?') ? partialText.slice(0, -1) : partialText;
  return { candidates: buildHelp(vendorProfile.commandSet, session.mode, tokenize(withoutMark)) };
}

export function execute(world: WorldState, profiles: ProfileSet, session: CliSession, commandText: string, attemptCounter = 0): CliResult {
  const { vendorProfile, device, host } = resolveEndpoint(world, profiles, session);
  const trimmed = commandText.trim();
  const promptStr = promptFor(profiles, world, session);

  if (trimmed.length === 0) {
    return { output: [], session, world, prompt: promptStr, recognized: true, handlerId: null, caretColumn: null, simulatedSeconds: 0, facts: [] };
  }

  if (trimmed.endsWith('?')) {
    const helpResult = help(world, profiles, session, trimmed);
    const output = helpResult.candidates.map((c) => `  ${c.token.padEnd(22)}${c.description}`);
    return { output, session, world, prompt: promptStr, recognized: true, handlerId: null, caretColumn: null, simulatedSeconds: 0, facts: [] };
  }

  const tokens = tokenize(trimmed);
  const match = matchCommand(vendorProfile.commandSet, session.mode, tokens);

  if (match.kind === 'matched') {
    const handler = HANDLERS[match.entry.handler];
    if (!handler) throw new Error(`No handler registered for id "${match.entry.handler}"`);
    const ctx: HandlerContext = { world, profiles, session, vendorProfile, device, host, attemptCounter };
    const outcome = handler(ctx, match.params);
    const nextWorld = outcome.world ?? world;
    const nextSession: CliSession = { ...session, mode: match.entry.transitionsTo ?? session.mode, ...outcome.session };
    return {
      output: outcome.output,
      session: nextSession,
      world: nextWorld,
      prompt: promptFor(profiles, nextWorld, nextSession),
      recognized: true,
      handlerId: match.entry.handler,
      caretColumn: null,
      simulatedSeconds: outcome.simulatedSeconds ?? CLI_COMMAND_SECONDS,
      facts: outcome.facts ?? [],
    };
  }

  if (match.kind === 'incomplete') {
    return {
      output: [vendorProfile.messages.incompleteCommand],
      session,
      world,
      prompt: promptStr,
      recognized: false,
      handlerId: null,
      caretColumn: null,
      simulatedSeconds: UNRECOGNIZED_SECONDS,
      facts: [],
    };
  }
  if (match.kind === 'ambiguous') {
    return {
      output: [vendorProfile.messages.ambiguousCommand.replace('{input}', trimmed)],
      session,
      world,
      prompt: promptStr,
      recognized: false,
      handlerId: null,
      caretColumn: null,
      simulatedSeconds: UNRECOGNIZED_SECONDS,
      facts: [],
    };
  }

  const caretColumn = promptStr.length + match.caretTokenColumn;
  return {
    output: [' '.repeat(caretColumn) + '^', vendorProfile.messages.syntaxError.replace('{input}', trimmed)],
    session,
    world,
    prompt: promptStr,
    recognized: false,
    handlerId: null,
    caretColumn,
    simulatedSeconds: UNRECOGNIZED_SECONDS,
    facts: [],
  };
}

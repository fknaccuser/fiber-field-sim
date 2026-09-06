/**
 * Formatting helpers shared by the show-* handlers: deterministic MAC/counter
 * derivation, interface abbreviation, mask conversions, and log timestamps.
 */
import { createRng, deriveSeed } from '../../world';
import type { InterfaceState } from '../../world';
import type { CliMode, VendorProfile } from '../../profiles';

/** Deterministic MAC address for an interface that doesn't have one authored, so `show` output is stable across runs for the same world seed. Locally-administered, unicast. */
export function macFromSeed(worldSeed: number, deviceId: string, interfaceId: string): string {
  const rng = createRng(deriveSeed(worldSeed, 'mac', deviceId, interfaceId));
  const bytes: number[] = [];
  for (let i = 0; i < 6; i++) bytes.push(Math.floor(rng.next() * 256));
  bytes[0] = (bytes[0] & 0b11111100) | 0b00000010; // clear multicast bit, set locally-administered bit
  const hex = bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 4)}.${hex.slice(4, 8)}.${hex.slice(8, 12)}`;
}

export interface InterfaceCounters {
  packetsIn: number;
  bytesIn: number;
  packetsOut: number;
  bytesOut: number;
  crcErrors: number;
  lateCollisions: number;
}

export function counterFromSeed(worldSeed: number, deviceId: string, interfaceId: string, iface: Pick<InterfaceState, 'crcErrors' | 'lateCollisions'>): InterfaceCounters {
  const rngIn = createRng(deriveSeed(worldSeed, 'counters', deviceId, interfaceId, 'in'));
  const rngOut = createRng(deriveSeed(worldSeed, 'counters', deviceId, interfaceId, 'out'));
  const packetsIn = 10_000 + Math.floor(rngIn.next() * (5_000_000 - 10_000));
  const packetsOut = 10_000 + Math.floor(rngOut.next() * (5_000_000 - 10_000));
  return {
    packetsIn,
    bytesIn: packetsIn * 640,
    packetsOut,
    bytesOut: packetsOut * 640,
    crcErrors: iface.crcErrors ?? 0,
    lateCollisions: iface.lateCollisions ?? 0,
  };
}

export interface InterfaceFamily {
  prefix: string;
  abbrev: string;
  cdpAbbrev: string;
  typeLabel: string;
  bandwidthKbit: number;
}

function familyFor(interfaceId: string, families: readonly InterfaceFamily[]): InterfaceFamily | null {
  return families.find((f) => interfaceId.startsWith(f.prefix)) ?? null;
}

/** e.g. 'GigabitEthernet0/1' -> 'Gi0/1'. Interface ids outside any known family pass through unchanged. */
export function abbrev(interfaceId: string, families: readonly InterfaceFamily[]): string {
  const family = familyFor(interfaceId, families);
  if (!family) return interfaceId;
  return family.abbrev + interfaceId.slice(family.prefix.length);
}

/** e.g. 'GigabitEthernet0/1' -> 'Gig 0/1' (CDP's own, differently-spaced abbreviation). */
export function cdpName(interfaceId: string, families: readonly InterfaceFamily[]): string {
  const family = familyFor(interfaceId, families);
  if (!family) return interfaceId;
  return family.cdpAbbrev + interfaceId.slice(family.prefix.length);
}

/** Resolves a possibly-abbreviated interface id (e.g. 'Gi0/1') back to its full form ('GigabitEthernet0/1') against a device's actual interfaces and the vendor's families. Returns null if it cannot be resolved to an existing interface. */
export function resolveInterfaceId(input: string, existingIds: readonly string[], families: readonly InterfaceFamily[]): string | null {
  if (existingIds.includes(input)) return input;
  for (const id of existingIds) {
    if (abbrev(id, families).toLowerCase() === input.toLowerCase()) return id;
  }
  // Also allow creating a not-yet-existing SVI by exact 'Vlan{n}' form; caller decides.
  return null;
}

export function prefixToMask(prefixLength: number): string {
  const bits = 0xffffffff << (32 - prefixLength);
  const masked = prefixLength === 0 ? 0 : bits >>> 0;
  return [(masked >>> 24) & 255, (masked >>> 16) & 255, (masked >>> 8) & 255, masked & 255].join('.');
}

export function maskToPrefix(mask: string): number {
  const octets = mask.split('.').map(Number);
  let bits = 0;
  for (const o of octets) {
    bits += o.toString(2).split('1').length - 1;
  }
  return bits;
}

/** Deterministic IOS-style uptime log timestamp for line index `i` (0-based). */
export function logTimestamp(i: number): string {
  const totalSeconds = 240 + 37 * i;
  const hh = Math.floor(totalSeconds / 3600) % 24;
  const mm = Math.floor(totalSeconds / 60) % 60;
  const ss = totalSeconds % 60;
  const mmm = (i * 137) % 1000;
  const pad = (n: number, len = 2) => String(n).padStart(len, '0');
  return `*Mar  1 ${pad(hh)}:${pad(mm)}:${pad(ss)}.${pad(mmm, 3)}: `;
}

export type InterfaceStatusWord = 'administratively down' | 'up' | 'down';

export function adminOrLineStatusWord(iface: Pick<InterfaceState, 'adminStatus' | 'lineStatus'>): { status: InterfaceStatusWord; protocol: 'up' | 'down' } {
  if (iface.adminStatus === 'administratively-down') return { status: 'administratively down', protocol: 'down' };
  return { status: iface.lineStatus, protocol: iface.lineStatus };
}

export function isErrDisabled(iface: Pick<InterfaceState, 'portSecurity'>): boolean {
  return iface.portSecurity?.state === 'err-disabled';
}

export const IP_ROUTE_CODES_HEADER = `Codes: L - local, C - connected, S - static, R - RIP, M - mobile, B - BGP
       D - EIGRP, EX - EIGRP external, O - OSPF, IA - OSPF inter area
       N1 - OSPF NSSA external type 1, N2 - OSPF NSSA external type 2
       E1 - OSPF external type 1, E2 - OSPF external type 2
       i - IS-IS, su - IS-IS summary, L1 - IS-IS level-1, L2 - IS-IS level-2
       ia - IS-IS inter area, * - candidate default, U - per-user static route
       o - ODR, P - periodic downloaded static route, H - NHRP, l - LISP
       a - application route
       + - replicated route, % - next hop override, p - overrides from PfR`;

export function vendorPromptFor(profile: VendorProfile, mode: CliMode, hostname: string): string {
  const template = profile.modePrompts[mode];
  return template.replace('{hostname}', hostname);
}

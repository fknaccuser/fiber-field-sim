# Item 3 — CLI, host shell, and device-state module (access/distribution layer)

Status: architecture, ready to implement. Depends on item 2's `src/instruments/shared/opticalPath.ts` (`pathLossDb`) and `src/world/random.ts`.

## Open questions (defaults stated; not blocking)

1. **Host shell flavor.** Technicians' laptops are assumed Windows (`ipconfig`, `tracert`, "Request timed out."). If the crew uses macOS/Linux, add a `vendor/host-unix.yaml`; the handlers are shared. Default: Windows layout.
2. **Calix AXOS command accuracy.** The four OLT `show` commands below use plausible Calix-style layouts. Their *syntax* lives entirely in `vendor/olt-calix-e7-2.yaml`, so correcting it against a real E7-2 session is a YAML edit. Default: proceed; mark the OLT layouts "unverified" in the YAML `notes`.
3. **`show ip ospf neighbor`.** Not in the spec's minimum list, but the `ospf-exstart-mtu-mismatch` fault is otherwise undiscoverable. Default: include it (it's one handler).

## 1. Purpose and boundaries

`cli.execute(world, profiles, session, commandText)` is a pure function returning output lines, the (possibly updated) `WorldState`, and the next session mode. All output is computed from `NetworkDeviceConfig`, `WorldState.hosts`, `WorldState.links`, and (for the OLT and for hosts behind ONTs) the optical path. Syntax — which words exist, prompts, error templates, interface abbreviations — comes from the vendor profile; semantics (what `show ip interface brief` *means*) is a code handler with a vendor-neutral id that the profile maps to.

Also delivered here because the diagnostic methodology requires it: a **host shell** (the customer-premise laptop: `ipconfig`, `ping`, `nslookup`, `tracert`) driven by the same forwarding engine, and **derived ONT status** on the OLT (optical world ⇒ logical state).

## 2. Amendments to item 1 (additive; existing tests unchanged)

### 2.1 `src/world/types.ts`

```ts
export interface InterfaceState {
  // …existing…
  description?: string;
  ipAddress?: string;          // dotted quad; presence makes this a routed/SVI interface
  prefixLength?: number;       // required when ipAddress is set
  macAddress?: string;         // 'aabb.ccdd.eeff'; if absent, derived deterministically (Section 5.1)
  mtu?: number;                // default 1500
}

export interface DhcpConfig {
  // …existing…
  dnsServerIp?: string;        // handed to DHCP clients; defaults to the SVI address
}

export interface AclRule {
  id: string;
  action: 'permit' | 'deny';
  matchDescription: string;    // kept for display/explanations
  match?: { protocol: 'ip' | 'icmp' | 'tcp' | 'udp'; srcCidr: string; dstCidr: string; dstPort?: number };
  appliedTo?: Array<{ interfaceId: string; direction: 'in' | 'out' }>;
}

export interface OntRecord {
  ontId: string;               // e.g. '1/1/xp1/1'
  serial: string;              // physical ONT serial (e.g. 'CXNK00A1B2C3')
  provisionedSerial?: string;  // what the OLT expects; mismatch ⇒ not ranging
  ontNodeId: string;           // TopologyNode of kind 'ont'
  misbehaving?: 'rogue-tx';    // transmitting out of its timeslot; takes down the PON
}
export interface PonPortState {
  id: string;                  // e.g. '1/1/xp1'
  adminStatus: AdminStatus;
  spanId: string;              // the feeder span leaving the OLT node for this port
  onts: OntRecord[];
}

export interface NetworkDeviceConfig {
  // …existing…
  role?: 'switch' | 'router' | 'l3-switch' | 'olt' | 'server' | 'dns-server';   // default 'switch'
  platform?: string;           // shown by CDP; default vendor displayName
  topologyNodeId?: string;     // required for role 'olt' (the 'olt' TopologyNode)
  ponPorts?: PonPortState[];
  dnsResolverIp?: string;      // the DNS server this device itself uses for name lookups
  dnsServerHealth?: 'ok' | 'degraded' | 'down';  // only meaningful when this device serves dnsRecords
}

export interface NetworkLink {
  id: string;
  a: { deviceId: string; interfaceId: string };
  b: { deviceId: string; interfaceId: string } | { hostId: string };
}

export type HostAddressing =
  | { mode: 'static'; ip: string; prefixLength: number; gateway: string; dns: string }
  | { mode: 'dhcp' };
export interface HostConfig {
  id: string;
  label: string;               // e.g. "Customer laptop"
  premiseNodeId: string;       // 'customer-premise' node
  macAddress: string;
  /** Exactly one attachment: a switch port (via NetworkLink b.hostId) or an ONT (L2 continues through the PON to the OLT's uplink). */
  attachedOntNodeId?: string;
  vlan?: number;               // service VLAN when attached via an ONT; when attached to a switch port the port's accessVlan wins
  addressing: HostAddressing;
}

export interface WorldState {
  // …existing…
  links: NetworkLink[];        // add to createEmptyWorld as []
  hosts: HostConfig[];         // add to createEmptyWorld as []
}
```

Fault amendments (all additive to `faultTaxonomy.ts`; extend param schemas with optional fields only):
- `acl-silent-drop`: params gain optional `match` and `appliedTo` (same shapes as `AclRule`); `apply` copies them onto the rule.
- `subnet-mask-typo-overlap`: after the existing route mutation, if an interface with `id === params.interfaceId` exists, set its `prefixLength` to the prefix of `wrongCidr`.
- `ospf-exstart-mtu-mismatch`: params gain optional `localMtu` (default 1500); `apply` sets `iface.mtu = localMtu` and appends `%OSPF-5-ADJCHG: Process 1, Nbr ${neighborId} on ${iface.id} from EXCHANGE to EXSTART, Negotiation Done` to `logLines`.
- `transceiver-rx-power-low`: also append `%SFF8472-3-THRESHOLD_VIOLATION: ${iface.id}: Rx power low alarm; Operating value: ${rx} dBm, Threshold value: ${network.receivePower.lossOfSignalBelowDbm} dBm` — the network profile isn't available inside `apply`; instead store the threshold in the fault params as optional `lowAlarmDbm` (default −24) and use that.
- New fault `ont-unpowered` (domain `'cpe'` — extend `FaultDomain`), `appliesTo: 'site'`, params `{}`, apply: `node.attributes.powered = false`. New fault `ont-serial-mismatch`, `appliesTo: 'device-global'`, params `{ ontId, provisionedSerial }`, apply: sets `provisionedSerial` on the matching `OntRecord`. New fault `rogue-ont` , `appliesTo: 'device-global'`, params `{ ontId }`, apply: sets `misbehaving: 'rogue-tx'`. New fault `dns-server-unresponsive`, `appliesTo: 'device-global'`, params `{ health: 'degraded' | 'down' }`, apply: sets `dnsServerHealth`. Add tests for each in `faultTaxonomy.test.ts` (one assertion each) and update the "15 network kinds" test to assert `>= 15` rather than `=== 15`, since `ont-serial-mismatch`, `rogue-ont`, `dns-server-unresponsive` are `domain: 'network'`.

### 2.2 `src/profiles/schema.ts` — `VendorProfileSchema` (breaking for the two YAMLs, which are rewritten below; the tests that only assert `kind`/`id` still pass)

```ts
export const CommandEntrySchema = z.object({
  pattern: z.string(),                 // tokens: literals or {param}; a final {...rest} swallows the remainder
  handler: z.string(),                 // vendor-neutral handler id (Section 4.3); validated against HANDLER_IDS at registry load
  modes: z.array(CliModeSchema).min(1),
  description: z.string(),
  transitionsTo: CliModeSchema.optional(),
});
export const CliModeSchema = z.enum(['user-exec', 'priv-exec', 'global-config', 'interface-config', 'vlan-config']);
export const VendorProfileSchema = z.object({
  id: z.string(),
  kind: z.enum(['olt', 'switch', 'host']),
  displayName: z.string(),
  modePrompts: z.record(CliModeSchema, z.string()),     // templates with {hostname}; host kind uses only 'user-exec'
  commandSet: z.array(CommandEntrySchema).min(1),
  messages: z.object({
    syntaxError: z.string(),          // "% Invalid input detected at '^' marker."
    ambiguousCommand: z.string(),     // "% Ambiguous command:  \"{input}\""
    incompleteCommand: z.string(),    // "% Incomplete command."
    unknownHost: z.string(),          // "% Unrecognized host or address, or protocol not running."
    enterConfig: z.string().optional(),
  }),
  interfaceFamilies: z.array(z.object({ prefix: z.string(), abbrev: z.string(), cdpAbbrev: z.string(), typeLabel: z.string(), bandwidthKbit: z.number() })).default([]),
  cdpCapable: z.boolean().default(false),
  osVersionLine: z.string().optional(),
  transceiverThresholds: z.object({
    temperatureC: z.tuple([z.number(), z.number(), z.number(), z.number()]),  // highAlarm, highWarn, lowWarn, lowAlarm
    txDbm: z.tuple([z.number(), z.number(), z.number(), z.number()]),
    rxDbm: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  }).optional(),
  notes: z.string().optional(),
});
```
`ProfileSet` gains `hostShell: VendorProfile`; `ActiveProfileSet` gains `hostShell: string` (`'host-windows'`); `loadDefaultProfileSet` and the registry include it; update the two existing test fixtures' `ActiveProfileSet` literals.

### 2.3 Rewritten `vendor/switch-cisco-ios.yaml` (authoritative content)

```yaml
id: switch-cisco-ios
kind: switch
displayName: Cisco IOS-style switch/router
modePrompts:
  user-exec: "{hostname}>"
  priv-exec: "{hostname}#"
  global-config: "{hostname}(config)#"
  interface-config: "{hostname}(config-if)#"
  vlan-config: "{hostname}(config-vlan)#"
messages:
  syntaxError: "% Invalid input detected at '^' marker."
  ambiguousCommand: "% Ambiguous command:  \"{input}\""
  incompleteCommand: "% Incomplete command."
  unknownHost: "% Unrecognized host or address, or protocol not running."
  enterConfig: "Enter configuration commands, one per line.  End with CNTL/Z."
interfaceFamilies:
  - { prefix: GigabitEthernet, abbrev: Gi, cdpAbbrev: "Gig ", typeLabel: 10/100/1000BaseTX, bandwidthKbit: 1000000 }
  - { prefix: TenGigabitEthernet, abbrev: Te, cdpAbbrev: "Ten ", typeLabel: 10GBase-LR, bandwidthKbit: 10000000 }
  - { prefix: FastEthernet, abbrev: Fa, cdpAbbrev: "Fas ", typeLabel: 10/100BaseTX, bandwidthKbit: 100000 }
  - { prefix: Vlan, abbrev: Vl, cdpAbbrev: "Vla ", typeLabel: EtherSVI, bandwidthKbit: 1000000 }
cdpCapable: true
osVersionLine: "version 15.2"
transceiverThresholds:
  temperatureC: [75.0, 70.0, -5.0, -10.0]
  txDbm: [4.0, 3.0, -4.0, -5.0]
  rxDbm: [-1.0, -2.0, -23.0, -24.0]
commandSet:
  - { pattern: enable,                                   handler: enter-priv-exec,          modes: [user-exec], transitionsTo: priv-exec, description: Enter privileged EXEC }
  - { pattern: disable,                                  handler: leave-priv-exec,          modes: [priv-exec], transitionsTo: user-exec, description: Leave privileged EXEC }
  - { pattern: exit,                                     handler: exit-mode,                modes: [priv-exec, global-config, interface-config, vlan-config], description: Exit current mode }
  - { pattern: end,                                      handler: end-config,               modes: [global-config, interface-config, vlan-config], transitionsTo: priv-exec, description: Return to privileged EXEC }
  - { pattern: show ip interface brief,                  handler: show-ip-interface-brief,  modes: [user-exec, priv-exec], description: Interface status and IP summary }
  - { pattern: show interfaces status,                   handler: show-interfaces-status,   modes: [user-exec, priv-exec], description: Port status, VLAN, duplex, speed }
  - { pattern: show interfaces {id},                     handler: show-interface-detail,    modes: [user-exec, priv-exec], description: Interface counters and state }
  - { pattern: show interfaces transceiver detail,       handler: show-transceiver-detail,  modes: [user-exec, priv-exec], description: Optic Tx/Rx power and thresholds }
  - { pattern: show vlan brief,                          handler: show-vlan-brief,          modes: [user-exec, priv-exec], description: VLAN database }
  - { pattern: show mac address-table,                   handler: show-mac-address-table,   modes: [user-exec, priv-exec], description: Learned MAC addresses }
  - { pattern: show ip route,                            handler: show-ip-route,            modes: [user-exec, priv-exec], description: Routing table }
  - { pattern: show ip ospf neighbor,                    handler: show-ip-ospf-neighbor,    modes: [user-exec, priv-exec], description: OSPF adjacencies }
  - { pattern: show cdp neighbors,                       handler: show-cdp-neighbors,       modes: [user-exec, priv-exec], description: Directly connected neighbors }
  - { pattern: show running-config,                      handler: show-running-config,      modes: [priv-exec], description: Active configuration }
  - { pattern: show logging,                             handler: show-logging,             modes: [user-exec, priv-exec], description: Log buffer }
  - { pattern: ping {target},                            handler: ping,                     modes: [user-exec, priv-exec], description: Send ICMP echoes }
  - { pattern: traceroute {target},                      handler: traceroute,               modes: [user-exec, priv-exec], description: Trace the route }
  - { pattern: configure terminal,                       handler: enter-global-config,      modes: [priv-exec], transitionsTo: global-config, description: Enter global configuration }
  - { pattern: interface {id},                           handler: enter-interface-config,   modes: [global-config], transitionsTo: interface-config, description: Configure an interface }
  - { pattern: vlan {id},                                handler: enter-vlan-config,        modes: [global-config], transitionsTo: vlan-config, description: Configure a VLAN }
  - { pattern: name {name},                              handler: vlan-name,                modes: [vlan-config], description: Name the VLAN }
  - { pattern: ip route {network} {mask} {nexthop},      handler: ip-route-add,             modes: [global-config], description: Add a static route }
  - { pattern: no ip route {network} {mask} {nexthop},   handler: ip-route-remove,          modes: [global-config], description: Remove a static route }
  - { pattern: switchport mode {mode},                   handler: if-switchport-mode,       modes: [interface-config], description: access or trunk }
  - { pattern: switchport access vlan {id},              handler: if-access-vlan,           modes: [interface-config], description: Set access VLAN }
  - { pattern: switchport trunk allowed vlan {list},     handler: if-trunk-allowed,         modes: [interface-config], description: Set allowed VLAN list (replace) }
  - { pattern: switchport trunk allowed vlan add {list}, handler: if-trunk-allowed-add,     modes: [interface-config], description: Add to allowed VLANs }
  - { pattern: switchport trunk native vlan {id},        handler: if-trunk-native,          modes: [interface-config], description: Set native VLAN }
  - { pattern: shutdown,                                 handler: if-shutdown,              modes: [interface-config], description: Administratively disable }
  - { pattern: no shutdown,                              handler: if-no-shutdown,           modes: [interface-config], description: Administratively enable }
  - { pattern: duplex {mode},                            handler: if-duplex,                modes: [interface-config], description: full, half, or auto }
  - { pattern: speed {value},                            handler: if-speed,                 modes: [interface-config], description: 10, 100, 1000, or auto }
  - { pattern: ip address {ip} {mask},                   handler: if-ip-address,            modes: [interface-config], description: Set interface IP }
  - { pattern: ip helper-address {ip},                   handler: if-ip-helper,             modes: [interface-config], description: DHCP relay target }
  - { pattern: no ip helper-address {ip},                handler: if-ip-helper-remove,      modes: [interface-config], description: Remove DHCP relay target }
  - { pattern: description {...rest},                    handler: if-description,           modes: [interface-config], description: Interface description }
notes: >
  Access/distribution-layer dialect only; backbone-layer commands are deferred to a later stage.
```

### 2.4 Rewritten `vendor/olt-calix-e7-2.yaml`

Same shape; `kind: olt`; `modePrompts` `{ user-exec: "{hostname}>", priv-exec: "{hostname}#", global-config: "{hostname}(config)#", interface-config: "{hostname}(config-if)#", vlan-config: "{hostname}(config-vlan)#" }`; `cdpCapable: false`; `messages.syntaxError: "% Invalid command."`, `ambiguousCommand: "% Ambiguous command: \"{input}\""`, `incompleteCommand: "% Incomplete command."`, `unknownHost: "% Unknown host {input}"`. commandSet: `enable`, `exit`, `show ont status` → `olt-show-ont-status`, `show ont status {ontId}` → `olt-show-ont-detail`, `show pon port` → `olt-show-pon-port`, `show interface pon {id}` → `olt-show-pon-interface`, `show alarms` → `olt-show-alarms`, `show logging` → `show-logging`, `ping {target}` → `ping`. Keep the existing `notes` and add "Command layouts unverified against a live E7-2 session."

### 2.5 New `vendor/host-windows.yaml`

`kind: host`; `modePrompts: { user-exec: "C:\\Users\\tech>" }` (plus the other four modes mapped to the same string — the schema requires all keys); messages: `syntaxError: "'{input}' is not recognized as an internal or external command,\noperable program or batch file."`, `ambiguousCommand`/`incompleteCommand` same text, `unknownHost: "Ping request could not find host {input}. Please check the name and try again."`; commandSet: `ipconfig` → `host-ipconfig`, `ipconfig /all` → `host-ipconfig-all`, `ping {target}` → `host-ping`, `nslookup {target}` → `host-nslookup`, `tracert {target}` → `host-tracert`. `interfaceFamilies: []`.

## 3. Module layout

```
src/instruments/cli/
  types.ts            CliSession, CliResult, HelpResult, Endpoint
  matcher.ts          tokenize, matchCommand, buildHelp, caret placement
  handlers/
    index.ts          HANDLER_IDS + HANDLERS registry (Record<string, Handler>)
    exec.ts           enter/leave modes, exit/end
    showInterfaces.ts show-ip-interface-brief, show-interfaces-status, show-interface-detail, show-transceiver-detail
    showL2.ts         show-vlan-brief, show-mac-address-table, show-cdp-neighbors
    showL3.ts         show-ip-route, show-ip-ospf-neighbor
    showConfig.ts     show-running-config, show-logging
    reachability.ts   ping, traceroute (IOS layout)
    config.ts         all if-*, vlan-*, ip-route-* handlers
    olt.ts            olt-show-*
    host.ts           host-* handlers (Windows layout)
  format.ts           padEnd/padStart helpers, prefix<->mask, interface abbreviation, mac derivation, timestamp generation
  execute.ts          execute(), help()
  index.ts
  network/
    addressing.ts     ipToInt, cidrContains, longestPrefixMatch, ownerOfIp
    l2.ts             l2Reachable(), link lookup, VLAN/trunk/STP/err-disabled/duplex checks
    forwarding.ts     forward() — hop-by-hop L3 with ACLs
    dns.ts            resolveName()
    dhcp.ts           resolveHostAddressing()
    ontStatus.ts      deriveOntStatus() (uses item 2's pathLossDb)
  *.test.ts (one per file above)
```

## 4. Core contracts

### 4.1 Types (`types.ts`)
```ts
export type CliMode = 'user-exec' | 'priv-exec' | 'global-config' | 'interface-config' | 'vlan-config';
export type Endpoint = { kind: 'device'; deviceId: string } | { kind: 'host'; hostId: string };
export interface CliSession {
  endpoint: Endpoint;
  mode: CliMode;                 // hosts are always 'user-exec'
  contextInterfaceId?: string;   // interface-config
  contextVlanId?: number;        // vlan-config
}
export interface CliResult {
  output: string[];              // lines, no prompt, no echo (the terminal echoes)
  session: CliSession;           // next mode/context
  world: WorldState;             // same reference if unchanged; a clone if a config handler mutated
  prompt: string;                // prompt for the *next* line, from modePrompts[next mode]
  recognized: boolean;
  handlerId: string | null;
  caretColumn: number | null;    // for syntax errors: column (in the echoed prompt+command line) under which '^' sits
  simulatedSeconds: number;
  /** Structured facts for scoring's evidence rules (item 4). Never rendered. */
  facts: CliFact[];
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
  | { kind: 'ont-status-observed'; deviceId: string; ontId: string; status: OntStatus }
  | { kind: 'host-addressing-observed'; hostId: string; state: HostAddressingState['state'] }
  | { kind: 'config-changed'; deviceId: string; summary: string };
export interface HelpResult { candidates: Array<{ token: string; description: string; isParam: boolean }>; }
```

### 4.2 Entry points (`execute.ts`)
```ts
export function execute(world: WorldState, profiles: ProfileSet, session: CliSession, commandText: string): CliResult;
export function help(world: WorldState, profiles: ProfileSet, session: CliSession, partialText: string): HelpResult;
export function promptFor(profiles: ProfileSet, world: WorldState, session: CliSession): string;
```
`execute` resolves the vendor profile: device → `profiles` entry whose `id === device.vendorProfileId` (look in `oltVendor`, `switchVendor`; if neither matches, throw `UnknownVendorProfileError`); host → `profiles.hostShell`. Empty/whitespace input → `{ output: [], recognized: true, handlerId: null, simulatedSeconds: 0 }`. Input ending in `?` → returns `help()` candidates rendered one per line as `  ${token.padEnd(22)}${description}` and `recognized: true, simulatedSeconds: 0`.

### 4.3 Matching (`matcher.ts`)
`tokenize(text)`: trim, split on `/\s+/`, record each token's start column.
`matchCommand(entries, mode, tokens)`:
1. `candidates = entries.filter(e => e.modes.includes(mode))`.
2. For each candidate, walk pattern tokens `P[i]` against input `T[i]`:
   - `{...rest}`: captures `T[i..]` joined by single spaces; match complete.
   - `{name}`: requires `T[i]` present; captures it.
   - literal: `P[i].toLowerCase().startsWith(T[i].toLowerCase())`; record `exact = (P[i].toLowerCase() === T[i].toLowerCase())`.
   - Outcome per candidate: `full` (all pattern tokens consumed and no extra input tokens), `incomplete` (input ran out first), `extra` (input has more tokens than the pattern and no `{...rest}`), or `fail` at index `k` (first non-matching token).
3. If ≥1 `full`: keep those with the most exact literal matches; if exactly one remains → **matched**. Else → **ambiguous** (message `ambiguousCommand` with `{input}` = original text).
4. Else if ≥1 `incomplete` → **incomplete** (`incompleteCommand`).
5. Else → **syntax error** with `caretColumn = prompt.length + T[k].column` where `k` = the maximum fail index across candidates (the deepest point any candidate reached); output = `[' '.repeat(caretColumn) + '^', messages.syntaxError]`. (`extra` outcomes count as fail at index = pattern length.)
`buildHelp(entries, mode, tokens, endsWithSpace)`: candidates that are `incomplete` or prefix-consistent; the next pattern token of each is a candidate (`isParam` for `{x}`; render `{id}` as `WORD`, `{target}` as `WORD`, `{ip}` as `A.B.C.D`); dedupe by token; sort literals alphabetically, params last. This is what item 6's tap-token chips consume.

`simulatedSeconds`: `CLI_COMMAND_SECONDS = 15` for any recognized command except `ping` (15 + 2·failed echoes), `traceroute` (30 + 3·timed-out hops), `show running-config` (30). Unrecognized: 5.

## 5. Formatting rules (`format.ts`)

5.1 Derived MAC when absent: `macFromSeed(world.seed, deviceId, interfaceId)` → `createRng(deriveSeed(seed,'mac',deviceId,interfaceId))`, six bytes, first byte with the local bit set (`0x02`), rendered `xxxx.xxxx.xxxx`. Interface counters (packets/bytes) similarly from `deriveSeed(seed,'counters',…)`: packets ∈ [10 000, 5 000 000], bytes = packets·640, plus `crcErrors`/`lateCollisions` from state.
5.2 `abbrev(interfaceId, families)`: replace the family prefix with `abbrev` (`GigabitEthernet0/1` → `Gi0/1`); `cdpName` uses `cdpAbbrev` (`Gig 0/1`). Unknown family → unchanged.
5.3 `prefixToMask(24) = '255.255.255.0'`; `maskToPrefix`.
5.4 Log timestamps: line `i` (0-based) → `*Mar  1 ${hh}:${mm}:${ss}.${mmm}: ` with seconds = `240 + 37·i` (uptime style; deterministic).
5.5 Status words: `adminStatus === 'administratively-down'` ⇒ status `administratively down`, protocol `down`; else `lineStatus` for both; `err-disabled` when `portSecurity?.state === 'err-disabled'`.

## 6. Handler output layouts (exact)

Column widths use `padEnd` unless stated. `{…}` marks computed values.

**show-ip-interface-brief** — one header + one row per interface, order as in `device.interfaces`:
```
Interface              IP-Address      OK? Method Status                Protocol
{id:23}{ip ?? 'unassigned':16}YES {ip ? 'manual':'unset':7}{status:22}{protocol}
```
**show-interfaces-status** — physical interfaces only (families other than `Vlan`):
```
Port      Name               Status       Vlan       Duplex  Speed Type
{abbrev:10}{description ?? '':19}{status:13}{vlan:11}{duplex:8}{speed:6} {typeLabel}
```
status: `err-disabled` | `disabled` (admin down) | `connected` (line up) | `notconnect`. vlan: `routed` if `ipAddress`, `trunk` if mode trunk, else `accessVlan ?? 1`. duplex: connected & `'auto'` → `a-full`; not connected & auto → `auto`; else the word. speed: connected & auto → `a-{speedMbps}`; not connected & auto → `auto`; else `{speedMbps}`.

**show-interface-detail** `{id}` (accepts abbreviations: resolve `Gi0/1` → `GigabitEthernet0/1` via families; unknown → `% Invalid input detected at '^' marker.` with caret under the id):
```
{id} is {adminStatus==='administratively-down' ? 'administratively down' : lineStatus}, line protocol is {lineStatus}{lineStatus==='up' ? ' (connected)' : (errDisabled ? ' (err-disabled)' : ' (notconnect)')}
  Hardware is {typeLabel}, address is {mac} (bia {mac})
  Description: {description}                       ← only when set
  Internet address is {ip}/{prefix}                ← only when set
  MTU {mtu ?? 1500} bytes, BW {bandwidthKbit} Kbit/sec, DLY 10 usec,
     reliability 255/255, txload 1/255, rxload 1/255
  Encapsulation ARPA, loopback not set
  Keepalive set (10 sec)
  {Full|Half|Auto}-duplex, {speedMbps}Mb/s, media type is {typeLabel}
  input flow-control is off, output flow-control is unsupported
  Last input 00:00:01, output 00:00:00, output hang never
  Last clearing of "show interface" counters never
  Input queue: 0/75/0/0 (size/max/drops/flushes); Total output drops: 0
  5 minute input rate 1000 bits/sec, 2 packets/sec
  5 minute output rate 1000 bits/sec, 2 packets/sec
     {pkts} packets input, {bytes} bytes, 0 no buffer
     Received 0 broadcasts (0 multicasts)
     0 runts, 0 giants, 0 throttles
     {crc} input errors, {crc} CRC, 0 frame, 0 overrun, 0 ignored
     0 watchdog, 0 multicast, 0 pause input
     {pkts} packets output, {bytes} bytes, 0 underruns
     0 output errors, {lateCollisions} collisions, 0 interface resets
     0 unknown protocol drops
     0 babbles, {lateCollisions} late collision, 0 deferred
     0 lost carrier, 0 no carrier, 0 pause output
     0 output buffer failures, 0 output buffers swapped out
```
Emits fact `interface-observed`.

**show-transceiver-detail** — three blocks (temperature, Tx, Rx) for every interface with `transceiver?.present`, each:
```
                              High Alarm  High Warn  Low Warn   Low Alarm
           {Temperature | Optical Transmit Power | Optical Receive Power}
Port       ({Celsius|dBm})     Threshold   Threshold  Threshold  Threshold
---------  -----------------  ----------  ---------  ---------  ---------
{abbrev:11}{value:>6.1f} {flag:2}{t0:>12.1f}{t1:>11.1f}{t2:>11.1f}{t3:>11.1f}
```
flag: `++` if value > highAlarm, `+` if > highWarn, `--` if < lowAlarm, `-` if < lowWarn, else blank. Missing value → `N/A`. Preceded once by the fixed six-line header (“Transceiver monitoring is enabled for all interfaces.” … “The threshold values are calibrated.”). Emits `transceiver-observed` per interface.

**show-vlan-brief**:
```
VLAN Name                             Status    Ports
---- -------------------------------- --------- -------------------------------
{id:5}{name:33}active    {ports}
```
Rows: VLAN 1 `default` always first (even if absent from `vlans`), then `vlans` sorted by id. `ports` = comma+space list of `abbrev` for access-mode physical interfaces whose `accessVlan ?? 1 === id`. Emits `vlan-table-observed`.

**show-mac-address-table**:
```
          Mac Address Table
-------------------------------------------

Vlan    Mac Address       Type        Ports
----    -----------       --------    -----
{vlan:>4}    {mac:18}{'DYNAMIC':12}{abbrev}
Total Mac Addresses for this criterion: {n}
```
Entries = `device.macTable` ∪ derived: for each `NetworkLink` with `b.hostId` on this device where the host is currently L2-up (Section 7.2 link checks pass), `{ mac: host.macAddress, vlan: iface.accessVlan ?? 1, interfaceId }`; dedupe by mac; sort by vlan then mac. Emits `mac-table-observed`.

**show-ip-route** — fixed 10-line `Codes:` header (as printed by IOS 15; copy verbatim into `format.ts` as `IP_ROUTE_CODES_HEADER`), blank line, then:
`Gateway of last resort is {nextHop} to network 0.0.0.0` or `Gateway of last resort is not set`, blank line, then entries sorted by numeric network, default route first:
```
S*    0.0.0.0/0 [1/0] via {nextHop}
C        {network} is directly connected, {interfaceId}
L        {ip}/32 is directly connected, {interfaceId}
S        {network} [1/0] via {nextHop}
O        {network} [110/2] via {nextHop}, 00:10:00, {interfaceId}
```
Effective routes = connected routes derived from every interface with `ipAddress` (C + L lines) ∪ `routeTable` (dedupe by `network`; explicit `connected` entries without an interface IP still print as C with their `interfaceId`). Emits `route-table-observed`.

**show-ip-ospf-neighbor**:
```
Neighbor ID     Pri   State           Dead Time   Address         Interface
{neighborId:16}  1   {STATE/-:16}00:00:35    {peerIp ?? '0.0.0.0':16}{interfaceId}
```
STATE upper-cased: `FULL/DR`, `EXSTART/DR`, `2WAY/DROTHER`, etc. (`state.toUpperCase() + (state==='2way' ? '/DROTHER' : '/DR')`). `peerIp` = IP of the linked peer interface if a link exists.

**show-cdp-neighbors** — fixed 3-line capability header, blank, then:
```
Device ID        Local Intrfce     Holdtme    Capability  Platform  Port ID
{peerHostname:17}{cdpName(local):18}{holdtime:>3}{'':13}{caps:12}{platform:10}{cdpName(peer)}

Total cdp entries displayed : {n}
```
Neighbors = links whose other end is a device whose vendor profile has `cdpCapable` and whose both interfaces are admin/line up. caps by peer `role`: switch `S I`, l3-switch `R S I`, router `R`, others `H`. holdtime = 120 + (deriveSeed % 60).

**show-running-config** — generated, in this order, `!` separators as shown:
```
Building configuration...

Current configuration : {bytes} bytes
!
{osVersionLine}
!
hostname {hostname}
!
vlan {id}                    ← per vlan (excluding 1)
 name {name}
!
interface {id}               ← per interface, in device order
 description {description}
 switchport mode {mode}                          ← physical only
 switchport access vlan {accessVlan}             ← access mode, when set and ≠ 1
 switchport trunk native vlan {nativeVlan}       ← trunk, when set and ≠ 1
 switchport trunk allowed vlan {a,b,c}           ← trunk, when set
 switchport port-security maximum {maxMac}       ← when portSecurity.enabled
 switchport port-security
 duplex {duplex}                                 ← when ≠ auto
 speed {speedMbps}                               ← when duplex ≠ auto
 ip address {ip} {mask}                          ← when set
 ip helper-address {h}                           ← SVI Vlan{n}: one line per dhcp[vlan==n].helperAddresses
 shutdown                                        ← admin down
!
ip route {network} {mask} {nextHop}              ← per static/default routeTable entry
!
ip access-list extended {aclId}                  ← per ACL with structured match
 {action} {protocol} {srcCidr→ip wildcard} {dstCidr→ip wildcard}
!
{runningConfigLines verbatim}
!
end
```
`bytes` = total characters of all lines after this header line. Emits `route-table-observed`, `vlan-table-observed`.

**show-logging**:
```
Syslog logging: enabled (0 messages dropped, 0 messages rate-limited, 0 flushes, 0 overruns, xml disabled, filtering disabled)
    Console logging: level debugging, {n} messages logged, xml disabled, filtering disabled
    Buffer logging:  level debugging, {n} messages logged, xml disabled, filtering disabled

Log Buffer (8192 bytes):

{timestamp(i)}{logLines[i]}   ← per line
```
Emits `log-observed`.

**ping** `{target}` (IOS):
```
Type escape sequence to abort.
Sending 5, 100-byte ICMP Echos to {ip}, timeout is 2 seconds:
{glyphs}
Success rate is {pct} percent ({ok}/5), round-trip min/avg/max = 1/2/4 ms      ← omit the rtt clause when ok = 0
```
Resolution: if `target` is not dotted-quad → `resolveName()` (Section 7.4); unresolvable → single line `messages.unknownHost`. Glyphs from 5 runs of `forward()`; each run's glyph from the failure table in 7.3 (`!` delivered). Duplex-mismatch loss: per echo, `rng.next() < lossFraction` ⇒ `.`. Emits `ping` fact.

**traceroute**:
```
Type escape sequence to abort.
Tracing the route to {ip}
VRF info: (vrf in name/id, vrf out name/id)
  {hop:>1} {hopIp} 1 msec 1 msec 1 msec       ← per hop that answered (its ingress interface IP)
  {hop} {hopIp} !A !A !A                      ← acl-denied at that hop
  {hop}  *  *  *                              ← no answer; print up to 3 such lines after a dead end, then stop
```

**Config handlers** (all return a cloned, mutated world and emit `config-changed`):
- `enter-priv-exec` → mode change only. `enter-global-config` → output `[messages.enterConfig]`. `exit-mode`: interface/vlan-config → global-config; global-config → priv-exec; priv-exec → user-exec. `end-config` → priv-exec.
- `enter-interface-config {id}`: resolve abbreviation; unknown id → if it matches `/^Vlan(\d+)$/i` create an SVI `{ id:'Vlan{n}', adminStatus:'up', lineStatus:'up', speedMbps:1000, duplex:'auto', mode:'access' }`; else syntax error. Sets `contextInterfaceId`.
- `enter-vlan-config {id}`: creates the VLAN if missing with `name: 'VLAN{id:04d}'`; sets `contextVlanId`. `vlan-name {name}` renames.
- `if-switchport-mode {mode}` (`access|trunk`, else `% Invalid input`), `if-access-vlan {id}` (creates the VLAN if missing, IOS prints `% Access VLAN does not exist. Creating vlan {id}`), `if-trunk-allowed {list}` (replace; parse `1,10,20-30`), `if-trunk-allowed-add`, `if-trunk-native`, `if-shutdown` (adminStatus ← administratively-down, lineStatus ← down), `if-no-shutdown` (adminStatus ← up; lineStatus ← up **iff** the link peer is also up, or the interface is an SVI, or the interface has a host attached; **also clears `portSecurity.state` to `'ok'`** — this is how err-disabled is recovered), `if-duplex`, `if-speed` (`auto` ⇒ duplex/speed auto, else numeric), `if-ip-address {ip} {mask}`, `if-ip-helper {ip}` (adds to `dhcp[vlan of this SVI].helperAddresses`, creating the entry; only valid on `Vlan{n}` interfaces, else `% Invalid input`), `if-ip-helper-remove`, `if-description`.
- `ip-route-add {network} {mask} {nexthop}` → push `{ network: cidr, nextHop, source: mask==='0.0.0.0' ? 'default' : 'static' }` replacing any same-network entry; `ip-route-remove` filters it out.

**OLT handlers** (device must have `ponPorts`; otherwise `% No PON ports on this system`):
`olt-show-ont-status`:
```
ONT ID        Serial        Prov. Serial  Status      Rx (dBm)  OLT Rx (dBm)  PON
{ontId:14}{serial:14}{prov ?? '-':14}{status:12}{rx ?? '-':10}{oltRx ?? '-':14}{ponId}
```
`status` from `deriveOntStatus` (Section 7.6): `online | los | offline | unprovisioned | serial-mismatch | rogue`. Emits `ont-status-observed` per row.
`olt-show-pon-port`: `PON      Admin  Oper  ONTs  Online  LOS  Offline` rows per port; `Oper` is `down` if all ONTs are `los` or the port's feeder span is broken at its start.
`olt-show-pon-interface {id}`: per-port detail incl. `Tx power: {oltTxPowerDbm} dBm`, `Wavelength plan: {serviceDownstreamNm}/{serviceUpstreamNm} nm`, and the ONT table for that port.
`olt-show-alarms`: one line per derived alarm: `LOS ont {ontId}`, `DYING-GASP ont {ontId}` (unpowered), `SERIAL-MISMATCH ont {ontId}`, `ROGUE-ONT pon {ponId} suspect {ontId}`, `RX-HIGH ont {ontId}` (rx > receivePower.maxDbm); `No active alarms.` when none.

**Host handlers** (Windows layout):
`host-ipconfig`:
```

Windows IP Configuration


Ethernet adapter Ethernet:

   Connection-specific DNS Suffix  . : 
   IPv4 Address. . . . . . . . . . . : {ip}
   Subnet Mask . . . . . . . . . . . : {mask}
   Default Gateway . . . . . . . . . : {gateway}
```
APIPA state prints `Autoconfiguration IPv4 Address. . : 169.254.{x}.{y}` and an empty gateway. `/all` adds `Physical Address. . . . . . . . . : {MAC with dashes}`, `DHCP Enabled. . . . . . . . . . . : Yes|No`, `DNS Servers . . . . . . . . . . . : {dns}`. Emits `host-addressing-observed`.
`host-ping {target}`: resolve via the host's DNS (Section 7.4); unresolvable → `messages.unknownHost`. Then:
```

Pinging {target}{name ? ' [ip]' : ''} with 32 bytes of data:
Reply from {ip}: bytes=32 time={t}ms TTL={ttl}     ×4, or "Request timed out." / "Reply from {hopIp}: Destination net unreachable."
                                                 
Ping statistics for {ip}:
    Packets: Sent = 4, Received = {n}, Lost = {4-n} ({pct}% loss),
Approximate round trip times in milli-seconds:              ← only when n > 0
    Minimum = 1ms, Maximum = 4ms, Average = 2ms
```
`host-nslookup {name}`:
```
Server:  {dnsServerName ?? 'UnKnown'}
Address:  {dnsServerIp}

Name:    {name}
Address:  {resolvedIp}
```
Down server: `*** UnKnown can't find {name}: No response from server` after `DNS request timed out.` ×2 (and `simulatedSeconds += 8`). Degraded: 50 % (seeded) of lookups time out. Emits `dns-lookup` fact.
`host-tracert {target}`: `Tracing route to {ip} over a maximum of 30 hops` then `  {n}    <1 ms    <1 ms    <1 ms  {hopIp}` / `  {n}     *        *        *     Request timed out.`, ending `Trace complete.`

## 7. Network semantics (`network/`)

### 7.1 Addressing (`addressing.ts`)
`ipToInt`, `intToIp`, `cidrContains(cidr, ip)`, `longestPrefixMatch(routes, ip)` (prefer longest prefix; tie → first), `ownerOfIp(world, ip): { kind:'device-interface', deviceId, interfaceId } | { kind:'host', hostId } | null` (hosts by resolved addressing, Section 7.5).

### 7.2 Layer 2 (`l2.ts`)
`linkFor(world, deviceId, interfaceId): NetworkLink | null`. `interfaceUsable(iface)`: admin up ∧ line up ∧ `portSecurity?.state !== 'err-disabled'` ∧ `stpState !== 'blocking'` ∧ `stpState !== 'disabled'`.
`vlanCrossesLink(link, vlan)`: both interfaces usable; if both access: `a.accessVlan ?? 1 === vlan && b.accessVlan ?? 1 === vlan`; both trunk: `vlan ∈ allowed(a) ∧ vlan ∈ allowed(b)` (undefined allowed ⇒ all) ∧ NOT (`vlan === native(a) XOR vlan === native(b)`) (a native mismatch strands exactly the two native VLANs); access↔trunk: `vlan === access side's accessVlan ∧ vlan ∈ trunk allowed ∧ vlan !== trunk native`. `linkLossFraction(link)`: `0.4` if the two sides' effective duplex differ (`auto` on both ⇒ full; `auto` vs explicit ⇒ the explicit one's counterpart half ⇒ mismatch), else 0.
`l2Reachable(world, from: L2Attachment, to: L2Attachment, vlan): { ok: boolean; lossFraction: number; blockedAt?: string }` — BFS over devices starting at `from.deviceId` restricted to links where `vlanCrossesLink`; `L2Attachment = { deviceId, interfaceId? }`. A host attached to a switch port: attachment is that port and vlan is its `accessVlan ?? 1`. A host attached to an ONT: attachment is `{ deviceId: olt.id, interfaceId: pon.id }` with `vlan = host.vlan`, and it is usable only if `deriveOntStatus(...) === 'online'` (Section 7.6) — **this is where optical faults become logical symptoms**.

### 7.3 Forwarding (`forwarding.ts`)
```ts
export type FailureAt = 'source-no-route' | 'source-interface-down' | 'l2-blocked' | 'next-hop-unreachable' | 'acl-denied' | 'no-route-at-hop' | 'destination-unreachable' | 'ttl-exceeded';
export interface Hop { deviceId: string; ingressIp: string | null; }
export function forward(world, src: Endpoint, dstIp: string, protocol: 'icmp', ttlMax = 30): { delivered: boolean; hops: Hop[]; failure?: { at: FailureAt; hopIndex: number; detail: string }; lossFraction: number };
```
Algorithm: `current = src`, `hopIndex = 0`, `lossFraction = 0`.
- Host source: addressing must be assigned (else `source-no-route`). If `cidrContains(subnet, dstIp)` → L2 deliver to `ownerOfIp(dstIp)` in the host's VLAN (`l2-blocked` on failure); else next hop = gateway; L2 deliver to the gateway's owner interface (`next-hop-unreachable` if no owner or L2 blocked).
- Device hop: apply inbound ACLs on the ingress interface (rules with `appliedTo` matching `{ingress,'in'}`, first match wins; `deny` ⇒ `acl-denied`). If any interface owns `dstIp` → delivered. `route = longestPrefixMatch(effectiveRoutes, dstIp)`; none ⇒ `no-route-at-hop` (or `source-no-route` at hop 0). Egress interface = route.interfaceId, or the interface whose subnet contains `route.nextHop`; must be usable (`source-interface-down` at hop 0 / `next-hop-unreachable`). Outbound ACL check on egress. Connected route ⇒ L2 deliver to `ownerOfIp(dstIp)` within the egress interface's VLAN (SVI `Vlan{n}` ⇒ vlan n; routed port ⇒ its link only); no owner ⇒ `destination-unreachable`. Otherwise L2 deliver to `ownerOfIp(nextHop)` (must be a device interface) and continue with that device; `lossFraction = max(lossFraction, linkLossFraction)`. `hopIndex++`; exceed `ttlMax` ⇒ `ttl-exceeded`.
Glyph table (IOS ping): delivered `!`; `acl-denied`, `no-route-at-hop` → `U`; everything else → `.`. Windows: delivered `Reply from`; `acl-denied`/`no-route-at-hop` → `Reply from {hopIp}: Destination net unreachable.`; else `Request timed out.`

### 7.4 DNS (`dns.ts`)
`resolveName(world, requester: Endpoint, name): { ip: string | null; serverIp: string | null; stale: boolean; serverHealth: string | null; timedOut: boolean }`.
Server IP: host ⇒ its assigned `dns`; device ⇒ `dnsResolverIp`; if a device has none but has its own `dnsRecords`, answer locally (static host table). Server device = `ownerOfIp(serverIp)` device; `forward(requester → serverIp)` must deliver (else `timedOut`). Health `'down'` ⇒ `timedOut`; `'degraded'` ⇒ `timedOut` when `rng.next() < 0.5` (rng from `deriveSeed(world.seed,'dns',name, String(attemptCounter))` — the attempt counter is the action index, passed in by the caller so repeated lookups differ deterministically). Record lookup case-insensitive: `stale ? resolvedIp : actualIp`; missing ⇒ `ip: null`.

### 7.5 DHCP-derived host addressing (`dhcp.ts`)
```ts
export type HostAddressingState =
  | { state: 'static' | 'dhcp-assigned'; ip; prefixLength; gateway; dns; dhcpServerIp?: string }
  | { state: 'apipa'; ip: string; reason: 'no-link' | 'no-dhcp' | 'no-helper' | 'scope-exhausted' | 'server-unreachable' };
export function resolveHostAddressing(world, host): HostAddressingState;
```
Static ⇒ as configured. DHCP: find the gateway device: the device with an SVI `Vlan{v}` (v = host's effective VLAN) or a routed port that is L2-reachable from the host's attachment (`no-link` otherwise). `entry = gateway.dhcp?.find(d => d.vlan === v)`; none ⇒ `no-dhcp`. If `entry.helperAddresses.length === 0` and `!entry.scope` ⇒ `no-helper`. If helpers exist: server = `ownerOfIp(helper[0])`; `forward(gateway → helper[0])` must deliver ⇒ else `server-unreachable`. `scope = entry.scope` (required when helpers exist — validator, item 5); `leased >= poolSize` ⇒ `scope-exhausted`. Assigned `ip = base(scope.network) + 100 + indexOf(host among hosts on this vlan)`, `gateway = entry.rogueDetected ? rogueGateway : SVI ip`, `dns = entry.dnsServerIp ?? SVI ip`. APIPA ip = `169.254.{seed%254+1}.{hostIndex+1}`.

### 7.6 ONT status (`ontStatus.ts`)
```ts
export type OntStatus = 'online' | 'los' | 'offline' | 'unprovisioned' | 'serial-mismatch' | 'rogue';
export function deriveOntStatus(world, network, olt: NetworkDeviceConfig, pon: PonPortState, ont: OntRecord): { status: OntStatus; rxAtOntDbm: number | null; rxAtOltDbm: number | null; alarms: string[] };
```
Order: `pon.adminStatus === 'administratively-down'` ⇒ `los`; any *other* ONT on this PON with `misbehaving` ⇒ `los` (the rogue itself ⇒ `rogue`); `ontNode.attributes.powered === false` ⇒ `offline`; `pathLossDb(oltNode → ontNode, serviceDownstreamNm)`: `broken` ⇒ `los`; `rxAtOnt = oltTxPowerDbm − lossDb`; `rxAtOnt < lossOfSignalBelowDbm` ⇒ `los`; `ont.provisionedSerial && ont.provisionedSerial !== ont.serial` ⇒ `serial-mismatch`; no `provisionedSerial` and the scenario marks the ONT as requiring provisioning (`ontNode.attributes.requiresProvisioning === true`) ⇒ `unprovisioned`; else `online`. `rxAtOlt = ONT_TX_POWER_DBM (network profile amendment `ontTxPowerDbm`, default 4.0) − pathLossDb(ontNode → oltNode, serviceUpstreamNm)`.

## 8. Required tests (exact)

matcher.test.ts
1. `sh ip int br` matches `show ip interface brief` (abbreviation); `show ip` is incomplete; `show ip interfaces brief` fails at token index 2 and the caret column equals `prompt.length + column of 'interfaces'`; the output's second line equals `messages.syntaxError` verbatim from the profile (not a hardcoded string — test by loading a fixture vendor profile with a *different* syntax error string and asserting that string appears).
2. `s` in priv-exec is ambiguous (`show`, `shutdown` is interface-only so *not* ambiguous there; use `sh` vs `speed` in interface-config to assert the ambiguous template with `{input}` substituted).
3. `help` for `show ip ?` returns `interface`, `route`, `ospf` (sorted) and for `interface ?` returns a `WORD` param candidate.

showInterfaces.test.ts
4. `show ip interface brief` on a device with `GigabitEthernet0/2` administratively down yields the row `GigabitEthernet0/2     unassigned      YES unset  administratively down down` (exact string).
5. `show interfaces status` shows `err-disabled` for a port after the `port-security-violation-errdisabled` fault, and `a-full`/`a-1000` for a connected auto port.
6. `show interfaces transceiver detail` flags `--` when `rxPowerDbm` is below the profile's Rx low alarm; the threshold numbers come from the vendor profile (fixture with different thresholds changes the output).

config.test.ts
7. `configure terminal` → `interface Gi0/1` → `switchport access vlan 20` → `end`: the returned world has `accessVlan 20`; the original world object is unchanged (`toEqual` its snapshot); prompts progress `#`, `(config)#`, `(config-if)#`, `#`.
8. `shutdown` / `no shutdown` on an err-disabled port clears `portSecurity.state` to `'ok'` and brings line status up when the link peer is up.
9. `ip route 0.0.0.0 0.0.0.0 10.0.0.1` then `show ip route` prints `S*    0.0.0.0/0 [1/0] via 10.0.0.1` and `Gateway of last resort is 10.0.0.1 to network 0.0.0.0`.
10. `show running-config` after `ip helper-address 10.0.0.50` on `interface Vlan10` contains ` ip helper-address 10.0.0.50` under `interface Vlan10`.

forwarding.test.ts (build one fixture topology: host ↔ ACCESS-SW (Gi0/1 access vlan 10; Gi0/24 trunk) ↔ DIST-RTR (SVI Vlan10 10.10.0.1/24, Gi0/1 10.0.0.2/30 ↔ EDGE 10.0.0.1, default route) ↔ EDGE-RTR (8.8.8.8 owned by a "server" device beyond it); DNS server 10.0.0.50 with a record `portal.isp.net → 203.0.113.10`)
11. Baseline: host `ping 10.10.0.1` 4/4; `ping 8.8.8.8` 4/4; `ping portal.isp.net` 4/4.
12. `vlan-wrong-access-port` (actualVlan 99) ⇒ host addressing is `apipa/no-link`... (no SVI for 99) and `ping 10.10.0.1` from the host is 0/4; from the switch, `show mac address-table` no longer lists the host.
13. `trunk-native-vlan-mismatch` on the trunk with the host's VLAN equal to one side's native ⇒ `l2Reachable` false; with a non-native VLAN ⇒ true.
14. `dhcp-relay-missing-helper` ⇒ host `ipconfig` shows an `Autoconfiguration IPv4 Address` 169.254.x.y and no gateway; `dhcp-scope-exhausted` ⇒ same with reason `scope-exhausted`; `rogue-dhcp-server` ⇒ `ipconfig` gateway equals the rogue IP and `ping 8.8.8.8` is 0/4 while `ping 10.10.0.1` is 4/4.
15. `default-route-missing-or-wrong` (missing) on DIST-RTR ⇒ host `ping 8.8.8.8` prints `U` glyphs from the router hop in the IOS variant (run from ACCESS-SW: `Reply … Destination net unreachable` from the host), `ping 10.10.0.1` still succeeds.
16. `acl-silent-drop` with `match { protocol:'icmp', src:'10.10.0.0/24', dst:'0.0.0.0/0' }` applied `Vlan10 in` ⇒ host `ping 8.8.8.8` fails with `acl-denied` while `ping 10.10.0.1` (owned by the SVI, checked before ACL? **No** — ACL applies first; specify: the SVI-owned address is also denied, matching IOS behavior) fails too; a `tcp` rule leaves ICMP unaffected.
17. **Isolation methodology proof:** with `dns-stale-record` (`portal.isp.net` → stale 203.0.113.99) on the DNS server: host `ping 203.0.113.10` 4/4, `ping portal.isp.net` 0/4 (`Request timed out.` to 203.0.113.99), `nslookup portal.isp.net` shows `203.0.113.99`; the `ping` facts differ in `resolvedIp`. With `dns-server-unresponsive` (`down`): `ping portal.isp.net` prints the host `unknownHost` message and `nslookup` prints `DNS request timed out.` while `ping 203.0.113.10` is still 4/4.
18. `duplex-speed-mismatch` on the host's port ⇒ `ping 10.10.0.1` returns a success rate strictly between 0 and 100 and `show interfaces Gi0/1` shows the configured CRC/late-collision counts.
19. `ospf-exstart-mtu-mismatch` ⇒ `show ip ospf neighbor` shows `EXSTART/DR`, `show interfaces` shows the local MTU, and `show logging` contains the ADJCHG line.

ontStatus.test.ts (fixture: OLT node + device with one PON port, feeder span 2 km → splitter 1x32 → drop 300 m → ONT node; host behind the ONT on vlan 100; OLT uplink trunk to DIST-RTR)
20. Baseline `show ont status` row is `online` with `Rx` ≈ `4.0 − (0.42 + 17.5 + 0.06) ± 0.3`; host behind the ONT pings its gateway 4/4.
21. `macrobend` severe on the drop ⇒ status `los`, `show alarms` lists `LOS`, host ping 0/4 (`no-link`). `fiber-break` on the feeder ⇒ every ONT on the port `los` and `show pon port` Oper `down`.
22. `ont-unpowered` ⇒ `offline` and `DYING-GASP` alarm while the power meter at the ONT input (item 2) still reads normal — the two instruments disagree in exactly the way that isolates the ONT.
23. `ont-serial-mismatch` ⇒ `serial-mismatch` and the `Prov. Serial` column shows the provisioned value; `rogue-ont` ⇒ the rogue shows `rogue`, every other ONT on that PON `los`, and `show alarms` names the suspect.
24. `transceiver-rx-power-low` on the OLT uplink ⇒ `show interfaces transceiver detail` on the OLT flags `--`, and (if the fault also sets the uplink line down — it does not; the scenario author does) — assert only the flag and the log line.

execute.test.ts
25. Unrecognized command on the OLT yields `% Invalid command.` (the OLT profile's template) while the same input on the switch yields the IOS template; the host shell yields the Windows "is not recognized" text with the input substituted.
26. `execute` on a non-config command returns the *same* `world` reference; on a config command returns a different reference and leaves the input untouched.
27. Every `handler` id referenced by every bundled vendor YAML exists in `HANDLER_IDS` (registry cross-check).

## 9. Definition of done
All tests pass; `tsc -b` clean; the three vendor YAMLs validate through the amended schema; item 1's tests pass with the two documented adjustments (profile-set literals gain `hostShell`; the "15 network kinds" assertion becomes `≥ 15`).

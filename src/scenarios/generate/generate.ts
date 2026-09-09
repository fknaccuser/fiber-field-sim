/**
 * Procedural scenario generator. Given `GeneratorParams` (encoded in the scenario id) and
 * a seed, builds a complete, valid `ScenarioDefinition`: a South-OC PON plant sized to
 * the request, one fault plan drawn from the taxonomy families appropriate to the tier,
 * NOC ticket rows, plant records, red herrings, hints, and -- crucially -- a reference
 * solution that the validator (item 5) can replay to a perfect score. Everything is
 * derived from one RNG stream, so id + seed reproduces the definition exactly.
 */
import type { Intent } from '../../session/types';
import { rationaleForStep } from '../rationales';
import type { z } from 'zod';
import { createRng, deriveSeed } from '../../world';
import type { Rng } from '../../world';
import { ScenarioDefinitionSchema } from '../schema';
import type { ScenarioDefinition } from '../schema';
import { FOCUS_BY_TIER, generatedId } from './params';
import type { ConcreteFocus, GeneratorParams, GeneratorTier } from './params';
import { CROSS_STREETS, HINTS, STREETS, SYMPTOMS } from './names';

type Draft = z.input<typeof ScenarioDefinitionSchema>;
type DraftNode = Draft['topology']['nodes'][number];
type DraftSpan = Draft['topology']['spans'][number];
type DraftDevice = NonNullable<Draft['devices']>[number];
type DraftLink = NonNullable<Draft['links']>[number];
type DraftHost = NonNullable<Draft['hosts']>[number];
type DraftRecord = NonNullable<Draft['plantRecords']>[number];
type DraftReport = NonNullable<Draft['nocReports']>[number];
type DraftFault = NonNullable<Draft['faults']>[number];
type DraftStep = Draft['referenceSolution']['steps'][number];
type DraftClaim = NonNullable<Extract<DraftStep, { type: 'diagnosis' }>['diagnosis']['claims']>[number];
type ExpectedClaim = NonNullable<Draft['referenceSolution']['expectedClaims']>[number];
type DraftEvent = NonNullable<DraftSpan['events']>[number];
type TravelPair = { from: string; to: string; seconds: number };

export type PlanKind =
  | 'ont-unpowered'
  | 'connector-dirty'
  | 'macrobend'
  | 'fiber-break-dist'
  | 'fiber-break-feeder'
  | 'fusion-splice-degraded'
  | 'wrong-tube-continuity'
  | 'ont-serial-mismatch'
  | 'transceiver-rx-power-low'
  | 'dhcp-scope-exhausted'
  | 'rogue-ont'
  | 'dns-server-unresponsive'
  | 'locate-ticket-expired';

const PLANS_BY_FOCUS: Record<ConcreteFocus, Array<{ kind: PlanKind; minTier: GeneratorTier; maxTier: GeneratorTier }>> = {
  cpe: [{ kind: 'ont-unpowered', minTier: 1, maxTier: 3 }],
  drop: [
    { kind: 'connector-dirty', minTier: 2, maxTier: 4 },
    { kind: 'macrobend', minTier: 2, maxTier: 4 },
  ],
  plant: [
    { kind: 'fiber-break-dist', minTier: 3, maxTier: 4 },
    { kind: 'fusion-splice-degraded', minTier: 3, maxTier: 5 },
    { kind: 'fiber-break-feeder', minTier: 4, maxTier: 5 },
    { kind: 'wrong-tube-continuity', minTier: 4, maxTier: 5 },
  ],
  network: [
    { kind: 'ont-serial-mismatch', minTier: 2, maxTier: 3 },
    { kind: 'transceiver-rx-power-low', minTier: 2, maxTier: 4 },
    { kind: 'dhcp-scope-exhausted', minTier: 3, maxTier: 4 },
    { kind: 'rogue-ont', minTier: 5, maxTier: 5 },
    { kind: 'dns-server-unresponsive', minTier: 5, maxTier: 5 },
  ],
  compliance: [{ kind: 'locate-ticket-expired', minTier: 3, maxTier: 4 }],
};

export const TODAY = '2026-09-05';

const PROFILES = {
  network: 'xgs-pon-default',
  oltVendor: 'olt-calix-e7-2',
  switchVendor: 'switch-cisco-ios',
  hostShell: 'host-windows',
  equipment: 'hexatronic-commscope-default',
  otdrInstrument: 'otdr-exfo-maxtester-730c',
  region: 'ca-south-oc-digalert',
};

const OLT_ID = 'olt-1';
const OLT_DEV = 'olt-1-dev';
const DIST_RTR = 'dist-rtr-1';
const YARD_ID = 'yard-1';

// --- Plant model ----------------------------------------------------------------------

interface Port {
  index: number;
  napId: string;
  napNo: number;
  portNo: number;
  termId: string;
  distSpanId: string;
  dropSpanId: string;
  ontId: string;
  premId: string;
  custId: string;
  hostId: string;
  address: string;
  street: string;
  distLen: number;
  distSpliceAt: number | null;
  dropLen: number;
  nidPos: number;
  hasNidEvent: boolean;
  ponOntId: string;
  serial: string;
}

interface Hub {
  letter: string;
  fdhId: string;
  splitterId: string;
  street: string;
  cross: string;
  /** Feeder segment arriving at the splitter (the span a feeder-side fault sits on). */
  feederInSpanId: string;
  closureId: string | null;
  ports: Port[];
  ponPortId: string;
  ponStrand?: { tubeColor: 'blue'; fiberColor: 'blue' | 'orange' };
}

interface Plant {
  hubs: Hub[];
  nodes: DraftNode[];
  spans: DraftSpan[];
  /** Present only for the wrong-roll plan: the stranded feeder and the closure that splices it. */
  roll: { closureId: string; feederMainId: string; toB: string; toC: string } | null;
  hasYard: boolean;
}

const APC = (id: string, positionMeters: number, lossDb = 0.3): DraftEvent => ({ id, kind: 'connector-apc', positionMeters, lossDb, reflectanceDb: -60 });

function pick<T>(rng: Rng, items: readonly T[]): T {
  return rng.pick(items as T[]);
}

function houseNumber(rng: Rng): number {
  return rng.int(1, 9) * 100 + rng.int(1, 48);
}

function serialFor(rng: Rng): string {
  const hex = '0123456789ABCDEF';
  let s = 'CXNK00';
  for (let i = 0; i < 6; i++) s += hex[rng.int(0, 15)];
  return s;
}

function buildPlant(rng: Rng, params: GeneratorParams, plan: PlanKind): Plant {
  const nodes: DraftNode[] = [];
  const spans: DraftSpan[] = [];
  const hubs: Hub[] = [];
  const roll = plan === 'wrong-tube-continuity';
  const hubCount = roll || params.size === 'large' ? 2 : 1;
  const portsPerHub = params.size === 'small' ? 2 : params.size === 'medium' ? rng.int(3, 4) : 3;
  const hasYard = params.tier >= 2;

  nodes.push({ id: OLT_ID, kind: 'olt', label: `POP ${rng.int(1, 4)} — OLT rack` });
  if (hasYard) nodes.push({ id: YARD_ID, kind: 'yard', label: 'Truck yard' });

  const streetPool = [...STREETS];
  const takeStreet = () => streetPool.splice(rng.int(0, streetPool.length - 1), 1)[0];
  const letters = roll ? ['B', 'C'] : ['A', 'B'];

  let rollInfo: Plant['roll'] = null;
  if (roll) {
    const closureId = `cl-${rng.int(3, 9)}`;
    const feederMainId = 'sp-feeder-main';
    const toB = 'sp-cl-fdhb';
    const toC = 'sp-cl-fdhc';
    nodes.push({
      id: closureId,
      kind: 'splice-closure',
      label: `Closure ${closureId.slice(3)} — ${pick(rng, CROSS_STREETS)} @ ${pick(rng, CROSS_STREETS)}`,
      attributes: {
        handhole: true,
        spliceMap: [
          { fromSpanId: feederMainId, fromStrand: { tubeColor: 'blue', fiberColor: 'blue' }, toSpanId: toC, toStrand: { tubeColor: 'blue', fiberColor: 'blue' } },
          { fromSpanId: feederMainId, fromStrand: { tubeColor: 'blue', fiberColor: 'green' }, toSpanId: toB, toStrand: { tubeColor: 'blue', fiberColor: 'orange' } },
        ],
      },
    });
    const feederLen = rng.int(1700, 2400);
    spans.push({
      id: feederMainId,
      fromNodeId: OLT_ID,
      toNodeId: closureId,
      lengthMeters: feederLen,
      randomize: { lengthMeters: { min: feederLen - 100, max: feederLen + 100 } },
      strands: [
        { tubeColor: 'blue', fiberColor: 'blue', role: 'feeder' },
        { tubeColor: 'blue', fiberColor: 'orange', role: 'distribution' },
        { tubeColor: 'blue', fiberColor: 'green', role: 'dark' },
        { tubeColor: 'blue', fiberColor: 'brown', role: 'spare' },
      ],
      events: [{ ...APC('ev-panel-main', 0, 0.25) }],
    });
    rollInfo = { closureId, feederMainId, toB, toC };
  }

  for (let h = 0; h < hubCount; h++) {
    const letter = letters[h];
    const l = letter.toLowerCase();
    const street = takeStreet();
    const cross = pick(rng, CROSS_STREETS);
    const fdhId = `fdh-${l}`;
    const splitterId = `fdh-${l}-spl1`;
    nodes.push({ id: fdhId, kind: 'fdh', label: `FDH ${letter} — ${street} & ${cross}`, equipmentRef: 'fdh-cabinet-450-series' });
    nodes.push({ id: splitterId, kind: 'splitter', label: `FDH ${letter} Splitter 1`, attributes: { splitRatio: '1x32', cabinetNodeId: fdhId } });

    let feederInSpanId: string;
    let closureId: string | null = null;
    let ponStrand: Hub['ponStrand'];
    if (roll && rollInfo) {
      const isB = letter === 'B';
      feederInSpanId = isB ? rollInfo.toB : rollInfo.toC;
      closureId = rollInfo.closureId;
      ponStrand = { tubeColor: 'blue', fiberColor: isB ? 'orange' : 'blue' };
      const len = rng.int(380, 700);
      spans.push({
        id: feederInSpanId,
        fromNodeId: rollInfo.closureId,
        toNodeId: splitterId,
        lengthMeters: len,
        strands: [{ tubeColor: 'blue', fiberColor: isB ? 'orange' : 'blue', role: isB ? 'distribution' : 'feeder' }],
        events: [APC(`ev-fdh${l}-in`, len)],
      });
    } else if (params.tier >= 2) {
      closureId = `cl-${l}`;
      nodes.push({ id: closureId, kind: 'splice-closure', label: `Closure ${letter}1 — ${cross} handhole`, attributes: { handhole: true } });
      const len1 = rng.int(1200, 2200);
      const len2 = rng.int(500, 1100);
      const spliceAt = Math.round(len1 * (0.45 + rng.next() * 0.2));
      spans.push({
        id: `sp-feeder-${l}1`,
        fromNodeId: OLT_ID,
        toNodeId: closureId,
        lengthMeters: len1,
        randomize: { lengthMeters: { min: len1 - 80, max: len1 + 80 } },
        events: [APC(`ev-panel-${l}`, 0, 0.25), { id: `ev-f${l}-splice`, kind: 'fusion-splice', positionMeters: spliceAt, lossDb: 0.05 }],
      });
      feederInSpanId = `sp-feeder-${l}2`;
      spans.push({ id: feederInSpanId, fromNodeId: closureId, toNodeId: splitterId, lengthMeters: len2, events: [APC(`ev-fdh${l}-in`, len2)] });
    } else {
      feederInSpanId = `sp-feeder-${l}`;
      const len = rng.int(1500, 2600);
      const spliceAt = Math.round(len * (0.45 + rng.next() * 0.2));
      spans.push({
        id: feederInSpanId,
        fromNodeId: OLT_ID,
        toNodeId: splitterId,
        lengthMeters: len,
        randomize: { lengthMeters: { min: len - 80, max: len + 80 } },
        events: [APC(`ev-panel-${l}`, 0, 0.25), { id: `ev-f${l}-splice`, kind: 'fusion-splice', positionMeters: spliceAt, lossDb: 0.05 }],
      });
    }

    const ports: Port[] = [];
    const napStreets = [street, takeStreet()];
    const usedNumbers = new Set<number>();
    for (let p = 0; p < portsPerHub; p++) {
      const napNo = Math.floor(p / 2) + 1;
      const portNo = (p % 2) + 1;
      const napId = `nap-${l}-${napNo}`;
      const pStreet = napStreets[napNo % 2 === 1 ? 0 : 1] ?? street;
      let number = houseNumber(rng);
      while (usedNumbers.has(number)) number = houseNumber(rng);
      usedNumbers.add(number);
      const address = `${number} ${pStreet}`;
      const key = `${l}-${address.split(' ')[0]}`;
      const termId = `term-${key}`;
      const ontId = `ont-${key}`;
      const premId = `prem-${key}`;
      const distSpanId = `sp-dist-${key}`;
      const dropSpanId = `sp-drop-${key}`;
      const distLen = rng.int(320, 1150);
      const hasSplice = rng.next() < 0.4;
      const distSpliceAt = hasSplice ? Math.round(distLen * (0.35 + rng.next() * 0.3)) : null;
      const dropLen = rng.int(40, 120);
      const nidPos = Math.round(dropLen * (0.55 + rng.next() * 0.15));

      nodes.push({ id: termId, kind: 'terminal', label: `NAP ${letter}-${napNo}, port to ${address}`, equipmentRef: 'distribution-terminal-32', attributes: { napId, portNo, street: pStreet } });
      nodes.push({ id: ontId, kind: 'ont', label: `ONT — ${address}`, attributes: { powered: true } });
      nodes.push({ id: premId, kind: 'customer-premise', label: address });

      const distEvents: DraftEvent[] = [APC(`ev-${key}-out`, 0)];
      if (distSpliceAt !== null) distEvents.push({ id: `ev-${key}-splice`, kind: 'fusion-splice', positionMeters: distSpliceAt, lossDb: Math.round((0.04 + rng.next() * 0.04) * 100) / 100 });
      spans.push({ id: distSpanId, fromNodeId: splitterId, toNodeId: termId, lengthMeters: distLen, events: distEvents });

      const port: Port = {
        index: p,
        napId,
        napNo,
        portNo,
        termId,
        distSpanId,
        dropSpanId,
        ontId,
        premId,
        custId: `cust-${key}`,
        hostId: `laptop-${key}`,
        address,
        street: pStreet,
        distLen,
        distSpliceAt,
        dropLen,
        nidPos,
        hasNidEvent: true,
        ponOntId: '',
        serial: serialFor(rng),
      };
      ports.push(port);
    }

    hubs.push({ letter, fdhId, splitterId, street, cross, feederInSpanId, closureId, ports, ponPortId: `1/1/xp${h + 1}`, ponStrand });
  }

  for (const hub of hubs) {
    hub.ports.forEach((port, i) => {
      port.ponOntId = `${hub.ponPortId}/${i + 1}`;
    });
  }

  return { hubs, nodes, spans, roll: rollInfo, hasYard };
}

/** Drop spans are added after the plan is chosen so a dirty-connector plan can leave the NID connector out of the faulted drop (the fault event *is* that connector). */
function addDropSpans(plant: Plant, faultedDrop: string | null): void {
  for (const hub of plant.hubs) {
    for (const port of hub.ports) {
      const key = port.dropSpanId.slice('sp-drop-'.length);
      const events: DraftEvent[] = [APC(`ev-${key}-a`, 0)];
      if (port.dropSpanId !== faultedDrop) events.push(APC(`ev-${key}-nid`, port.nidPos));
      else port.hasNidEvent = false;
      events.push(APC(`ev-${key}-b`, port.dropLen));
      plant.spans.push({ id: port.dropSpanId, fromNodeId: port.termId, toNodeId: port.ontId, lengthMeters: port.dropLen, events });
    }
  }
}

// --- Devices, hosts, links --------------------------------------------------------------

function buildDevices(plant: Plant, tier: GeneratorTier, leased: number): { devices: DraftDevice[]; links: DraftLink[]; hosts: DraftHost[] } {
  const ponPorts: NonNullable<DraftDevice['ponPorts']> = plant.hubs.map((hub) => ({
    id: hub.ponPortId,
    adminStatus: 'up',
    spanId: plant.roll ? plant.roll.feederMainId : hub.feederInSpanId.replace(/2$/, '1').replace(/^sp-feeder-([a-z])1$/, 'sp-feeder-$11'),
    strand: hub.ponStrand,
    onts: hub.ports.map((p) => ({ ontId: p.ponOntId, serial: p.serial, provisionedSerial: p.serial, ontNodeId: p.ontId })),
  }));
  // The PON port's span must be the one leaving the OLT node itself.
  for (const port of ponPorts) {
    const leaving = plant.spans.find((s) => s.fromNodeId === OLT_ID && (s.id === port.spanId || plant.hubs.some((h) => h.ponPortId === port.id && reaches(plant, s.id, h.splitterId))));
    if (leaving) port.spanId = leaving.id;
  }

  const olt: DraftDevice = {
    id: OLT_DEV,
    hostname: 'OLT-POP1-E72-1',
    vendorProfileId: 'olt-calix-e7-2',
    role: 'olt',
    platform: 'Calix E7-2',
    topologyNodeId: OLT_ID,
    interfaces: [
      { id: 'TenGigabitEthernet1/1', adminStatus: 'up', lineStatus: 'up', speedMbps: 10000, duplex: 'full', mode: 'trunk', allowedVlans: [100], nativeVlan: 1, transceiver: { present: true, rxPowerDbm: -8.2, txPowerDbm: 2.1, temperatureC: 38 } },
    ],
    vlans: [],
    macTable: [],
    routeTable: [],
    ponPorts,
  };

  const distRtr: DraftDevice = {
    id: DIST_RTR,
    hostname: 'DIST-RTR-1',
    vendorProfileId: 'switch-cisco-ios',
    role: 'l3-switch',
    platform: 'C9300-24T',
    interfaces: [
      { id: 'TenGigabitEthernet1/0/1', adminStatus: 'up', lineStatus: 'up', speedMbps: 10000, duplex: 'full', mode: 'trunk', allowedVlans: [100], nativeVlan: 1, transceiver: { present: true, rxPowerDbm: -7.9, txPowerDbm: 1.8, temperatureC: 41 } },
      { id: 'Vlan100', adminStatus: 'up', lineStatus: 'up', speedMbps: 1000, duplex: 'auto', mode: 'access', ipAddress: '10.100.0.1', prefixLength: 24 },
      { id: 'GigabitEthernet1/0/48', adminStatus: 'up', lineStatus: 'up', speedMbps: 1000, duplex: 'full', mode: 'trunk', allowedVlans: [10], nativeVlan: 1 },
      { id: 'Vlan10', adminStatus: 'up', lineStatus: 'up', speedMbps: 1000, duplex: 'auto', mode: 'access', ipAddress: '10.0.0.1', prefixLength: 24 },
      { id: 'GigabitEthernet1/0/47', adminStatus: 'up', lineStatus: 'up', speedMbps: 1000, duplex: 'full', mode: 'access', accessVlan: 30, ipAddress: '203.0.113.1', prefixLength: 24 },
      ...(tier >= 3 ? [{ id: 'GigabitEthernet1/0/20', adminStatus: 'up' as const, lineStatus: 'down' as const, speedMbps: 1000, duplex: 'auto' as const, mode: 'access' as const, accessVlan: 100, description: 'spare, unpatched' }] : []),
    ],
    vlans: [
      { id: 100, name: 'PON-VLAN' },
      { id: 10, name: 'INFRA' },
    ],
    macTable: [],
    routeTable: [],
    dhcp: [{ vlan: 100, helperAddresses: ['10.0.0.50'], scope: { network: '10.100.0.0/24', poolSize: 200, leased }, dnsServerIp: '10.0.0.53' }],
    dnsResolverIp: '10.0.0.53',
  };

  const infra: DraftDevice[] = [
    {
      id: 'srv-sw-1',
      hostname: 'SRV-SW-1',
      vendorProfileId: 'switch-cisco-ios',
      role: 'switch',
      interfaces: [
        { id: 'GigabitEthernet0/1', adminStatus: 'up', lineStatus: 'up', speedMbps: 1000, duplex: 'full', mode: 'access', accessVlan: 10 },
        { id: 'GigabitEthernet0/2', adminStatus: 'up', lineStatus: 'up', speedMbps: 1000, duplex: 'full', mode: 'access', accessVlan: 10 },
        { id: 'GigabitEthernet0/24', adminStatus: 'up', lineStatus: 'up', speedMbps: 1000, duplex: 'full', mode: 'trunk', allowedVlans: [10], nativeVlan: 1 },
      ],
      vlans: [{ id: 10, name: 'INFRA' }],
      macTable: [],
      routeTable: [],
    },
    {
      id: 'dhcp-1',
      hostname: 'DHCP-1',
      vendorProfileId: 'switch-cisco-ios',
      role: 'server',
      interfaces: [{ id: 'GigabitEthernet0/0', adminStatus: 'up', lineStatus: 'up', speedMbps: 1000, duplex: 'full', mode: 'access', accessVlan: 10, ipAddress: '10.0.0.50', prefixLength: 24 }],
      vlans: [],
      macTable: [],
      routeTable: [{ network: '0.0.0.0/0', nextHop: '10.0.0.1', source: 'static' }],
    },
    {
      id: 'dns-1',
      hostname: 'DNS-1',
      vendorProfileId: 'switch-cisco-ios',
      role: 'dns-server',
      interfaces: [{ id: 'GigabitEthernet0/0', adminStatus: 'up', lineStatus: 'up', speedMbps: 1000, duplex: 'full', mode: 'access', accessVlan: 10, ipAddress: '10.0.0.53', prefixLength: 24 }],
      vlans: [],
      macTable: [],
      routeTable: [{ network: '0.0.0.0/0', nextHop: '10.0.0.1', source: 'static' }],
      dnsRecords: [
        { hostname: 'portal.isp.net', actualIp: '203.0.113.10' },
        { hostname: 'speedtest.isp.net', actualIp: '203.0.113.20' },
      ],
      dnsServerHealth: 'ok',
    },
    {
      id: 'web-1',
      hostname: 'WEB-1',
      vendorProfileId: 'switch-cisco-ios',
      role: 'server',
      interfaces: [{ id: 'GigabitEthernet0/0', adminStatus: 'up', lineStatus: 'up', speedMbps: 1000, duplex: 'full', mode: 'access', accessVlan: 30, ipAddress: '203.0.113.10', prefixLength: 24 }],
      vlans: [],
      macTable: [],
      routeTable: [{ network: '0.0.0.0/0', nextHop: '203.0.113.1', source: 'static' }],
    },
  ];

  const links: DraftLink[] = [
    { id: 'l-olt-dist', a: { deviceId: OLT_DEV, interfaceId: 'TenGigabitEthernet1/1' }, b: { deviceId: DIST_RTR, interfaceId: 'TenGigabitEthernet1/0/1' } },
    { id: 'l-dist-srvsw', a: { deviceId: DIST_RTR, interfaceId: 'GigabitEthernet1/0/48' }, b: { deviceId: 'srv-sw-1', interfaceId: 'GigabitEthernet0/24' } },
    { id: 'l-srvsw-dhcp', a: { deviceId: 'srv-sw-1', interfaceId: 'GigabitEthernet0/1' }, b: { deviceId: 'dhcp-1', interfaceId: 'GigabitEthernet0/0' } },
    { id: 'l-srvsw-dns', a: { deviceId: 'srv-sw-1', interfaceId: 'GigabitEthernet0/2' }, b: { deviceId: 'dns-1', interfaceId: 'GigabitEthernet0/0' } },
    { id: 'l-dist-web', a: { deviceId: DIST_RTR, interfaceId: 'GigabitEthernet1/0/47' }, b: { deviceId: 'web-1', interfaceId: 'GigabitEthernet0/0' } },
  ];

  const hosts: DraftHost[] = [];
  plant.hubs.forEach((hub, h) => {
    hub.ports.forEach((port, k) => {
      hosts.push({
        id: port.hostId,
        label: 'Customer laptop',
        premiseNodeId: port.premId,
        macAddress: `02:11:4a:00:${String(h + 1).padStart(2, '0')}:${String(k + 1).padStart(2, '0')}`,
        attachedOntNodeId: port.ontId,
        vlan: 100,
        addressing: { mode: 'dhcp' },
      });
    });
  });

  return { devices: [olt, distRtr, ...infra], links, hosts };
}

function reaches(plant: Plant, fromSpanId: string, nodeId: string): boolean {
  const visited = new Set<string>();
  const span = plant.spans.find((s) => s.id === fromSpanId);
  if (!span) return false;
  const queue = [span.toNodeId];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (cur === nodeId) return true;
    if (visited.has(cur)) continue;
    visited.add(cur);
    for (const s of plant.spans) if (s.fromNodeId === cur) queue.push(s.toNodeId);
  }
  return false;
}

// --- Fault plans -------------------------------------------------------------------------

interface Built {
  faults: DraftFault[];
  steps: DraftStep[];
  rationales: string[];
  expectedClaims: ExpectedClaim[];
  affectedPorts: Port[];
  symptomPool: string[];
  records: DraftRecord[];
  remoteHostAccess: boolean;
  startLocationNodeId: string;
  hints: string[];
  description: string;
  title: string;
  faultedDrop: string | null;
  outOfScope: boolean;
}

class Steps {
  readonly steps: DraftStep[] = [];
  readonly rationales: string[] = [];
  location: string;
  constructor(start: string) {
    this.location = start;
  }
  push(step: DraftStep): string {
    this.rationales.push(rationaleForStep(step as Intent, this.steps as Intent[]));
    this.steps.push(step);
    return `$${this.steps.length - 1}`;
  }
  truckTo(nodeId: string): void {
    if (this.location === nodeId) return;
    this.push({ type: 'truck-roll', toNodeId: nodeId });
    this.location = nodeId;
  }
  /**
   * Ask NOC what they are seeing. Idempotent on purpose: NOC hands over the whole alarm
   * picture in one conversation, so a reference solution that asked twice would be teaching
   * a wasted step rather than a method.
   */
  nocContact(): string {
    const existing = this.steps.findIndex((s) => s.type === 'noc-contact');
    if (existing >= 0) return `$${existing}`;
    return this.push({ type: 'noc-contact' });
  }
  cli(deviceId: string, command: string): string {
    return this.push({ type: 'cli', endpoint: { kind: 'device', deviceId }, command });
  }
  host(hostId: string, command: string): string {
    return this.push({ type: 'cli', endpoint: { kind: 'host', hostId }, command });
  }
  powerMeter(nodeId: string, strand?: { tubeColor: 'blue'; fiberColor: 'blue' | 'orange' }): string {
    this.truckTo(nodeId);
    return this.push({ type: 'power-meter', nodeId, wavelengthNm: 1577, strand });
  }
  vfl(spanId: string, fromNodeId: string): string {
    this.truckTo(fromNodeId);
    return this.push({ type: 'vfl', spanId, fromNodeId });
  }
  scope(spanId: string, eventId: string, atNodeId: string): string {
    this.truckTo(atNodeId);
    return this.push({ type: 'scope', spanId, eventId });
  }
  otdr(accessNodeId: string, launchSpanId: string, rangeMeters: number): string {
    this.truckTo(accessNodeId);
    return this.push({
      type: 'otdr-shot',
      access: { accessNodeId, launchSpanId },
      settings: { wavelengthNm: 1625, pulseWidthNs: 30, rangeMeters, iorSetting: 1.4685, averagingSeconds: 30, launchCableMeters: 500, receiveCableMeters: 0 },
    });
  }
  records(nodeId: string): string {
    return this.push({ type: 'records', nodeId });
  }
  diagnose(claims: DraftClaim[], escalate?: { reason: string; evidenceActionIds: string[] }): void {
    this.push({ type: 'diagnosis', diagnosis: { claims, escalate } });
  }
}

function stripClaims(claims: DraftClaim[]): ExpectedClaim[] {
  return claims.map(({ faultKind, target, positionMeters, strand }) => ({ faultKind, target, positionMeters, strand }));
}

/** A fault position on a span that stays clear of the span's authored events by at least `clear` metres. */
function clearPosition(rng: Rng, length: number, avoid: number[], clear: number, lo = 0.2, hi = 0.8): number {
  for (let attempt = 0; attempt < 24; attempt++) {
    const p = Math.round(length * (lo + rng.next() * (hi - lo)));
    if (avoid.every((a) => Math.abs(a - p) >= clear)) return p;
  }
  return Math.round(length * 0.5);
}

function isoDaysAgo(days: number): string {
  const d = new Date(`${TODAY}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function buildPlan(rng: Rng, plan: PlanKind, plant: Plant): Built {
  const hub = plant.hubs[0];
  const port = pick(rng, hub.ports);
  const start = plant.hasYard ? YARD_ID : port.ontId;
  const S = new Steps(start);
  const records: DraftRecord[] = [];
  const base = { records, remoteHostAccess: false, startLocationNodeId: start, faultedDrop: null as string | null, outOfScope: false };

  switch (plan) {
    case 'ont-unpowered': {
      const c = S.cli(OLT_DEV, 'show ont status');
      const pm = S.powerMeter(port.ontId);
      const claims: DraftClaim[] = [{ faultKind: 'ont-unpowered', target: { type: 'site', nodeId: port.ontId }, evidenceActionIds: [c, pm] }];
      S.diagnose(claims);
      return {
        ...base,
        faults: [{ instanceId: `f-${port.ontId}-unpowered`, kind: 'ont-unpowered', target: { type: 'site', nodeId: port.ontId }, params: {} }],
        steps: S.steps, rationales: S.rationales,
        expectedClaims: stripClaims(claims),
        affectedPorts: [port],
        symptomPool: SYMPTOMS.unpowered,
        hints: HINTS['ont-unpowered'],
        title: `Dark ONT on ${port.street}`,
        description: `A single residential customer at ${port.address} is completely dark. The ONT lost power; the fiber itself is fine.`,
      };
    }
    case 'connector-dirty': {
      const instanceId = `f-${port.dropSpanId}-dirty-nid`;
      S.nocContact();
      S.cli(OLT_DEV, 'show ont status');
      const sc = S.scope(port.dropSpanId, instanceId, port.ontId);
      S.powerMeter(port.ontId);
      const claims: DraftClaim[] = [{ faultKind: 'connector-dirty', target: { type: 'fiber-span', spanId: port.dropSpanId }, positionMeters: port.nidPos, evidenceActionIds: [sc] }];
      S.diagnose(claims);
      return {
        ...base,
        faultedDrop: port.dropSpanId,
        faults: [
          {
            instanceId,
            kind: 'connector-dirty',
            target: { type: 'fiber-span', spanId: port.dropSpanId },
            params: { positionMeters: port.nidPos, lossDb: Math.round((1.0 + rng.next() * 1.4) * 100) / 100, reflectanceDb: -rng.int(20, 32) },
          },
        ],
        steps: S.steps, rationales: S.rationales,
        expectedClaims: stripClaims(claims),
        affectedPorts: [port],
        symptomPool: SYMPTOMS.degraded,
        hints: HINTS['connector-dirty'],
        title: `Flapping service at ${port.address}`,
        description: `One customer on ${port.street} reports intermittent, slow service. A contaminated connector at the NID is bleeding light; the plant behind it is clean.`,
      };
    }
    case 'macrobend': {
      const p = clearPosition(rng, port.nidPos, [0, port.nidPos], 8, 0.3, 0.75);
      const instanceId = `f-${port.dropSpanId}-bend`;
      S.nocContact();
      S.cli(OLT_DEV, 'show ont status');
      const v = S.vfl(port.dropSpanId, port.termId);
      const claims: DraftClaim[] = [{ faultKind: 'macrobend', target: { type: 'fiber-span', spanId: port.dropSpanId }, positionMeters: p, evidenceActionIds: [v] }];
      S.diagnose(claims);
      return {
        ...base,
        faults: [{ instanceId, kind: 'macrobend', target: { type: 'fiber-span', spanId: port.dropSpanId }, params: { positionMeters: p, severity: pick(rng, ['moderate', 'severe']), causeTag: pick(rng, ['staple', 'door-frame', 'tight-coil']) } }],
        steps: S.steps, rationales: S.rationales,
        expectedClaims: stripClaims(claims),
        affectedPorts: [port],
        symptomPool: SYMPTOMS.degraded,
        hints: HINTS.macrobend,
        title: `Pinched drop on ${port.street}`,
        description: `A customer at ${port.address} has been flapping since some yard work. The drop is bent hard somewhere between the pedestal and the house.`,
      };
    }
    case 'fiber-break-dist':
    case 'locate-ticket-expired': {
      const avoid = [0, ...(port.distSpliceAt !== null ? [port.distSpliceAt] : [])];
      const p = clearPosition(rng, port.distLen, avoid, 60);
      const instanceId = `f-${port.distSpanId}-break`;
      S.nocContact();
      S.cli(OLT_DEV, 'show ont status');
      const pm = S.powerMeter(port.termId);
      const v = S.vfl(port.distSpanId, hub.splitterId);
      const claims: DraftClaim[] = [{ faultKind: 'fiber-break', target: { type: 'fiber-span', spanId: port.distSpanId }, positionMeters: p, evidenceActionIds: [pm, v] }];
      const faults: DraftFault[] = [{ instanceId, kind: 'fiber-break', target: { type: 'fiber-span', spanId: port.distSpanId }, params: { positionMeters: p, cause: pick(rng, ['dig-strike', 'rodent', 'vehicle-strike']) } }];
      let hints = HINTS['fiber-break'];
      let title = `Cut distribution to ${port.address}`;
      let description = `A customer on ${port.street} went dark overnight; a contractor was trenching along the parkway. The distribution fiber to their NAP is severed.`;
      if (plan === 'locate-ticket-expired') {
        const openedDaysAgo = rng.int(30, 45);
        const ticket = `A${rng.int(2026000, 2026999)}-${rng.int(100, 999)}`;
        faults.push({ instanceId: `f-${port.termId}-ticket`, kind: 'locate-ticket-expired', target: { type: 'site', nodeId: port.termId }, params: { ticketOpenedDaysAgo: openedDaysAgo, validityDays: 28 } });
        const rec = S.records(port.termId);
        claims.push({ faultKind: 'locate-ticket-expired', target: { type: 'site', nodeId: port.termId }, evidenceActionIds: [rec] });
        records.push({
          id: `rec-${port.termId}-wo`,
          kind: 'work-order',
          title: `WO ${rng.int(40000, 49999)} — repair dig damage at NAP ${hub.letter}-${port.napNo}`,
          date: isoDaysAgo(openedDaysAgo),
          nodeId: port.termId,
          lines: [
            `Excavate and splice distribution ${port.distSpanId} near ${port.address}. Machine dig authorized.`,
            `DigAlert ticket ${ticket} opened ${isoDaysAgo(openedDaysAgo)} (28-day validity). Marks: orange paint, parkway side.`,
          ],
        });
        hints = [...HINTS['fiber-break'].slice(0, 1), ...HINTS['locate-ticket-expired']];
        title = `Dig strike repair at NAP ${hub.letter}-${port.napNo}`;
        description = `A severed distribution fiber near ${port.address} needs a repair dig, but the one-call ticket on the work order is older than it looks. Find the cut, and check the paperwork before anyone digs.`;
      }
      S.diagnose(claims);
      return { ...base, faults, steps: S.steps, rationales: S.rationales, expectedClaims: stripClaims(claims), affectedPorts: [port], symptomPool: SYMPTOMS.dark, hints, title, description };
    }
    case 'fiber-break-feeder': {
      const feeder = plant.spans.find((s) => s.id === hub.feederInSpanId)!;
      const p = clearPosition(rng, feeder.lengthMeters, [feeder.lengthMeters], 80, 0.15, 0.75);
      const instanceId = `f-${hub.feederInSpanId}-break`;
      S.nocContact();
      S.cli(OLT_DEV, 'show ont status');
      const pm = S.powerMeter(hub.splitterId);
      const v = S.vfl(hub.feederInSpanId, hub.closureId!);
      const claims: DraftClaim[] = [{ faultKind: 'fiber-break', target: { type: 'fiber-span', spanId: hub.feederInSpanId }, positionMeters: p, evidenceActionIds: [pm, v] }];
      S.diagnose(claims);
      return {
        ...base,
        faults: [{ instanceId, kind: 'fiber-break', target: { type: 'fiber-span', spanId: hub.feederInSpanId }, params: { positionMeters: p, cause: 'dig-strike' } }],
        steps: S.steps, rationales: S.rationales,
        expectedClaims: stripClaims(claims),
        affectedPorts: hub.ports,
        symptomPool: SYMPTOMS.darkNeighbourhood,
        hints: HINTS['fiber-break'],
        title: `FDH ${hub.letter} is dark`,
        description: `Every customer behind FDH ${hub.letter} on ${hub.street} is down at once. The feeder between the closure and the cabinet took a dig strike.`,
      };
    }
    case 'fusion-splice-degraded': {
      const avoid = [0, ...(port.distSpliceAt !== null ? [port.distSpliceAt] : []), port.distLen];
      const p = clearPosition(rng, port.distLen, avoid, 120, 0.25, 0.75);
      const instanceId = `f-${port.distSpanId}-splice`;
      S.nocContact();
      S.cli(OLT_DEV, 'show ont status');
      const o = S.otdr(hub.splitterId, port.distSpanId, 5000);
      const claims: DraftClaim[] = [{ faultKind: 'fusion-splice-degraded', target: { type: 'fiber-span', spanId: port.distSpanId }, positionMeters: p, evidenceActionIds: [o] }];
      S.diagnose(claims);
      return {
        ...base,
        faults: [{ instanceId, kind: 'fusion-splice-degraded', target: { type: 'fiber-span', spanId: port.distSpanId }, params: { positionMeters: p, lossDb: Math.round((0.8 + rng.next() * 0.9) * 100) / 100, causeTag: pick(rng, ['bad-cleave', 'contamination', 'arc-miscal']) } }],
        steps: S.steps, rationales: S.rationales,
        expectedClaims: stripClaims(claims),
        affectedPorts: [port],
        symptomPool: SYMPTOMS.degraded,
        hints: HINTS['fusion-splice-degraded'],
        title: `Low light on ${port.street}`,
        description: `A customer at ${port.address} is online but marginal, with no reflective event to blame. A field splice on the distribution run is well out of spec.`,
      };
    }
    case 'wrong-tube-continuity': {
      const roll = plant.roll!;
      const hubB = plant.hubs.find((h) => h.letter === 'B')!;
      S.nocContact();
      S.records(hubB.splitterId);
      const rec = S.records(roll.closureId);
      S.cli(OLT_DEV, 'show ont status');
      const pm1 = S.powerMeter(hubB.splitterId);
      const pm2 = S.powerMeter(roll.closureId, { tubeColor: 'blue', fiberColor: 'orange' });
      const claims: DraftClaim[] = [{ faultKind: 'wrong-tube-continuity', target: { type: 'fiber-span', spanId: roll.feederMainId }, strand: { tubeColor: 'blue', fiberColor: 'orange' }, evidenceActionIds: [rec, pm1, pm2] }];
      S.diagnose(claims);
      const wo = rng.int(40000, 49999);
      records.push(
        {
          id: `rec-${hubB.splitterId}-ports`,
          kind: 'port-assignment',
          title: `FDH ${hubB.letter} port assignments`,
          date: isoDaysAgo(rng.int(120, 240)),
          nodeId: hubB.splitterId,
          lines: [`FDH ${hubB.letter} fed from ${roll.closureId.toUpperCase()} splice, feeder cable 144f, TUBE BLUE / FIBER ORANGE -> FDH-${hubB.letter} splitter input`, `Splitter 1x32 SPL1X32-${hubB.letter}, ports 1-32 -> NAP ${hubB.letter}-1..${hubB.letter}-8`],
        },
        {
          id: `rec-${roll.closureId}-wo`,
          kind: 'work-order',
          title: `WO ${wo}`,
          date: isoDaysAgo(2),
          nodeId: roll.closureId,
          lines: [`WO ${wo}: Roll FDH-${hubB.letter} distribution to new 96f cable (${roll.toB}).`, `Splice feeder BLUE/ORANGE -> new cable BLUE/ORANGE. Tech: [redacted]. Closed ${isoDaysAgo(2)} 16:40.`],
        },
        {
          id: `rec-${roll.closureId}-sheet`,
          kind: 'splice-sheet',
          title: `Closure ${roll.closureId.slice(3)} splice sheet, Tray 1`,
          date: isoDaysAgo(2),
          nodeId: roll.closureId,
          lines: ['Tray 1: BLUE tube.', `Blue -> Blue (FDH-C feed) OK.`, `Orange -> Orange (FDH-${hubB.letter} feed) OK.`, 'Green: dark. Brown: spare.'],
        },
      );
      return {
        ...base,
        faults: [
          {
            instanceId: `f-${roll.closureId}-wrong-roll`,
            kind: 'wrong-tube-continuity',
            target: { type: 'fiber-span', spanId: roll.feederMainId },
            params: { tubeColor: 'blue', fiberColor: 'orange', rollType: 'spliced-into-dark-spare', actualTubeColor: 'blue', actualFiberColor: 'green' },
          },
        ],
        steps: S.steps, rationales: S.rationales,
        expectedClaims: stripClaims(claims),
        affectedPorts: hubB.ports,
        symptomPool: SYMPTOMS.darkNeighbourhood,
        hints: HINTS['wrong-tube-continuity'],
        title: `Wrong roll at Closure ${roll.closureId.slice(3)}`,
        description: `Every customer behind FDH ${hubB.letter} is down at once. A splice tech rolled the wrong tube at Closure ${roll.closureId.slice(3)} two days ago; the paperwork says otherwise.`,
      };
    }
    case 'ont-serial-mismatch': {
      const wrongSerial = serialFor(rng);
      S.nocContact();
      const c = S.cli(OLT_DEV, 'show ont status');
      const claims: DraftClaim[] = [{ faultKind: 'ont-serial-mismatch', target: { type: 'device-global', deviceId: OLT_DEV }, evidenceActionIds: [c] }];
      S.diagnose(claims);
      return {
        ...base,
        faults: [{ instanceId: `f-${port.ontId}-serial`, kind: 'ont-serial-mismatch', target: { type: 'device-global', deviceId: OLT_DEV }, params: { ontId: port.ponOntId, provisionedSerial: wrongSerial } }],
        steps: S.steps, rationales: S.rationales,
        expectedClaims: stripClaims(claims),
        affectedPorts: [port],
        symptomPool: SYMPTOMS.logical,
        hints: HINTS['ont-serial-mismatch'],
        title: `Never came online at ${port.address}`,
        description: `A swapped ONT at ${port.address} has light but never ranges. The OLT was provisioned with the old serial.`,
      };
    }
    case 'transceiver-rx-power-low': {
      const c = S.cli(DIST_RTR, 'show interfaces transceiver detail');
      const target = { type: 'device-interface' as const, deviceId: DIST_RTR, interfaceId: 'TenGigabitEthernet1/0/1' };
      const claims: DraftClaim[] = [{ faultKind: 'transceiver-rx-power-low', target, evidenceActionIds: [c] }];
      S.diagnose(claims);
      return {
        ...base,
        faults: [{ instanceId: 'f-dist-uplink-rx', kind: 'transceiver-rx-power-low', target, params: { rxPowerDbm: -rng.int(26, 29) } }],
        steps: S.steps, rationales: S.rationales,
        expectedClaims: stripClaims(claims),
        affectedPorts: [],
        symptomPool: SYMPTOMS.degraded,
        hints: HINTS['transceiver-rx-power-low'],
        title: 'Uplink optic alarm at the POP',
        description: `NOC forwarded an optic alarm on the distribution router's uplink from the OLT. Customers are up, for now. Confirm the receive level before it fails outright.`,
      };
    }
    case 'dhcp-scope-exhausted': {
      S.nocContact();
      S.cli(OLT_DEV, 'show ont status');
      const h = S.host(port.hostId, 'ipconfig');
      const r = S.cli(DIST_RTR, 'show ip route');
      const claims: DraftClaim[] = [{ faultKind: 'dhcp-scope-exhausted', target: { type: 'device-global', deviceId: DIST_RTR }, evidenceActionIds: [h, r] }];
      S.diagnose(claims);
      return {
        ...base,
        remoteHostAccess: true,
        faults: [{ instanceId: 'f-dist-dhcp-exhausted', kind: 'dhcp-scope-exhausted', target: { type: 'device-global', deviceId: DIST_RTR }, params: { vlan: 100, network: '10.100.0.0/24', poolSize: 200 } }],
        steps: S.steps, rationales: S.rationales,
        expectedClaims: stripClaims(claims),
        affectedPorts: plant.hubs.flatMap((hb) => hb.ports),
        symptomPool: SYMPTOMS.logical,
        hints: HINTS['dhcp-scope-exhausted'],
        title: 'Green lights, no internet',
        description: 'Several customers report they are connected but nothing loads. Every ONT is online and the fiber is clean; the address pool for the PON VLAN has run dry.',
      };
    }
    case 'rogue-ont': {
      const rogue = pick(rng, hub.ports);
      S.nocContact();
      const c = S.cli(OLT_DEV, 'show ont status');
      const claims: DraftClaim[] = [{ faultKind: 'rogue-ont', target: { type: 'device-global', deviceId: OLT_DEV }, evidenceActionIds: [c] }];
      S.diagnose(claims);
      return {
        ...base,
        faults: [{ instanceId: `f-${rogue.ontId}-rogue`, kind: 'rogue-ont', target: { type: 'device-global', deviceId: OLT_DEV }, params: { ontId: rogue.ponOntId } }],
        steps: S.steps, rationales: S.rationales,
        expectedClaims: stripClaims(claims),
        affectedPorts: hub.ports,
        symptomPool: SYMPTOMS.darkNeighbourhood,
        hints: HINTS['rogue-ont'],
        title: `PON ${hub.ponPortId} is flapping`,
        description: `Every ONT on PON ${hub.ponPortId} keeps dropping to LOS while the fiber plant tests clean. One ONT is transmitting outside its timeslot and taking the rest down with it.`,
      };
    }
    case 'dns-server-unresponsive': {
      const first = hub.ports[0];
      S.nocContact();
      const ont = S.cli(OLT_DEV, 'show ont status');
      S.host(first.hostId, 'ipconfig');
      S.host(first.hostId, 'ping 10.100.0.1');
      const pingIp = S.host(first.hostId, 'ping 203.0.113.10');
      S.host(first.hostId, 'ping portal.isp.net');
      const ns = S.host(first.hostId, 'nslookup portal.isp.net');
      const rtr = S.cli(DIST_RTR, 'ping 10.0.0.53');
      const claims: DraftClaim[] = [{ faultKind: 'dns-server-unresponsive', target: { type: 'device-global', deviceId: 'dns-1' }, evidenceActionIds: [ns, pingIp] }];
      S.diagnose(claims, { reason: 'DNS service down on DNS-1; hosts resolve nothing, IP connectivity intact, all ONTs online. Needs NOC/IT.', evidenceActionIds: [ont, pingIp, ns, rtr] });
      return {
        ...base,
        remoteHostAccess: true,
        outOfScope: true,
        faults: [{ instanceId: 'f-dns-down', kind: 'dns-server-unresponsive', outOfScope: true, target: { type: 'device-global', deviceId: 'dns-1' }, params: { health: 'down' } }],
        steps: S.steps, rationales: S.rationales,
        expectedClaims: stripClaims(claims),
        affectedPorts: plant.hubs.flatMap((hb) => hb.ports),
        symptomPool: SYMPTOMS.dns,
        hints: HINTS['dns-server-unresponsive'],
        title: "Everyone's down, nothing's broken",
        description: 'NOC has the whole street on one ticket -- internet dead everywhere at once -- but every ONT is online and every fiber path checks out. The DNS server itself is down -- outside a field tech\'s authority, but recognizing that (and escalating instead of rolling a truck) is the whole test.',
      };
    }
  }
}

// --- Assembly ----------------------------------------------------------------------------

function choosePlan(rng: Rng, params: GeneratorParams): { focus: ConcreteFocus; plan: PlanKind } {
  const allowed = FOCUS_BY_TIER[params.tier];
  const focus: ConcreteFocus = params.focus !== 'any' && allowed.includes(params.focus) ? params.focus : pick(rng, allowed);
  const plans = PLANS_BY_FOCUS[focus].filter((p) => params.tier >= p.minTier && params.tier <= p.maxTier);
  return { focus, plan: pick(rng, plans).kind };
}

function buildRedHerrings(rng: Rng, params: GeneratorParams, plant: Plant, built: Built): { faults: DraftFault[]; pool: Draft['redHerringPool'] } {
  if (params.tier < 3) return { faults: [], pool: undefined };
  const affected = new Set(built.affectedPorts.map((p) => p.dropSpanId));
  const faultedSpans = new Set(built.faults.map((f) => (f.target.type === 'fiber-span' ? f.target.spanId : '')));
  const spare = plant.hubs.flatMap((h) => h.ports).filter((p) => !affected.has(p.dropSpanId) && !faultedSpans.has(p.distSpanId) && !faultedSpans.has(p.dropSpanId));
  const from: DraftFault[] = [];
  if (spare.length > 0) {
    const a = pick(rng, spare);
    from.push({ instanceId: `rh-bend-${a.dropSpanId}`, kind: 'macrobend', target: { type: 'fiber-span', spanId: a.dropSpanId }, params: { positionMeters: Math.min(20, a.nidPos - 10), severity: 'light' } });
    const b = pick(rng, spare);
    const at = clearPosition(rng, b.distLen, [0, ...(b.distSpliceAt !== null ? [b.distSpliceAt] : [])], 60);
    from.push({ instanceId: `rh-splice-${b.distSpanId}`, kind: 'fusion-splice-degraded', target: { type: 'fiber-span', spanId: b.distSpanId }, params: { positionMeters: at, lossDb: Math.round((0.12 + rng.next() * 0.08) * 100) / 100 } });
  }
  const faults: DraftFault[] = [];
  if (params.tier >= 4 && !built.faults.some((f) => f.target.type === 'device-interface')) {
    faults.push({ instanceId: 'rh-stp-unused-port', kind: 'stp-unexpected-blocking', isRedHerring: true, target: { type: 'device-interface', deviceId: DIST_RTR, interfaceId: 'GigabitEthernet1/0/20' }, params: {} });
  }
  return { faults, pool: from.length > 0 ? { pick: 1, from } : undefined };
}

export function generateScenario(params: GeneratorParams, seed: number): ScenarioDefinition {
  const id = generatedId(params);
  const rng = createRng(deriveSeed(seed, 'generate', id));
  const { plan } = choosePlan(rng, params);
  const plant = buildPlant(rng, params, plan);
  const built = buildPlan(rng, plan, plant);
  addDropSpans(plant, built.faultedDrop);

  const { devices, links, hosts } = buildDevices(plant, params.tier, rng.int(20, 60));
  const herrings = buildRedHerrings(rng, params, plant, built);

  const reports: DraftReport[] = built.affectedPorts.map((p, i) => ({
    customerId: p.custId,
    premiseNodeId: p.premId,
    reportedSymptom: built.symptomPool[i % built.symptomPool.length],
    phrasingVariants: built.symptomPool.filter((_, j) => j !== i % built.symptomPool.length).slice(0, 2),
  }));
  if (built.affectedPorts.length === 0) {
    const p = plant.hubs[0].ports[0];
    reports.push({ customerId: p.custId, premiseNodeId: p.premId, reportedSymptom: 'No complaint on file; NOC ticket only.' });
  }
  if (params.tier >= 3) {
    const reported = new Set(reports.map((r) => r.customerId));
    const spare = plant.hubs.flatMap((h) => h.ports).filter((p) => !reported.has(p.custId));
    if (spare.length > 0) {
      const p = pick(rng, spare);
      reports.push({ customerId: p.custId, premiseNodeId: p.premId, isRedHerring: true, reportedSymptom: SYMPTOMS.redHerring[0], phrasingVariants: SYMPTOMS.redHerring.slice(1) });
    }
  }

  const records: DraftRecord[] = [...built.records];
  for (const hub of plant.hubs) {
    if (records.some((r) => r.nodeId === hub.splitterId)) continue;
    records.push({
      id: `rec-${hub.splitterId}-ports`,
      kind: 'port-assignment',
      title: `FDH ${hub.letter} port assignments`,
      date: isoDaysAgo(rng.int(90, 300)),
      nodeId: hub.splitterId,
      lines: [`Splitter 1x32 SPL1X32-${hub.letter} fed by ${hub.feederInSpanId}.`, ...hub.ports.map((p) => `Port ${p.index + 1} -> NAP ${hub.letter}-${p.napNo} port ${p.portNo} -> ${p.address}`)],
    });
  }

  const truckRolls = built.steps.filter((s) => s.type === 'truck-roll').length;
  const pairs: TravelPair[] = [];
  const siteNodes = plant.nodes.filter((n) => n.id !== YARD_ID && n.kind !== 'customer-premise');
  if (plant.hasYard) for (const n of siteNodes) pairs.push({ from: YARD_ID, to: n.id, seconds: rng.int(600, 1500) });
  for (const hub of plant.hubs) {
    if (hub.closureId) pairs.push({ from: hub.closureId, to: hub.splitterId, seconds: rng.int(300, 600) });
    for (const p of hub.ports) {
      pairs.push({ from: hub.splitterId, to: p.termId, seconds: rng.int(200, 480) });
      pairs.push({ from: p.termId, to: p.ontId, seconds: rng.int(120, 300) });
    }
  }

  const draft: Draft = {
    id,
    title: built.title,
    tier: params.tier,
    description: built.description,
    today: TODAY,
    profiles: PROFILES,
    environment: { weather: pick(rng, ['clear', 'overcast', 'marine-layer', 'hot']), timeOfDay: `${rng.int(7, 18)}:${pick(rng, ['00', '15', '30', '45'])}` },
    truckInventory: ['otdr', 'power-meter', 'vfl', 'inspection-scope', 'launch-cable-500m', 'laptop', 'cleaning-kit'],
    timeBudgetMinutes: params.tier >= 2 ? 45 + 15 * params.tier + 10 * truckRolls : undefined,
    startLocationNodeId: built.startLocationNodeId,
    remoteCliAccess: true,
    remoteHostAccess: built.remoteHostAccess,
    travelSeconds: { default: 900, pairs },
    hints: built.hints,
    topology: { nodes: plant.nodes, spans: plant.spans },
    devices,
    links,
    hosts,
    plantRecords: records,
    nocReports: reports,
    faults: [...built.faults, ...herrings.faults],
    redHerringPool: herrings.pool,
    referenceSolution: { steps: built.steps, rationales: built.rationales, expectedClaims: built.expectedClaims },
  };

  return ScenarioDefinitionSchema.parse(draft);
}

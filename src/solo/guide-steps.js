// The spotlight guide: the first tickets, broken into one small instruction
// at a time, in plain words, from "what's wrong" all the way to closing the
// ticket. walkthrough.js still owns the fault-specific fill-in blanks; this
// module turns a mission into the ordered list of spotlight steps and works
// out which one is current.
//
// Pure: no DOM. A step is "done" either because the mission's own events show
// the work was done, or (for the read-only steps) because the trainee tapped
// through it, which the caller tracks in `acks`.

import { isRecipeRepaired, recordTestEvent, applyMissionActions } from './app.js';
import { runMissionTest } from './devices.js';
import { walkthroughFor, walkthroughRecipeId } from './walkthrough.js';

const PORTAL = 'portal.northline.test';

function prefixOf(mission) {
  return (mission?.requirements?.targetSubnet ?? '10.42.10.0').split('.').slice(0, 3).join('.');
}

function device(mission, id) {
  return mission.network.devices.find((d) => d.id === id) ?? null;
}

function serverAddress(mission) {
  return device(mission, mission.requirements?.portalServerId)?.ip ?? null;
}

// The switch port the customer's cable lands on, and the trunk leaving that
// switch. Both are read from the network, so they hold for any layout.
export function accessPortOf(mission) {
  const network = mission.network;
  const own = network.ports.find((p) => p.deviceId === mission.targetClientId);
  const link = own ? network.links.find((l) => l.aPortId === own.id || l.bPortId === own.id) : null;
  const otherId = link ? (link.aPortId === own.id ? link.bPortId : link.aPortId) : null;
  return { link, port: otherId ? network.ports.find((p) => p.id === otherId) ?? null : null };
}

function trunkPortOf(mission) {
  const { port } = accessPortOf(mission);
  return port ? mission.network.ports.find((p) => p.mode === 'trunk' && p.deviceId === port.deviceId) ?? null : null;
}

// What a failed test means, for someone who has never heard the error code.
const PLAIN_RESULT = {
  LINK_DOWN: 'The computer is not connected to the network. Something between it and the switch is off or unplugged.',
  GATEWAY_UNREACHABLE: 'The computer cannot reach the router, which is its door out of the office.',
  NO_ROUTE: 'The computer does not know a way to the website.',
  VLAN_PATH_BLOCKED: 'The traffic ends up in the wrong VLAN. Think of it as a letter delivered to the wrong room.',
  DNS_UNREACHABLE: 'The computer cannot reach the server that turns website names into addresses.',
  DNS_NOT_FOUND: 'The name lookup found nothing for the website.',
  WRONG_SERVICE: 'The website name leads to the wrong server.',
  RETURN_PATH_FAILED: 'The request goes out, but the answer cannot find its way back.',
  DUPLICATE_IP: 'Two devices are using the same address.',
  INVALID_ADDRESS: 'The computer has an address that cannot work.',
};

export function plainResult(code) {
  return PLAIN_RESULT[code] ?? 'The website did not open.';
}

// The command a test button stands for, so the button teaches the command.
export function testCommand(mission, testKind, deviceId) {
  const client = device(mission, deviceId);
  switch (testKind) {
    case 'pingGateway': return `ping ${client?.gateway ?? '<gateway>'}`;
    case 'pingServer': return `ping ${serverAddress(mission) ?? '<server>'}`;
    case 'resolvePortal': return `nslookup ${PORTAL}`;
    case 'openPortal': return `curl http://${PORTAL}`;
    case 'checkProtected': return `curl http://${PORTAL}  (on the other office's computer)`;
    default: return '';
  }
}

export const PLAIN_TEST_LABELS = {
  pingGateway: 'Reach the router',
  pingServer: 'Reach the server',
  resolvePortal: 'Look up the website name',
  openPortal: 'Try the website',
  checkProtected: 'Check the other office',
};

// Per fault: where to look, what the trainee is told they are seeing, the
// plain question for the blank, and the change that answer makes.
const FAULTS = {
  P1: (m) => ({
    look: { target: { kind: 'cable', id: accessPortOf(m).link?.id }, tab: 'network',
      title: 'See the dashed line?',
      body: 'That is the customer\'s network cable. It has come unplugged from the switch, so the computer is cut off.' },
    ask: `The cable belongs in switch port ${accessPortOf(m).port?.label ?? 'Gi0/1'}. Type ${accessPortOf(m).port?.label ?? 'Gi0/1'} to plug it back in.`,
    term: 'Techs call this reseating the cable.',
    fix: () => [{ type: 'setLinkConnected', linkId: accessPortOf(m).link.id, connected: true }],
    note: `Reconnected the customer's cable to switch port ${accessPortOf(m).port?.label ?? 'Gi0/1'}.`,
  }),
  P2: (m) => ({
    select: { id: accessPortOf(m).port?.deviceId, title: 'Tap the switch', body: 'The switch is the box the customer\'s cable plugs into. Tap it on the map.' },
    look: { target: { kind: 'row', label: `Port ${accessPortOf(m).port?.label}` }, tab: 'device',
      title: 'This port is switched off',
      body: `Port ${accessPortOf(m).port?.label} is where the customer plugs in. It says "administratively down": someone turned the port off.` },
    ask: 'Type up to turn the port back on.',
    term: 'On a Cisco switch the command is no shutdown.',
    fix: () => [{ type: 'setPortAdmin', portId: accessPortOf(m).port.id, adminUp: true }],
    note: `Turned switch port ${accessPortOf(m).port?.label} back on (no shutdown).`,
  }),
  I1: (m) => ({
    look: { target: { kind: 'row', label: 'IP address' }, tab: 'device',
      title: 'The address is in the wrong place',
      body: `Every computer in this office has an address starting with ${prefixOf(m)}. This one does not, so it cannot talk to the router.` },
    ask: `Type a new address that starts with ${prefixOf(m)}. For example: ${prefixOf(m)}.50`,
    term: `Techs say it belongs in the ${prefixOf(m)}.0/24 subnet.`,
    fix: (value) => [{ type: 'setClientAddress', deviceId: m.targetClientId, ip: String(value).trim(), prefix: m.requirements.targetPrefix }],
    note: `Moved the customer's computer to an address in ${prefixOf(m)}.0/24.`,
  }),
  I2: (m) => ({
    look: { target: { kind: 'row', label: 'Gateway' }, tab: 'device',
      title: 'The door out points nowhere',
      body: `The gateway is the computer's door out of the office. It is set to ${device(m, m.targetClientId)?.gateway}, and nothing answers there.` },
    ask: `The router's address in this office is ${prefixOf(m)}.1. Type it in.`,
    term: 'Techs call this the default gateway.',
    fix: (value) => [{ type: 'setClientGateway', deviceId: m.targetClientId, gateway: String(value).trim() }],
    note: `Set the customer's default gateway to ${prefixOf(m)}.1.`,
  }),
  V1: (m) => ({
    select: { id: accessPortOf(m).port?.deviceId, title: 'Tap the switch', body: 'The switch is the box the customer\'s cable plugs into. Tap it on the map.' },
    look: { target: { kind: 'row', label: `Port ${accessPortOf(m).port?.label}` }, tab: 'device',
      title: 'The port is in the wrong VLAN',
      body: `A VLAN is like a separate room on the same switch. The customer's port was moved into VLAN ${accessPortOf(m).port?.accessVlan}, but the customer belongs in VLAN ${m.requirements.targetVlan}.` },
    ask: `The work order says the customer is on VLAN ${m.requirements.targetVlan}. Type ${m.requirements.targetVlan}.`,
    term: 'Techs call this the access VLAN.',
    fix: (value) => [{ type: 'setAccessVlan', portId: accessPortOf(m).port.id, vlanId: Number(String(value).trim()) }],
    note: `Put switch port ${accessPortOf(m).port?.label} back in VLAN ${m.requirements.targetVlan}.`,
  }),
  V2: (m) => ({
    select: { id: accessPortOf(m).port?.deviceId, title: 'Tap the switch', body: 'The switch is the box the customer\'s cable plugs into. Tap it on the map.' },
    look: { target: { kind: 'row', label: `Port ${trunkPortOf(m)?.label}` }, tab: 'device',
      title: 'The link between switches is missing a VLAN',
      body: `Port ${trunkPortOf(m)?.label} is the trunk: one cable that carries several VLANs between switches. The customer's VLAN ${m.requirements.targetVlan} is missing from its list.` },
    ask: `Both offices must cross this cable: VLAN ${m.requirements.targetVlan} and VLAN ${m.requirements.protectedVlan}. Type ${m.requirements.targetVlan},${m.requirements.protectedVlan}`,
    term: 'Techs call this the trunk allowed VLAN list.',
    fix: (value) => [{ type: 'setTrunkAllowedVlans', portId: trunkPortOf(m).id, vlans: String(value).split(/[,\s]+/).map(Number).filter(Number.isInteger) }],
    note: `Added VLAN ${m.requirements.targetVlan} back to the trunk on ${trunkPortOf(m)?.label}.`,
  }),
  D1: (m) => ({
    look: { target: { kind: 'row', label: 'DNS' }, tab: 'device',
      title: 'The name helper is wrong',
      body: `DNS turns a website name into an address. This computer asks ${device(m, m.targetClientId)?.dns} for names, and nothing answers there.` },
    ask: `The DNS server is at ${serverAddress(m)}. Type it in.`,
    term: 'Techs call this the DNS resolver.',
    fix: (value) => [{ type: 'setClientDns', deviceId: m.targetClientId, dns: String(value).trim() }],
    note: `Pointed the customer's DNS at ${serverAddress(m)}.`,
  }),
  D2: (m) => ({
    select: { id: m.requirements.portalServerId, title: 'Tap the server', body: 'The server holds the website and the list of names. Tap it on the map.' },
    look: { target: { kind: 'panel' }, tab: 'device',
      title: 'The website name points to the wrong place',
      body: `The server's name list sends ${PORTAL} to the wrong address. The website lives on this server, at ${serverAddress(m)}.` },
    ask: `Type the server's own address: ${serverAddress(m)}`,
    term: 'Techs call this fixing the DNS A record.',
    fix: (value) => [{ type: 'setDnsRecord', serverId: m.requirements.portalServerId, name: PORTAL, address: String(value).trim() }],
    note: `Corrected the ${PORTAL} DNS record to ${serverAddress(m)}.`,
  }),
};

function faultFor(mission) {
  const recipeId = walkthroughRecipeId(mission);
  return recipeId ? FAULTS[recipeId](mission) : null;
}

export function fixActionsFor(mission, value) {
  return faultFor(mission)?.fix(value) ?? [];
}

export function guidedNote(mission) {
  const fault = faultFor(mission);
  const change = fault?.note ?? 'Fixed the fault.';
  return `${change} Checked the website from the customer's computer and from the other office: both work.`;
}

// Why the website failed, explained at the lowest layer that is broken. The
// website test alone reports the first thing it tripped over (usually the
// name lookup), which would send a beginner after DNS for an unplugged cable.
export function rootCauseCode(mission, baseline) {
  if (!baseline || baseline.details.result?.ok) return null;
  const client = mission.targetClientId;
  for (const kind of ['pingGateway', 'pingServer', 'resolvePortal']) {
    const result = runMissionTest(mission, kind, client);
    if (!result.ok) return { code: result.code, plain: kind === 'pingGateway' && !['LINK_DOWN', 'VLAN_PATH_BLOCKED'].includes(result.code) ? 'GATEWAY_UNREACHABLE' : result.code };
  }
  const code = baseline.details.result.code;
  // Name lookup worked but the website did not answer: the name leads somewhere wrong.
  return { code, plain: code === 'NO_ROUTE' ? 'WRONG_SERVICE' : code };
}

function baselineTest(mission) {
  return mission.events.find((e) => e.kind === 'test' && e.deviceId === mission.targetClientId) ?? null;
}

function verifiedNow(mission, deviceId, testKind) {
  return mission.events.some((e) => e.kind === 'test' && e.deviceId === deviceId && e.details.testKind === testKind
    && e.details.result?.ok === true && e.revision === mission.network.revision);
}

// guidedSteps(mission) -> ordered steps, each with an id, what it shows, and
// done(): true once the mission itself shows the work was done. Steps with
// ack: true are read-and-continue steps; the caller records the tap.
export function guidedSteps(mission) {
  const walkthrough = walkthroughFor(mission);
  const fault = faultFor(mission);
  if (!walkthrough || !fault) return [];
  const blank = walkthrough.steps[3].blank;
  const events = mission.events ?? [];
  const inspected = (id) => events.some((e) => e.kind === 'inspection' && e.deviceId === id);
  const repaired = () => isRecipeRepaired(mission, walkthrough.recipeId);
  const baseline = baselineTest(mission);

  const steps = [
    { id: 'intro', ack: true, button: 'Start',
      title: 'A customer cannot open the company website',
      body: 'You are the technician. You will find out why and fix it, one step at a time.' },
    { id: 'pick-client', target: { kind: 'device', id: mission.targetClientId }, tab: 'network',
      title: 'Tap the customer\'s computer',
      body: 'It is the one marked "Start here" on the map.',
      done: () => inspected(mission.targetClientId) },
    { id: 'try-site', target: { kind: 'test', testKind: 'openPortal' }, tab: 'device',
      title: 'Tap "Try the website"',
      body: 'See the problem for yourself before you fix anything.',
      term: `Techs run this as: curl http://${PORTAL}`,
      done: () => Boolean(baseline) },
    { id: 'result', ack: true, button: 'Next', target: { kind: 'feedback' }, tab: 'device',
      title: baseline?.details?.result?.ok ? 'That worked' : 'It failed, just like the customer said',
      body: baseline?.details?.result?.ok ? 'This test passed. The next steps show where the fault is.' : plainResult(rootCauseCode(mission, baseline)?.plain),
      term: baseline?.details?.result?.ok ? null : `Error code: ${rootCauseCode(mission, baseline)?.code}` },
  ];
  if (fault.select?.id && fault.select.id !== mission.targetClientId) {
    steps.push({ id: 'pick-fault-device', target: { kind: 'device', id: fault.select.id }, tab: 'network',
      title: fault.select.title, body: fault.select.body,
      done: () => events.some((e) => e.kind === 'inspection' && e.deviceId === fault.select.id && e.index > (baseline?.index ?? -1)) });
  }
  steps.push(
    { id: 'look', ack: true, button: 'Got it', target: fault.look.target, tab: fault.look.tab,
      device: fault.select?.id ?? mission.targetClientId,
      title: fault.look.title, body: fault.look.body },
    { id: 'fix', blank: { ...blank, prompt: fault.ask }, term: fault.term,
      title: 'Your turn: fix it',
      body: fault.ask,
      done: repaired },
    { id: 'verify', finish: 'verify',
      title: 'Fixed. Now check it works',
      body: 'One tap tries the website from the customer\'s computer and from the other office.',
      done: () => verifiedNow(mission, mission.targetClientId, 'openPortal') && verifiedNow(mission, mission.protectedClientId, 'checkProtected') },
    { id: 'close', finish: 'close',
      title: 'Both offices work. Close the ticket',
      body: 'Here is a note for the customer. You can change it or keep it.',
      done: () => mission.status === 'completed' },
  );
  return steps;
}

// currentGuidedStep(mission, acks) -> {step, index, total} or null. A
// read-and-continue step also counts as done once any later step's work is
// done, so doing things out of order never strands the guide behind you.
export function currentGuidedStep(mission, acks = new Set()) {
  const steps = guidedSteps(mission);
  if (!steps.length) return null;
  const done = steps.map((s) => (s.ack ? acks.has(s.id) : Boolean(s.done?.())));
  for (let i = steps.length - 1; i >= 0; i -= 1) {
    if (done[i]) { for (let j = 0; j < i; j += 1) if (steps[j].ack) done[j] = true; break; }
  }
  const index = done.findIndex((d) => !d);
  if (index === -1) return null;
  return { step: steps[index], index, total: steps.length };
}

// The one-button finish: try the website from both computers, cite the
// evidence (the first failed test and the two passing checks), and draft the
// note. Pure state in, state out; main.js saves and renders.
export function guidedVerify(state) {
  const mission = state.mission;
  if (!mission) return state;
  let next = state;
  const target = runMissionTest(next.mission, 'openPortal', mission.targetClientId);
  next = recordTestEvent(next, 'openPortal', mission.targetClientId, target);
  const other = runMissionTest(next.mission, 'checkProtected', mission.targetClientId);
  next = recordTestEvent(next, 'checkProtected', mission.protectedClientId, other);
  const events = next.mission.events;
  const cited = new Set(next.mission.selectedFindingIds);
  const firstFailure = events.find((e) => e.kind === 'test' && e.details.result?.ok === false);
  if (firstFailure) cited.add(firstFailure.id);
  for (const e of events.slice(-2)) if (e.details.result?.ok) cited.add(e.id);
  const note = next.mission.completionNote?.trim() ? next.mission.completionNote : guidedNote(next.mission);
  return { ...next, mission: { ...next.mission, selectedFindingIds: [...cited], completionNote: note } };
}

// Applies the trainee's answer to the blank as the change it describes.
export function guidedFix(state, value) {
  const actions = fixActionsFor(state.mission, value);
  const { deviceId } = actions[0] ?? {};
  return applyMissionActions(state, actions, { deviceId: deviceId ?? state.mission.targetClientId });
}

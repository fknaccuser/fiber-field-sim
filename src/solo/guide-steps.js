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
  LINK_DOWN: 'the computer is not connected to the network',
  GATEWAY_UNREACHABLE: 'the computer cannot reach the router, its door out of the office',
  NO_ROUTE: 'the computer does not know a way to the website',
  VLAN_PATH_BLOCKED: 'the traffic lands in the wrong VLAN, like mail sent to the wrong room',
  DNS_UNREACHABLE: 'the computer cannot reach the server that looks up website names',
  DNS_NOT_FOUND: 'the name lookup found nothing for the website',
  WRONG_SERVICE: 'the website name leads to the wrong server',
  RETURN_PATH_FAILED: 'the answer cannot find its way back',
  DUPLICATE_IP: 'two devices are using the same address',
  INVALID_ADDRESS: 'the computer has an address that cannot work',
}

export function plainResult(code) {
  return PLAIN_RESULT[code] ?? 'the website did not open';
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
      body: 'It\'s the customer\'s cable, unplugged from the switch.' },
    ask: `Type ${accessPortOf(m).port?.label ?? 'Gi0/1'}, the switch port it belongs in.`,
    term: 'Techs call this reseating the cable.',
    fix: () => [{ type: 'setLinkConnected', linkId: accessPortOf(m).link.id, connected: true }],
    note: `Reconnected the customer's cable to switch port ${accessPortOf(m).port?.label ?? 'Gi0/1'}.`,
  }),
  P2: (m) => ({
    select: { id: accessPortOf(m).port?.deviceId, title: 'Tap the switch', body: 'The box the customer\'s cable plugs into.' },
    look: { target: { kind: 'row', label: `Port ${accessPortOf(m).port?.label}` }, tab: 'device',
      title: 'This port is switched off',
      body: `Port ${accessPortOf(m).port?.label}, the customer's port, says "administratively down".` },
    ask: 'Type up to turn the port back on.',
    term: 'On a Cisco switch the command is no shutdown.',
    fix: () => [{ type: 'setPortAdmin', portId: accessPortOf(m).port.id, adminUp: true }],
    note: `Turned switch port ${accessPortOf(m).port?.label} back on (no shutdown).`,
  }),
  I1: (m) => ({
    look: { target: { kind: 'row', label: 'IP address' }, tab: 'device',
      title: 'The address is in the wrong place',
      body: `Everyone in this office starts with ${prefixOf(m)}. This computer doesn't.` },
    ask: `Type a new address, like ${prefixOf(m)}.50`,
    term: `Techs say it belongs in the ${prefixOf(m)}.0/24 subnet.`,
    fix: (value) => [{ type: 'setClientAddress', deviceId: m.targetClientId, ip: String(value).trim(), prefix: m.requirements.targetPrefix }],
    note: `Moved the customer's computer to an address in ${prefixOf(m)}.0/24.`,
  }),
  I2: (m) => ({
    look: { target: { kind: 'row', label: 'Gateway' }, tab: 'device',
      title: 'The door out points nowhere',
      body: `The gateway is the door out of the office. ${device(m, m.targetClientId)?.gateway} leads nowhere.` },
    ask: `Type the router's address: ${prefixOf(m)}.1`,
    term: 'Techs call this the default gateway.',
    fix: (value) => [{ type: 'setClientGateway', deviceId: m.targetClientId, gateway: String(value).trim() }],
    note: `Set the customer's default gateway to ${prefixOf(m)}.1.`,
  }),
  V1: (m) => ({
    select: { id: accessPortOf(m).port?.deviceId, title: 'Tap the switch', body: 'The box the customer\'s cable plugs into.' },
    look: { target: { kind: 'row', label: `Port ${accessPortOf(m).port?.label}` }, tab: 'device',
      title: 'The port is in the wrong VLAN',
      body: `A VLAN is a separate room on the switch. This port is in VLAN ${accessPortOf(m).port?.accessVlan}; the customer belongs in ${m.requirements.targetVlan}.` },
    ask: `Type ${m.requirements.targetVlan}, the customer's VLAN.`,
    term: 'Techs call this the access VLAN.',
    fix: (value) => [{ type: 'setAccessVlan', portId: accessPortOf(m).port.id, vlanId: Number(String(value).trim()) }],
    note: `Put switch port ${accessPortOf(m).port?.label} back in VLAN ${m.requirements.targetVlan}.`,
  }),
  V2: (m) => ({
    select: { id: accessPortOf(m).port?.deviceId, title: 'Tap the switch', body: 'The box the customer\'s cable plugs into.' },
    look: { target: { kind: 'row', label: `Port ${trunkPortOf(m)?.label}` }, tab: 'device',
      title: 'The link between switches is missing a VLAN',
      body: `${trunkPortOf(m)?.label} is the trunk, the cable that carries VLANs between switches. VLAN ${m.requirements.targetVlan} is missing.` },
    ask: `Type both offices' VLANs: ${m.requirements.targetVlan},${m.requirements.protectedVlan}`,
    term: 'Techs call this the trunk allowed VLAN list.',
    fix: (value) => [{ type: 'setTrunkAllowedVlans', portId: trunkPortOf(m).id, vlans: String(value).split(/[,\s]+/).map(Number).filter(Number.isInteger) }],
    note: `Added VLAN ${m.requirements.targetVlan} back to the trunk on ${trunkPortOf(m)?.label}.`,
  }),
  D1: (m) => ({
    look: { target: { kind: 'row', label: 'DNS' }, tab: 'device',
      title: 'The name helper is wrong',
      body: `DNS looks up website names. This computer asks ${device(m, m.targetClientId)?.dns}, and nobody answers.` },
    ask: `Type the DNS server's address: ${serverAddress(m)}`,
    term: 'Techs call this the DNS resolver.',
    fix: (value) => [{ type: 'setClientDns', deviceId: m.targetClientId, dns: String(value).trim() }],
    note: `Pointed the customer's DNS at ${serverAddress(m)}.`,
  }),
  D2: (m) => ({
    select: { id: m.requirements.portalServerId, title: 'Tap the server', body: 'It holds the website and the list of names.' },
    look: { target: { kind: 'heading' }, tab: 'device',
      title: 'The website name points to the wrong place',
      body: `Its name list sends the website to the wrong address.` },
    ask: `Type this server's address: ${serverAddress(m)}`,
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

  // Every step is something to do; there are no read-and-tap-Next steps.
  // What the last step achieved rides at the top of the next card as `news`,
  // so each action gets its result right away and the story keeps moving.
  const failed = baseline && !baseline.details.result?.ok;
  const cause = rootCauseCode(mission, baseline);
  const resultNews = !baseline ? null : failed
    ? { ok: false, text: `It failed: ${plainResult(cause?.plain)}.`, code: cause?.code }
    : { ok: true, text: 'The website test passed. The fault is somewhere else.' };
  const pickFault = fault.select?.id && fault.select.id !== mission.targetClientId;

  const steps = [
    { id: 'pick-client', target: { kind: 'device', id: mission.targetClientId }, tab: 'network',
      title: 'A customer can\'t open the website. Tap their computer.',
      body: 'It is the one marked "Start here" on the map.',
      done: () => inspected(mission.targetClientId) },
    { id: 'try-site', target: { kind: 'test', testKind: 'openPortal' }, tab: 'device',
      news: { ok: true, text: 'Opened the customer\'s computer.' },
      title: 'Tap "Try the website"',
      body: 'See the problem for yourself first.',
      term: `Techs run this as: curl http://${PORTAL}`,
      done: () => Boolean(baseline) },
  ];
  if (pickFault) {
    steps.push({ id: 'pick-fault-device', target: { kind: 'device', id: fault.select.id }, tab: 'network',
      news: resultNews,
      title: fault.select.title, body: fault.select.body,
      done: () => events.some((e) => e.kind === 'inspection' && e.deviceId === fault.select.id && e.index > (baseline?.index ?? -1)) });
  }
  steps.push(
    { id: 'fix', target: fault.look.target, tab: fault.look.tab,
      device: fault.select?.id ?? mission.targetClientId,
      news: pickFault ? { ok: true, text: 'Found it.' } : resultNews,
      title: fault.look.title, body: fault.look.body,
      blank: { ...blank, prompt: fault.ask }, term: fault.term,
      done: repaired },
    { id: 'verify', finish: 'verify',
      news: { ok: true, text: 'Fixed. Your change is in.' },
      title: 'Check that it works',
      body: 'One tap tries the website from both offices.',
      done: () => verifiedNow(mission, mission.targetClientId, 'openPortal') && verifiedNow(mission, mission.protectedClientId, 'checkProtected') },
    { id: 'close', finish: 'close',
      news: { ok: true, text: 'Both offices can open the website.' },
      title: 'Close the ticket',
      body: 'Here is a note for the customer. Change it or keep it.',
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

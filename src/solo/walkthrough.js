// The guided walkthrough: a per-fault sequence that names the actual devices
// and addresses in this case, and finishes by making the trainee supply the
// fix themselves rather than watching it applied.
//
// Pure: no DOM, no randomness. Every value is read from the mission's own
// network and requirements, so a walkthrough is correct for any generated
// case rather than only the seed it was written against.

import { HINTS, renderHintText } from './content.js';

const CLIENT = 'the customer workstation';

function lanPrefix(mission) {
  return (mission?.requirements?.targetSubnet ?? '10.42.10.0').split('.').slice(0, 3).join('.');
}

function serviceAddress(mission) {
  return mission?.network?.devices?.find(d => d.id === mission.requirements?.portalServerId)?.ip ?? null;
}

function hostOctet(address) {
  const parts = String(address ?? '').split('.');
  return parts.length === 4 ? Number(parts[3]) : NaN;
}

function addressesInUse(mission) {
  return new Set((mission?.network?.devices ?? []).map(d => d.ip).filter(Boolean));
}

// A free host in the target /24. Rejects the network and broadcast addresses
// and the router's own address, and anything already assigned.
function checkFreeHostAddress(value, mission) {
  const prefix = lanPrefix(mission);
  const text = String(value ?? '').trim();
  if (!text.startsWith(prefix + '.')) return false;
  const host = hostOctet(text);
  if (!Number.isInteger(host) || host < 2 || host > 254) return false;
  return !addressesInUse(mission).has(text);
}

function equals(expected) {
  return (value) => String(value ?? '').trim() === String(expected);
}

function vlanList(value) {
  return String(value ?? '').split(/[,\s]+/).map(part => Number(part.trim())).filter(Number.isInteger);
}

// Each entry supplies the two case-specific steps. The opening and closing
// steps are shared, because the arc is the same regardless of the fault:
// see the symptom, prove it, find the break, fix the break.
const FAULTS = {
  P1: () => ({
    look: { title: 'Follow the cable', detail: `Select ${CLIENT} and read its link. The canvas draws a connected cable differently from a loose one, and this one is loose at the access port.` },
    blank: { prompt: 'The cable belongs in which switch port?', answer: 'Gi0/1', check: equals('Gi0/1'), hint: 'Read the port label on the switch end of the workstation link.' },
  }),
  P2: () => ({
    look: { title: 'Read the port, not the cable', detail: 'The cable is seated at both ends. Open the switch and read the state of the access port the workstation lands on: it is administratively down, which a healthy cable cannot overcome.' },
    blank: { prompt: 'Type the state the port must be set to.', answer: 'up', check: (v) => ['up', 'enabled', 'no shutdown'].includes(String(v ?? '').trim().toLowerCase()), hint: 'The opposite of shutdown.' },
  }),
  I1: (m) => ({
    look: { title: 'Compare the two addresses', detail: `${CLIENT} answers on an address outside ${lanPrefix(m)}.0/24, which is the network its gateway lives on. It can talk to its own neighbours and nothing beyond them.` },
    blank: { prompt: `Type a free host address in ${lanPrefix(m)}.0/24.`, answer: `${lanPrefix(m)}.50`, check: (v) => checkFreeHostAddress(v, m), hint: `Anything from ${lanPrefix(m)}.2 to .254 that no device already holds.` },
  }),
  I2: (m) => ({
    look: { title: 'Find who owns the gateway', detail: `The workstation is sending off-subnet traffic to an address no device on ${lanPrefix(m)}.0/24 answers for. Inspect the router's address on this segment and compare.` },
    blank: { prompt: 'Type the address the gateway should be.', answer: `${lanPrefix(m)}.1`, check: equals(`${lanPrefix(m)}.1`), hint: 'The router interface on the customer segment.' },
  }),
  V1: (m) => ({
    look: { title: 'Read the logical port, not the physical one', detail: `The link is up and the address is right. Open the switch access port: it has been placed in the other department's VLAN, so the frames are delivered to the wrong network entirely.` },
    blank: { prompt: 'Type the VLAN the access port belongs in.', answer: String(m?.requirements?.targetVlan ?? 10), check: equals(String(m?.requirements?.targetVlan ?? 10)), hint: 'The VLAN the customer segment uses.' },
  }),
  V2: (m) => ({
    look: { title: 'Walk the path between the switches', detail: 'The access port is correct. The break is on the trunk between switches, which has stopped carrying the customer VLAN while still carrying the other one.' },
    blank: { prompt: 'Type every VLAN the trunk must allow, separated by commas.', answer: `${m?.requirements?.targetVlan ?? 10},${m?.requirements?.protectedVlan ?? 20}`,
      check: (v) => { const list = vlanList(v); const need = [m?.requirements?.targetVlan ?? 10, m?.requirements?.protectedVlan ?? 20]; return need.every(n => list.includes(n)) && list.length === need.length; },
      hint: 'Adding the customer VLAN back is half of it. Removing the other one breaks the department that still works.' },
  }),
  D1: (m) => ({
    look: { title: 'Separate the name from the address', detail: `A test by address now succeeds and a test by name still fails, which puts the fault in resolution rather than in the path. Read the resolver configured on ${CLIENT}: nothing at that address answers DNS.` },
    blank: { prompt: 'Type the address of the server that does answer DNS.', answer: serviceAddress(m) ?? `${lanPrefix(m).split('.').slice(0,2).join('.')}.30.53`,
      check: (v) => equals(serviceAddress(m))(v), hint: 'Inspect the service server and read its address.' },
  }),
  D2: (m) => ({
    look: { title: 'Read what the name resolves to', detail: 'The resolver is reachable and answering. The answer it gives points at a host that does not serve the portal, so the record itself is the fault rather than the client.' },
    blank: { prompt: 'Type the address the portal record should return.', answer: serviceAddress(m) ?? null,
      check: (v) => equals(serviceAddress(m))(v), hint: 'The same server that answers DNS also serves the portal.' },
  }),
};

export function walkthroughRecipeId(mission) {
  const [first] = mission?.recipeIds ?? [];
  return FAULTS[first] ? first : null;
}

export function walkthroughFor(mission) {
  const recipeId = walkthroughRecipeId(mission);
  if (!recipeId || mission?.mode !== 'repair') return null;
  const fault = FAULTS[recipeId](mission);
  const prefix = lanPrefix(mission);
  const x = prefix.split('.')[1];

  return {
    recipeId,
    steps: [
      { index: 0, kind: 'orient', title: 'Read the work order, then look at the customer',
        detail: `The complaint is against ${mission.targetName}. Select ${CLIENT} on the canvas and inspect it. Nothing is committed by looking.`,
        focus: { deviceId: mission.targetClientId } },
      { index: 1, kind: 'baseline', title: 'Prove the failure before you chase it',
        detail: 'Run a test from the workstation. A recorded failure is what separates a diagnosis from a guess, and it lands in Findings for you to cite later.',
        focus: { deviceId: mission.targetClientId } },
      { index: 2, kind: 'locate', title: fault.look.title, detail: fault.look.detail,
        focus: { deviceId: mission.targetClientId } },
      { index: 3, kind: 'fix', title: 'Your turn: make the change',
        detail: renderHintText(HINTS[recipeId].step, x),
        blank: { ...fault.blank },
        focus: { deviceId: mission.targetClientId } },
    ],
  };
}

// Advances on what the trainee actually did, matching nextGuidance()'s
// event-driven approach rather than a click-through counter.
export function walkthroughPosition(mission) {
  const walkthrough = walkthroughFor(mission);
  if (!walkthrough) return null;
  const events = mission.events ?? [];
  let index = 0;
  if (events.some(e => e.kind === 'inspection')) index = 1;
  if (index === 1 && events.some(e => e.kind === 'test')) index = 2;
  if (index === 2 && events.some(e => e.kind === 'change')) index = 3;
  return { ...walkthrough, index, step: walkthrough.steps[index], done: index >= 3 && events.some(e => e.kind === 'change') };
}

export function checkBlank(mission, value) {
  const walkthrough = walkthroughFor(mission);
  const blank = walkthrough?.steps?.[3]?.blank;
  if (!blank) return { ok: false, reason: 'This case has no walkthrough.' };
  if (!String(value ?? '').trim()) return { ok: false, reason: 'Enter a value.' };
  return blank.check(value, mission) ? { ok: true } : { ok: false, reason: blank.hint };
}

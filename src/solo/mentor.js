// Beginner "mentor" layer: plain-language explanations of every device,
// interface, and core concept, shown as a hover/focus tooltip. The knowledge
// base and the small parsing helpers are pure (DOM-free, testable); only the
// tooltip element and attach* helpers touch `document`.
//
// The whole point is that a total beginner can hover anything on the canvas or
// in the inspector and be told, in everyday language, what it is and why it
// matters — the "explain it to me like I've never seen a network" layer that
// sits under the career path.

// --- Knowledge base -------------------------------------------------------

// Matched by device name first (most specific — these are the roles a learner
// actually sees on the canvas), then by kind as a fallback.
const DEVICE_BY_NAME = {
  'access switch': {
    title: 'Access Switch',
    tag: 'Layer 2',
    plain:
      'Think of this as the power strip for a row of desks. Every workstation, printer, and phone plugs into this switch first to join the local network. It moves traffic between devices on the same network using their hardware (MAC) addresses.',
  },
  'distribution switch': {
    title: 'Distribution Switch',
    tag: 'Layer 3',
    plain:
      'The traffic cop standing at the main hallway intersection. It gathers traffic coming from several access switches, routes between different VLANs and subnets, and feeds it up toward the core of the network.',
  },
  gateway: {
    title: 'Gateway Router',
    tag: 'Layer 3 · Router',
    plain:
      'The doorway out of the local network. Anything headed to a different subnet or the internet leaves through the router. Each workstation points at this router’s address (usually the .1) as its "default gateway".',
  },
  'dns and portal': {
    title: 'DNS & Portal Server',
    tag: 'Server',
    plain:
      'The phone book and the front desk of the network. It translates human names like portal.northline.test into machine addresses (that’s DNS), and it hosts the internal portal that workstations open to prove service is working.',
  },
  'protected workstation': {
    title: 'Protected Workstation',
    tag: 'Secured endpoint',
    plain:
      'A computer that’s locked down tight. If someone unplugs this authorized PC and tries to connect an unknown laptop, port security trips and shuts the port down. Use it to confirm security still holds after you fix something.',
  },
  'customer workstation': {
    title: 'Customer Workstation',
    tag: 'Endpoint',
    plain:
      'An ordinary user’s PC — and the place most troubleshooting starts. It has an IP address, a gateway, and a DNS server. This is where you run ping, nslookup, and open the portal to see what actually fails.',
  },
  'additional workstation': {
    title: 'Additional Workstation',
    tag: 'Endpoint',
    plain:
      'Another user’s PC on the network. Like any workstation, it has its own IP address, gateway, and DNS server, and it’s a place to test whether service works from more than one desk.',
  },
};

const DEVICE_BY_KIND = {
  client: {
    title: 'Workstation',
    tag: 'Endpoint',
    plain:
      'A person’s computer — where the actual work happens. Start troubleshooting here: check its IP address, gateway, and DNS, then run a test like ping or open the portal to see the symptom for yourself.',
  },
  switch: {
    title: 'Switch',
    tag: 'Layer 2',
    plain:
      'Connects many devices on the same local network and forwards traffic by hardware (MAC) address. Its ports are either "access" (one VLAN, for a single device) or "trunk" (many VLANs, between switches).',
  },
  router: {
    title: 'Router',
    tag: 'Layer 3',
    plain:
      'Connects different networks together and routes traffic between subnets and out to the internet. Workstations use it as their "default gateway" — the way out of their own network.',
  },
  server: {
    title: 'Server',
    tag: 'Server',
    plain:
      'A computer that provides a service to everyone else — such as translating names into addresses (DNS) or hosting a web portal — rather than being used by one person at a desk.',
  },
  firewall: {
    title: 'Firewall',
    tag: 'Security',
    plain:
      'The security guard at the boundary between networks. It allows the traffic that’s supposed to pass and blocks everything else, according to its rules.',
  },
  accessPoint: {
    title: 'Access Point',
    tag: 'Wi-Fi',
    plain:
      'Bridges wireless devices — laptops, phones — onto the wired network, so Wi-Fi clients can reach everything the cabled devices can.',
  },
  cloud: {
    title: 'Internet / WAN',
    tag: 'Beyond the LAN',
    plain:
      'Everything beyond your local network — the wider internet or the provider’s network. Traffic reaches it by going out through the router.',
  },
  fiber: {
    title: 'Fiber Cabinet',
    tag: 'Physical plant',
    plain:
      'Where fiber strands terminate and are patched onward. It’s the physical hand-off point between cabling runs.',
  },
  site: {
    title: 'Site',
    tag: 'Group',
    plain:
      'A collapsed group of devices at one location. Expand it to see the individual equipment inside.',
  },
};

// Display names can carry a "site: " / "customer: " style prefix (see
// layouts.js applyLabel and the site-collapsed labels); strip one leading
// "prefix: " so both role matching and prose read on the base name.
function baseName(name) {
  if (name == null) return '';
  return String(name).trim().replace(/^[a-z0-9 ]{1,24}:\s*/i, '');
}

export function explainDevice(device) {
  if (!device) return null;
  const raw = String(device.name ?? '').trim().toLowerCase();
  const stripped = baseName(raw).toLowerCase();
  const byName = DEVICE_BY_NAME[raw] ?? DEVICE_BY_NAME[stripped];
  const base = byName ?? DEVICE_BY_KIND[device.kind] ?? {
    title: device.name ?? 'Device',
    tag: device.kind ?? '',
    plain: 'A piece of network equipment.',
  };
  return { ...base };
}

// --- Interfaces -----------------------------------------------------------

const MEDIA_PREFIX = [
  { re: /^(GigabitEthernet|Gi)/i, family: 'GigabitEthernet', speed: '1 Gbps' },
  { re: /^(TenGigabitEthernet|Te)/i, family: 'TenGigabitEthernet', speed: '10 Gbps' },
  { re: /^(FastEthernet|Fa)/i, family: 'FastEthernet', speed: '100 Mbps' },
  { re: /^(Ethernet|eth|Eth)/i, family: 'Ethernet', speed: '' },
];

// Parses an interface label ("Gi0/0", "Gi0/0/0", "eth0", "Gi0/24") into its
// media family, human speed, and slot/module/port numbers where present.
export function parseInterface(label) {
  const text = String(label ?? '').trim();
  const match = MEDIA_PREFIX.find((m) => m.re.test(text)) ?? { family: 'Interface', speed: '' };
  const numbers = (text.match(/\d+/g) ?? []).map((n) => Number(n));
  return { label: text, family: match.family, speed: match.speed, numbers };
}

// How Cisco-style interface numbers read depends on how many there are:
// two numbers are slot/port, three are slot/module/port.
const SLOT_WORDS_BY_COUNT = {
  1: ['Port'],
  2: ['Slot', 'Port'],
  3: ['Slot', 'Module', 'Port'],
  4: ['Slot', 'Module', 'Sub-port', 'Port'],
};

function positionPhrase(numbers) {
  if (!numbers.length) return '';
  const words = SLOT_WORDS_BY_COUNT[numbers.length] ?? [];
  return numbers.map((n, i) => `${words[i] ?? 'Position'} ${n}`).join(', ');
}

export function explainPort(port, device) {
  if (!port) return null;
  const info = parseInterface(port.label);
  const isHostNic = /^eth/i.test(port.label);
  const speed = info.speed ? ` at ${info.speed}` : '';
  const statusParts = [port.adminUp ? 'Link: Up' : 'Link: Administratively down'];
  if (info.speed) statusParts.push(`Speed: ${info.speed}`);

  let plain;
  if (isHostNic) {
    plain =
      'The workstation’s network card — the single Ethernet port it uses to reach the whole network. If this is down, the computer is effectively unplugged.';
  } else {
    const where = positionPhrase(info.numbers);
    plain =
      `The physical socket where an Ethernet cable plugs in. The numbers mean ${where || 'its position on the device'}, and it moves data${speed}. ` +
      '"Up" means the link is live; "administratively down" means someone switched the port off in software.';
  }

  let note = '';
  if (port.mode === 'access') {
    note = `This is an access port: it carries exactly one VLAN (VLAN ${port.accessVlan}) — one dedicated lane for the single device plugged in here.`;
  } else if (port.mode === 'trunk') {
    const list = (port.allowedVlans ?? []).join(', ') || 'several';
    note = `This is a trunk port: it carries multiple VLANs at once (${list}) between switches — a multi-lane highway between network gear.`;
  } else if (port.mode === 'routed') {
    note = 'This is a routed port: it behaves like a router interface with its own IP address, not a plain switch port.';
  }

  return {
    title: `Interface: ${info.family} ${info.label.replace(/^[A-Za-z]+/, '')}`.trim(),
    tag: device?.name ? device.name : '',
    status: statusParts.join('  ·  '),
    plain,
    note,
  };
}

// --- Concepts (for configuration fields / glossary) -----------------------

const CONCEPTS = {
  vlan: {
    title: 'VLAN',
    tag: 'Segmentation',
    plain:
      'A VLAN splits one physical switch into separate virtual networks. Devices on VLAN 10 can’t talk directly to VLAN 20 without going through a router — like putting two departments on different floors even though they share the same building.',
  },
  gateway: {
    title: 'Default gateway',
    tag: 'Addressing',
    plain:
      'The address a device sends traffic to when the destination is outside its own network. It’s the router’s address on that network — the "way out". It is NOT the DNS server, and it can’t be a made-up unused address.',
  },
  dns: {
    title: 'DNS server',
    tag: 'Name resolution',
    plain:
      'Turns a name like portal.northline.test into an IP address. Reaching a server by its IP can work even when DNS is broken — so if a name fails but the IP pings, suspect DNS.',
  },
  subnet: {
    title: 'IP address & prefix (/24)',
    tag: 'Addressing',
    plain:
      'The IP address identifies the device; the prefix (/24) says which part is the network. Two devices must share the same network portion to talk directly — otherwise they need the router.',
  },
};

const CONCEPTS_EXTRA = {
  console: {
    title: 'Device console (CLI)',
    tag: 'Command line',
    plain:
      'A direct text link into one device — like plugging a laptop into its console port. You type commands (ipconfig, ping, nslookup, show…) and read the raw output, the same tools a real network engineer uses. Type ? to see what this device accepts.',
  },
  commandBuilder: {
    title: 'Command builder',
    tag: 'Helper',
    plain:
      'Not sure what to type? These buttons drop a valid command for this device into the input, so you can run it as-is or edit it — a scaffold while you learn the syntax.',
  },
  findings: {
    title: 'Findings',
    tag: 'Evidence',
    plain:
      'Your evidence log. Every device you inspect and every test you run is recorded here. Before you submit a repair, tick the findings that prove what was wrong and that you fixed it, then write a short note.',
  },
  tests: {
    title: 'Tests — read the symptom',
    tag: 'Method',
    plain:
      'Each button runs one check from a workstation and records pass/fail in Findings. Read the results as symptoms: WHICH test fails tells you WHERE the fault is — a local link, routing between networks, or DNS — so you fix the right layer instead of guessing.',
    note:
      'Work bottom-up: gateway → server IP → resolve name → open portal. The first test that fails points at the cause.',
  },
  diagnosis: {
    title: 'Symptom → cause → fix',
    tag: 'How to think',
    plain:
      'Troubleshooting runs from the symptom to the cause. “Can’t reach anything” is a common symptom of a local fault — a cable unplugged, a shut port, a wrong IP/subnet, or the access port on the wrong VLAN. “Works by IP but not by name” points at DNS. “This desk works, the next doesn’t” points at the VLAN on that port. Change one thing, test again.',
  },
};
Object.assign(CONCEPTS, CONCEPTS_EXTRA);

export function explainConcept(key) {
  const c = CONCEPTS[key];
  return c ? { ...c } : null;
}

// --- Cables / links -------------------------------------------------------

// `endpoints` optionally carries the two device names for a friendlier line.
export function explainCable(link, endpoints = {}) {
  const connected = link?.connected !== false;
  const aName = baseName(endpoints.aName);
  const bName = baseName(endpoints.bName);
  const between = aName && bName ? ` between ${aName} and ${bName}` : '';
  return {
    title: connected ? 'Network cable' : 'Disconnected cable',
    tag: connected ? 'Physical link · up' : 'Physical link · down',
    plain: `The physical connection${between}. It carries every bit of traffic that passes between these two devices.`,
    note: connected
      ? 'This link is connected. If traffic still fails, the cause is higher up — an address, VLAN, or service setting — not the cable itself.'
      : 'This link is DOWN (shown dashed). Nothing can cross it no matter how perfect the settings are, so reconnect it first. Always rule out the physical layer before blaming configuration.',
  };
}

// --- Tests (the workstation verification buttons) -------------------------

const TESTS = {
  pingGateway: {
    title: 'Test: Ping gateway',
    tag: 'Reachability',
    plain:
      'Sends a tiny "are you there?" message to this workstation’s gateway — the router that leads out of its network. A reply means the local path (cable, port, VLAN, IP) is good up to the router.',
    note:
      'A FAILURE here is a classic local-fault symptom. Look out for: the cable unplugged, a port administratively shut, a wrong IP or subnet on the PC, or the switch access port set to the wrong VLAN. Fix the physical and local layer first.',
  },
  pingServer: {
    title: 'Test: Ping server IP',
    tag: 'Reachability',
    plain:
      'Pings the portal server by its raw IP address. Success proves the network path all the way to the server works — separately from whether the server’s NAME resolves.',
    note:
      'If the gateway pings but THIS fails, the break is between networks. Look out for: a wrong router segment / gateway address, or the PC sitting in the wrong subnet or VLAN so its traffic never reaches the server’s network.',
  },
  resolvePortal: {
    title: 'Test: Resolve portal',
    tag: 'DNS',
    plain:
      'Asks DNS to turn the portal’s name into an IP address. This checks name resolution only — it does not prove the page will actually load.',
    note:
      'If you can ping the server’s IP but THIS fails, it’s a DNS symptom. Look out for: the PC’s DNS resolver set to a wrong or unreachable address, or the DNS server missing the portal’s record. The network is fine — the name lookup isn’t.',
  },
  openPortal: {
    title: 'Test: Open portal',
    tag: 'End-to-end',
    plain:
      'Opens the portal by name — the real check a user cares about. It only passes when addressing, VLAN, routing AND DNS are all correct at once.',
    note:
      'This is the symptom the customer actually reports, and a failure can come from ANY layer. Work bottom-up — gateway, then server IP, then resolve the name — and the first test that fails names the cause.',
  },
  checkProtected: {
    title: 'Test: Check protected client',
    tag: 'Security + service',
    plain:
      'Runs the portal check from the locked-down workstation, confirming your fix restored service for the authorized PC without tripping its port security.',
    note:
      'A FAILURE after your fix means: port security tripped (an unknown device was plugged in), or your change broke this PC’s own addressing or VLAN. It proves security held AND service works.',
  },
};

export function explainTest(id) {
  const t = TESTS[id];
  return t ? { ...t } : null;
}

// --- Tooltip element + attach helpers ------------------------------------

const STORAGE_KEY = 'field-sim:mentor-guide';
let enabled = readEnabled();

function readEnabled() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === null ? true : raw === '1';
  } catch {
    return true;
  }
}

export function mentorGuideEnabled() {
  return enabled;
}

export function setMentorGuide(value) {
  enabled = Boolean(value);
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    // Preference is a nicety; a storage failure just means it isn't remembered.
  }
  if (!enabled) hideTip();
  document.body?.classList.toggle('mentor-guide-off', !enabled);
}

let tip = null;
let visible = false;

function ensureTip() {
  if (tip) return tip;
  tip = document.createElement('div');
  tip.className = 'mentor-tip';
  tip.setAttribute('role', 'tooltip');
  tip.hidden = true;
  document.body.appendChild(tip);
  return tip;
}

function fillTip(spec) {
  const el = ensureTip();
  el.textContent = '';
  const head = document.createElement('div');
  head.className = 'mentor-tip-head';
  const title = document.createElement('span');
  title.className = 'mentor-tip-title';
  title.textContent = spec.title;
  head.appendChild(title);
  if (spec.tag) {
    const tag = document.createElement('span');
    tag.className = 'mentor-tip-tag';
    tag.textContent = spec.tag;
    head.appendChild(tag);
  }
  el.appendChild(head);
  if (spec.status) {
    const status = document.createElement('div');
    status.className = 'mentor-tip-status';
    status.textContent = spec.status;
    el.appendChild(status);
  }
  const body = document.createElement('p');
  body.className = 'mentor-tip-body';
  body.textContent = spec.plain;
  el.appendChild(body);
  if (spec.note) {
    const note = document.createElement('p');
    note.className = 'mentor-tip-note';
    note.textContent = spec.note;
    el.appendChild(note);
  }
  const hint = document.createElement('div');
  hint.className = 'mentor-tip-hint';
  hint.textContent = 'Guided help';
  el.appendChild(hint);
}

function place(x, y) {
  const el = ensureTip();
  el.hidden = false;
  visible = true;
  const margin = 14;
  const rect = el.getBoundingClientRect();
  let left = x + margin;
  let top = y + margin;
  if (left + rect.width + margin > window.innerWidth) left = x - rect.width - margin;
  if (left < margin) left = margin;
  if (top + rect.height + margin > window.innerHeight) top = y - rect.height - margin;
  if (top < margin) top = margin;
  el.style.left = `${Math.round(left)}px`;
  el.style.top = `${Math.round(top)}px`;
}

export function hideTip() {
  if (tip) tip.hidden = true;
  visible = false;
}

// `specFn` is called lazily on hover so building the explanation costs nothing
// until the learner actually points at the element.
export function attachMentor(element, specFn) {
  if (!element) return;
  const show = (x, y) => {
    if (!enabled) return;
    const spec = specFn();
    if (!spec) return;
    fillTip(spec);
    place(x, y);
  };
  element.addEventListener('pointerenter', (e) => {
    if (e.pointerType === 'touch') return; // touch devices tap to select instead
    show(e.clientX, e.clientY);
  });
  element.addEventListener('pointermove', (e) => {
    if (visible && e.pointerType !== 'touch') place(e.clientX, e.clientY);
  });
  element.addEventListener('pointerleave', hideTip);
  element.addEventListener('pointerdown', hideTip);
  element.addEventListener('focus', () => {
    if (!enabled) return;
    // Only show on *keyboard* focus. A click/tap also focuses the element, and
    // showing on that would leave the tip stuck open after selecting a device.
    let keyboard = false;
    try {
      keyboard = element.matches(':focus-visible');
    } catch {
      keyboard = false;
    }
    if (!keyboard) return;
    const spec = specFn();
    if (!spec) return;
    fillTip(spec);
    const r = element.getBoundingClientRect();
    place(r.left + r.width / 2, r.bottom);
  });
  element.addEventListener('blur', hideTip);
  // Activating (Enter/Space), Escape, or tabbing away also dismisses it.
  element.addEventListener('keydown', (e) => {
    if (['Enter', ' ', 'Spacebar', 'Escape', 'Tab'].includes(e.key)) hideTip();
  });
}

// A press or tap anywhere, a scroll, or Escape dismisses any open tooltip —
// the safety net that guarantees it never stays stuck (e.g. after a tap, or
// once the view re-renders and the hovered element is gone).
if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', () => { if (visible) hideTip(); }, true);
  document.addEventListener('scroll', () => { if (visible) hideTip(); }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && visible) hideTip(); }, true);
}

// Small pill button that toggles the beginner tooltips, for a toolbar.
export function createGuideToggle() {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'mentor-guide-toggle';
  const sync = () => {
    button.textContent = enabled ? 'Guided help: On' : 'Guided help: Off';
    button.setAttribute('aria-pressed', String(enabled));
    button.title = enabled
      ? 'Beginner explanations show when you hover a device or interface. Click to turn off.'
      : 'Beginner explanations are off. Click to turn on plain-language help on hover.';
  };
  button.addEventListener('click', () => {
    setMentorGuide(!enabled);
    sync();
  });
  sync();
  return button;
}

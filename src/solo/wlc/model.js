// A wireless LAN controller, as the configuration its web GUI edits.
//
// Pure. The GUI in screen.js reads and writes this shape; the work orders
// below check it. The concepts follow what the CCNA expects in a WLC GUI:
// WLANs (profile, SSID, ID, status, interface), Layer 2 security (WPA2 or
// WPA3, AES, PSK or 802.1X), RADIUS servers for 802.1X, dynamic interfaces
// that put a WLAN on a VLAN, QoS profiles, and AP modes. The look is our own.

import { rngOf, int, pick, sample, privateBase, subnetIn, addHost } from '../study/gen/kit.js';

export const QOS = ['platinum', 'gold', 'silver', 'bronze'];
export const QOS_LABEL = { platinum: 'Platinum (voice)', gold: 'Gold (video)', silver: 'Silver (best effort)', bronze: 'Bronze (background)' };
export const AP_MODES = ['local', 'flexconnect', 'monitor', 'sniffer'];

export function emptyController({ mgmt, gw, port = 1 } = {}) {
  return {
    interfaces: {
      management: { name: 'management', vlan: 0, port, ip: mgmt, mask: '255.255.255.0', gw, dhcp: gw, fixed: true },
      virtual: { name: 'virtual', vlan: null, port: null, ip: '192.0.2.1', mask: null, gw: null, dhcp: null, fixed: true },
    },
    wlans: {},
    radius: {},
    aps: [],
  };
}

export const blankWlan = (id, profile, ssid) => ({
  id, profile, ssid, enabled: false, iface: 'management', broadcast: true,
  l2: 'wpa2', wpa2: true, wpa3: false, aes: true, tkip: false, akm: '802.1x', psk: '', radius: [], qos: 'silver',
});

export const clone = (c) => JSON.parse(JSON.stringify(c));

// One line per thing set, so a grade can name what nobody asked for.
export function entries(c) {
  const out = new Set();
  for (const i of Object.values(c.interfaces)) if (!i.fixed) out.add(`interface ${i.name} vlan ${i.vlan} port ${i.port} ${i.ip}/${i.mask} gw ${i.gw} dhcp ${i.dhcp}`);
  for (const w of Object.values(c.wlans)) out.add(`wlan ${w.id} ${w.profile} ${w.ssid} ${w.enabled ? 'enabled' : 'disabled'} ${w.iface} ${w.l2}${w.wpa2 ? ' wpa2' : ''}${w.wpa3 ? ' wpa3' : ''}${w.aes ? ' aes' : ''}${w.tkip ? ' tkip' : ''} ${w.akm} ${w.akm === 'psk' ? w.psk : ''} radius ${w.radius.join(',')} qos ${w.qos} ${w.broadcast ? 'broadcast' : 'hidden'}`);
  for (const r of Object.values(c.radius)) out.add(`radius ${r.index} ${r.ip} ${r.port} ${r.enabled ? 'enabled' : 'disabled'}`);
  for (const a of c.aps) out.add(`ap ${a.name} ${a.mode}`);
  return out;
}

const SITES = ['Harbor Clinic', 'Elm Street Branch', 'Northgate Office', 'Mesa Warehouse', 'Riverside Annex', 'Pine Ridge School', 'Lakeview Dental', 'Canyon Library'];
const REQUESTERS = ['IT Service Desk', 'Network Operations', 'Branch Manager', 'Security Team', 'Facilities'];
const WORDS = ['harbor', 'cedar', 'falcon', 'meadow', 'granite', 'summit', 'willow', 'copper'];

function frame(rnd, kind) {
  return { number: `CHG${int(rnd, 10000, 99999)}`, site: pick(rnd, SITES), requester: pick(rnd, REQUESTERS), priority: pick(rnd, ['P3', 'P3', 'P4']), kind };
}

// The controller as the order finds it: management interface, one corporate
// WLAN already there, a few joined APs.
function startingController(rnd, n) {
  const c = emptyController({ mgmt: addHost(n.mgmtNet, 10), gw: addHost(n.mgmtNet, 1) });
  c.wlans[1] = { ...blankWlan(1, 'CORP', `${n.code}-CORP`), enabled: true, akm: '802.1x', qos: 'silver', radius: [] };
  c.aps = sample(rnd, ['AP-LOBBY', 'AP-FLOOR1', 'AP-FLOOR2', 'AP-WAREHOUSE', 'AP-BREAKROOM'], 3).map(name => ({ name, mode: 'local', model: 'AP-3800', ip: addHost(n.mgmtNet, int(rnd, 40, 90)) }));
  return c;
}

const wlanBySsid = (c, ssid) => Object.values(c.wlans).find(w => w.ssid === ssid) ?? null;

const CODES = { 'Harbor Clinic': 'HBR', 'Elm Street Branch': 'ELM', 'Northgate Office': 'NGT', 'Mesa Warehouse': 'MSA', 'Riverside Annex': 'RVA', 'Pine Ridge School': 'PRS', 'Lakeview Dental': 'LKD', 'Canyon Library': 'CNL' };

// The SSID prefix comes from the site, so the order reads as one place.
function plan(rnd, site) {
  const code = CODES[site] ?? 'SITE';
  const mgmtNet = subnetIn(rnd, privateBase(rnd), 24);
  let userNet = subnetIn(rnd, privateBase(rnd), 24);
  while (userNet === mgmtNet) userNet = subnetIn(rnd, privateBase(rnd), 24);
  return { code, mgmtNet, userNet, vlan: pick(rnd, [20, 30, 40, 50, 60, 110, 120, 200]) };
}

// ------------------------------------------------------------ the orders
export const WLC_TEMPLATES = [
  {
    kind: 'wlc-psk',
    title: 'Put a guest WLAN on its own VLAN',
    minutes: 10,
    lights: ['t2-wlc', 't5-wsec'],
    make(seed) {
      const rnd = rngOf(seed);
      const f = frame(rnd, this.kind);
      const n = plan(rnd, f.site);
      const ifName = pick(rnd, ['guest', 'guest-net', 'visitors']);
      const ssid = `${n.code}-${pick(rnd, ['GUEST', 'VISITOR', 'PUBLIC'])}`;
      const profile = pick(rnd, ['GUEST', 'GUEST-WIFI', 'VISITORS']);
      const id = int(rnd, 2, 9);
      const pass = `${pick(rnd, WORDS)}-${pick(rnd, WORDS)}-${int(rnd, 10, 99)}`;
      const qos = pick(rnd, ['bronze', 'silver']);
      const ip = addHost(n.userNet, 5);
      const gw = addHost(n.userNet, 1);
      const reqs = [
        { id: 'iface', text: `Create a dynamic interface "${ifName}" on VLAN ${n.vlan}, port 1, ${ip}/24, gateway ${gw}, DHCP server ${gw}`,
          check: (c) => { const i = c.interfaces[ifName]; return Boolean(i) && Number(i.vlan) === n.vlan && Number(i.port) === 1 && i.ip === ip && i.mask === '255.255.255.0' && i.gw === gw && i.dhcp === gw; },
          hint: 'Controller → Interfaces → New. Name and VLAN first, then the port, address, mask, gateway and DHCP server on the next page. A WLAN rides whichever interface it is mapped to, so this interface is what puts guests on their VLAN.' },
        { id: 'wlan', text: `Create WLAN ID ${id}, profile "${profile}", SSID "${ssid}"`,
          check: (c) => { const w = c.wlans[id]; return Boolean(w) && w.profile === profile && w.ssid === ssid; },
          hint: 'WLANs → Create New. The profile name is the controller\'s label; the SSID is what phones see. The ID is the number the controller files it under.' },
        { id: 'map', text: `Map it to the "${ifName}" interface`,
          check: (c) => wlanBySsid(c, ssid)?.iface === ifName,
          hint: 'In the WLAN\'s General tab, Interface/Interface Group. Left on management, guests land on the controller\'s own VLAN.' },
        { id: 'sec', text: `Secure it with WPA2, AES, and the pre-shared key ${pass}`,
          check: (c) => { const w = wlanBySsid(c, ssid); return Boolean(w) && w.l2 === 'wpa2' && w.wpa2 && w.aes && !w.tkip && w.akm === 'psk' && w.psk === pass; },
          hint: 'Security → Layer 2: WPA+WPA2, tick WPA2 Policy and AES (not TKIP), Auth Key Management PSK, then the passphrase. 802.1X is for a RADIUS-backed WLAN.' },
        { id: 'qos', text: `Set its QoS to ${QOS_LABEL[qos]}`,
          check: (c) => wlanBySsid(c, ssid)?.qos === qos,
          hint: 'QoS tab. Platinum is for voice, Gold video, Silver best effort, Bronze background traffic like guests.' },
        { id: 'on', text: 'Enable the WLAN', check: (c) => Boolean(wlanBySsid(c, ssid)?.enabled),
          hint: 'General tab, Status: Enabled. A new WLAN is created disabled, and nothing broadcasts until it is turned on.' },
      ];
      return {
        ...f, title: this.title, minutes: this.minutes, lights: this.lights,
        summary: `Visitors at ${f.site} are on the corporate SSID. Give them their own WLAN on VLAN ${n.vlan}, with a passphrase the front desk can hand out.`,
        notes: [`Guest VLAN ${n.vlan}: ${n.userNet}/24, gateway and DHCP ${gw}, controller gets .5`, `SSID ${ssid}, WLAN ID ${id}, profile ${profile}`, `Passphrase ${pass}`, 'Controller uplink is port 1'],
        controller: startingController(rnd, n), requirements: reqs,
        owns: [/^interface /, new RegExp(`^wlan ${id} `)],
        // The finished configuration, for tests and for checking the checks.
        solve: (c) => {
          c.interfaces[ifName] = { name: ifName, vlan: n.vlan, port: 1, ip, mask: '255.255.255.0', gw, dhcp: gw };
          c.wlans[id] = { ...blankWlan(id, profile, ssid), iface: ifName, akm: 'psk', psk: pass, qos, enabled: true };
        },
      };
    },
  },
  {
    kind: 'wlc-dot1x',
    title: 'Staff WLAN with RADIUS',
    minutes: 12,
    lights: ['t2-wlc', 't5-wsec', 't5-aaa'],
    make(seed) {
      const rnd = rngOf(seed);
      const f = frame(rnd, this.kind);
      const n = plan(rnd, f.site);
      const ifName = pick(rnd, ['staff', 'staff-net', 'employees']);
      const ssid = `${n.code}-${pick(rnd, ['STAFF', 'SECURE', 'EMPLOYEE'])}`;
      const profile = pick(rnd, ['STAFF', 'SECURE', 'EMPLOYEE']);
      const id = int(rnd, 2, 9);
      const radiusIp = addHost(n.mgmtNet, int(rnd, 20, 30));
      const secret = `${pick(rnd, WORDS)}${int(rnd, 100, 999)}`;
      const qos = pick(rnd, ['silver', 'gold', 'platinum']);
      const ip = addHost(n.userNet, 5);
      const gw = addHost(n.userNet, 1);
      const reqs = [
        { id: 'radius', text: `Add RADIUS authentication server ${radiusIp}, port 1812, shared secret ${secret}, enabled`,
          check: (c) => Object.values(c.radius).some(r => r.ip === radiusIp && Number(r.port) === 1812 && r.secret === secret && r.enabled),
          hint: 'Security → AAA → RADIUS → Authentication → New. 1812 is the RADIUS authentication port. The secret must match what the server has for this controller.' },
        { id: 'iface', text: `Create a dynamic interface "${ifName}" on VLAN ${n.vlan}, port 1, ${ip}/24, gateway ${gw}, DHCP server ${gw}`,
          check: (c) => { const i = c.interfaces[ifName]; return Boolean(i) && Number(i.vlan) === n.vlan && Number(i.port) === 1 && i.ip === ip && i.mask === '255.255.255.0' && i.gw === gw && i.dhcp === gw; },
          hint: 'Controller → Interfaces → New, then the details page.' },
        { id: 'wlan', text: `Create WLAN ID ${id}, profile "${profile}", SSID "${ssid}", on the "${ifName}" interface`,
          check: (c) => { const w = c.wlans[id]; return Boolean(w) && w.profile === profile && w.ssid === ssid && w.iface === ifName; },
          hint: 'WLANs → Create New, then General → Interface.' },
        { id: 'sec', text: 'Secure it with WPA2, AES and 802.1X, authenticating against that RADIUS server',
          check: (c) => { const w = wlanBySsid(c, ssid); const r = Object.values(c.radius).find(x => x.ip === radiusIp); return Boolean(w && r) && w.l2 === 'wpa2' && w.wpa2 && w.aes && !w.tkip && w.akm === '802.1x' && w.radius.includes(r.index); },
          hint: 'Security → Layer 2: WPA2 Policy, AES, Auth Key Management 802.1X. Then Security → AAA Servers and pick the server. This is WPA2-Enterprise: each user signs in, nobody shares a key.' },
        { id: 'qos', text: `Set its QoS to ${QOS_LABEL[qos]}`, check: (c) => wlanBySsid(c, ssid)?.qos === qos,
          hint: 'QoS tab.' },
        { id: 'on', text: 'Enable the WLAN', check: (c) => Boolean(wlanBySsid(c, ssid)?.enabled), hint: 'General tab, Status: Enabled.' },
      ];
      return {
        ...f, title: this.title, minutes: this.minutes, lights: this.lights,
        summary: `${f.site} is retiring its shared staff passphrase. Build a WLAN where each person signs in with their own account through the RADIUS server, on VLAN ${n.vlan}.`,
        notes: [`RADIUS ${radiusIp}, auth port 1812, secret ${secret}`, `Staff VLAN ${n.vlan}: ${n.userNet}/24, gateway and DHCP ${gw}, controller gets .5`, `SSID ${ssid}, WLAN ID ${id}, profile ${profile}`],
        controller: startingController(rnd, n), requirements: reqs,
        owns: [/^interface /, new RegExp(`^wlan ${id} `), /^radius /],
        solve: (c) => {
          c.radius[1] = { index: 1, ip: radiusIp, secret, port: 1812, enabled: true };
          c.interfaces[ifName] = { name: ifName, vlan: n.vlan, port: 1, ip, mask: '255.255.255.0', gw, dhcp: gw };
          c.wlans[id] = { ...blankWlan(id, profile, ssid), iface: ifName, akm: '802.1x', radius: [1], qos, enabled: true };
        },
      };
    },
  },
  {
    kind: 'wlc-flex',
    title: 'Branch APs that survive a WAN outage',
    minutes: 6,
    lights: ['t2-wlan-arch', 't2-wlc'],
    make(seed) {
      const rnd = rngOf(seed);
      const f = frame(rnd, this.kind);
      const n = plan(rnd, f.site);
      const c = startingController(rnd, n);
      const branch = c.aps.slice(0, 2).map(a => a.name);
      const mon = c.aps[2].name;
      const reqs = [
        { id: 'flex', text: `Put ${branch.join(' and ')} in FlexConnect mode`, check: (x) => branch.every(name => x.aps.find(a => a.name === name)?.mode === 'flexconnect'),
          hint: 'Wireless → All APs → the AP → General → AP Mode. FlexConnect switches client traffic locally at the branch and keeps serving clients if the link to the controller drops. In local mode, all traffic tunnels to the controller.' },
        { id: 'mon', text: `Turn ${mon} into a dedicated monitor for rogue APs`, check: (x) => x.aps.find(a => a.name === mon)?.mode === 'monitor',
          hint: 'Same page. Monitor mode stops serving clients and only listens, scanning every channel for rogues and interference.' },
      ];
      return {
        ...f, title: this.title, minutes: this.minutes, lights: this.lights,
        summary: `${f.site}'s APs tunnel everything back to the controller over a WAN link that drops a few times a week, and wireless dies with it. Keep two of them serving clients locally, and use the third to watch for rogue access points.`,
        notes: [`APs: ${c.aps.map(a => a.name).join(', ')}`, `Controller management ${addHost(n.mgmtNet, 10)}`],
        controller: c, requirements: reqs,
        owns: [/^ap /],
        solve: (x) => { for (const a of x.aps) a.mode = branch.includes(a.name) ? 'flexconnect' : a.name === mon ? 'monitor' : a.mode; },
      };
    },
  },
];

export const wlcTemplateOf = (kind) => WLC_TEMPLATES.find(t => t.kind === kind) ?? null;

// Grade a finished controller: each requirement a point, each line nobody
// asked for minus one, the same rule as the Field desk.
export function gradeWlc(order, start, now) {
  const reqs = order.requirements.map(r => ({ id: r.id, text: r.text, hint: r.hint, ok: (() => { try { return Boolean(r.check(now)); } catch { return false; } })() }));
  const before = entries(start);
  const after = entries(now);
  const owned = (e) => order.owns.some(re => re.test(e));
  const extras = [...after].filter(e => !before.has(e) && !owned(e)).map(e => ({ text: e, kind: 'added' }))
    .concat([...before].filter(e => !after.has(e) && !owned(e)).map(e => ({ text: `removed: ${e}`, kind: 'removed' })));
  const got = reqs.filter(r => r.ok).length;
  const pct = Math.max(0, Math.round((100 * (got - extras.length)) / reqs.length));
  return { reqs, extras, got, total: reqs.length, pct };
}

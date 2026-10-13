// Build work orders for the Field desk: a switch out of the box, SSH,
// VLANs, an uplink trunk, an EtherChannel, edge-port hygiene. Each template
// turns a seed into one concrete order (site, hostnames, VLAN numbers,
// subnets, ports), so no two runs are the same exercise.
//
// An order is plain data plus check functions:
//   devices [{ id, kind, x, y, pc? }], links, setup, saved, start
//   requirements [{ id, text, device, check(w), owns: { DEV: [RegExp] }, hint, show: { DEV: [lines] } }]
//   tests [{ id, text, check(w) }]
// "owns" lists the running-config lines a requirement is allowed to touch;
// the grader treats any other changed line as extra configuration.

import { rngOf, int, pick, sample, privateBase, subnetIn, addHost } from '../study/gen/kit.js';
import { interfaceState, ping as pingWorld, l2Of } from '../labs/world.js';
import { memberFlag, operMode } from '../labs/switching.js';
import { parseIp } from '../labs/ip4.js';

const ip = parseIp;
const NIC = 'FastEthernet0';
const MASK24 = '255.255.255.0';
const cfg = (w, d) => w.devices[d].config;
const port = (w, d, n) => cfg(w, d).interfaces[n];
const swp = (w, d, n) => port(w, d, n)?.sw;
const up = (w, d, n) => interfaceState(w, d, n).up;
const reach = (w, d, dst) => pingWorld(w, d, ip(dst)).ok;
const sameList = (a, b) => Array.isArray(a) && a.length === b.length && a.every((v, i) => v === b[i]);
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const ifRe = (...names) => new RegExp(`^interface (${names.map(esc).join('|')})\\|`);
const vlanRe = (...ids) => new RegExp(`^vlan\\|(${ids.join('|')}) `);
const short = (n) => n.replace('GigabitEthernet', 'Gi').replace('FastEthernet', 'Fa').replace('Port-channel', 'Po');
const lower = (n) => short(n).toLowerCase();

let linkSeq = 0;
const L = (a, ai, b, bi) => ({ id: `l${linkSeq += 1}`, ends: [[a, ai], [b, bi]] });

const SITES = ['Harbor Clinic', 'Elm Street Branch', 'Northgate Office', 'Mesa Warehouse', 'Riverside Annex', 'Pine Ridge School', 'Lakeview Dental', 'Canyon Library', 'Bayside Depot', 'Cedar Hall'];
const REQUESTERS = ['IT Service Desk', 'Network Operations', 'Branch Manager', 'Facilities', 'Security Team', 'Project Lead'];
const VLAN_NAMES = ['SALES', 'ENG', 'HR', 'FINANCE', 'GUEST', 'LAB', 'OPS', 'CLINIC', 'FRONTDESK', 'STAFF', 'CAMERAS', 'PRINTERS'];

function frame(rnd, kind) {
  return {
    number: `CHG${int(rnd, 10000, 99999)}`,
    site: pick(rnd, SITES),
    requester: pick(rnd, REQUESTERS),
    priority: pick(rnd, ['P2', 'P3', 'P3', 'P4']),
    kind,
  };
}

// Two different /24s. A 192.168.x.0 base holds only one, so draw a new
// base when the first has no room.
function twoNets(rnd) {
  const a = subnetIn(rnd, privateBase(rnd), 24);
  let b = a;
  while (b === a) b = subnetIn(rnd, privateBase(rnd), 24);
  return [a, b];
}

// An access switch hanging off a router, with an admin PC on another subnet
// behind the router: the PC proves the switch's gateway works.
function managedSite(rnd) {
  const [lan, admin] = twoNets(rnd);
  return { lan, admin, gw: addHost(lan, 1), sw: addHost(lan, int(rnd, 2, 30)), pc: addHost(admin, int(rnd, 10, 60)), adminGw: addHost(admin, 1) };
}

export const TEMPLATES = [
  // ------------------------------------------------------------ out of the box
  {
    kind: 'build-access',
    title: 'Rack a new access switch',
    minutes: 10,
    lights: ['t0-base', 't5-access'],
    make(seed) {
      const rnd = rngOf(seed);
      const f = frame(rnd, this.kind);
      const host = pick(rnd, ['ACC1', 'ACC2', 'IDF1-SW', 'FL2-ACC', 'BR-ACC1', 'CLOSET-SW']);
      const router = pick(rnd, ['BR-RTR', 'R1', 'EDGE1', 'SITE-RTR']);
      const mgmt = pick(rnd, [1, 99, 100, 250]);
      const mgmtName = pick(rnd, ['MGMT', 'MANAGEMENT', 'NETMGMT']);
      const uplink = pick(rnd, ['GigabitEthernet0/1', 'GigabitEthernet0/2']);
      const a = managedSite(rnd);
      const svi = `Vlan${mgmt}`;
      const reqs = [
        { id: 'hostname', text: `Name the switch ${host}`, device: host, check: (w) => cfg(w, host).hostname === host, owns: { [host]: [/^global\|hostname /] },
          hint: 'hostname, in global configuration.', show: { [host]: ['enable', 'configure terminal', `hostname ${host}`] } },
        { id: 'secret', text: 'Protect privileged mode with an enable secret', device: host, check: (w) => Boolean(cfg(w, host).enableSecret), owns: { [host]: [/\|enable (secret|password) /] },
          hint: 'enable secret, so it is stored hashed.', show: { [host]: ['enable secret Ch4ngeMe!'] } },
        { id: 'console', text: 'Require a password on the console line', device: host, check: (w) => Boolean(cfg(w, host).lines.con.password) && cfg(w, host).lines.con.login === 'line', owns: { [host]: [/^line con 0\|/] },
          hint: 'line console 0, password, login.', show: { [host]: ['line console 0', 'password C0nsole!', 'login'] } },
        { id: 'vty', text: 'Require a login on all 16 VTY lines', device: host, check: (w) => { const v = cfg(w, host).lines.vty; return (v.login === 'line' && Boolean(v.password)) || (v.login === 'local' && Object.keys(cfg(w, host).users).length > 0); }, owns: { [host]: [/^line vty/, /\|username /] },
          hint: 'line vty 0 15, then a password and login (or login local with a username).', show: { [host]: ['line vty 0 15', 'password Vty!pass', 'login'] } },
      ];
      if (mgmt !== 1) {
        reqs.push(
          { id: 'mgmtvlan', text: `Create VLAN ${mgmt} named ${mgmtName}`, device: host, check: (w) => cfg(w, host).vlans[mgmt]?.name === mgmtName, owns: { [host]: [vlanRe(mgmt)] },
            hint: `vlan ${mgmt}, then name ${mgmtName}.`, show: { [host]: [`vlan ${mgmt}`, `name ${mgmtName}`] } },
          { id: 'uplink', text: `Make ${short(uplink)}, the link to ${router}, an access port in VLAN ${mgmt}`, device: host, check: (w) => swp(w, host, uplink).mode === 'access' && swp(w, host, uplink).access === mgmt, owns: { [host]: [ifRe(uplink)] },
            hint: `${router}'s port is a plain routed port, so the management VLAN reaches it untagged on an access port.`, show: { [host]: [`interface ${lower(uplink)}`, 'switchport mode access', `switchport access vlan ${mgmt}`] } },
        );
      }
      reqs.push(
        { id: 'svi', text: `Give ${host} the management address ${a.sw}/24 on VLAN ${mgmt}, up`, device: host, check: (w) => port(w, host, svi)?.ip === ip(a.sw) && port(w, host, svi)?.mask === ip(MASK24) && up(w, host, svi), owns: { [host]: [ifRe(svi)] },
          hint: `interface vlan ${mgmt}, ip address, no shutdown. The SVI is up once a port in VLAN ${mgmt} is up.`, show: { [host]: [`interface vlan ${mgmt}`, `ip address ${a.sw} ${MASK24}`, 'no shutdown'] } },
        { id: 'gateway', text: `Point the switch at ${router} (${a.gw}) as its default gateway`, device: host, check: (w) => cfg(w, host).defaultGateway === ip(a.gw), owns: { [host]: [/ip default-gateway/] },
          hint: 'ip default-gateway, in global configuration.', show: { [host]: ['exit', `ip default-gateway ${a.gw}`] } },
        { id: 'save', text: 'Save the configuration', device: host, check: (w) => w.devices[host].startup?.hostname === host && w.devices[host].startup?.defaultGateway === ip(a.gw), owns: {},
          hint: 'copy running-config startup-config, from privileged EXEC.', show: { [host]: ['end', 'copy running-config startup-config', ''] } },
      );
      return {
        ...f, title: this.title, minutes: this.minutes, lights: this.lights, start: host,
        summary: `A new switch, ${host}, is racked at ${f.site} and patched from its ${short(uplink)} to ${router} Gi0/0. It is fresh from the box. Make it manageable from the admin subnet, then save it.`,
        devices: [{ id: host, kind: 'switch', x: 50, y: 14 }, { id: router, kind: 'router', x: 50, y: 50 }, { id: 'ADMIN', kind: 'pc', x: 84, y: 50, pc: { ip: a.pc, mask: MASK24, gateway: a.adminGw } }],
        links: [L(host, uplink, router, 'GigabitEthernet0/0'), L(router, 'GigabitEthernet0/1', 'ADMIN', NIC)],
        setup: { [router]: [`hostname ${router}`, 'interface g0/0', `ip address ${a.gw} ${MASK24}`, 'no shutdown', 'interface g0/1', `ip address ${a.adminGw} ${MASK24}`, 'no shutdown'] },
        saved: [router],
        notes: [`Management VLAN ${mgmt}`, `Switch ${a.sw}/24, gateway ${a.gw}`, `Admin PC ${a.pc}`],
        requirements: reqs,
        tests: [
          { id: 'gw', text: `${host} pings its gateway ${a.gw}`, check: (w) => reach(w, host, a.gw) },
          { id: 'admin', text: `The admin PC (${a.pc}) pings ${host}`, check: (w) => reach(w, 'ADMIN', a.sw) },
        ],
      };
    },
  },

  // ------------------------------------------------------------ SSH
  {
    kind: 'build-ssh',
    title: 'Lock a switch down to SSH',
    minutes: 8,
    lights: ['t0-remote', 't5-access'],
    make(seed) {
      const rnd = rngOf(seed);
      const f = frame(rnd, this.kind);
      const host = pick(rnd, ['ACC3', 'IDF2-SW', 'LAB-SW', 'FL1-ACC', 'MDF-SW']);
      const a = managedSite(rnd);
      const domain = pick(rnd, ['corp.local', 'branch.lan', 'fieldops.net', 'clinic.internal', 'site.example']);
      const user = pick(rnd, ['netadmin', 'jsmith', 'tech1', 'fieldops', 'ops2']);
      const bits = pick(rnd, [1024, 2048]);
      const reqs = [
        { id: 'domain', text: `Set the domain name to ${domain}`, device: host, check: (w) => cfg(w, host).domain === domain, owns: { [host]: [/ip domain name/] },
          hint: 'ip domain name, in global configuration. RSA keys are named hostname.domain.', show: { [host]: ['enable', 'Cl0set!', 'configure terminal', `ip domain name ${domain}`] } },
        { id: 'keys', text: `Generate RSA keys of at least ${bits} bits`, device: host, check: (w) => (w.devices[host].rsaBits ?? 0) >= bits, owns: {},
          hint: 'crypto key generate rsa, then answer the modulus question.', show: { [host]: [`crypto key generate rsa modulus ${bits}`] } },
        { id: 'v2', text: 'Allow SSH version 2 only', device: host, check: (w) => cfg(w, host).sshVersion === 2, owns: { [host]: [/ip ssh version/] },
          hint: 'ip ssh version 2.', show: { [host]: ['ip ssh version 2'] } },
        { id: 'user', text: `Create the local user ${user} with a secret`, device: host, check: (w) => Boolean(cfg(w, host).users[user]?.secret), owns: { [host]: [/\|username /] },
          hint: 'username NAME secret PASSWORD. secret, not password, so it is hashed.', show: { [host]: [`username ${user} secret S3cure!pw`] } },
        { id: 'local', text: 'Make the VTY lines log in against local users', device: host, check: (w) => cfg(w, host).lines.vty.login === 'local', owns: { [host]: [/^line vty/] },
          hint: 'line vty 0 15, login local.', show: { [host]: ['line vty 0 15', 'login local'] } },
        { id: 'sshonly', text: 'Allow only SSH on the VTY lines', device: host, check: (w) => cfg(w, host).lines.vty.transport === 'ssh', owns: { [host]: [/^line vty/] },
          hint: 'transport input ssh, under the VTY lines.', show: { [host]: ['transport input ssh'] } },
      ];
      return {
        ...f, title: this.title, minutes: this.minutes, lights: this.lights, start: host,
        summary: `${host} at ${f.site} still takes Telnet with a shared password. The enable secret is Cl0set!. Move remote access to SSH version 2 with named logins, and nothing else.`,
        devices: [{ id: host, kind: 'switch', x: 50, y: 14 }, { id: 'R1', kind: 'router', x: 50, y: 50 }, { id: 'ADMIN', kind: 'pc', x: 84, y: 50, pc: { ip: a.pc, mask: MASK24, gateway: a.adminGw } }],
        links: [L(host, 'GigabitEthernet0/1', 'R1', 'GigabitEthernet0/0'), L('R1', 'GigabitEthernet0/1', 'ADMIN', NIC)],
        setup: {
          R1: ['hostname R1', 'interface g0/0', `ip address ${a.gw} ${MASK24}`, 'no shutdown', 'interface g0/1', `ip address ${a.adminGw} ${MASK24}`, 'no shutdown'],
          [host]: [`hostname ${host}`, 'enable secret Cl0set!', 'interface vlan 1', `ip address ${a.sw} ${MASK24}`, 'no shutdown', 'exit', `ip default-gateway ${a.gw}`, 'line vty 0 15', 'password telnet123', 'login', 'transport input telnet'],
        },
        saved: ['R1', host],
        notes: [`Switch ${a.sw}, gateway ${a.gw}`, `Domain ${domain}, user ${user}, ${bits}-bit keys`],
        requirements: reqs,
        tests: [
          { id: 'ssh', text: 'show ip ssh would say SSH Enabled - version 2.0', check: (w) => Boolean(w.devices[host].rsaBits) && cfg(w, host).sshVersion === 2 },
          { id: 'reach', text: `The admin PC still reaches ${host}`, check: (w) => reach(w, 'ADMIN', a.sw) },
        ],
      };
    },
  },

  // ------------------------------------------------------------ VLANs
  {
    kind: 'build-vlans',
    title: 'Carve the VLANs on a new floor',
    minutes: 10,
    lights: ['t2-vlans', 't5-l2sec'],
    make(seed) {
      const rnd = rngOf(seed);
      const f = frame(rnd, this.kind);
      const host = pick(rnd, ['FL3-ACC', 'ACC4', 'WING-B-SW', 'IDF3-SW']);
      const [va, vb] = sample(rnd, [10, 20, 30, 40, 50, 60, 70, 80, 90, 110, 120], 2).sort((x, y) => x - y);
      const [na, nb] = sample(rnd, VLAN_NAMES, 2);
      const park = pick(rnd, [999, 900, 666]);
      const parkName = pick(rnd, ['PARKING', 'UNUSED', 'BLACKHOLE']);
      const used = sample(rnd, Array.from({ length: 16 }, (_, k) => k + 1), 4).sort((x, y) => x - y);
      const groupA = sample(rnd, used, 2).sort((x, y) => x - y);
      const groupB = used.filter(n => !groupA.includes(n));
      const fa = (n) => `FastEthernet0/${n}`;
      const [netA, netB] = twoNets(rnd);
      const pcs = [
        { id: 'PC1', port: groupA[0], ip: addHost(netA, 11) }, { id: 'PC2', port: groupA[1], ip: addHost(netA, 12) },
        { id: 'PC3', port: groupB[0], ip: addHost(netB, 11) }, { id: 'PC4', port: groupB[1], ip: addHost(netB, 12) },
      ];
      const parked = Array.from({ length: 8 }, (_, k) => fa(17 + k));
      const inVlan = (w, ports, v) => ports.every(n => swp(w, host, fa(n)).mode === 'access' && swp(w, host, fa(n)).access === v);
      return {
        ...f, title: this.title, minutes: this.minutes, lights: this.lights, start: host,
        summary: `${f.site} is opening a new floor. ${host} is named and racked; every port is still in VLAN 1. Put each team in its own VLAN and park the ports nobody uses yet.`,
        devices: [
          { id: host, kind: 'switch', x: 50, y: 16 },
          ...pcs.map((p, k) => ({ id: p.id, kind: 'pc', x: 14 + k * 24, y: 52, pc: { ip: p.ip, mask: MASK24 } })),
        ],
        links: pcs.map(p => L(p.id, NIC, host, fa(p.port))),
        setup: { [host]: [`hostname ${host}`] },
        saved: [],
        notes: [`${na}: Fa0/${groupA.join(', Fa0/')} (${netA}/24)`, `${nb}: Fa0/${groupB.join(', Fa0/')} (${netB}/24)`, `Spare: Fa0/17 to Fa0/24`],
        requirements: [
          { id: 'va', text: `Create VLAN ${va} named ${na}`, device: host, check: (w) => cfg(w, host).vlans[va]?.name === na, owns: { [host]: [vlanRe(va)] },
            hint: `vlan ${va}, then name ${na}.`, show: { [host]: ['enable', 'configure terminal', `vlan ${va}`, `name ${na}`] } },
          { id: 'vb', text: `Create VLAN ${vb} named ${nb}`, device: host, check: (w) => cfg(w, host).vlans[vb]?.name === nb, owns: { [host]: [vlanRe(vb)] },
            hint: `vlan ${vb}, then name ${nb}.`, show: { [host]: [`vlan ${vb}`, `name ${nb}`] } },
          { id: 'pa', text: `Make Fa0/${groupA[0]} and Fa0/${groupA[1]} access ports in VLAN ${va}`, device: host, check: (w) => inVlan(w, groupA, va), owns: { [host]: [ifRe(...groupA.map(fa))] },
            hint: 'The two ports are not next to each other. interface range takes a comma: f0/1 , f0/5.', show: { [host]: [`interface range f0/${groupA[0]} , f0/${groupA[1]}`, 'switchport mode access', `switchport access vlan ${va}`] } },
          { id: 'pb', text: `Make Fa0/${groupB[0]} and Fa0/${groupB[1]} access ports in VLAN ${vb}`, device: host, check: (w) => inVlan(w, groupB, vb), owns: { [host]: [ifRe(...groupB.map(fa))] },
            hint: 'Same pattern, other ports, other VLAN.', show: { [host]: [`interface range f0/${groupB[0]} , f0/${groupB[1]}`, 'switchport mode access', `switchport access vlan ${vb}`] } },
          { id: 'park', text: `Park Fa0/17 to Fa0/24: VLAN ${park} named ${parkName}, access mode, shut down`, device: host,
            check: (w) => cfg(w, host).vlans[park]?.name === parkName && parked.every(n => swp(w, host, n).access === park && swp(w, host, n).mode === 'access' && port(w, host, n).shutdown),
            owns: { [host]: [vlanRe(park), ifRe(...parked)] },
            hint: 'Create the VLAN, then one interface range for all eight.', show: { [host]: [`vlan ${park}`, `name ${parkName}`, 'interface range f0/17 - 24', 'switchport mode access', `switchport access vlan ${park}`, 'shutdown'] } },
        ],
        tests: [
          { id: 'a', text: `PC1 reaches PC2 in ${na}`, check: (w) => reach(w, 'PC1', pcs[1].ip) },
          { id: 'b', text: `PC3 reaches PC4 in ${nb}`, check: (w) => reach(w, 'PC3', pcs[3].ip) },
        ],
      };
    },
  },

  // ------------------------------------------------------------ the uplink
  {
    kind: 'build-uplink',
    title: 'Trunk a new switch to distribution',
    minutes: 10,
    lights: ['t2-trunks'],
    make(seed) {
      const rnd = rngOf(seed);
      const f = frame(rnd, this.kind);
      const acc = pick(rnd, ['ACC5', 'IDF4-SW', 'FL4-ACC', 'EAST-ACC']);
      const dist = pick(rnd, ['DIST1', 'DIST2', 'MDF-DIST', 'CORE-SW']);
      const [va, vb] = sample(rnd, [10, 20, 30, 40, 50, 60, 70, 80], 2).sort((x, y) => x - y);
      const [na, nb] = sample(rnd, VLAN_NAMES, 2);
      const native = pick(rnd, [99, 999, 333, 900]);
      const accUp = pick(rnd, ['GigabitEthernet0/1', 'GigabitEthernet0/2']);
      const distDown = pick(rnd, ['GigabitEthernet0/1', 'GigabitEthernet0/2', 'FastEthernet0/24']);
      const noDtp = rnd() < 0.5;
      const [netA, netB] = twoNets(rnd);
      const vlans = [`vlan ${va}`, `name ${na}`, `vlan ${vb}`, `name ${nb}`];
      const access = (n, v) => [`interface f0/${n}`, 'switchport mode access', `switchport access vlan ${v}`];
      const both = [[acc, accUp], [dist, distDown]];
      const reqs = [
        { id: 'trunkA', text: `Make ${acc} ${short(accUp)} a static trunk`, device: acc, check: (w) => swp(w, acc, accUp).mode === 'trunk', owns: { [acc]: [ifRe(accUp)] },
          hint: 'switchport mode trunk.', show: { [acc]: ['enable', 'configure terminal', `interface ${lower(accUp)}`, 'switchport mode trunk'] } },
        { id: 'trunkD', text: `Make ${dist} ${short(distDown)} a static trunk`, device: dist, check: (w) => swp(w, dist, distDown).mode === 'trunk', owns: { [dist]: [ifRe(distDown)] },
          hint: 'Static on both ends, so it never depends on DTP.', show: { [dist]: ['enable', 'configure terminal', `interface ${lower(distDown)}`, 'switchport mode trunk'] } },
        { id: 'allowed', text: `Allow only VLANs ${va} and ${vb} on the trunk, both ends`, device: acc, check: (w) => both.every(([d, n]) => sameList(swp(w, d, n).allowed, [va, vb])), owns: { [acc]: [ifRe(accUp)], [dist]: [ifRe(distDown)] },
          hint: `switchport trunk allowed vlan ${va},${vb} on each end.`, show: { [acc]: [`switchport trunk allowed vlan ${va},${vb}`], [dist]: [`switchport trunk allowed vlan ${va},${vb}`] } },
        { id: 'native', text: `Use VLAN ${native} (named NATIVE) as the native VLAN, both ends`, device: acc,
          check: (w) => both.every(([d, n]) => cfg(w, d).vlans[native]?.name === 'NATIVE' && swp(w, d, n).native === native),
          owns: { [acc]: [ifRe(accUp), vlanRe(native)], [dist]: [ifRe(distDown), vlanRe(native)] },
          hint: 'Create the VLAN first on each switch, then switchport trunk native vlan.', show: { [acc]: [`vlan ${native}`, 'name NATIVE', `interface ${lower(accUp)}`, `switchport trunk native vlan ${native}`], [dist]: [`vlan ${native}`, 'name NATIVE', `interface ${lower(distDown)}`, `switchport trunk native vlan ${native}`] } },
      ];
      if (noDtp) {
        reqs.push({ id: 'nodtp', text: 'Turn DTP off on the uplink, both ends', device: acc, check: (w) => both.every(([d, n]) => swp(w, d, n).nonegotiate), owns: { [acc]: [ifRe(accUp)], [dist]: [ifRe(distDown)] },
          hint: 'switchport nonegotiate, on a port that is already a static trunk.', show: { [acc]: [`interface ${lower(accUp)}`, 'switchport nonegotiate'], [dist]: [`interface ${lower(distDown)}`, 'switchport nonegotiate'] } });
      }
      return {
        ...f, title: this.title, minutes: this.minutes, lights: this.lights, start: acc,
        summary: `${acc} at ${f.site} has its VLANs and access ports done. Its ${short(accUp)} is cabled to ${dist} ${short(distDown)}, both still at factory settings. Build the trunk to the site standard.`,
        devices: [
          { id: dist, kind: 'switch', x: 50, y: 12 }, { id: acc, kind: 'switch', x: 50, y: 40 },
          { id: 'PC1', kind: 'pc', x: 18, y: 62, pc: { ip: addHost(netA, 11), mask: MASK24 } }, { id: 'PC2', kind: 'pc', x: 40, y: 62, pc: { ip: addHost(netB, 11), mask: MASK24 } },
          { id: 'PC3', kind: 'pc', x: 86, y: 12, pc: { ip: addHost(netA, 12), mask: MASK24 } }, { id: 'PC4', kind: 'pc', x: 86, y: 34, pc: { ip: addHost(netB, 12), mask: MASK24 } },
        ],
        links: [L(acc, accUp, dist, distDown), L('PC1', NIC, acc, 'FastEthernet0/1'), L('PC2', NIC, acc, 'FastEthernet0/2'), L('PC3', NIC, dist, 'FastEthernet0/1'), L('PC4', NIC, dist, 'FastEthernet0/2')],
        setup: {
          [acc]: [`hostname ${acc}`, ...vlans, ...access(1, va), ...access(2, vb)],
          [dist]: [`hostname ${dist}`, ...vlans, ...access(1, va), ...access(2, vb)],
        },
        saved: [],
        notes: [`${na} = VLAN ${va}, ${nb} = VLAN ${vb}`, `Native VLAN ${native}`, noDtp ? 'Standard: DTP off on trunks' : 'Standard: static trunks'],
        requirements: reqs,
        tests: [
          { id: 'a', text: `PC1 (${acc}) reaches PC3 (${dist}) in ${na}`, check: (w) => reach(w, 'PC1', addHost(netA, 12)) },
          { id: 'b', text: `PC2 (${acc}) reaches PC4 (${dist}) in ${nb}`, check: (w) => reach(w, 'PC2', addHost(netB, 12)) },
          { id: 'oper', text: 'Both ends show trunking', check: (w) => both.every(([d, n]) => operMode(w, d, n) === 'trunk') },
        ],
      };
    },
  },

  // ------------------------------------------------------------ EtherChannel
  {
    kind: 'build-bundle',
    title: 'Bundle two uplinks into an EtherChannel',
    minutes: 8,
    lights: ['t2-etherchannel'],
    make(seed) {
      const rnd = rngOf(seed);
      const f = frame(rnd, this.kind);
      const s1 = pick(rnd, ['DIST1', 'CORE1', 'MDF-SW']);
      const s2 = pick(rnd, ['ACC6', 'IDF5-SW', 'FL5-ACC']);
      const lacp = rnd() < 0.6;
      const group = int(rnd, 1, 6);
      const m1 = lacp ? 'active' : 'desirable';
      const m2 = lacp ? pick(rnd, ['passive', 'active']) : pick(rnd, ['auto', 'desirable']);
      const pair = pick(rnd, [['GigabitEthernet0/1', 'GigabitEthernet0/2'], ['FastEthernet0/23', 'FastEthernet0/24']]);
      const po = `Port-channel${group}`;
      const base = privateBase(rnd);
      const net = subnetIn(rnd, base, 24);
      const rangeOf = (p) => (p[0].startsWith('Gig') ? 'g0/1 - 2' : 'f0/23 - 24');
      const trunk = [`interface range ${rangeOf(pair)}`, 'switchport mode trunk'];
      const bundled = (w) => pair.every(n => memberFlag(w, s1, n) === 'P' && memberFlag(w, s2, n) === 'P');
      return {
        ...f, title: this.title, minutes: this.minutes, lights: this.lights, start: s1,
        summary: `${s1} and ${s2} at ${f.site} are joined by two trunks, and spanning tree is blocking one. Bundle them as channel group ${group} using ${lacp ? 'LACP' : 'PAgP'}: ${s1} ${m1}, ${s2} ${m2}.`,
        devices: [{ id: s1, kind: 'switch', x: 50, y: 12 }, { id: s2, kind: 'switch', x: 50, y: 44 }, { id: 'PC1', kind: 'pc', x: 86, y: 12, pc: { ip: addHost(net, 11), mask: MASK24 } }, { id: 'PC2', kind: 'pc', x: 86, y: 44, pc: { ip: addHost(net, 12), mask: MASK24 } }],
        links: [L(s1, pair[0], s2, pair[0]), L(s1, pair[1], s2, pair[1]), L('PC1', NIC, s1, 'FastEthernet0/1'), L('PC2', NIC, s2, 'FastEthernet0/1')],
        macs: { [s1]: '0019.e8d0.0001', [s2]: '0019.e8d0.0002' },
        setup: { [s1]: [`hostname ${s1}`, ...trunk], [s2]: [`hostname ${s2}`, ...trunk] },
        saved: [],
        notes: [`Members: ${short(pair[0])} and ${short(pair[1])} on both`, `Group ${group}, ${lacp ? 'LACP' : 'PAgP'}`],
        requirements: [
          { id: 's1', text: `On ${s1}, put both links in channel group ${group}, mode ${m1}`, device: s1, check: (w) => pair.every(n => swp(w, s1, n).channel?.group === group && swp(w, s1, n).channel.mode === m1), owns: { [s1]: [ifRe(...pair, po)] },
            hint: `interface range, then channel-group ${group} mode ${m1}.`, show: { [s1]: ['enable', 'configure terminal', `interface range ${rangeOf(pair)}`, `channel-group ${group} mode ${m1}`] } },
          { id: 's2', text: `On ${s2}, the same group, mode ${m2}`, device: s2, check: (w) => pair.every(n => swp(w, s2, n).channel?.group === group && swp(w, s2, n).channel.mode === m2), owns: { [s2]: [ifRe(...pair, po)] },
            hint: `channel-group ${group} mode ${m2}.`, show: { [s2]: ['enable', 'configure terminal', `interface range ${rangeOf(pair)}`, `channel-group ${group} mode ${m2}`] } },
          { id: 'up', text: 'Both members bundled (P) on both switches', device: s1, check: bundled, owns: {},
            hint: 'show etherchannel summary. I means no partner; s means settings differ.', show: { [s1]: ['do show etherchannel summary'] } },
          { id: 'potrunk', text: `${po} is a trunk on both switches`, device: s1, check: (w) => [s1, s2].every(d => port(w, d, po)?.sw?.mode === 'trunk'), owns: { [s1]: [ifRe(po)], [s2]: [ifRe(po)] },
            hint: 'The Port-channel takes its settings from the members you bundled; check it with show interfaces trunk.', show: { [s1]: ['do show interfaces trunk'] } },
        ],
        tests: [
          { id: 'stp', text: 'Spanning tree blocks nothing between them', check: (w) => !Object.values(l2Of(w).stp[s2]?.[1]?.ports ?? {}).some(p => p.state === 'BLK') && bundled(w) },
          { id: 'ping', text: 'PC1 reaches PC2', check: (w) => reach(w, 'PC1', addHost(net, 12)) },
        ],
      };
    },
  },

  // ------------------------------------------------------------ edge ports
  {
    kind: 'build-edge',
    title: 'Harden the edge ports',
    minutes: 10,
    lights: ['t2-stp', 't5-l2sec'],
    make(seed) {
      const rnd = rngOf(seed);
      const f = frame(rnd, this.kind);
      const host = pick(rnd, ['ACC7', 'LOBBY-SW', 'FL6-ACC', 'CLINIC-SW']);
      const v = pick(rnd, [10, 20, 30, 40, 50]);
      const vname = pick(rnd, VLAN_NAMES);
      const first = int(rnd, 1, 8);
      const ports = [first, first + 1, first + 2].map(n => `FastEthernet0/${n}`);
      const max = pick(rnd, [1, 2]);
      const violation = pick(rnd, ['shutdown', 'restrict', 'protect']);
      const base = privateBase(rnd);
      const net = subnetIn(rnd, base, 24);
      const range = `f0/${first} - ${first + 2}`;
      const all = (w, fn) => ports.every(n => fn(swp(w, host, n), n));
      return {
        ...f, title: this.title, minutes: this.minutes, lights: this.lights, start: host,
        summary: `${host} at ${f.site} has three desks on ${short(ports[0])} to ${short(ports[2])}, VLAN ${v} (${vname}). Bring them to the access-port standard before the audit.`,
        devices: [{ id: host, kind: 'switch', x: 50, y: 14 }, ...ports.map((_, k) => ({ id: `PC${k + 1}`, kind: 'pc', x: 20 + k * 30, y: 50, pc: { ip: addHost(net, 11 + k), mask: MASK24 } }))],
        links: ports.map((n, k) => L(`PC${k + 1}`, NIC, host, n)),
        setup: { [host]: [`hostname ${host}`, `vlan ${v}`, `name ${vname}`, `interface range ${range}`, 'switchport mode access', `switchport access vlan ${v}`] },
        saved: [],
        notes: [`Desk ports ${short(ports[0])} to ${short(ports[2])}`, `Port security: max ${max}, violation ${violation}, sticky`],
        requirements: [
          { id: 'portfast', text: 'PortFast on the three desk ports', device: host, check: (w) => all(w, s => s.portfast), owns: { [host]: [ifRe(...ports)] },
            hint: 'spanning-tree portfast under an interface range.', show: { [host]: ['enable', 'configure terminal', `interface range ${range}`, 'spanning-tree portfast'] } },
          { id: 'guard', text: 'BPDU Guard on the three desk ports', device: host, check: (w) => all(w, s => s.bpduguard === 'enable'), owns: { [host]: [ifRe(...ports)] },
            hint: 'spanning-tree bpduguard enable.', show: { [host]: ['spanning-tree bpduguard enable'] } },
          { id: 'psec', text: 'Port security on, learning MACs as sticky', device: host, check: (w) => all(w, s => s.psec.on && s.psec.sticky), owns: { [host]: [ifRe(...ports)] },
            hint: 'switchport port-security, then switchport port-security mac-address sticky.', show: { [host]: ['switchport port-security', 'switchport port-security mac-address sticky'] } },
          { id: 'max', text: `Allow at most ${max} MAC${max > 1 ? 's' : ''} per port`, device: host, check: (w) => all(w, s => s.psec.on && s.psec.max === max), owns: { [host]: [ifRe(...ports)] },
            hint: `switchport port-security maximum ${max}. 1 is the default.`, show: { [host]: [`switchport port-security maximum ${max}`] } },
          { id: 'violation', text: `On a violation: ${violation}`, device: host, check: (w) => all(w, s => s.psec.on && s.psec.violation === violation), owns: { [host]: [ifRe(...ports)] },
            hint: violation === 'shutdown' ? 'shutdown is the default.' : `switchport port-security violation ${violation}.`, show: { [host]: [`switchport port-security violation ${violation}`] } },
        ],
        tests: [
          { id: 'up', text: 'All three desk ports up, none err-disabled', check: (w) => ports.every(n => up(w, host, n)) },
          { id: 'ping', text: 'PC1 reaches PC3', check: (w) => reach(w, 'PC1', addHost(net, 13)) },
        ],
      };
    },
  },
];

export const templateOf = (kind) => TEMPLATES.find(t => t.kind === kind) ?? null;

export function makeOrder(kind, seed) {
  const t = templateOf(kind);
  if (!t) throw new Error(`Unknown work order kind "${kind}"`);
  linkSeq = 0;
  return { ...t.make(seed), seed };
}

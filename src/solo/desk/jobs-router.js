// Router work orders for the Field desk: builds (DHCP, NAT, ACLs, router on
// a stick, OSPF, NTP and syslog) and changes to a working network (move a
// desk, add a VLAN to a trunk, add a backup route). Same shape as jobs.js.
//
// Checks that test behavior run on a copy of the world, so grading never
// changes the learner's network, hit counters or leases.

import { rngOf, int, pick, sample, privateBase, subnetIn, addHost, maskOf } from '../study/gen/kit.js';
import { interfaceState, exchange, requestDhcp, routingTable, neighbors } from '../labs/world.js';
import { aceMatches } from '../labs/services.js';
import { negotiate } from '../labs/switching.js';
import { parseIp } from '../labs/ip4.js';
import { cloneWorld } from './grade.js';

const ip = parseIp;
const NIC = 'FastEthernet0';
const M24 = '255.255.255.0';
const cfg = (w, d) => w.devices[d].config;
const port = (w, d, n) => cfg(w, d).interfaces[n];
const swp = (w, d, n) => port(w, d, n)?.sw;
const up = (w, d, n) => interfaceState(w, d, n).up;
const sameList = (a, b) => Array.isArray(a) && a.length === b.length && a.every((v, i) => v === b[i]);
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const ifRe = (...names) => new RegExp(`^interface (${names.map(esc).join('|')})\\|`);
const vlanRe = (...ids) => new RegExp(`^vlan\\|(${ids.join('|')}) `);
const globalRe = (prefix) => new RegExp(`^global\\|${esc(prefix)}`);
const short = (n) => n.replace('GigabitEthernet', 'Gi').replace('FastEthernet', 'Fa');
const lower = (n) => short(n).toLowerCase();
const PC_LINES = /^pc\|/;

// Behavior, tried on a copy.
const tryIt = (w, fn) => fn(cloneWorld(w));
const reachOn = (w, d, dst, opts) => exchange(w, d, ip(dst), opts).ok;
const reach = (w, d, dst, opts = {}) => tryIt(w, c => reachOn(c, d, dst, opts));
let linkSeq = 0;
const L = (a, ai, b, bi) => ({ id: `r${linkSeq += 1}`, ends: [[a, ai], [b, bi]] });

const SITES = ['Harbor Clinic', 'Elm Street Branch', 'Northgate Office', 'Mesa Warehouse', 'Riverside Annex', 'Pine Ridge School', 'Lakeview Dental', 'Canyon Library', 'Bayside Depot', 'Cedar Hall'];
const REQUESTERS = ['IT Service Desk', 'Network Operations', 'Branch Manager', 'Facilities', 'Security Team', 'Project Lead'];
const VLAN_NAMES = ['SALES', 'ENG', 'HR', 'FINANCE', 'GUEST', 'LAB', 'OPS', 'CLINIC', 'STAFF', 'CAMERAS'];
const ROUTERS = ['BR-RTR', 'R1', 'EDGE1', 'SITE-RTR', 'BR2-RTR'];

function frame(rnd, kind, prefix = 'CHG') {
  return { number: `${prefix}${int(rnd, 10000, 99999)}`, site: pick(rnd, SITES), requester: pick(rnd, REQUESTERS), priority: pick(rnd, ['P2', 'P3', 'P3', 'P4']), kind };
}

function nets(rnd, n) {
  const out = [];
  while (out.length < n) {
    const x = subnetIn(rnd, privateBase(rnd), 24);
    if (!out.includes(x)) out.push(x);
  }
  return out;
}

// A /29 of documentation space for the WAN, so a static NAT has spare
// public addresses: .1 ISP, .2 router, .3 to .6 free.
const wan29 = (rnd) => `203.0.113.${8 * int(rnd, 1, 30)}`;
const WEB_NET = '198.51.100.0';

export const ROUTER_TEMPLATES = [
  // ------------------------------------------------------------ DHCP
  {
    kind: 'build-dhcp',
    title: 'Hand out addresses at a branch',
    minutes: 10,
    lights: ['t4-dhcp-dns'],
    make(seed) {
      const rnd = rngOf(seed);
      const f = frame(rnd, this.kind);
      const rtr = pick(rnd, ROUTERS);
      const relay = rnd() < 0.4;
      const [lan, srvNet] = nets(rnd, 2);
      const gw = addHost(lan, 1);
      const excl = pick(rnd, [5, 10, 20]);
      const pool = pick(rnd, ['LAN', 'STAFF', 'DATA', 'BRANCH-POOL']);
      const dns = pick(rnd, ['8.8.8.8', '1.1.1.1', addHost(srvNet, 53)]);
      const ports = sample(rnd, [2, 3, 4, 5, 6, 7, 8], 2).sort((a, b) => a - b);
      const pcs = ['PC1', 'PC2'];
      const inPool = (w, d) => { const a = port(w, d, NIC).ip; return a !== null && a > ip(addHost(lan, excl)) && (a & 0xffffff00) >>> 0 === ip(lan); };
      const devices = [
        { id: rtr, kind: 'router', x: 50, y: 12 }, { id: 'SW1', kind: 'switch', x: 50, y: 36 },
        { id: 'PC1', kind: 'pc', x: 30, y: 60, pc: { dhcp: true } }, { id: 'PC2', kind: 'pc', x: 70, y: 60, pc: { dhcp: true } },
      ];
      const links = [L(rtr, 'GigabitEthernet0/0', 'SW1', 'GigabitEthernet0/1'), L('PC1', NIC, 'SW1', `FastEthernet0/${ports[0]}`), L('PC2', NIC, 'SW1', `FastEthernet0/${ports[1]}`)];
      const setup = { SW1: ['hostname SW1'], [rtr]: [`hostname ${rtr}`, 'interface g0/0', `ip address ${gw} ${M24}`, 'no shutdown'] };
      const clients = { id: 'clients', text: 'PC1 and PC2 have their addresses (ipconfig /renew on each)', device: 'PC1', check: (w) => pcs.every(d => inPool(w, d) && cfg(w, d).gateway === ip(gw)), owns: { PC1: [PC_LINES], PC2: [PC_LINES] },
        hint: 'On each PC, ipconfig /renew asks for an address. ipconfig shows what it got.', show: { PC1: ['ipconfig /renew'], PC2: ['ipconfig /renew'] } };
      let reqs;
      let notes;
      if (relay) {
        const hqWan = addHost(srvNet, 1);
        devices.push({ id: 'HQ', kind: 'router', x: 84, y: 12 });
        links.push(L(rtr, 'GigabitEthernet0/1', 'HQ', 'GigabitEthernet0/0'));
        setup[rtr].push('interface g0/1', `ip address ${addHost(srvNet, 2)} ${M24}`, 'no shutdown');
        setup.HQ = ['hostname HQ', 'interface g0/0', `ip address ${hqWan} ${M24}`, 'no shutdown', 'exit', `ip route ${lan} ${M24} ${addHost(srvNet, 2)}`,
          `ip dhcp excluded-address ${gw} ${addHost(lan, excl)}`, `ip dhcp pool ${pool}`, `network ${lan} ${M24}`, `default-router ${gw}`, `dns-server ${dns}`, 'exit'];
        notes = [`LAN ${lan}/24, gateway ${gw}`, `DHCP server: HQ at ${hqWan} (pool ${pool} is already built there)`];
        reqs = [
          { id: 'helper', text: `Relay the LAN's DHCP requests to HQ (${hqWan})`, device: rtr, check: (w) => port(w, rtr, 'GigabitEthernet0/0').helper === ip(hqWan), owns: { [rtr]: [ifRe('GigabitEthernet0/0')] },
            hint: 'A DHCP request is a broadcast and a router does not forward broadcasts. ip helper-address on the LAN interface turns it into a unicast to the server.', show: { [rtr]: ['enable', 'configure terminal', 'interface g0/0', `ip helper-address ${hqWan}`] } },
          clients,
        ];
      } else {
        notes = [`LAN ${lan}/24, gateway ${gw}`, `Reserve .1 to .${excl} for gear`, `DNS ${dns}, pool name ${pool}`];
        const pl = (w) => cfg(w, rtr).dhcp?.pools?.[pool];
        reqs = [
          { id: 'excluded', text: `Keep ${gw} to ${addHost(lan, excl)} out of the pool`, device: rtr, check: (w) => (cfg(w, rtr).dhcp?.excluded ?? []).some(([a, b]) => a <= ip(gw) && b >= ip(addHost(lan, excl))), owns: { [rtr]: [globalRe('ip dhcp excluded-address')] },
            hint: 'ip dhcp excluded-address FIRST LAST, in global configuration, before the pool hands anything out.', show: { [rtr]: ['enable', 'configure terminal', `ip dhcp excluded-address ${gw} ${addHost(lan, excl)}`] } },
          { id: 'pool', text: `Create pool ${pool} for ${lan}/24`, device: rtr, check: (w) => pl(w)?.net === ip(lan) && pl(w)?.len === 24, owns: { [rtr]: [/^ip dhcp pool /] },
            hint: 'ip dhcp pool NAME, then network with the subnet and its mask.', show: { [rtr]: [`ip dhcp pool ${pool}`, `network ${lan} ${M24}`] } },
          { id: 'router', text: `Hand out ${gw} as the default gateway`, device: rtr, check: (w) => pl(w)?.router === ip(gw), owns: { [rtr]: [/^ip dhcp pool /] },
            hint: 'default-router, inside the pool.', show: { [rtr]: [`ip dhcp pool ${pool}`, `default-router ${gw}`] } },
          { id: 'dns', text: `Hand out ${dns} as the DNS server`, device: rtr, check: (w) => pl(w)?.dns === ip(dns), owns: { [rtr]: [/^ip dhcp pool /] },
            hint: 'dns-server, inside the pool.', show: { [rtr]: [`dns-server ${dns}`] } },
          clients,
        ];
      }
      return {
        ...f, title: this.title, minutes: this.minutes, lights: this.lights, start: rtr,
        summary: relay
          ? `${f.site}'s PCs are set to DHCP, and the server team built pool ${pool} on HQ. The requests never get there. Make them, then get the PCs addressed.`
          : `${f.site}'s PCs are set to DHCP but nothing answers. Build the pool on ${rtr}, keeping the first addresses for gear, then get the PCs addressed.`,
        devices, links, setup, saved: [], notes, requirements: reqs,
        tests: [
          { id: 'gw', text: `PC1 reaches its gateway ${gw}`, check: (w) => inPool(w, 'PC1') && reach(w, 'PC1', gw) },
          { id: 'fresh', text: 'A new PC on the LAN would get an address too', check: (w) => tryIt(w, c => { c.devices.PC2.config.interfaces.FastEthernet0.ip = null; return Boolean(requestDhcp(c, 'PC2').ok); }) },
        ],
      };
    },
  },

  // ------------------------------------------------------------ NAT
  {
    kind: 'build-nat',
    title: 'Get the branch online with NAT',
    minutes: 12,
    lights: ['t4-nat', 't5-acl'],
    make(seed) {
      const rnd = rngOf(seed);
      const f = frame(rnd, this.kind);
      const rtr = pick(rnd, ROUTERS);
      const [lan, srvNet] = nets(rnd, 2);
      const gw = addHost(lan, 1);
      const w29 = wan29(rnd);
      const isp = addHost(w29, 1);
      const out = addHost(w29, 2);
      const pub = addHost(w29, int(rnd, 3, 6));
      const withStatic = rnd() < 0.5;
      const named = rnd() < 0.4;
      const acl = named ? pick(rnd, ['NAT-LAN', 'INSIDE-NETS', 'PAT-SOURCES']) : String(int(rnd, 1, 99));
      const web = addHost(WEB_NET, int(rnd, 10, 200));
      const srv = addHost(srvNet, int(rnd, 10, 50));
      const lanUp = 'GigabitEthernet0/0', wanIf = 'GigabitEthernet0/1', srvIf = 'GigabitEthernet0/2';
      const devices = [
        { id: rtr, kind: 'router', x: 40, y: 30 }, { id: 'ISP', kind: 'router', x: 82, y: 30 },
        { id: 'PC1', kind: 'pc', x: 14, y: 14, pc: { ip: addHost(lan, 21), mask: M24, gateway: gw } },
        { id: 'WEB', kind: 'pc', x: 82, y: 60, pc: { ip: web, mask: M24, gateway: addHost(WEB_NET, 1), services: [80] } },
      ];
      const links = [L('PC1', NIC, rtr, lanUp), L(rtr, wanIf, 'ISP', 'GigabitEthernet0/0'), L('ISP', 'GigabitEthernet0/1', 'WEB', NIC)];
      const setup = {
        ISP: ['hostname ISP', 'interface g0/0', `ip address ${isp} 255.255.255.248`, 'no shutdown', 'interface g0/1', `ip address ${addHost(WEB_NET, 1)} ${M24}`, 'no shutdown'],
        [rtr]: [`hostname ${rtr}`, 'interface g0/0', `ip address ${gw} ${M24}`, 'no shutdown', 'interface g0/1', `ip address ${out} 255.255.255.248`, 'no shutdown', 'exit', `ip route 0.0.0.0 0.0.0.0 ${isp}`],
      };
      if (withStatic) {
        devices.push({ id: 'SRV', kind: 'pc', x: 14, y: 52, pc: { ip: srv, mask: M24, gateway: addHost(srvNet, 1), services: [80, 443] } });
        links.push(L('SRV', NIC, rtr, srvIf));
        setup[rtr].push('interface g0/2', `ip address ${addHost(srvNet, 1)} ${M24}`, 'no shutdown');
      }
      const aclOk = (w) => {
        const a = cfg(w, rtr).acls?.[acl];
        if (!a) return false;
        const hit = (src) => a.entries.find(e => aceMatches(e, { src: ip(src), dst: ip(web), proto: 'icmp' }))?.action === 'permit';
        return hit(addHost(lan, 77)) && !hit(out);
      };
      const nat = (w) => cfg(w, rtr).nat;
      const insides = withStatic ? [lanUp, srvIf] : [lanUp];
      const aclShow = named ? [`ip access-list standard ${acl}`, `permit ${lan} 0.0.0.255`, 'exit'] : [`access-list ${acl} permit ${lan} 0.0.0.255`];
      const reqs = [
        { id: 'inside', text: `Mark ${insides.map(short).join(' and ')} as NAT inside`, device: rtr, check: (w) => insides.every(n => port(w, rtr, n).nat === 'inside'), owns: { [rtr]: [ifRe(...insides)] },
          hint: 'ip nat inside, on each interface that faces your own network.', show: { [rtr]: ['enable', 'configure terminal', ...insides.flatMap(n => [`interface ${lower(n)}`, 'ip nat inside'])] } },
        { id: 'outside', text: `Mark ${short(wanIf)} as NAT outside`, device: rtr, check: (w) => port(w, rtr, wanIf).nat === 'outside', owns: { [rtr]: [ifRe(wanIf)] },
          hint: 'ip nat outside, on the interface toward the ISP.', show: { [rtr]: [`interface ${lower(wanIf)}`, 'ip nat outside'] } },
        { id: 'acl', text: `${named ? `Standard ACL ${acl}` : `ACL ${acl}`} matches the LAN, ${lan}/24`, device: rtr, check: aclOk, owns: { [rtr]: [globalRe(`access-list ${acl} `), new RegExp(`^ip access-list standard ${esc(acl)}\\|`)] },
          hint: 'The ACL only picks which sources get translated. A standard ACL with the LAN and its wildcard mask.', show: { [rtr]: ['exit', ...aclShow] } },
        { id: 'pat', text: `Overload the LAN onto ${short(wanIf)}'s address (PAT)`, device: rtr, check: (w) => (nat(w)?.rules ?? []).some(r => r.acl === acl && r.iface === wanIf && r.overload), owns: { [rtr]: [globalRe('ip nat inside source list')] },
          hint: 'ip nat inside source list ACL interface INTERFACE overload.', show: { [rtr]: [`ip nat inside source list ${acl} interface ${lower(wanIf)} overload`] } },
      ];
      const tests = [{ id: 'web', text: `PC1 reaches the web server at ${web}`, check: (w) => reach(w, 'PC1', web, { proto: 'tcp', port: 80 }) }];
      if (withStatic) {
        reqs.push({ id: 'static', text: `Publish the server ${srv} on ${pub}`, device: rtr, check: (w) => (nat(w)?.statics ?? []).some(s => s.local === ip(srv) && s.global === ip(pub)), owns: { [rtr]: [globalRe('ip nat inside source static')] },
          hint: 'ip nat inside source static INSIDE-LOCAL INSIDE-GLOBAL.', show: { [rtr]: [`ip nat inside source static ${srv} ${pub}`] } });
        tests.push({ id: 'pub', text: `The internet reaches the server's website on ${pub}`, check: (w) => reach(w, 'WEB', pub, { proto: 'tcp', port: 80 }) });
      }
      return {
        ...f, title: this.title, minutes: this.minutes, lights: this.lights, start: rtr,
        summary: `${f.site}'s circuit is live: ${rtr} ${short(wanIf)} has ${out}/29 and a default route to the ISP. The LAN uses private addresses, so nothing comes back. Set up NAT${withStatic ? ' and publish the server' : ''}.`,
        devices, links, setup, saved: [],
        notes: [`LAN ${lan}/24`, `WAN ${w29}/29: ISP .1, ${rtr} .2${withStatic ? `, server public ${pub}` : ''}`, `NAT ACL: ${acl}`],
        requirements: reqs, tests,
      };
    },
  },

  // ------------------------------------------------------------ ACLs
  {
    kind: 'build-acl',
    title: 'Fence off the guest network',
    minutes: 12,
    lights: ['t5-acl'],
    make(seed) {
      const rnd = rngOf(seed);
      const f = frame(rnd, this.kind);
      const rtr = pick(rnd, ROUTERS);
      const [staff, guest, srvNet] = nets(rnd, 3);
      const srv = addHost(srvNet, int(rnd, 10, 60));
      const extended = rnd() < 0.6;
      const name = extended ? pick(rnd, ['GUEST-IN', 'GUEST-FILTER', 'FENCE-GUEST']) : String(int(rnd, 10, 99));
      const sIf = 'GigabitEthernet0/0', gIf = 'GigabitEthernet0/1', vIf = 'GigabitEthernet0/2';
      const where = extended ? { intf: gIf, dir: 'in' } : { intf: vIf, dir: 'out' };
      const wild = '0.0.0.255';
      const show = extended
        ? [`ip access-list extended ${name}`, `permit tcp ${guest} ${wild} host ${srv} eq www`, `deny ip ${guest} ${wild} ${srvNet} ${wild}`, 'permit ip any any', 'exit', `interface ${lower(gIf)}`, `ip access-group ${name} in`]
        : [`access-list ${name} deny ${guest} ${wild}`, `access-list ${name} permit any`, `interface ${lower(vIf)}`, `ip access-group ${name} out`];
      const applied = (w) => (where.dir === 'in' ? port(w, rtr, where.intf).aclIn : port(w, rtr, where.intf).aclOut) === name && Boolean(cfg(w, rtr).acls?.[name]);
      const reqs = [
        { id: 'place', text: extended ? `Use an extended ACL named ${name}, inbound on ${short(gIf)} (guest side)` : `Use standard ACL ${name}, outbound on ${short(vIf)} (server side)`, device: rtr, check: applied,
          owns: { [rtr]: [ifRe(where.intf), globalRe(`access-list ${name} `), new RegExp(`^ip access-list (standard|extended) ${esc(name)}\\|`)] },
          hint: extended ? 'Extended ACLs go close to the source, so the dropped traffic never crosses the router.' : 'A standard ACL only sees the source, so it goes close to the destination, or it would block guests from everything.',
          show: { [rtr]: ['enable', 'configure terminal', ...show] } },
        { id: 'block', text: extended ? 'Guests cannot reach the server subnet, except the website (TCP 80)' : 'Guests cannot reach the server subnet', device: rtr,
          check: (w) => applied(w) && !reach(w, 'GUEST', srv) && (!extended || (reach(w, 'GUEST', srv, { proto: 'tcp', port: 80 }) && !reach(w, 'GUEST', srv, { proto: 'tcp', port: 22 }))),
          owns: {}, hint: extended ? 'Permit the web traffic first, then deny the rest of guest-to-server, then permit everything else: the end of every ACL is an implicit deny.' : 'Deny the guest subnet, then permit any.', show: { [rtr]: ['do show access-lists'] } },
      ];
      return {
        ...f, title: this.title, minutes: this.minutes, lights: this.lights, start: rtr,
        summary: `At ${f.site}, guest Wi-Fi traffic (${guest}/24) can reach the servers (${srvNet}/24). Security wants that stopped${extended ? ', except the public website on the web server' : ''}, without touching staff access. Use the ACL type the standard calls for.`,
        devices: [
          { id: rtr, kind: 'router', x: 50, y: 30 },
          { id: 'STAFF', kind: 'pc', x: 14, y: 12, pc: { ip: addHost(staff, 20), mask: M24, gateway: addHost(staff, 1) } },
          { id: 'GUEST', kind: 'pc', x: 14, y: 52, pc: { ip: addHost(guest, 20), mask: M24, gateway: addHost(guest, 1) } },
          { id: 'SRV', kind: 'pc', x: 86, y: 30, pc: { ip: srv, mask: M24, gateway: addHost(srvNet, 1), services: [80, 22, 445] } },
        ],
        links: [L('STAFF', NIC, rtr, sIf), L('GUEST', NIC, rtr, gIf), L('SRV', NIC, rtr, vIf)],
        setup: { [rtr]: [`hostname ${rtr}`, 'interface g0/0', `ip address ${addHost(staff, 1)} ${M24}`, 'no shutdown', 'interface g0/1', `ip address ${addHost(guest, 1)} ${M24}`, 'no shutdown', 'interface g0/2', `ip address ${addHost(srvNet, 1)} ${M24}`, 'no shutdown'] },
        saved: [],
        notes: [`Staff ${staff}/24 on ${short(sIf)}`, `Guest ${guest}/24 on ${short(gIf)}`, `Servers ${srvNet}/24 on ${short(vIf)}, web server ${srv}`, extended ? `Standard: named extended ACL ${name}` : `Standard: numbered standard ACL ${name}`],
        requirements: reqs,
        tests: [
          { id: 'staff', text: 'Staff still reach the server (ping and SSH)', check: (w) => reach(w, 'STAFF', srv) && reach(w, 'STAFF', srv, { proto: 'tcp', port: 22 }) },
          { id: 'guestnet', text: 'Guests still reach their own gateway', check: (w) => reach(w, 'GUEST', addHost(guest, 1)) },
        ],
      };
    },
  },

  // ------------------------------------------------------------ router on a stick
  {
    kind: 'build-roas',
    title: 'Route between VLANs on one cable',
    minutes: 10,
    lights: ['t2-trunks', 't3-table'],
    make(seed) {
      const rnd = rngOf(seed);
      const f = frame(rnd, this.kind);
      const rtr = pick(rnd, ROUTERS);
      const [va, vb] = sample(rnd, [10, 20, 30, 40, 50, 60], 2).sort((a, b) => a - b);
      const [na, nb] = sample(rnd, VLAN_NAMES, 2);
      const [netA, netB] = nets(rnd, 2);
      const upl = pick(rnd, ['GigabitEthernet0/1', 'GigabitEthernet0/2']);
      const sub = (v) => `GigabitEthernet0/0.${v}`;
      const subOk = (w, v, net) => port(w, rtr, sub(v))?.encap?.vlan === v && port(w, rtr, sub(v))?.ip === ip(addHost(net, 1));
      return {
        ...f, title: this.title, minutes: this.minutes, lights: this.lights, start: 'SW1',
        summary: `${na} (VLAN ${va}) and ${nb} (VLAN ${vb}) at ${f.site} are split on SW1 and cannot reach each other. ${rtr} has one cable to SW1's ${short(upl)}. Route between them on that one cable.`,
        devices: [
          { id: rtr, kind: 'router', x: 50, y: 12 }, { id: 'SW1', kind: 'switch', x: 50, y: 36 },
          { id: 'PC1', kind: 'pc', x: 28, y: 60, pc: { ip: addHost(netA, 20), mask: M24, gateway: addHost(netA, 1) } },
          { id: 'PC2', kind: 'pc', x: 72, y: 60, pc: { ip: addHost(netB, 20), mask: M24, gateway: addHost(netB, 1) } },
        ],
        links: [L(rtr, 'GigabitEthernet0/0', 'SW1', upl), L('PC1', NIC, 'SW1', 'FastEthernet0/1'), L('PC2', NIC, 'SW1', 'FastEthernet0/2')],
        setup: { [rtr]: [`hostname ${rtr}`], SW1: ['hostname SW1', `vlan ${va}`, `name ${na}`, `vlan ${vb}`, `name ${nb}`, 'interface f0/1', 'switchport mode access', `switchport access vlan ${va}`, 'interface f0/2', 'switchport mode access', `switchport access vlan ${vb}`] },
        saved: [],
        notes: [`${na}: VLAN ${va}, ${netA}/24, gateway .1`, `${nb}: VLAN ${vb}, ${netB}/24, gateway .1`],
        requirements: [
          { id: 'trunk', text: `Make SW1 ${short(upl)} a trunk`, device: 'SW1', check: (w) => swp(w, 'SW1', upl).mode === 'trunk', owns: { SW1: [ifRe(upl)] },
            hint: 'Routers do not negotiate DTP, so the switch end has to be a trunk by configuration.', show: { SW1: ['enable', 'configure terminal', `interface ${lower(upl)}`, 'switchport mode trunk'] } },
          { id: 'phys', text: `Bring up ${rtr} Gi0/0`, device: rtr, check: (w) => up(w, rtr, 'GigabitEthernet0/0'), owns: { [rtr]: [ifRe('GigabitEthernet0/0')] },
            hint: 'The physical port needs no address, only no shutdown.', show: { [rtr]: ['enable', 'configure terminal', 'interface g0/0', 'no shutdown'] } },
          { id: 'subA', text: `Gi0/0.${va}: VLAN ${va}, ${addHost(netA, 1)}/24`, device: rtr, check: (w) => subOk(w, va, netA), owns: { [rtr]: [ifRe(sub(va))] },
            hint: 'encapsulation dot1q before the address.', show: { [rtr]: [`interface g0/0.${va}`, `encapsulation dot1q ${va}`, `ip address ${addHost(netA, 1)} ${M24}`] } },
          { id: 'subB', text: `Gi0/0.${vb}: VLAN ${vb}, ${addHost(netB, 1)}/24`, device: rtr, check: (w) => subOk(w, vb, netB), owns: { [rtr]: [ifRe(sub(vb))] },
            hint: 'Same pattern for the second VLAN.', show: { [rtr]: [`interface g0/0.${vb}`, `encapsulation dot1q ${vb}`, `ip address ${addHost(netB, 1)} ${M24}`] } },
        ],
        tests: [
          { id: 'x', text: `PC1 (${na}) reaches PC2 (${nb})`, check: (w) => reach(w, 'PC1', addHost(netB, 20)) },
          { id: 'table', text: `${rtr} has a connected route for each VLAN`, check: (w) => [netA, netB].every(n => routingTable(w, rtr).some(r => r.type === 'connected' && r.net === ip(n))) },
        ],
      };
    },
  },

  // ------------------------------------------------------------ OSPF
  {
    kind: 'build-ospf',
    title: 'Join a branch to OSPF',
    minutes: 10,
    lights: ['t3-ospf'],
    make(seed) {
      const rnd = rngOf(seed);
      const f = frame(rnd, this.kind);
      const br = pick(rnd, ['BR-RTR', 'BR2', 'EAST-RTR', 'SITE7']);
      const pid = pick(rnd, [1, 10, 100]);
      const rid = `${int(rnd, 2, 9)}.${int(rnd, 2, 9)}.${int(rnd, 2, 9)}.${int(rnd, 2, 9)}`;
      const [lan, hqLan] = nets(rnd, 2);
      const t = `10.255.${int(rnd, 0, 250)}.0`;
      const hqT = addHost(t, 1), brT = addHost(t, 2);
      const brLan = addHost(lan, 1);
      const nbr = (w) => neighbors(w, br).some(n => n.state === 'FULL' || n.state === '2WAY');
      return {
        ...f, title: this.title, minutes: this.minutes, lights: this.lights, start: br,
        summary: `${br} at ${f.site} is addressed and cabled to HQ. HQ runs OSPF process 1 in area 0. Bring ${br} into OSPF so its LAN and HQ's LAN can reach each other.`,
        devices: [
          { id: 'HQ', kind: 'router', x: 70, y: 14 }, { id: br, kind: 'router', x: 30, y: 14 },
          { id: 'PC1', kind: 'pc', x: 30, y: 52, pc: { ip: addHost(lan, 20), mask: M24, gateway: brLan } },
          { id: 'SRV', kind: 'pc', x: 70, y: 52, pc: { ip: addHost(hqLan, 10), mask: M24, gateway: addHost(hqLan, 1), services: [80] } },
        ],
        links: [L(br, 'GigabitEthernet0/1', 'HQ', 'GigabitEthernet0/1'), L('PC1', NIC, br, 'GigabitEthernet0/0'), L('SRV', NIC, 'HQ', 'GigabitEthernet0/0')],
        setup: {
          HQ: ['hostname HQ', 'interface g0/0', `ip address ${addHost(hqLan, 1)} ${M24}`, 'no shutdown', 'interface g0/1', `ip address ${hqT} 255.255.255.252`, 'no shutdown', 'router ospf 1', 'router-id 1.1.1.1', 'network 0.0.0.0 255.255.255.255 area 0', 'passive-interface g0/0'],
          [br]: [`hostname ${br}`, 'interface g0/0', `ip address ${brLan} ${M24}`, 'no shutdown', 'interface g0/1', `ip address ${brT} 255.255.255.252`, 'no shutdown'],
        },
        saved: [],
        notes: [`Transit ${t}/30: HQ .1, ${br} .2`, `${br} LAN ${lan}/24`, `Standard: process ${pid}, router ID ${rid}, area 0, LAN passive`],
        requirements: [
          { id: 'rid', text: `OSPF process ${pid} with router ID ${rid}`, device: br, check: (w) => cfg(w, br).ospf?.pid === pid && cfg(w, br).ospf?.routerId === ip(rid), owns: { [br]: [/^router ospf /] },
            hint: 'router ospf PROCESS, then router-id. The process number is local and need not match HQ.', show: { [br]: ['enable', 'configure terminal', `router ospf ${pid}`, `router-id ${rid}`] } },
          { id: 'nets', text: 'Advertise the transit link and the LAN in area 0', device: br,
            check: (w) => routingTable(w, 'HQ').some(r => r.type === 'ospf' && r.net === ip(lan) && r.len === 24) && nbr(w),
            owns: { [br]: [/^router ospf /, ifRe('GigabitEthernet0/0', 'GigabitEthernet0/1')] },
            hint: 'network ADDRESS WILDCARD area 0 for each, or ip ospf PROCESS area 0 on each interface.', show: { [br]: [`network ${t} 0.0.0.3 area 0`, `network ${lan} 0.0.0.255 area 0`] } },
          { id: 'passive', text: 'Make the LAN interface passive', device: br, check: (w) => (cfg(w, br).ospf?.passive ?? []).includes('GigabitEthernet0/0'), owns: { [br]: [/^router ospf /] },
            hint: 'passive-interface keeps hellos off the user LAN while still advertising it.', show: { [br]: ['passive-interface g0/0'] } },
        ],
        tests: [
          { id: 'full', text: `${br} is FULL with HQ`, check: (w) => neighbors(w, br).some(n => n.state === 'FULL') },
          { id: 'srv', text: 'PC1 reaches the HQ server', check: (w) => reach(w, 'PC1', addHost(hqLan, 10)) },
        ],
      };
    },
  },

  // ------------------------------------------------------------ NTP and syslog
  {
    kind: 'build-ops',
    title: 'Set time and logging to the standard',
    minutes: 6,
    lights: ['t4-ntp-log'],
    make(seed) {
      const rnd = rngOf(seed);
      const f = frame(rnd, this.kind);
      const rtr = pick(rnd, ROUTERS);
      const [mgmt] = nets(rnd, 1);
      const ntp = addHost(mgmt, int(rnd, 5, 20));
      const sys = addHost(mgmt, int(rnd, 30, 60));
      return {
        ...f, title: this.title, minutes: this.minutes, lights: this.lights, start: rtr,
        summary: `An audit at ${f.site} found ${rtr} with no time source and no remote logging, so its log lines cannot be lined up with anything. Point it at the NTP and syslog servers and timestamp its logs.`,
        devices: [{ id: rtr, kind: 'router', x: 40, y: 30 }, { id: 'NTP', kind: 'pc', x: 82, y: 14, pc: { ip: ntp, mask: M24, gateway: addHost(mgmt, 1) } }, { id: 'SYSLOG', kind: 'pc', x: 82, y: 50, pc: { ip: sys, mask: M24, gateway: addHost(mgmt, 1) } }, { id: 'SW1', kind: 'switch', x: 64, y: 30 }],
        links: [L(rtr, 'GigabitEthernet0/1', 'SW1', 'GigabitEthernet0/1'), L('NTP', NIC, 'SW1', 'FastEthernet0/1'), L('SYSLOG', NIC, 'SW1', 'FastEthernet0/2')],
        setup: { [rtr]: [`hostname ${rtr}`, 'interface g0/1', `ip address ${addHost(mgmt, 1)} ${M24}`, 'no shutdown'], SW1: ['hostname SW1'] },
        saved: [],
        notes: [`NTP server ${ntp}`, `Syslog server ${sys}`],
        requirements: [
          { id: 'ntp', text: `Sync time from ${ntp}`, device: rtr, check: (w) => (cfg(w, rtr).ntp ?? []).includes(ip(ntp)), owns: { [rtr]: [globalRe('ntp server')] },
            hint: 'ntp server ADDRESS.', show: { [rtr]: ['enable', 'configure terminal', `ntp server ${ntp}`] } },
          { id: 'log', text: `Send logs to ${sys}`, device: rtr, check: (w) => (cfg(w, rtr).logHosts ?? []).includes(ip(sys)), owns: { [rtr]: [globalRe('logging host')] },
            hint: 'logging host ADDRESS (or just logging ADDRESS).', show: { [rtr]: [`logging host ${sys}`] } },
          { id: 'ts', text: 'Stamp log messages with the date and time', device: rtr, check: (w) => Boolean(cfg(w, rtr).timestamps), owns: { [rtr]: [globalRe('service timestamps')] },
            hint: 'service timestamps log datetime msec.', show: { [rtr]: ['service timestamps log datetime msec'] } },
        ],
        tests: [{ id: 'sync', text: `${rtr} can reach its NTP server`, check: (w) => reach(w, rtr, ntp) }],
      };
    },
  },

  // ------------------------------------------------------------ subnetting
  {
    kind: 'build-subnet',
    title: 'Carve a block into subnets and address them',
    minutes: 10,
    lights: ['t1-ipv4', 't1-client'],
    make(seed) {
      const rnd = rngOf(seed);
      const f = frame(rnd, this.kind);
      const rtr = pick(rnd, ROUTERS);
      const base = pick(rnd, [`10.${int(rnd, 1, 250)}.${int(rnd, 0, 250)}.0`, `172.${int(rnd, 16, 31)}.${int(rnd, 0, 250)}.0`, `192.168.${int(rnd, 0, 250)}.0`]);
      // Host counts that need three different prefix lengths and fit a /24
      // when allocated largest first.
      const sizes = pick(rnd, [[100, 50, 20], [60, 28, 12], [120, 60, 25], [110, 40, 10], [55, 25, 6]]);
      const names = sample(rnd, VLAN_NAMES, 3);
      const lenFor = (hosts) => { let len = 30; while ((2 ** (32 - len)) - 2 < hosts) len -= 1; return len; };
      let at = 0;
      const plan = sizes.map((hosts, k) => {
        const len = lenFor(hosts);
        const net = addHost(base, at);
        at += 2 ** (32 - len);
        return { hosts, len, net, mask: maskOf(len), first: addHost(net, 1), last: addHost(net, (2 ** (32 - len)) - 2), name: names[k], port: `GigabitEthernet0/${k}`, pc: `PC${k + 1}` };
      });
      const devices = [{ id: rtr, kind: 'router', x: 50, y: 16 }, ...plan.map((p, k) => ({ id: p.pc, kind: 'pc', x: 18 + 32 * k, y: 58, pc: {} }))];
      const links = plan.map(p => L(rtr, p.port, p.pc, NIC));
      const reqs = plan.flatMap((p, k) => [
        { id: `if${k}`, text: `${short(p.port)}: the ${p.name} LAN, ${p.hosts} hosts. Smallest subnet that fits, router on the first usable address`, device: rtr,
          check: (w) => { const i = port(w, rtr, p.port); return i.ip === ip(p.first) && i.mask === ip(p.mask) && up(w, rtr, p.port); }, owns: { [rtr]: [ifRe(p.port)] },
          hint: `${p.hosts} hosts need ${p.hosts} + 2 addresses, so /${p.len} (${(2 ** (32 - p.len)) - 2} usable). Allocated largest first from ${base}, this one is ${p.net}/${p.len}.`,
          show: { [rtr]: [...(k === 0 ? ['enable', 'configure terminal'] : []), `interface ${lower(p.port)}`, `ip address ${p.first} ${p.mask}`, 'no shutdown'] } },
        { id: `pc${k}`, text: `${p.pc} on the ${p.name} LAN: the last usable address, gateway ${short(p.port)}`, device: p.pc,
          check: (w) => { const n = port(w, p.pc, NIC); return n.ip === ip(p.last) && n.mask === ip(p.mask) && cfg(w, p.pc).gateway === ip(p.first); }, owns: { [p.pc]: [PC_LINES] },
          hint: `The last usable address is one below the broadcast of ${p.net}/${p.len}.`, show: { [p.pc]: [`ipconfig ${p.last} ${p.mask} ${p.first}`] } },
      ]);
      return {
        ...f, title: this.title, minutes: this.minutes, lights: this.lights, start: rtr,
        summary: `${f.site} has been given ${base}/24 for three LANs on ${rtr}. Carve it with VLSM, largest LAN first from the start of the block, and address the router and one PC on each.`,
        devices, links, setup: { [rtr]: [`hostname ${rtr}`] }, saved: [],
        notes: [`Block ${base}/24`, ...plan.map(p => `${p.name}: ${p.hosts} hosts, on ${short(p.port)} (${p.pc})`), 'Allocate largest first, no gaps; router takes the first usable, the PC the last'],
        requirements: reqs,
        tests: [
          { id: 'ab', text: `${plan[0].pc} reaches ${plan[1].pc}`, check: (w) => reach(w, plan[0].pc, plan[1].last) },
          { id: 'bc', text: `${plan[1].pc} reaches ${plan[2].pc}`, check: (w) => reach(w, plan[1].pc, plan[2].last) },
        ],
      };
    },
  },

  // ------------------------------------------------------------ physical layer
  {
    kind: 'build-legacy',
    title: 'Connect a device that will not negotiate',
    minutes: 6,
    lights: ['t1-physical', 't2-vlans'],
    make(seed) {
      const rnd = rngOf(seed);
      const f = frame(rnd, this.kind);
      const what = pick(rnd, [['BMS', 'building management controller'], ['HVAC', 'HVAC controller'], ['DOOR', 'door access panel'], ['PLC', 'line PLC'], ['CAM', 'old IP camera recorder']]);
      const [dev, label] = what;
      const p = int(rnd, 5, 20);
      const portName = `FastEthernet0/${p}`;
      const v = pick(rnd, [30, 40, 60, 90, 120]);
      const vname = pick(rnd, ['FACILITIES', 'OT', 'BUILDING', 'SECURITY']);
      const [net] = nets(rnd, 1);
      const gw = addHost(net, 1);
      const rtr = pick(rnd, ROUTERS);
      const devices = [
        { id: rtr, kind: 'router', x: 50, y: 12 }, { id: 'SW1', kind: 'switch', x: 50, y: 36 },
        { id: dev, kind: 'pc', x: 50, y: 62, pc: { ip: addHost(net, 50), mask: M24, gateway: gw, nic: { speed: 100, duplex: 'full' } } },
      ];
      const links = [L(rtr, 'GigabitEthernet0/0', 'SW1', 'GigabitEthernet0/1'), L(dev, NIC, 'SW1', portName)];
      const desc = `${dev} ${label}`.slice(0, 40);
      const reqs = [
        { id: 'vlan', text: `${short(portName)} is an access port in VLAN ${v} (${vname})`, device: 'SW1',
          check: (w) => swp(w, 'SW1', portName)?.mode === 'access' && swp(w, 'SW1', portName)?.access === v, owns: { SW1: [ifRe(portName)] },
          hint: 'switchport mode access, then switchport access vlan.', show: { SW1: ['enable', 'configure terminal', `interface ${lower(portName)}`, 'switchport mode access', `switchport access vlan ${v}`] } },
        { id: 'speed', text: `Hard-set ${short(portName)} to match the ${label}: 100 Mb/s, full duplex`, device: 'SW1',
          check: (w) => port(w, 'SW1', portName).speed === 100 && port(w, 'SW1', portName).duplex === 'full', owns: { SW1: [ifRe(portName)] },
          hint: `The ${label} has autonegotiation off. A switch port left on auto senses 100 Mb/s but cannot learn the duplex, so it falls back to half while the device runs full: a duplex mismatch. Set both speed and duplex to match it.`,
          show: { SW1: ['speed 100', 'duplex full'] } },
        { id: 'desc', text: `Label the port "${desc}"`, device: 'SW1',
          check: (w) => (port(w, 'SW1', portName).description ?? '').toLowerCase() === desc.toLowerCase(), owns: { SW1: [ifRe(portName)] },
          hint: 'description, in interface configuration. The next tech to find a hard-set port will want to know why.', show: { SW1: [`description ${desc}`] } },
      ];
      return {
        ...f, title: this.title, minutes: this.minutes, lights: this.lights, start: 'SW1',
        summary: `Facilities are cabling a ${label} into SW1 ${short(portName)}. Its port is fixed at 100 Mb/s full duplex with autonegotiation turned off, and the vendor says it drops off the network on auto ports. Put it in the ${vname} VLAN and match its settings.`,
        devices, links,
        setup: { SW1: ['hostname SW1', `vlan ${v}`, `name ${vname}`, 'interface g0/1', 'switchport mode trunk'], [rtr]: [`hostname ${rtr}`, 'interface g0/0', 'no shutdown', `interface g0/0.${v}`, `encapsulation dot1q ${v}`, `ip address ${gw} ${M24}`] },
        saved: [],
        notes: [`${dev}: ${label}, fixed 100 Mb/s full duplex, no autonegotiation`, `${vname}: VLAN ${v}, ${net}/24, gateway ${gw}`],
        requirements: reqs,
        tests: [
          { id: 'clean', text: `${short(portName)} runs without a duplex mismatch`, check: (w) => { const n = negotiate(w, 'SW1', portName); return Boolean(n?.ok) && !n.mismatch; } },
          { id: 'gw', text: `The ${label} reaches its gateway`, check: (w) => reach(w, dev, gw) },
        ],
      };
    },
  },

  // ------------------------------------------------------------ changes
  {
    kind: 'change-move',
    title: 'Move a desk to another VLAN',
    minutes: 6,
    lights: ['t2-vlans', 't1-client'],
    make(seed) {
      const rnd = rngOf(seed);
      const f = frame(rnd, this.kind, 'CR');
      const rtr = pick(rnd, ROUTERS);
      const [va, vb] = sample(rnd, [10, 20, 30, 40, 50], 2).sort((a, b) => a - b);
      const [na, nb] = sample(rnd, VLAN_NAMES, 2);
      const [netA, netB] = nets(rnd, 2);
      const desk = int(rnd, 3, 12);
      const user = pick(rnd, ['Maria', 'Dev', 'Sam', 'Priya', 'Luis', 'Kim']);
      const deskPort = `FastEthernet0/${desk}`;
      const gwB = addHost(netB, 1);
      const pools = [[na, netA], [nb, netB]].flatMap(([n, net]) => [`ip dhcp excluded-address ${addHost(net, 1)} ${addHost(net, 9)}`, `ip dhcp pool ${n}`, `network ${net} ${M24}`, `default-router ${addHost(net, 1)}`, 'exit']);
      return {
        ...f, title: this.title, minutes: this.minutes, lights: this.lights, start: 'SW1',
        summary: `${user} moved from ${na} to ${nb} but kept the same desk, on SW1 ${short(deskPort)}. Move the port to ${nb} and get the PC its new address. Nothing else changes.`,
        devices: [
          { id: rtr, kind: 'router', x: 50, y: 12 }, { id: 'SW1', kind: 'switch', x: 50, y: 36 },
          { id: 'DESK', kind: 'pc', x: 28, y: 60, pc: { dhcp: true } }, { id: 'PC2', kind: 'pc', x: 72, y: 60, pc: { ip: addHost(netB, 30), mask: M24, gateway: gwB } },
        ],
        links: [L(rtr, 'GigabitEthernet0/0', 'SW1', 'GigabitEthernet0/1'), L('DESK', NIC, 'SW1', deskPort), L('PC2', NIC, 'SW1', 'FastEthernet0/2')],
        setup: {
          SW1: ['hostname SW1', `vlan ${va}`, `name ${na}`, `vlan ${vb}`, `name ${nb}`, 'interface g0/1', 'switchport mode trunk', `interface f0/${desk}`, 'switchport mode access', `switchport access vlan ${va}`, 'interface f0/2', 'switchport mode access', `switchport access vlan ${vb}`],
          [rtr]: [`hostname ${rtr}`, 'interface g0/0', 'no shutdown', `interface g0/0.${va}`, `encapsulation dot1q ${va}`, `ip address ${addHost(netA, 1)} ${M24}`, `interface g0/0.${vb}`, `encapsulation dot1q ${vb}`, `ip address ${gwB} ${M24}`, 'exit', ...pools],
          DESK: ['ipconfig /renew'],
        },
        saved: [],
        notes: [`${na}: VLAN ${va}, ${netA}/24`, `${nb}: VLAN ${vb}, ${netB}/24`, 'Both VLANs get addresses from DHCP on the router'],
        requirements: [
          { id: 'port', text: `SW1 ${short(deskPort)} is an access port in VLAN ${vb}`, device: 'SW1', check: (w) => swp(w, 'SW1', deskPort).access === vb && swp(w, 'SW1', deskPort).mode === 'access', owns: { SW1: [ifRe(deskPort)] },
            hint: 'One line on that interface: switchport access vlan.', show: { SW1: ['enable', 'configure terminal', `interface f0/${desk}`, `switchport access vlan ${vb}`] } },
          { id: 'renew', text: `The PC has a ${nb} address (ipconfig /renew)`, device: 'DESK', check: (w) => { const a = port(w, 'DESK', NIC).ip; return a !== null && ((a & 0xffffff00) >>> 0) === ip(netB) && cfg(w, 'DESK').gateway === ip(gwB); }, owns: { DESK: [PC_LINES] },
            hint: 'The PC still holds its old lease. ipconfig /renew asks again, and now its request lands in the new VLAN.', show: { DESK: ['ipconfig /renew'] } },
        ],
        tests: [
          { id: 'gw', text: `The PC reaches ${nb}'s gateway`, check: (w) => reach(w, 'DESK', gwB) },
          { id: 'peer', text: `The PC reaches a ${nb} neighbor`, check: (w) => reach(w, 'DESK', addHost(netB, 30)) },
        ],
      };
    },
  },

  {
    kind: 'change-trunk',
    title: 'Carry a new VLAN across the uplink',
    minutes: 8,
    lights: ['t2-trunks', 't2-vlans'],
    make(seed) {
      const rnd = rngOf(seed);
      const f = frame(rnd, this.kind, 'CR');
      const [va, vb, vc] = sample(rnd, [10, 20, 30, 40, 50, 60, 70, 80], 3).sort((a, b) => a - b);
      const [na, nb, nc] = sample(rnd, VLAN_NAMES, 3);
      const [netA, netB, netC] = nets(rnd, 3);
      const both = ['SW1', 'SW2'];
      const up = 'GigabitEthernet0/1';
      const base = [`vlan ${va}`, `name ${na}`, `vlan ${vb}`, `name ${nb}`, 'interface g0/1', 'switchport mode trunk', `switchport trunk allowed vlan ${va},${vb}`,
        'interface f0/1', 'switchport mode access', `switchport access vlan ${va}`, 'interface f0/2', 'switchport mode access', `switchport access vlan ${vb}`];
      const pc = (id, x, y, net, n) => ({ id, kind: 'pc', x, y, pc: { ip: addHost(net, n), mask: M24 } });
      return {
        ...f, title: this.title, minutes: this.minutes, lights: this.lights, start: 'SW1',
        summary: `${f.site} is adding ${nc} (VLAN ${vc}) on both floors. The uplink between SW1 and SW2 carries ${va} and ${vb} today and must keep carrying them. The new desks are on Fa0/3 of each switch.`,
        devices: [
          { id: 'SW1', kind: 'switch', x: 30, y: 16 }, { id: 'SW2', kind: 'switch', x: 70, y: 16 },
          pc('A1', 12, 44, netA, 11), pc('B1', 30, 54, netB, 11), pc('C1', 46, 44, netC, 11),
          pc('A2', 56, 44, netA, 12), pc('B2', 72, 54, netB, 12), pc('C2', 90, 44, netC, 12),
        ],
        links: [L('SW1', up, 'SW2', up), L('A1', NIC, 'SW1', 'FastEthernet0/1'), L('B1', NIC, 'SW1', 'FastEthernet0/2'), L('C1', NIC, 'SW1', 'FastEthernet0/3'), L('A2', NIC, 'SW2', 'FastEthernet0/1'), L('B2', NIC, 'SW2', 'FastEthernet0/2'), L('C2', NIC, 'SW2', 'FastEthernet0/3')],
        setup: { SW1: ['hostname SW1', ...base], SW2: ['hostname SW2', ...base] },
        saved: [],
        notes: [`${na} ${va}, ${nb} ${vb} on the trunk today`, `New: ${nc}, VLAN ${vc}, desks on Fa0/3`],
        requirements: [
          { id: 'vlan', text: `Create VLAN ${vc} named ${nc} on both switches`, device: 'SW1', check: (w) => both.every(d => cfg(w, d).vlans[vc]?.name === nc), owns: { SW1: [vlanRe(vc)], SW2: [vlanRe(vc)] },
            hint: 'vlan, then name, on each switch.', show: { SW1: ['enable', 'configure terminal', `vlan ${vc}`, `name ${nc}`], SW2: ['enable', 'configure terminal', `vlan ${vc}`, `name ${nc}`] } },
          { id: 'trunk', text: `Add VLAN ${vc} to the uplink on both ends, keeping ${va} and ${vb}`, device: 'SW1', check: (w) => both.every(d => sameList(swp(w, d, up).allowed, [va, vb, vc])), owns: { SW1: [ifRe(up)], SW2: [ifRe(up)] },
            hint: 'switchport trunk allowed vlan add. Without add, the list is replaced and two VLANs go dark.', show: { SW1: ['interface g0/1', `switchport trunk allowed vlan add ${vc}`], SW2: ['interface g0/1', `switchport trunk allowed vlan add ${vc}`] } },
          { id: 'desks', text: `Fa0/3 on both switches: access ports in VLAN ${vc}`, device: 'SW1', check: (w) => both.every(d => swp(w, d, 'FastEthernet0/3').mode === 'access' && swp(w, d, 'FastEthernet0/3').access === vc), owns: { SW1: [ifRe('FastEthernet0/3')], SW2: [ifRe('FastEthernet0/3')] },
            hint: 'switchport mode access and switchport access vlan, on each Fa0/3.', show: { SW1: ['interface f0/3', 'switchport mode access', `switchport access vlan ${vc}`], SW2: ['interface f0/3', 'switchport mode access', `switchport access vlan ${vc}`] } },
        ],
        tests: [
          { id: 'c', text: `${nc} desks reach each other across the uplink`, check: (w) => reach(w, 'C1', addHost(netC, 12)) },
          { id: 'a', text: `${na} still works`, check: (w) => reach(w, 'A1', addHost(netA, 12)) },
          { id: 'b', text: `${nb} still works`, check: (w) => reach(w, 'B1', addHost(netB, 12)) },
        ],
      };
    },
  },

  {
    kind: 'change-backup',
    title: 'Add a backup route',
    minutes: 6,
    lights: ['t3-static'],
    make(seed) {
      const rnd = rngOf(seed);
      const f = frame(rnd, this.kind, 'CR');
      const rtr = pick(rnd, ROUTERS);
      const ad = pick(rnd, [5, 10, 200, 250]);
      const [lan] = nets(rnd, 1);
      const a = `10.200.${int(rnd, 0, 120)}.0`;
      const b = `10.201.${int(rnd, 0, 120)}.0`;
      const web = addHost(WEB_NET, int(rnd, 10, 200));
      const backup = (w) => cfg(w, rtr).statics.some(s => s.net === 0 && s.len === 0 && s.nh === ip(addHost(b, 1)) && s.ad === ad);
      return {
        ...f, title: this.title, minutes: this.minutes, lights: this.lights, start: rtr,
        summary: `${rtr} at ${f.site} reaches everything through ISP-A on a static default route. A second circuit to ISP-B is live but unused. Make ISP-B a backup that takes over only if ISP-A fails.`,
        devices: [
          { id: rtr, kind: 'router', x: 22, y: 30 }, { id: 'ISPA', kind: 'router', x: 56, y: 12 }, { id: 'ISPB', kind: 'router', x: 56, y: 50 },
          { id: 'WEB', kind: 'pc', x: 88, y: 30, pc: { ip: web, mask: M24, gateway: addHost(WEB_NET, 1), services: [80] } }, { id: 'CORE', kind: 'switch', x: 76, y: 30 },
        ],
        links: [L(rtr, 'GigabitEthernet0/1', 'ISPA', 'GigabitEthernet0/0'), L(rtr, 'GigabitEthernet0/2', 'ISPB', 'GigabitEthernet0/0'),
          L('ISPA', 'GigabitEthernet0/1', 'CORE', 'GigabitEthernet0/1'), L('ISPB', 'GigabitEthernet0/1', 'CORE', 'GigabitEthernet0/2'), L('WEB', NIC, 'CORE', 'FastEthernet0/1')],
        setup: {
          [rtr]: [`hostname ${rtr}`, 'interface g0/0', `ip address ${addHost(lan, 1)} ${M24}`, 'interface g0/1', `ip address ${addHost(a, 2)} 255.255.255.252`, 'no shutdown', 'interface g0/2', `ip address ${addHost(b, 2)} 255.255.255.252`, 'no shutdown', 'exit', `ip route 0.0.0.0 0.0.0.0 ${addHost(a, 1)}`],
          ISPA: ['hostname ISPA', 'interface g0/0', `ip address ${addHost(a, 1)} 255.255.255.252`, 'no shutdown', 'interface g0/1', `ip address ${addHost(WEB_NET, 1)} ${M24}`, 'no shutdown', 'exit', `ip route ${b} 255.255.255.252 ${addHost(WEB_NET, 2)}`],
          ISPB: ['hostname ISPB', 'interface g0/0', `ip address ${addHost(b, 1)} 255.255.255.252`, 'no shutdown', 'interface g0/1', `ip address ${addHost(WEB_NET, 2)} ${M24}`, 'no shutdown', 'exit', `ip route ${a} 255.255.255.252 ${addHost(WEB_NET, 1)}`],
          CORE: ['hostname CORE'],
        },
        saved: [],
        notes: [`ISP-A ${addHost(a, 1)} (primary)`, `ISP-B ${addHost(b, 1)} (backup)`, `Backup distance: ${ad}`],
        requirements: [
          { id: 'float', text: `A default route via ISP-B (${addHost(b, 1)}) with administrative distance ${ad}`, device: rtr, check: backup, owns: { [rtr]: [globalRe('ip route 0.0.0.0 0.0.0.0')] },
            hint: 'The same ip route, with a distance at the end. Higher than the primary\'s 1, so it stays out of the table until the primary goes.', show: { [rtr]: ['enable', 'configure terminal', `ip route 0.0.0.0 0.0.0.0 ${addHost(b, 1)} ${ad}`] } },
        ],
        tests: [
          { id: 'primary', text: 'Traffic still leaves through ISP-A', check: (w) => routingTable(w, rtr).find(r => r.len === 0)?.hops[0].nh === ip(addHost(a, 1)) && reach(w, rtr, web) },
          { id: 'failover', text: 'If ISP-A goes down, the site still reaches the web', check: (w) => tryIt(w, c => { c.devices[rtr].config.interfaces['GigabitEthernet0/1'].shutdown = true; return reachOn(c, rtr, web); }) },
        ],
      };
    },
  },
];


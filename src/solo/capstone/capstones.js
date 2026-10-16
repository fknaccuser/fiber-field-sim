// Tree capstones: one CLI build per tree that crowns it.
//
// The order gives the goals as outcomes and a plan, nothing more. There
// are no ticks, no hints and no right-or-wrong while you work. On submit
// the network is tested for what the goals describe (who reaches whom,
// what survives a failure, what a new PC is handed), and every test must
// pass for the crown. How you get there is yours: any working
// configuration counts, and nothing extra is charged.
//
// `answer` is one working configuration per device, used by the tests to
// prove each capstone can be passed. It is never shown.

import { rngOf, int, pick, sample, privateBase, subnetIn, addHost, maskOf } from '../study/gen/kit.js';
import { exchange, requestDhcp, refresh, l2Of } from '../labs/world.js';
import { memberFlag } from '../labs/switching.js';
import { parseIp } from '../labs/ip4.js';
import { ping6, v6Of } from '../labs/v6.js';
import { cloneWorld } from '../desk/grade.js';

const ip = parseIp;
const NIC = 'FastEthernet0';
const M24 = '255.255.255.0';
const M30 = '255.255.255.252';
let seq = 0;
const L = (a, ai, b, bi) => ({ id: `cap${seq += 1}`, ends: [[a, ai], [b, bi]] });
const cfg = (w, d) => w.devices[d].config;
const on = (w, fn) => fn(cloneWorld(w));
const reachOn = (w, d, dst, opts = {}) => exchange(w, d, ip(dst), opts).ok;
const reach = (w, d, dst, opts = {}) => on(w, c => reachOn(c, d, dst, opts));
// Run a check after breaking something, on a copy.
const after = (w, breakIt, check) => on(w, c => { breakIt(c); refresh(c); return check(c); });
const shut = (c, d, ...ifs) => { for (const i of ifs) c.devices[d].config.interfaces[i].shutdown = true; };
const nets = (rnd, n) => { const out = []; while (out.length < n) { const x = subnetIn(rnd, privateBase(rnd), 24); if (!out.includes(x)) out.push(x); } return out; };
// A fresh DHCP client on a PC's port: does it get an address, and which?
const freshLease = (w, pc) => on(w, c => { c.devices[pc].config.interfaces[NIC].ip = null; return requestDhcp(c, pc); });

const SITES = ['Harbor Clinic', 'Elm Street Branch', 'Northgate Office', 'Mesa Warehouse', 'Riverside Annex', 'Pine Ridge School', 'Lakeview Dental', 'Canyon Library'];
const frame = (rnd, tree) => ({ number: `CAP-${tree.toUpperCase()}-${int(rnd, 100, 999)}`, site: pick(rnd, SITES), requester: 'Your lead', priority: 'P2' });

export const CAPSTONES = [
  // ------------------------------------------------------------ IOS
  {
    tree: 't0', kind: 'capstone-t0', title: 'Commission new gear from the box', minutes: 20,
    make(seed) {
      const rnd = rngOf(seed);
      const f = frame(rnd, 't0');
      const [mgmt, remote] = nets(rnd, 2);
      const r = pick(rnd, ['BR-RTR', 'EDGE1', 'SITE-RTR']);
      const sw = pick(rnd, ['BR-SW1', 'ACC1', 'IDF-SW']);
      const domain = pick(rnd, ['branch.lab', 'corp.lab', 'site.lab']);
      const user = pick(rnd, ['netadmin', 'ops', 'tech1']);
      const gw = addHost(mgmt, 1), swIp = addHost(mgmt, 2), rIp2 = addHost(remote, 1);
      return {
        ...f, kind: this.kind, tree: this.tree, title: this.title, minutes: this.minutes, lights: [], start: r,
        summary: `A router and a switch arrived at ${f.site} straight from the box. Bring them up to the standard below. When you submit, they are tested the way the admins will use them.`,
        devices: [{ id: r, kind: 'router', x: 50, y: 14 }, { id: sw, kind: 'switch', x: 50, y: 40 },
          { id: 'ADMIN', kind: 'pc', x: 20, y: 64, pc: { ip: addHost(mgmt, 10), mask: M24, gateway: gw } },
          { id: 'NOC', kind: 'pc', x: 86, y: 14, pc: { ip: addHost(remote, 10), mask: M24, gateway: rIp2 } }],
        links: [L(r, 'GigabitEthernet0/0', sw, 'GigabitEthernet0/1'), L('ADMIN', NIC, sw, 'FastEthernet0/1'), L(r, 'GigabitEthernet0/1', 'NOC', NIC)],
        setup: {}, saved: [],
        notes: [`Names: ${r} and ${sw}`, `Management LAN ${mgmt}/24: ${r} .1, ${sw} .2, ADMIN .10`, `NOC LAN ${remote}/24 on ${r} Gi0/1 (.1)`, `Domain ${domain}; local user ${user}`],
        goals: [
          `Both devices carry their names`,
          'Privileged mode on both asks for a password that is stored hashed',
          `Admins log in to both over SSH version 2 as ${user}, and Telnet is refused`,
          `The NOC, on another subnet, can SSH to ${sw}`,
          'Both keep all of this after a reload',
        ],
        requirements: [],
        tests: [
          { id: 'names', text: 'Both carry their names', check: (w) => cfg(w, r).hostname === r && cfg(w, sw).hostname === sw },
          { id: 'secret', text: 'Privileged mode is protected by a hashed secret on both', check: (w) => Boolean(cfg(w, r).enableSecret && cfg(w, sw).enableSecret) },
          { id: 'ssh-r', text: `ADMIN reaches ${r} over SSH v2 with a local login, and Telnet is refused`, check: (w) => cfg(w, r).sshVersion === 2 && cfg(w, r).lines.vty.login === 'local' && Boolean(cfg(w, r).users[user]) && reach(w, 'ADMIN', gw, { proto: 'tcp', port: 22 }) && !reach(w, 'ADMIN', gw, { proto: 'tcp', port: 23 }) },
          { id: 'ssh-sw', text: `ADMIN reaches ${sw} over SSH v2 with a local login, and Telnet is refused`, check: (w) => cfg(w, sw).sshVersion === 2 && cfg(w, sw).lines.vty.login === 'local' && Boolean(cfg(w, sw).users[user]) && reach(w, 'ADMIN', swIp, { proto: 'tcp', port: 22 }) && !reach(w, 'ADMIN', swIp, { proto: 'tcp', port: 23 }) },
          { id: 'noc', text: `The NOC reaches ${sw} over SSH from another subnet`, check: (w) => reach(w, 'NOC', swIp, { proto: 'tcp', port: 22 }) },
          { id: 'saved', text: 'Both survive a reload', check: (w) => w.devices[r].startup?.hostname === r && w.devices[sw].startup?.hostname === sw && w.devices[r].startup?.lines?.vty?.transport === 'ssh' && w.devices[sw].startup?.lines?.vty?.transport === 'ssh' },
        ],
        answer: {
          [r]: ['enable', 'configure terminal', `hostname ${r}`, 'enable secret Cl0set!', `ip domain name ${domain}`, `username ${user} secret Adm1n!pw`, 'crypto key generate rsa modulus 2048', 'ip ssh version 2',
            'interface g0/0', `ip address ${gw} ${M24}`, 'no shutdown', 'interface g0/1', `ip address ${rIp2} ${M24}`, 'no shutdown', 'line vty 0 4', 'login local', 'transport input ssh', 'end', 'copy running-config startup-config', ''],
          [sw]: ['enable', 'configure terminal', `hostname ${sw}`, 'enable secret Cl0set!', `ip domain name ${domain}`, `username ${user} secret Adm1n!pw`, 'crypto key generate rsa modulus 2048', 'ip ssh version 2',
            'interface vlan 1', `ip address ${swIp} ${M24}`, 'no shutdown', 'exit', `ip default-gateway ${gw}`, 'line vty 0 15', 'login local', 'transport input ssh', 'end', 'copy running-config startup-config', ''],
        },
      };
    },
  },

  // ------------------------------------------------------------ Network Fundamentals
  {
    tree: 't1', kind: 'capstone-t1', title: 'Address a new site, IPv4 and IPv6', minutes: 20,
    make(seed) {
      const rnd = rngOf(seed);
      const f = frame(rnd, 't1');
      const base = `10.${int(rnd, 1, 250)}.${int(rnd, 0, 250)}.0`;
      const sizes = pick(rnd, [[100, 50, 20], [60, 28, 12], [120, 60, 25], [55, 25, 6]]);
      const lenFor = (h) => { let len = 30; while ((2 ** (32 - len)) - 2 < h) len -= 1; return len; };
      let at = 0;
      const plan = sizes.map((h, k) => { const len = lenFor(h); const net = addHost(base, at); at += 2 ** (32 - len); return { h, len, net, port: `GigabitEthernet0/${k}`, pc: `PC${k + 1}` }; });
      const v6 = `2001:db8:${int(rnd, 0x1000, 0xfffe).toString(16)}:${pick(rnd, ['10', 'a', '1'])}`;
      const rIfs = (w) => plan.map(p => cfg(w, 'R1').interfaces[p.port]);
      const inBlock = (a) => a !== null && ((a >>> 8) & 0xffffff) === ((ip(base) >>> 8) & 0xffffff);
      return {
        ...f, kind: this.kind, tree: this.tree, title: this.title, minutes: this.minutes, lights: [], start: 'R1',
        summary: `${f.site} has ${base}/24 for three LANs on R1 and an IPv6 prefix for the first one. Carve, address and prove it. Which subnets go where, and which hosts get which addresses, is up to you.`,
        devices: [{ id: 'R1', kind: 'router', x: 50, y: 16 }, ...plan.map((p, k) => ({ id: p.pc, kind: 'pc', x: 18 + 32 * k, y: 58, pc: {} }))],
        links: plan.map(p => L('R1', p.port, p.pc, NIC)),
        setup: { R1: ['hostname R1'] }, saved: [],
        notes: [`Block ${base}/24`, ...plan.map(p => `${p.pc}'s LAN on ${p.port.replace('GigabitEthernet', 'Gi')}: ${p.h} hosts`), `IPv6 for PC1's LAN: ${v6}::/64, PC1 by SLAAC`],
        goals: [
          'Each LAN gets the smallest subnet that holds its hosts, all inside the block, none overlapping',
          'Every PC reaches every other PC',
          'PC1 configures its own IPv6 address and reaches R1 over IPv6',
        ],
        requirements: [],
        tests: [
          { id: 'sizes', text: 'Each LAN is the smallest subnet that fits, inside the block', check: (w) => rIfs(w).every((i, k) => i.ip !== null && inBlock(i.ip) && i.mask === ip(maskOf(plan[k].len))) },
          { id: 'overlap', text: 'No two LANs overlap', check: (w) => { const r = rIfs(w).map(i => [((i.ip & i.mask) >>> 0), i.mask]); return r.every(([n, m], a) => r.every(([n2, m2], b) => a === b || (((n & m2) >>> 0) !== n2 && ((n2 & m) >>> 0) !== n))); } },
          { id: 'ab', text: 'PC1 and PC2 reach each other', check: (w) => { const t = cfg(w, 'PC2').interfaces[NIC].ip; return t !== null && on(w, c => exchange(c, 'PC1', t).ok); } },
          { id: 'bc', text: 'PC2 and PC3 reach each other', check: (w) => { const t = cfg(w, 'PC3').interfaces[NIC].ip; return t !== null && on(w, c => exchange(c, 'PC2', t).ok); } },
          { id: 'v6', text: 'PC1 has a SLAAC address and reaches R1 over IPv6', check: (w) => { const a = v6Of(w, 'PC1', NIC).addrs[0]?.addr; const r = v6Of(w, 'R1', 'GigabitEthernet0/0').addrs[0]?.addr; return a !== undefined && r !== undefined && ping6(w, 'PC1', r).ok && cfg(w, 'PC1').v6?.auto; } },
        ],
        answer: {
          R1: ['enable', 'configure terminal', 'ipv6 unicast-routing', ...plan.flatMap((p, k) => [`interface g0/${k}`, `ip address ${addHost(p.net, 1)} ${maskOf(p.len)}`, ...(k === 0 ? [`ipv6 address ${v6}::1/64`] : []), 'no shutdown'])],
          ...Object.fromEntries(plan.map((p, k) => [p.pc, [`ipconfig ${addHost(p.net, 2)} ${maskOf(p.len)} ${addHost(p.net, 1)}`, ...(k === 0 ? ['ipv6config auto'] : [])]])),
        },
      };
    },
  },

  // ------------------------------------------------------------ Network Access
  {
    tree: 't2', kind: 'capstone-t2', title: 'Build the office network end to end', minutes: 30,
    make(seed) {
      const rnd = rngOf(seed);
      const f = frame(rnd, 't2');
      const [va, vb] = sample(rnd, [10, 20, 30, 40, 50, 60], 2).sort((a, b) => a - b);
      const [na, nb] = sample(rnd, ['SALES', 'ENG', 'HR', 'FINANCE', 'STAFF', 'OPS'], 2);
      const [netA, netB] = nets(rnd, 2);
      const gA = addHost(netA, 1), gB = addHost(netB, 1);
      const ports = { PC1: ['SW1', 'FastEthernet0/1', va], PC2: ['SW1', 'FastEthernet0/2', vb], PC3: ['SW2', 'FastEthernet0/1', va], PC4: ['SW2', 'FastEthernet0/2', vb] };
      const trunkEnds = [['SW1', 'Port-channel1'], ['SW2', 'Port-channel1'], ['SW1', 'FastEthernet0/24']];
      const leaseOk = (w, pc, net) => { const r = freshLease(w, pc); return r.ok && ((r.ip >>> 8) === (ip(net) >>> 8)) && (r.ip & 255) > 10; };
      return {
        ...f, kind: this.kind, tree: this.tree, title: this.title, minutes: this.minutes, lights: [], start: 'SW1',
        summary: `${f.site}'s new office: two switches joined by two cables, a router hanging off SW1, and four desks. Everything is from the box. Build it so the office works, the way you would on a first day on site.`,
        devices: [{ id: 'R1', kind: 'router', x: 20, y: 12 }, { id: 'SW1', kind: 'switch', x: 30, y: 38 }, { id: 'SW2', kind: 'switch', x: 70, y: 38 },
          ...['PC1', 'PC2'].map((p, k) => ({ id: p, kind: 'pc', x: 14 + 22 * k, y: 64, pc: { dhcp: true } })), ...['PC3', 'PC4'].map((p, k) => ({ id: p, kind: 'pc', x: 62 + 22 * k, y: 64, pc: { dhcp: true } }))],
        links: [L('R1', 'GigabitEthernet0/0', 'SW1', 'FastEthernet0/24'), L('SW1', 'GigabitEthernet0/1', 'SW2', 'GigabitEthernet0/1'), L('SW1', 'GigabitEthernet0/2', 'SW2', 'GigabitEthernet0/2'),
          ...Object.entries(ports).map(([pc, [sw, p]]) => L(pc, NIC, sw, p))],
        setup: {}, saved: [],
        notes: [`${na}: VLAN ${va}, ${netA}/24, PC1 and PC3`, `${nb}: VLAN ${vb}, ${netB}/24, PC2 and PC4`, 'Gateways are .1 on R1; the first 10 addresses of each are kept for gear', 'Native VLAN 99 on every trunk', 'SW1 to SW2: both cables carry traffic as one link'],
        goals: [
          'Every desk is in its VLAN and gets an address automatically, above the reserved range',
          'Desks in the same VLAN reach each other across the two switches',
          'Desks in different VLANs reach each other through R1',
          'Both cables between the switches carry traffic as one LACP bundle',
          'Trunks use native VLAN 99 with no mismatch anywhere',
          'SW1 is the spanning tree root for both user VLANs',
        ],
        requirements: [],
        tests: [
          { id: 'dhcp', text: 'Each desk gets an address above the reserved range in its VLAN', check: (w) => leaseOk(w, 'PC1', netA) && leaseOk(w, 'PC2', netB) && leaseOk(w, 'PC3', netA) && leaseOk(w, 'PC4', netB) },
          { id: 'same', text: 'PC1 reaches PC3 across the switches', check: (w) => on(w, c => { for (const p of ['PC1', 'PC3']) { const r = requestDhcp(c, p); if (!r.ok) return false; Object.assign(c.devices[p].config.interfaces[NIC], { ip: r.ip, mask: 0xffffff00 }); c.devices[p].config.gateway = r.router; } return exchange(c, 'PC1', c.devices.PC3.config.interfaces[NIC].ip).ok; }) },
          { id: 'inter', text: 'PC1 reaches PC4 through R1', check: (w) => on(w, c => { for (const p of ['PC1', 'PC4']) { const r = requestDhcp(c, p); if (!r.ok) return false; Object.assign(c.devices[p].config.interfaces[NIC], { ip: r.ip, mask: 0xffffff00 }); c.devices[p].config.gateway = r.router; } return exchange(c, 'PC1', c.devices.PC4.config.interfaces[NIC].ip).ok; }) },
          { id: 'lacp', text: 'Both inter-switch cables are bundled with LACP', check: (w) => ['SW1', 'SW2'].every(s => ['GigabitEthernet0/1', 'GigabitEthernet0/2'].every(p => memberFlag(w, s, p) === 'P')) && ['SW1', 'SW2'].some(s => ['active'].includes(cfg(w, s).interfaces['GigabitEthernet0/1'].sw.channel?.mode)) },
          { id: 'native', text: 'Every trunk uses native VLAN 99, no mismatch', check: (w) => trunkEnds.every(([s, p]) => cfg(w, s).interfaces[p]?.sw?.native === 99) && !Object.keys(w.mismatch ?? {}).length },
          { id: 'root', text: 'SW1 is root for both user VLANs', check: (w) => [va, vb].every(v => l2Of(w).stp.SW2?.[v]?.rootId === 'SW1') },
        ],
        answer: {
          SW1: ['enable', 'configure terminal', 'hostname SW1', `vlan ${va}`, `name ${na}`, `vlan ${vb}`, `name ${nb}`, 'vlan 99', 'name NATIVE', 'exit', `spanning-tree vlan ${va},${vb} root primary`,
            'interface range g0/1 - 2', 'channel-group 1 mode active', 'interface port-channel 1', 'switchport mode trunk', 'switchport trunk native vlan 99',
            'interface f0/24', 'switchport mode trunk', 'switchport trunk native vlan 99',
            'interface f0/1', 'switchport mode access', `switchport access vlan ${va}`, 'interface f0/2', 'switchport mode access', `switchport access vlan ${vb}`, 'end'],
          SW2: ['enable', 'configure terminal', 'hostname SW2', `vlan ${va}`, `name ${na}`, `vlan ${vb}`, `name ${nb}`, 'vlan 99', 'name NATIVE', 'exit',
            'interface range g0/1 - 2', 'channel-group 1 mode passive', 'interface port-channel 1', 'switchport mode trunk', 'switchport trunk native vlan 99',
            'interface f0/1', 'switchport mode access', `switchport access vlan ${va}`, 'interface f0/2', 'switchport mode access', `switchport access vlan ${vb}`, 'end'],
          R1: ['enable', 'configure terminal', 'interface g0/0', 'no shutdown', `interface g0/0.${va}`, `encapsulation dot1q ${va}`, `ip address ${gA} ${M24}`, `interface g0/0.${vb}`, `encapsulation dot1q ${vb}`, `ip address ${gB} ${M24}`,
            'interface g0/0.99', 'encapsulation dot1q 99 native', 'exit',
            `ip dhcp excluded-address ${gA} ${addHost(netA, 10)}`, `ip dhcp excluded-address ${gB} ${addHost(netB, 10)}`,
            `ip dhcp pool ${na}`, `network ${netA} ${M24}`, `default-router ${gA}`, 'exit', `ip dhcp pool ${nb}`, `network ${netB} ${M24}`, `default-router ${gB}`, 'end'],
        },
      };
    },
  },

  // ------------------------------------------------------------ IP Connectivity
  {
    tree: 't3', kind: 'capstone-t3', title: 'Connect three sites and the internet', minutes: 30,
    make(seed) {
      const rnd = rngOf(seed);
      const f = frame(rnd, 't3');
      const [lHQ, l1, l2] = nets(rnd, 3);
      const x = int(rnd, 1, 200);
      const t = (k) => `10.${250}.${x}.${k * 4}`;
      const [a, b, c] = [t(0), t(1), t(2)];
      const devs = [{ id: 'HQ', kind: 'router', x: 50, y: 14, ports: ['GigabitEthernet0/0', 'GigabitEthernet0/1', 'GigabitEthernet0/2', 'GigabitEthernet0/3'] }, { id: 'S1', kind: 'router', x: 20, y: 42 }, { id: 'S2', kind: 'router', x: 80, y: 42 },
        { id: 'ISP', kind: 'router', x: 86, y: 6 }, { id: 'WEB', kind: 'pc', x: 96, y: 26, pc: { ip: '198.51.100.80', mask: M24, gateway: '198.51.100.1', services: [80] } },
        { id: 'PC0', kind: 'pc', x: 30, y: 6, pc: { ip: addHost(lHQ, 10), mask: M24, gateway: addHost(lHQ, 1) } },
        { id: 'PC1', kind: 'pc', x: 20, y: 66, pc: { ip: addHost(l1, 10), mask: M24, gateway: addHost(l1, 1) } }, { id: 'PC2', kind: 'pc', x: 80, y: 66, pc: { ip: addHost(l2, 10), mask: M24, gateway: addHost(l2, 1) } }];
      return {
        ...f, kind: this.kind, tree: this.tree, title: this.title, minutes: this.minutes, lights: [], start: 'HQ',
        summary: `${f.site} has a headquarters and two sites in a triangle, and HQ has the internet link. The PCs are addressed; every router is blank. Make every site reach every other site and the internet, and keep it working when a link fails.`,
        devices: devs,
        links: [L('HQ', 'GigabitEthernet0/0', 'S1', 'GigabitEthernet0/0'), L('HQ', 'GigabitEthernet0/1', 'S2', 'GigabitEthernet0/0'), L('S1', 'GigabitEthernet0/1', 'S2', 'GigabitEthernet0/1'),
          L('HQ', 'GigabitEthernet0/2', 'ISP', 'GigabitEthernet0/0'), L('ISP', 'GigabitEthernet0/1', 'WEB', NIC), L('HQ', 'GigabitEthernet0/3', 'PC0', NIC), L('S1', 'GigabitEthernet0/2', 'PC1', NIC), L('S2', 'GigabitEthernet0/2', 'PC2', NIC)],
        setup: { ISP: ['hostname ISP', 'interface g0/0', 'ip address 203.0.113.1 255.255.255.252', 'no shutdown', 'interface g0/1', 'ip address 198.51.100.1 255.255.255.0', 'no shutdown', 'exit', 'ip route 10.0.0.0 255.0.0.0 203.0.113.2', 'ip route 172.16.0.0 255.240.0.0 203.0.113.2', 'ip route 192.168.0.0 255.255.0.0 203.0.113.2'] },
        saved: [],
        notes: [`HQ LAN ${lHQ}/24 on Gi0/3, S1 LAN ${l1}/24 on Gi0/2, S2 LAN ${l2}/24 on Gi0/2 (routers .1)`, `Links: HQ-S1 ${a}/30, HQ-S2 ${b}/30, S1-S2 ${c}/30`, 'Internet: HQ Gi0/2 is 203.0.113.2/30, the ISP is .1 and already routes your space back to you', 'Test site: 198.51.100.80'],
        goals: [
          'Every site LAN reaches every other site LAN',
          'Every site reaches the internet test site',
          'If the HQ to S1 link fails, S1 still reaches HQ and the internet',
          'Routers never send routing hellos toward the PCs',
        ],
        requirements: [],
        tests: [
          { id: 'mesh', text: 'Every LAN reaches every other LAN', check: (w) => reach(w, 'PC1', addHost(l2, 10)) && reach(w, 'PC1', addHost(lHQ, 10)) && reach(w, 'PC2', addHost(lHQ, 10)) },
          { id: 'web', text: 'Every site reaches the internet', check: (w) => ['PC0', 'PC1', 'PC2'].every(p => reach(w, p, '198.51.100.80', { proto: 'tcp', port: 80 })) },
          { id: 'fail', text: 'With HQ to S1 down, S1 still reaches HQ and the internet', check: (w) => after(w, (cw) => shut(cw, 'HQ', 'GigabitEthernet0/0'), (cw) => reachOn(cw, 'PC1', addHost(lHQ, 10)) && reachOn(cw, 'PC1', '198.51.100.80', { proto: 'tcp', port: 80 })) },
          { id: 'passive', text: 'No hellos toward the PC LANs', check: (w) => [['HQ', 'GigabitEthernet0/3'], ['S1', 'GigabitEthernet0/2'], ['S2', 'GigabitEthernet0/2']].every(([d, i]) => !cfg(w, d).ospf || cfg(w, d).ospf.passive.includes(i)) },
        ],
        answer: {
          HQ: ['enable', 'configure terminal', 'interface g0/0', `ip address ${addHost(a, 1)} ${M30}`, 'no shutdown', 'interface g0/1', `ip address ${addHost(b, 1)} ${M30}`, 'no shutdown', 'interface g0/2', 'ip address 203.0.113.2 255.255.255.252', 'no shutdown', 'interface g0/3', `ip address ${addHost(lHQ, 1)} ${M24}`, 'no shutdown', 'exit',
            'ip route 0.0.0.0 0.0.0.0 203.0.113.1', 'router ospf 1', 'router-id 1.1.1.1', `network 10.250.${x}.0 0.0.0.255 area 0`, `network ${lHQ} 0.0.0.255 area 0`, 'passive-interface g0/3', 'default-information originate', 'end'],
          S1: ['enable', 'configure terminal', 'interface g0/0', `ip address ${addHost(a, 2)} ${M30}`, 'no shutdown', 'interface g0/1', `ip address ${addHost(c, 1)} ${M30}`, 'no shutdown', 'interface g0/2', `ip address ${addHost(l1, 1)} ${M24}`, 'no shutdown', 'exit',
            'router ospf 1', 'router-id 2.2.2.2', `network 10.250.${x}.0 0.0.0.255 area 0`, `network ${l1} 0.0.0.255 area 0`, 'passive-interface g0/2', 'end'],
          S2: ['enable', 'configure terminal', 'interface g0/0', `ip address ${addHost(b, 2)} ${M30}`, 'no shutdown', 'interface g0/1', `ip address ${addHost(c, 2)} ${M30}`, 'no shutdown', 'interface g0/2', `ip address ${addHost(l2, 1)} ${M24}`, 'no shutdown', 'exit',
            'router ospf 1', 'router-id 3.3.3.3', `network 10.250.${x}.0 0.0.0.255 area 0`, `network ${l2} 0.0.0.255 area 0`, 'passive-interface g0/2', 'end'],
        },
      };
    },
  },

  // ------------------------------------------------------------ IP Services
  {
    tree: 't4', kind: 'capstone-t4', title: 'Bring a branch online', minutes: 30,
    make(seed) {
      const rnd = rngOf(seed);
      const f = frame(rnd, 't4');
      const [users, srvNet] = nets(rnd, 2);
      const gw = addHost(users, 1);
      const srv = addHost(srvNet, 10);
      const keep = pick(rnd, [10, 20, 30]);
      const pub = pick(rnd, ['203.0.113.5', '203.0.113.6', '203.0.113.4']);
      return {
        ...f, kind: this.kind, tree: this.tree, title: this.title, minutes: this.minutes, lights: [], start: 'EDGE',
        summary: `${f.site} has users, a server and an internet link, and a blank edge router between them. The server already runs DNS for the office. Get the users online, publish the server to the internet, and point the router's time and logs at the server.`,
        devices: [{ id: 'EDGE', kind: 'router', x: 46, y: 14 }, { id: 'ISP', kind: 'router', x: 86, y: 14 }, { id: 'WEB', kind: 'pc', x: 88, y: 42, pc: { ip: '198.51.100.80', mask: M24, gateway: '198.51.100.1', services: [80] } },
          { id: 'SW1', kind: 'switch', x: 30, y: 38 }, { id: 'SRV', kind: 'pc', x: 62, y: 42, pc: { ip: srv, mask: M24, gateway: addHost(srvNet, 1), services: [80], server: { dns: { on: true, records: { 'intranet.branch.lab': srv } } } } },
          { id: 'PC1', kind: 'pc', x: 14, y: 64, pc: { dhcp: true } }, { id: 'PC2', kind: 'pc', x: 40, y: 64, pc: { dhcp: true } }],
        links: [L('EDGE', 'GigabitEthernet0/1', 'ISP', 'GigabitEthernet0/0'), L('ISP', 'GigabitEthernet0/1', 'WEB', NIC), L('EDGE', 'GigabitEthernet0/0', 'SW1', 'GigabitEthernet0/1'), L('EDGE', 'GigabitEthernet0/2', 'SRV', NIC), L('PC1', NIC, 'SW1', 'FastEthernet0/1'), L('PC2', NIC, 'SW1', 'FastEthernet0/2')],
        setup: { ISP: ['hostname ISP', 'interface g0/0', 'ip address 203.0.113.1 255.255.255.248', 'no shutdown', 'interface g0/1', 'ip address 198.51.100.1 255.255.255.0', 'no shutdown'], SW1: ['hostname SW1'] },
        saved: [],
        notes: [`Users ${users}/24 on Gi0/0, gateway ${gw}; keep .1 to .${keep} out of DHCP`, `Server LAN ${srvNet}/24 on Gi0/2: SRV ${srv} runs DNS`, 'WAN 203.0.113.0/29: ISP .1, EDGE .2, spare .3 to .6', `Publish SRV as ${pub}`, 'Internet test site 198.51.100.80'],
        goals: [
          `A new PC gets an address above .${keep}, the gateway, and SRV as its DNS server`,
          'The users reach the internet test site, without the ISP knowing your private addresses',
          `The internet reaches the server's web page at ${pub}`,
          `A user can look up intranet.branch.lab`,
          'EDGE takes its time from SRV and sends its logs to SRV',
        ],
        requirements: [],
        tests: [
          { id: 'dhcp', text: `A new PC gets an address above .${keep}, the gateway and the DNS server`, check: (w) => { const r = freshLease(w, 'PC1'); return r.ok && (r.ip >>> 8) === (ip(users) >>> 8) && (r.ip & 255) > keep && r.router === ip(gw) && r.dns === ip(srv); } },
          { id: 'web', text: 'Users reach the internet', check: (w) => on(w, c => { const r = requestDhcp(c, 'PC1'); if (!r.ok) return false; Object.assign(c.devices.PC1.config.interfaces[NIC], { ip: r.ip, mask: 0xffffff00 }); c.devices.PC1.config.gateway = r.router; return exchange(c, 'PC1', ip('198.51.100.80'), { proto: 'tcp', port: 80 }).ok; }) },
          { id: 'pub', text: `The internet reaches ${pub} on port 80`, check: (w) => reach(w, 'WEB', pub, { proto: 'tcp', port: 80 }) },
          { id: 'dns', text: 'A user can look up intranet.branch.lab', check: (w) => on(w, c => { const r = requestDhcp(c, 'PC2'); if (!r.ok) return false; Object.assign(c.devices.PC2.config.interfaces[NIC], { ip: r.ip, mask: 0xffffff00 }); Object.assign(c.devices.PC2.config, { gateway: r.router, dns: r.dns }); return exchange(c, 'PC2', ip(srv), { proto: 'udp', port: 53 }).ok && r.dns === ip(srv); }) },
          { id: 'ops', text: 'NTP and syslog point at SRV, and SRV is reachable from EDGE', check: (w) => (cfg(w, 'EDGE').ntp ?? []).includes(ip(srv)) && (cfg(w, 'EDGE').logHosts ?? []).includes(ip(srv)) && reach(w, 'EDGE', srv) },
        ],
        answer: {
          EDGE: ['enable', 'configure terminal', 'interface g0/0', `ip address ${gw} ${M24}`, 'ip nat inside', 'no shutdown', 'interface g0/1', 'ip address 203.0.113.2 255.255.255.248', 'ip nat outside', 'no shutdown', 'interface g0/2', `ip address ${addHost(srvNet, 1)} ${M24}`, 'ip nat inside', 'no shutdown', 'exit',
            'ip route 0.0.0.0 0.0.0.0 203.0.113.1', `ip dhcp excluded-address ${gw} ${addHost(users, keep)}`, 'ip dhcp pool USERS', `network ${users} ${M24}`, `default-router ${gw}`, `dns-server ${srv}`, 'exit',
            `access-list 1 permit ${users} 0.0.0.255`, 'ip nat inside source list 1 interface g0/1 overload', `ip nat inside source static ${srv} ${pub}`, `ntp server ${srv}`, `logging host ${srv}`, 'end'],
        },
      };
    },
  },

  // ------------------------------------------------------------ Security
  {
    tree: 't5', kind: 'capstone-t5', title: 'Lock down a branch', minutes: 25,
    make(seed) {
      const rnd = rngOf(seed);
      const f = frame(rnd, 't5');
      const [users, admins, srvNet] = nets(rnd, 3);
      const srv = addHost(srvNet, 10);
      const user = pick(rnd, ['secops', 'netadmin', 'ops']);
      const desk = `FastEthernet0/${int(rnd, 3, 9)}`;
      return {
        ...f, kind: this.kind, tree: this.tree, title: this.title, minutes: this.minutes, lights: [], start: 'R1',
        summary: `${f.site} works, but it is wide open: anyone reaches anything, the router takes Telnet, and any laptop plugged into a desk port joins the network. The routing is done; lock it down without breaking what people use.`,
        devices: [{ id: 'R1', kind: 'router', x: 50, y: 12 }, { id: 'SW1', kind: 'switch', x: 30, y: 38 },
          { id: 'USER', kind: 'pc', x: 14, y: 64, pc: { ip: addHost(users, 20), mask: M24, gateway: addHost(users, 1) } },
          { id: 'ADMIN', kind: 'pc', x: 86, y: 40, pc: { ip: addHost(admins, 20), mask: M24, gateway: addHost(admins, 1) } },
          { id: 'SRV', kind: 'pc', x: 60, y: 64, pc: { ip: srv, mask: M24, gateway: addHost(srvNet, 1), services: [22, 80, 443] } }],
        links: [L('R1', 'GigabitEthernet0/0', 'SW1', 'GigabitEthernet0/1'), L('R1', 'GigabitEthernet0/1', 'ADMIN', NIC), L('R1', 'GigabitEthernet0/2', 'SRV', NIC), L('USER', NIC, 'SW1', desk)],
        setup: {
          R1: ['hostname R1', 'interface g0/0', `ip address ${addHost(users, 1)} ${M24}`, 'no shutdown', 'interface g0/1', `ip address ${addHost(admins, 1)} ${M24}`, 'no shutdown', 'interface g0/2', `ip address ${addHost(srvNet, 1)} ${M24}`, 'no shutdown', 'line vty 0 4', 'password cisco', 'login', 'transport input all'],
          SW1: ['hostname SW1', `interface ${desk.replace('FastEthernet', 'f')}`, 'switchport mode access'],
        },
        saved: ['R1', 'SW1'],
        notes: [`Users ${users}/24 behind SW1; USER sits on ${desk.replace('FastEthernet', 'Fa')}`, `Admins ${admins}/24 on R1 Gi0/1`, `Server ${srv}: web for everyone, SSH for admins only`, `Router logins: local user ${user}, SSH only`],
        goals: [
          'Anyone reaches the server\'s web pages (80 and 443)',
          'Only the admin subnet reaches the server over SSH',
          `Admins manage R1 over SSH v2 as ${user}; Telnet is refused from everywhere`,
          `Only the PC on ${desk.replace('FastEthernet', 'Fa')} today may use that port; another device shuts the port`,
        ],
        requirements: [],
        tests: [
          { id: 'web', text: 'Users and admins reach the server on 80 and 443', check: (w) => ['USER', 'ADMIN'].every(p => [80, 443].every(port => reach(w, p, srv, { proto: 'tcp', port }))) },
          { id: 'ssh-srv', text: 'Only admins reach the server over SSH', check: (w) => reach(w, 'ADMIN', srv, { proto: 'tcp', port: 22 }) && !reach(w, 'USER', srv, { proto: 'tcp', port: 22 }) },
          { id: 'mgmt', text: 'R1 takes SSH v2 with a local login and refuses Telnet', check: (w) => cfg(w, 'R1').sshVersion === 2 && cfg(w, 'R1').lines.vty.login === 'local' && Boolean(cfg(w, 'R1').users[user]) && reach(w, 'ADMIN', addHost(admins, 1), { proto: 'tcp', port: 22 }) && !reach(w, 'ADMIN', addHost(admins, 1), { proto: 'tcp', port: 23 }) && !reach(w, 'USER', addHost(users, 1), { proto: 'tcp', port: 23 }) },
          { id: 'psec', text: 'A different device on the desk port shuts it down', check: (w) => reach(w, 'USER', addHost(users, 1)) && after(w, (c) => { c.devices.USER.mac = '0050.79ff.eeee'; }, (c) => Boolean(c.devices.SW1.err?.[desk])) },
        ],
        answer: {
          R1: ['enable', 'configure terminal', 'ip domain name branch.lab', `username ${user} secret S3cure!pw`, 'crypto key generate rsa modulus 2048', 'ip ssh version 2', 'line vty 0 4', 'login local', 'transport input ssh', 'exit',
            'ip access-list extended SRV-IN', `permit tcp any host ${srv} eq www`, `permit tcp any host ${srv} eq 443`, `permit tcp ${admins} 0.0.0.255 host ${srv} eq 22`, 'exit', 'interface g0/2', 'ip access-group SRV-IN out', 'end'],
          SW1: ['enable', 'configure terminal', `interface ${desk.replace('FastEthernet', 'f')}`, 'switchport port-security', 'switchport port-security mac-address sticky', 'end'],
          USER: [`ping ${addHost(users, 1)}`],
        },
      };
    },
  },
];

export const capstoneOf = (kind) => CAPSTONES.find(c => c.kind === kind) ?? null;
export const capstoneFor = (treeId) => CAPSTONES.find(c => c.tree === treeId) ?? null;

// All or nothing: the tree is crowned only when every test passes.
export const capstonePassed = (g) => g.tests.length > 0 && g.tests.every(t => t.ok);

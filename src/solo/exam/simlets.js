// Simlets: a live network you can only look at through its consoles, and a
// handful of questions about what it is doing. The exam's version gives you
// show commands on a running topology, then asks which switch is root, which
// path a router takes, which address a host ends up with.
//
// make(seed) builds the scenario the same way a work order does (devices,
// links, setup lines), so the desk's buildWorld, map and consoles all work
// on it. Each question's answer is read from the engine after the world is
// built, so the right choice is whatever the network does, never a typo in
// an answer key.

import { rngOf, int, pick, sample, shuffle, privateBase, subnetIn, addHost } from '../study/gen/kit.js';
import { l2Of, routingTable, requestDhcp, exchange } from '../labs/world.js';
import { parseIp, formatIp } from '../labs/ip4.js';
import { macFrom, OUI } from '../labs/switching.js';
import { parse6, format6, eui64, linkLocalOf } from '../labs/ip6.js';
import { v6Of, routingTable6 } from '../labs/v6.js';
import { cloneWorld } from '../desk/grade.js';

const NIC = 'FastEthernet0';
const M24 = '255.255.255.0';
const M30 = '255.255.255.252';
const G0 = 'GigabitEthernet0/0';
const G1 = 'GigabitEthernet0/1';
const G2 = 'GigabitEthernet0/2';
const short = (n) => n.replace('GigabitEthernet', 'Gi').replace('FastEthernet', 'Fa');
let linkSeq = 0;
const L = (a, ai, b, bi) => ({ id: `s${linkSeq += 1}`, ends: [[a, ai], [b, bi]] });

// Distinct /24s, each from its own private base (a 192.168.x.0 base holds
// only one /24, so drawing twice from it would never find a second).
function nets(rnd, n) {
  const out = [];
  while (out.length < n) { const x = subnetIn(rnd, privateBase(rnd), 24); if (!out.includes(x)) out.push(x); }
  return out;
}

// One right answer and distinct wrong ones, shuffled by the simlet's seed.
function options(rnd, right, wrongs, why = {}) {
  const seen = new Set([right]);
  const list = [{ text: right, correct: true, why: why[right] ?? '' }];
  for (const w of wrongs) {
    if (seen.has(w) || list.length >= 4) continue;
    seen.add(w);
    list.push({ text: w, correct: false, why: why[w] ?? '' });
  }
  return shuffle(rnd, list);
}

// ------------------------------------------------------------ spanning tree
const STP = {
  kind: 'simlet-stp',
  title: 'Spanning tree in a switch triangle',
  domain: 'NA',
  lights: ['t2-stp'],
  make(seed) {
    const rnd = rngOf(seed);
    const [va, vb] = sample(rnd, [10, 20, 30, 40, 50, 60, 70], 2).sort((a, b) => a - b);
    const names = sample(rnd, ['DS1', 'DS2', 'CORE', 'DIST'], 2);
    const [d1, d2] = names;
    const acc = pick(rnd, ['AS1', 'ACC1', 'FLOOR2']);
    // MACs decide the default root; priorities move one VLAN's root.
    const macs = Object.fromEntries(shuffle(rnd, [d1, d2, acc]).map((d, i) => [d, `0019.e8${(0x10 + i * 0x11).toString(16).padStart(2, '0')}.${int(rnd, 0x1000, 0xfff0).toString(16)}`]));
    const tuned = pick(rnd, [d1, d2]);
    const prio = pick(rnd, [4096, 8192, 24576]);
    const vlans = [`vlan ${va}`, `vlan ${vb}`];
    const trunk = (p) => [`interface ${p}`, 'switchport mode trunk'];
    const setup = {
      [d1]: [`hostname ${d1}`, ...vlans, ...trunk('g0/1'), ...trunk('g0/2')],
      [d2]: [`hostname ${d2}`, ...vlans, ...trunk('g0/1'), ...trunk('g0/2')],
      [acc]: [`hostname ${acc}`, ...vlans, ...trunk('g0/1'), ...trunk('g0/2'),
        'interface f0/1', 'switchport mode access', `switchport access vlan ${va}`, 'interface f0/2', 'switchport mode access', `switchport access vlan ${vb}`],
      PC1: [], PC2: [],
    };
    setup[tuned].splice(1, 0, `spanning-tree vlan ${vb} priority ${prio}`);
    const n = { d1, d2, acc, va, vb, tuned, prio };
    return {
      kind: this.kind, title: this.title, domain: this.domain, lights: this.lights, seed, start: acc,
      scenario: `A small campus: two distribution switches, ${d1} and ${d2}, and an access switch, ${acc}, cabled in a triangle. All three links are trunks carrying VLANs ${va} and ${vb}. Nobody remembers who set what. Use show commands to answer.`,
      devices: [
        { id: d1, kind: 'switch', x: 26, y: 14 }, { id: d2, kind: 'switch', x: 74, y: 14 }, { id: acc, kind: 'switch', x: 50, y: 42 },
        { id: 'PC1', kind: 'pc', x: 30, y: 64, pc: { ip: '10.0.1.11', mask: M24 } }, { id: 'PC2', kind: 'pc', x: 70, y: 64, pc: { ip: '10.0.2.11', mask: M24 } },
      ],
      links: [L(d1, G1, d2, G1), L(d1, G2, acc, G1), L(d2, G2, acc, G2), L('PC1', NIC, acc, 'FastEthernet0/1'), L('PC2', NIC, acc, 'FastEthernet0/2')],
      macs, setup, n,
      questions: [
        { id: 'root-a', prompt: `Which switch is the root bridge for VLAN ${va}?`, ask: (w) => {
          const root = l2Of(w).stp[acc][va].rootId;
          return { choices: options(rnd, root, [d1, d2, acc]), explain: `Every priority in VLAN ${va} is the default 32768, so the lowest MAC address wins. show spanning-tree vlan ${va} on any switch names the root's address; "This bridge is the root" appears only on ${root}.` };
        } },
        { id: 'root-b', prompt: `Which switch is the root bridge for VLAN ${vb}?`, ask: (w) => {
          const root = l2Of(w).stp[acc][vb].rootId;
          return { choices: options(rnd, root, [d1, d2, acc]), explain: `${tuned} has spanning-tree vlan ${vb} priority ${prio}, lower than the default 32768, so it wins VLAN ${vb} whatever the MACs say. The bridge ID shown is the priority plus the VLAN number: ${prio + vb}.` };
        } },
        { id: 'blocked', prompt: `On ${acc}, which port is blocking for VLAN ${vb}?`, ask: (w) => {
          const st = l2Of(w).stp[acc][vb];
          const blk = Object.entries(st.ports).find(([, p]) => p.state === 'BLK')?.[0];
          const right = blk ? short(blk) : `None; ${acc} blocks nothing in VLAN ${vb}`;
          return {
            choices: options(rnd, right, ['Gi0/1', 'Gi0/2', `None; ${acc} blocks nothing in VLAN ${vb}`, 'Fa0/2']),
            explain: `show spanning-tree vlan ${vb} on ${acc}: the root port is the one with the lowest cost to ${st.rootId}, and on the triangle's third link the switch with the higher bridge ID blocks. ${blk ? `${acc} loses that comparison, so its ${short(blk)} is Altn BLK.` : `Here the block is on another switch, so every ${acc} port forwards.`}`,
          };
        } },
        { id: 'bid', prompt: `What bridge ID priority does ${tuned} show for itself in VLAN ${vb}?`, ask: () => ({
          choices: options(rnd, String(prio + vb), [String(prio), '32768', String(32768 + vb), String(prio + 1)]),
          explain: `The extended system ID adds the VLAN number to the configured priority, so priority ${prio} in VLAN ${vb} shows as ${prio + vb}. That is also why priorities step in 4096: the low 12 bits belong to the VLAN.`,
        }) },
      ],
    };
  },
};

// ------------------------------------------------------------ OSPF paths
const OSPF = {
  kind: 'simlet-ospf',
  title: 'Which way does R1 go?',
  domain: 'IPC',
  lights: ['t3-ospf', 't3-table'],
  make(seed) {
    const rnd = rngOf(seed);
    const lans = nets(rnd, 3);
    const t = int(rnd, 1, 200);
    const link = (k) => `10.255.${t}.${k * 4}`;
    const [l12, l13, l23] = [link(0), link(1), link(2)];
    // Costs pick the path: either the direct link or the way round wins.
    const direct = pick(rnd, [true, false]);
    const c13 = direct ? int(rnd, 2, 4) : int(rnd, 8, 20);
    const c12 = int(rnd, 1, 2);
    const c23 = int(rnd, 1, 3);
    const ridSet = pick(rnd, [true, false]);
    const r2rid = ridSet ? `${int(rnd, 1, 9)}.${int(rnd, 1, 9)}.${int(rnd, 1, 9)}.${int(rnd, 1, 9)}` : null;
    const ad = pick(rnd, [90, 100, 115, 130]);
    const lanIf = (lan) => ['interface g0/2', `ip address ${addHost(lan, 1)} ${M24}`, 'no shutdown'];
    const ospf = (rid, nets) => ['router ospf 1', ...(rid ? [`router-id ${rid}`] : []), ...nets.map(x => `network ${x} 0.0.0.255 area 0`), 'passive-interface g0/2', 'exit'];
    const r1 = ['hostname R1', 'interface g0/0', `ip address ${addHost(l12, 1)} ${M30}`, 'no shutdown', 'interface g0/1', `ip address ${addHost(l13, 1)} ${M30}`, `ip ospf cost ${c13}`, 'no shutdown', ...lanIf(lans[0]),
      ...ospf('1.1.1.1', [`10.255.${t}.0`, lans[0]]), `ip route ${lans[1]} ${M24} ${addHost(l13, 2)} ${ad}`];
    const r2 = ['hostname R2', 'interface g0/0', `ip address ${addHost(l12, 2)} ${M30}`, 'no shutdown', 'interface g0/1', `ip address ${addHost(l23, 1)} ${M30}`, 'no shutdown', ...lanIf(lans[1]),
      ...ospf(r2rid, [`10.255.${t}.0`, lans[1]])];
    const r3 = ['hostname R3', 'interface g0/0', `ip address ${addHost(l13, 2)} ${M30}`, `ip ospf cost ${c13}`, 'no shutdown', 'interface g0/1', `ip address ${addHost(l23, 2)} ${M30}`, 'no shutdown', ...lanIf(lans[2]),
      ...ospf('3.3.3.3', [`10.255.${t}.0`, lans[2]])];
    r1.splice(r1.indexOf('interface g0/0') + 2, 0, `ip ospf cost ${c12}`);
    r2.splice(r2.indexOf('interface g0/0') + 2, 0, `ip ospf cost ${c12}`);
    r2.splice(r2.indexOf('interface g0/1') + 2, 0, `ip ospf cost ${c23}`);
    r3.splice(r3.indexOf('interface g0/1') + 2, 0, `ip ospf cost ${c23}`);
    const lanEnd = (r) => ({ id: `s${linkSeq += 1}`, ends: [[r, G2]], segment: true });
    return {
      kind: this.kind, title: this.title, domain: this.domain, lights: this.lights, seed, start: 'R1',
      scenario: `Three routers in OSPF area 0, each with a LAN on Gi0/2: R1 ${lans[0]}/24, R2 ${lans[1]}/24, R3 ${lans[2]}/24. Someone also left a static route on R1. Use show commands to answer.`,
      devices: [{ id: 'R1', kind: 'router', x: 50, y: 14 }, { id: 'R2', kind: 'router', x: 22, y: 52 }, { id: 'R3', kind: 'router', x: 78, y: 52 }],
      links: [L('R1', G0, 'R2', G0), L('R1', G1, 'R3', G0), L('R2', G1, 'R3', G1), lanEnd('R1'), lanEnd('R2'), lanEnd('R3')],
      setup: { R1: r1, R2: r2, R3: r3 },
      questions: [
        { id: 'path', prompt: `Which next hop does R1 use to reach ${lans[2]}/24?`, ask: (w) => {
          const r = routingTable(w, 'R1').find(x => x.net === parseIp(lans[2]) && x.len === 24);
          const hops = r.hops.map(h => formatIp(h.nh));
          const right = hops.length > 1 ? `Both ${addHost(l12, 2)} and ${addHost(l13, 2)}, equal cost` : hops[0];
          return {
            choices: options(rnd, right, [addHost(l13, 2), addHost(l12, 2), `Both ${addHost(l12, 2)} and ${addHost(l13, 2)}, equal cost`, addHost(lans[2], 1)]),
            explain: `OSPF adds up the outgoing interface costs. Straight to R3 costs ${c13}; round through R2 costs ${c12} + ${c23} = ${c12 + c23}, and the LAN's own cost is added to both. ${hops.length > 1 ? 'They tie, so both install.' : `The cheaper one wins: show ip route ${lans[2]} names ${hops[0]}.`}`,
          };
        } },
        { id: 'metric', prompt: `What metric does R1's route to ${lans[2]}/24 have?`, ask: (w) => {
          const r = routingTable(w, 'R1').find(x => x.net === parseIp(lans[2]) && x.len === 24);
          const m = r.metric;
          return { choices: options(rnd, String(m), [String(m + 1), String(c13), String(c12 + c23), String(Math.max(1, m - 1)), '110']), explain: `In show ip route the metric is the second number in [110/${m}]. It is the sum of the costs out of each router along the path, including R3's Gi0/2 (cost 1 on a gigabit LAN). 110 is the administrative distance, not the metric.` };
        } },
        { id: 'static', prompt: `R1 has a static route for ${lans[1]}/24 with an administrative distance of ${ad}. Which next hop does R1 use for that network?`, ask: (w) => {
          const r = routingTable(w, 'R1').find(x => x.net === parseIp(lans[1]) && x.len === 24);
          const right = `${formatIp(r.hops[0].nh)} (${r.type === 'static' ? 'the static route' : 'OSPF'})`;
          return { choices: options(rnd, right, [`${addHost(l13, 2)} (the static route)`, `${addHost(l12, 2)} (OSPF)`, `${addHost(l13, 2)} (OSPF)`]), explain: `For the same prefix, the lower administrative distance wins. OSPF is 110 and the static is ${ad}, so ${ad < 110 ? 'the static route installs and the OSPF route stays out of the table' : 'OSPF wins and the static waits as a floating backup'}. show ip route ${lans[1]} shows which one is in.` };
        } },
        { id: 'rid', prompt: 'What is R2\'s OSPF router ID?', ask: (w) => {
          const rid = formatIp(w.devices.R2.ospfRid);
          const highest = formatIp(Math.max(...Object.values(w.devices.R2.config.interfaces).filter(i => i.ip !== null).map(i => i.ip)));
          return { choices: options(rnd, rid, [highest, addHost(l12, 2), '2.2.2.2', addHost(lans[1], 1), '1.1.1.1']), explain: r2rid ? `R2 has router-id ${r2rid} configured, which beats any interface address. show ip protocols or show ip ospf neighbor on R1 shows it.` : `No router-id is configured and R2 has no loopback, so it takes its highest active interface address: ${rid}. show ip protocols on R2, or the Neighbor ID column on R1, shows it.` };
        } },
      ],
    };
  },
};

// ------------------------------------------------------------ branch services
const SERVICES = {
  kind: 'simlet-services',
  title: 'What does the branch router hand out?',
  domain: 'IPS',
  lights: ['t4-dhcp-dns', 't4-nat', 't5-acl'],
  make(seed) {
    const rnd = rngOf(seed);
    const [lan, srvNet] = nets(rnd, 2);
    const gw = addHost(lan, 1);
    const excl = pick(rnd, [10, 20, 50, 99]);
    const wan = `203.0.113.${4 * int(rnd, 1, 60)}`;
    const out = addHost(wan, 2);
    const srv = addHost(srvNet, 10);
    const srvPub = addHost(wan, 5);
    const open = pick(rnd, [80, 443]);
    const admin = pick(rnd, [22, 23]);
    const pc2 = addHost(lan, excl + int(rnd, 20, 60));
    const leaseFirst = rnd() < 0.5;
    const setup = {
      R1: ['hostname R1', 'interface g0/0', `ip address ${gw} ${M24}`, 'ip nat inside', 'no shutdown',
        'interface g0/1', `ip address ${out} 255.255.255.248`, 'ip nat outside', 'no shutdown',
        'interface g0/2', `ip address ${addHost(srvNet, 1)} ${M24}`, 'ip nat inside', 'ip access-group SRV out', 'no shutdown', 'exit',
        `ip route 0.0.0.0 0.0.0.0 ${addHost(wan, 1)}`,
        'access-list 1 permit ' + `${lan} 0.0.0.255`, 'ip nat inside source list 1 interface g0/1 overload', `ip nat inside source static ${srv} ${srvPub}`,
        'ip access-list extended SRV', `permit tcp host ${addHost(lan, excl + 1)} host ${srv} eq ${admin}`, `permit tcp any host ${srv} eq ${open}`, 'exit',
        `ip dhcp excluded-address ${gw} ${addHost(lan, excl)}`, 'ip dhcp pool LAN', `network ${lan} ${M24}`, `default-router ${gw}`, 'dns-server 1.1.1.1', 'exit'],
      ISP: ['hostname ISP', 'interface g0/0', `ip address ${addHost(wan, 1)} 255.255.255.248`, 'no shutdown', 'interface g0/1', 'ip address 198.51.100.1 255.255.255.0', 'no shutdown'],
      SW1: ['hostname SW1'],
      PC1: leaseFirst ? ['ipconfig /renew'] : [],
    };
    const n = { lan, gw, excl, srv, srvPub, out, open, admin };
    return {
      kind: this.kind, title: this.title, domain: this.domain, lights: this.lights, seed, start: 'R1',
      scenario: `A branch: PCs on R1 Gi0/0 through SW1, a server on Gi0/2, the provider on Gi0/1. R1 runs DHCP, NAT and an ACL in front of the server. ${leaseFirst ? 'PC1 already has a lease.' : 'No PC has asked for a lease yet.'} PC3 is about to ask for one. Use show commands to answer.`,
      devices: [
        { id: 'R1', kind: 'router', x: 50, y: 12 }, { id: 'ISP', kind: 'router', x: 86, y: 12 }, { id: 'SW1', kind: 'switch', x: 30, y: 36 },
        { id: 'WEB', kind: 'pc', x: 88, y: 40, pc: { ip: '198.51.100.80', mask: M24, gateway: '198.51.100.1', services: [80] } },
        { id: 'SRV', kind: 'pc', x: 66, y: 42, pc: { ip: srv, mask: M24, gateway: addHost(srvNet, 1), services: [22, 23, 80, 443] } },
        { id: 'PC1', kind: 'pc', x: 10, y: 64, pc: { dhcp: true } }, { id: 'PC2', kind: 'pc', x: 30, y: 64, pc: { ip: pc2, mask: M24, gateway: gw } }, { id: 'PC3', kind: 'pc', x: 50, y: 64, pc: { dhcp: true } },
      ],
      links: [L('R1', G0, 'SW1', G1), L('R1', G1, 'ISP', G0), L('ISP', G1, 'WEB', NIC), L('R1', G2, 'SRV', NIC),
        L('PC1', NIC, 'SW1', 'FastEthernet0/1'), L('PC2', NIC, 'SW1', 'FastEthernet0/2'), L('PC3', NIC, 'SW1', 'FastEthernet0/3')],
      setup, n,
      questions: [
        { id: 'lease', prompt: 'PC3 asks for an address now. Which address does it get?', ask: (w) => {
          const c = cloneWorld(w);
          const r = requestDhcp(c, 'PC3');
          const got = formatIp(r.ip);
          return { choices: options(rnd, got, [addHost(lan, excl + 1), addHost(lan, excl + 2), addHost(lan, 2), addHost(lan, excl)]), explain: `The pool skips the excluded range, ${gw} to ${addHost(lan, excl)}, and anything already leased: show ip dhcp excluded-address is in the running config, show ip dhcp binding lists leases. ${leaseFirst ? `PC1 holds ${addHost(lan, excl + 1)}, so PC3 gets the next one.` : 'Nothing is leased yet, so PC3 gets the first address after the excluded range.'}` };
        } },
        { id: 'pat', prompt: 'PC2 opens a website on the internet. Which source address does the web server see?', ask: () => ({
          choices: options(rnd, out, [pc2, srvPub, gw, addHost(wan, 1)]),
          explain: `NAT overload on interface g0/1 translates every LAN source to Gi0/1's own address, ${out}, and tells them apart by port. ${srvPub} belongs to the server's static entry, which only translates the server.`,
        }) },
        { id: 'static', prompt: 'Users on the internet reach the server at which address?', ask: () => ({
          choices: options(rnd, srvPub, [out, srv, addHost(wan, 1), '198.51.100.80']),
          explain: `ip nat inside source static ${srv} ${srvPub} maps the server's private address to ${srvPub} in both directions. show ip nat translations lists it with dashes for the outside columns until someone connects.`,
        }) },
        { id: 'acl', prompt: `From PC2 (${pc2}), which connection to the server at ${srv} succeeds?`, ask: (w) => {
          const tries = [['SSH (22)', 22], ['Telnet (23)', 23], ['HTTP (80)', 80], ['HTTPS (443)', 443]];
          const ok = tries.filter(([, port]) => exchange(cloneWorld(w), 'PC2', parseIp(srv), { proto: 'tcp', port }).ok).map(([t]) => t);
          const right = ok.length === 1 ? ok[0] : ok.length ? ok.join(' and ') : 'None of them';
          return { choices: options(rnd, right, tries.map(([t]) => t)), explain: `show access-lists SRV: line 1 permits port ${admin} only from ${addHost(lan, excl + 1)}, line 2 permits port ${open} from anyone, and the implicit deny drops the rest. PC2 is not that one host, so only ${open} gets through. The ACL is applied out on Gi0/2, toward the server.` };
        } },
      ],
    };
  },
};

// ------------------------------------------------------------ IPv6
const IPV6 = {
  kind: 'simlet-ipv6',
  title: 'Read an IPv6 branch',
  domain: 'NF',
  lights: ['t1-ipv6'],
  make(seed) {
    const rnd = rngOf(seed);
    const site = `2001:db8:${int(rnd, 0x1000, 0xfffe).toString(16)}`;
    const lanId = pick(rnd, ['1', '10', 'a', '20']);
    const wanId = pick(rnd, ['f', 'ff', '99']);
    const rtr = pick(rnd, ['R1', 'BR1', 'EDGE1']);
    const llSet = rnd() < 0.5;
    const setup = {
      [rtr]: [`hostname ${rtr}`, 'ipv6 unicast-routing', 'interface g0/0', `ipv6 address ${site}:${lanId}::/64 eui-64`, ...(llSet ? ['ipv6 address fe80::1 link-local'] : []), 'no shutdown',
        'interface g0/1', `ipv6 address ${site}:${wanId}::1/64`, 'no shutdown', 'exit', `ipv6 route ::/0 ${site}:${wanId}::2`],
      ISP: ['hostname ISP', 'ipv6 unicast-routing', 'interface g0/0', `ipv6 address ${site}:${wanId}::2/64`, 'no shutdown', 'exit', `ipv6 route ${site}::/48 ${site}:${wanId}::1`],
      SW1: ['hostname SW1'],
      PC1: ['ipv6config auto'],
    };
    const rmac = macFrom(`${rtr}|${G0}`, OUI.router);
    return {
      kind: this.kind, title: this.title, domain: this.domain, lights: this.lights, seed, start: rtr,
      scenario: `${rtr} routes IPv6 for a branch: the LAN on Gi0/0 uses EUI-64, PC1 configures itself by SLAAC, and the provider is on Gi0/1. Use show commands and ipconfig to answer.`,
      devices: [{ id: rtr, kind: 'router', x: 50, y: 14 }, { id: 'ISP', kind: 'router', x: 86, y: 14 }, { id: 'SW1', kind: 'switch', x: 34, y: 38 }, { id: 'PC1', kind: 'pc', x: 20, y: 62 }],
      links: [L(rtr, G0, 'SW1', G1), L(rtr, G1, 'ISP', G0), L('PC1', NIC, 'SW1', 'FastEthernet0/1')],
      setup,
      questions: [
        { id: 'gua', prompt: `What global address does ${rtr} have on Gi0/0?`, ask: (w) => {
          const a = v6Of(w, rtr, G0).addrs[0].addr;
          const prefix = parse6(`${site}:${lanId}::`);
          const flip = eui64(rmac) ^ (0x02n << 56n);
          return { choices: options(rnd, format6(a, true), [format6(prefix | flip, true), format6(prefix | 1n, true), format6(parse6(`${site}:${wanId}::`) | eui64(rmac), true)]), explain: `eui-64 takes the /64 prefix and builds the host half from Gi0/0's MAC: split it, insert FFFE, flip the seventh bit. show ipv6 interface brief prints the result; the running config only says eui-64.` };
        } },
        { id: 'll', prompt: `What does PC1 use as its IPv6 default gateway?`, ask: (w) => {
          const ll = v6Of(w, rtr, G0).ll;
          return { choices: options(rnd, format6(ll), [format6(v6Of(w, rtr, G0).addrs[0].addr), format6(linkLocalOf(macFrom(`${rtr}|${G1}`, OUI.router))), `${site}:${wanId}::2`]), explain: `SLAAC hosts take the router advertisement's source as their gateway, and an RA always comes from the router's link-local address${llSet ? ', here set by hand to FE80::1' : ', here the EUI-64 one made from Gi0/0\'s MAC'}. ipconfig on PC1 shows it with a %interface suffix.` };
        } },
        { id: 'pc', prompt: 'Which prefix did PC1 build its address in?', ask: (w) => {
          const a = v6Of(w, 'PC1', NIC).addrs[0]?.addr;
          const right = a === undefined ? 'None; PC1 has no global address' : `${format6(parse6(`${site}:${lanId}::`))}/64`;
          return { choices: options(rnd, right, [`${site}:${wanId}::/64`, `${site}::/48`, 'fe80::/10', 'None; PC1 has no global address']), explain: `PC1 heard ${rtr}'s router advertisement on Gi0/0, which carries the /64 configured there. SLAAC always uses a /64; the /48 is the whole site and is only used for routing between the provider and ${rtr}.` };
        } },
        { id: 'default', prompt: `Which route does ${rtr} use for traffic to 2001:db8:cafe::80?`, ask: (w) => {
          const r = routingTable6(w, rtr).filter(x => x.len === 0)[0];
          const right = r ? `::/0 via ${format6(r.hops[0].nh, true)}` : 'None; it has no route';
          const us = format6(parse6(`${site}:${wanId}::1`), true);
          return { choices: options(rnd, right, [`${format6(parse6(`${site}::`), true)}/48 via ${us}`, `::/0 via ${us}`, 'None; it has no route']), explain: `show ipv6 route: nothing more specific covers 2001:DB8:CAFE::/64, so the static default ::/0 carries it to the provider. The /48 route lives on the provider's router, pointing back at ${rtr}.` };
        } },
      ],
    };
  },
};

export const SIMLETS = [STP, OSPF, SERVICES, IPV6];
export const simletOf = (kind) => SIMLETS.find(s => s.kind === kind) ?? null;

// The questions for a built world, each with its choices fixed.
export function resolveQuestions(simlet, world) {
  return simlet.questions.map(q => ({ id: q.id, prompt: q.prompt, ...q.ask(world) }));
}

export const isSimletRight = (q, pickIndex) => Boolean(q.choices[pickIndex]?.correct);

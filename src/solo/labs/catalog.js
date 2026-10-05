// The Do labs: short work orders on live routers, each with a checklist that
// ticks itself as the configuration lands.
//
// A goal is { id, text, check(ctx), hint, show } where ctx = { world,
// sessions, events, answers }. `show` is the exact commands, per device, that
// complete it: the second level of help. A goal with `ask` takes a typed
// answer instead of a configuration change.

import { makeDevice, makeWorld, routingTable, neighbors, interfaceState, ospfEnabled, freshElections, save } from './world.js';
import { createSession, execute } from './ios.js';
import { parseIp, formatIp } from './ip4.js';

const G3 = ['GigabitEthernet0/0', 'GigabitEthernet0/1', 'GigabitEthernet0/2'];

// Build a lab world by typing its starting configuration into each router,
// so a lab starts from exactly what IOS would hold.
function build({ devices, links, setup = {}, saved = [], ifs = {} }) {
  const world = makeWorld(devices.map(id => makeDevice(id, ifs[id] ?? G3)), links);
  for (const [id, lines] of Object.entries(setup)) {
    const s = createSession(world, id);
    for (const l of ['enable', 'configure terminal', ...lines, 'end']) execute(s, l);
  }
  for (const id of saved) save(world, id);
  freshElections(world);
  world.seq = 0;
  return world;
}

// ---------- checks ----------
const dev = (ctx, id) => ctx.world.devices[id].config;
const ip = parseIp;
const iface = (ctx, d, n) => dev(ctx, d).interfaces[n];
const isUp = (ctx, d, n) => interfaceState(ctx.world, d, n).up;
const route = (ctx, d, net, len) => routingTable(ctx.world, d).find(r => r.net === ip(net) && r.len === len) ?? null;
const events = (ctx, d) => ctx.events.filter(e => !d || e.device === d);
const ran = (ctx, d, key, after = 0) => events(ctx, d).some(e => e.kind === 'command' && e.key === key && e.seq > after);
const lastSeq = (ctx, pred) => Math.max(0, ...ctx.events.filter(pred).map(e => e.seq));
const pinged = (ctx, d, dst, src = null, after = 0) => events(ctx, d).some(e => e.kind === 'ping' && e.ok && e.dst === ip(dst) && (src === null || e.src === ip(src)) && e.seq > after);
const sameIf = (a) => String(a ?? '').toLowerCase().replace(/\s+/g, '').replace(/^gigabitethernet|^gi|^g/, 'gi');

const INTERFACE_ANSWER = (want) => (text) => sameIf(text) === sameIf(want);

export const LABS = [
  // ---------------------------------------------------------------- IOS
  {
    id: 'ios-first-boot',
    title: 'First boot',
    lights: ['t0-nav', 't0-base'],
    story: 'A new router is racked next to R2 and cabled to it on Gi0/0. Give it a name, lock privileged mode, address the link and prove it talks to R2.',
    start: 'R1',
    devices: ['R1', 'R2'],
    links: [{ id: 'r1-r2', ends: [['R1', 'GigabitEthernet0/0'], ['R2', 'GigabitEthernet0/0']] }],
    topology: 'R1 Gi0/0 ── Gi0/0 R2 (10.0.12.2)',
    build() {
      return build({ devices: ['R1', 'R2'], links: this.links, setup: { R2: ['hostname R2', 'interface g0/0', 'ip address 10.0.12.2 255.255.255.0', 'no shutdown'] }, saved: ['R2'] });
    },
    goals: [
      { id: 'config', text: 'Get into global configuration mode', check: (c) => ran(c, 'R1', 'configure terminal'),
        hint: 'enable takes you from > to #. From #, configure terminal (conf t) opens global configuration.', show: { R1: ['enable', 'configure terminal'] } },
      { id: 'hostname', text: 'Name the router R1', check: (c) => dev(c, 'R1').hostname === 'R1',
        hint: 'The hostname command, in global configuration.', show: { R1: ['hostname R1'] } },
      { id: 'secret', text: 'Protect privileged mode with an enable secret', check: (c) => Boolean(dev(c, 'R1').enableSecret),
        hint: 'enable secret stores a hashed password; enable password does not.', show: { R1: ['enable secret Cisco123!'] } },
      { id: 'ip', text: 'Address Gi0/0 as 10.0.12.1/24', check: (c) => iface(c, 'R1', 'GigabitEthernet0/0').ip === ip('10.0.12.1') && iface(c, 'R1', 'GigabitEthernet0/0').mask === ip('255.255.255.0'),
        hint: 'Enter the interface, then ip address with a dotted mask. /24 is 255.255.255.0.', show: { R1: ['interface g0/0', 'ip address 10.0.12.1 255.255.255.0'] } },
      { id: 'desc', text: 'Describe Gi0/0 as the link to R2', check: (c) => /r2/i.test(iface(c, 'R1', 'GigabitEthernet0/0').description ?? ''),
        hint: 'description takes free text. Mention R2 in it.', show: { R1: ['interface g0/0', 'description Link to R2'] } },
      { id: 'up', text: 'Bring Gi0/0 up', check: (c) => isUp(c, 'R1', 'GigabitEthernet0/0'),
        hint: 'Router interfaces start shut down.', show: { R1: ['interface g0/0', 'no shutdown'] } },
      { id: 'ping', text: 'Ping R2 at 10.0.12.2 and get !!!!!', check: (c) => pinged(c, 'R1', '10.0.12.2'),
        hint: 'ping works from privileged EXEC, or with do in front of it from configuration mode.', show: { R1: ['do ping 10.0.12.2'] } },
    ],
  },
  {
    id: 'ios-save',
    title: 'Save and survive a reload',
    lights: ['t0-save'],
    story: 'Someone addressed R1 this morning and went home without saving. A power cut is forecast. Find what is unsaved, save it, and prove it survives a reload.',
    start: 'R1',
    devices: ['R1', 'R2'],
    links: [{ id: 'r1-r2', ends: [['R1', 'GigabitEthernet0/0'], ['R2', 'GigabitEthernet0/0']] }],
    topology: 'R1 Gi0/0 (10.0.12.1) ── Gi0/0 R2',
    build() {
      const w = build({ devices: ['R1', 'R2'], links: this.links, setup: { R1: ['hostname R1'], R2: ['hostname R2', 'interface g0/0', 'ip address 10.0.12.2 255.255.255.0', 'no shutdown'] }, saved: ['R1', 'R2'] });
      const s = createSession(w, 'R1');
      for (const l of ['enable', 'configure terminal', 'interface g0/0', 'ip address 10.0.12.1 255.255.255.0', 'no shutdown', 'end']) execute(s, l);
      w.seq = 0;
      return w;
    },
    goals: [
      { id: 'compare', text: 'Compare the running and startup configs to see what is unsaved', check: (c) => ran(c, 'R1', 'show running-config') && ran(c, 'R1', 'show startup-config'),
        hint: 'Running config lives in RAM; startup config in NVRAM. Show both.', show: { R1: ['enable', 'show running-config', 'show startup-config'] } },
      { id: 'save', text: 'Save the running config', check: (c) => events(c, 'R1').some(e => e.kind === 'save'),
        hint: 'copy running-config startup-config, or write memory.', show: { R1: ['copy running-config startup-config', ''] } },
      { id: 'reload', text: 'Reload R1', check: (c) => events(c, 'R1').some(e => e.kind === 'reload'),
        hint: 'reload asks to confirm; press Enter.', show: { R1: ['reload', ''] } },
      { id: 'survived', text: 'After the reload, confirm Gi0/0 still has 10.0.12.1', check: (c) => {
        const r = lastSeq(c, e => e.device === 'R1' && e.kind === 'reload');
        return r > 0 && iface(c, 'R1', 'GigabitEthernet0/0').ip === ip('10.0.12.1') && ran(c, 'R1', 'show ip interface brief', r);
      }, hint: 'show ip interface brief lists every interface with its address.', show: { R1: ['enable', 'show ip interface brief'] } },
    ],
  },
  {
    id: 'ios-ssh',
    title: 'SSH only',
    lights: ['t0-remote'],
    story: 'Security wants Telnet gone. Set R1 up so admins can reach it over SSH version 2, with their own logins, and nothing else.',
    start: 'R1',
    devices: ['R1'],
    links: [{ id: 'mgmt', segment: true, ends: [['R1', 'GigabitEthernet0/0']] }],
    topology: 'R1 Gi0/0 (10.0.0.1) ── management LAN',
    build() {
      return build({ devices: ['R1'], links: this.links, setup: { R1: ['interface g0/0', 'ip address 10.0.0.1 255.255.255.0', 'no shutdown'] } });
    },
    goals: [
      { id: 'hostname', text: 'Give the router a hostname (SSH keys need one)', check: (c) => dev(c, 'R1').hostname !== 'Router',
        hint: 'The keys are named after hostname and domain, so "Router" is not allowed.', show: { R1: ['enable', 'configure terminal', 'hostname R1'] } },
      { id: 'domain', text: 'Set the domain name lab.local', check: (c) => dev(c, 'R1').domain === 'lab.local',
        hint: 'ip domain name (or ip domain-name) in global configuration.', show: { R1: ['ip domain name lab.local'] } },
      { id: 'keys', text: 'Generate RSA keys of at least 1024 bits', check: (c) => (c.world.devices.R1.rsaBits ?? 0) >= 1024,
        hint: 'crypto key generate rsa, then answer the modulus question. 2048 is a good size.', show: { R1: ['crypto key generate rsa modulus 2048'] } },
      { id: 'v2', text: 'Use SSH version 2 only', check: (c) => dev(c, 'R1').sshVersion === 2,
        hint: 'ip ssh version, in global configuration.', show: { R1: ['ip ssh version 2'] } },
      { id: 'user', text: 'Create a local user called admin with a secret', check: (c) => Boolean(dev(c, 'R1').users.admin?.secret),
        hint: 'username NAME secret PASSWORD.', show: { R1: ['username admin secret Str0ngPass'] } },
      { id: 'local', text: 'Make the VTY lines check logins against local users', check: (c) => dev(c, 'R1').lines.vty.login === 'local',
        hint: 'Enter line vty 0 4, then login local.', show: { R1: ['line vty 0 4', 'login local'] } },
      { id: 'sshonly', text: 'Allow only SSH on the VTY lines', check: (c) => dev(c, 'R1').lines.vty.transport === 'ssh',
        hint: 'transport input, under the VTY lines.', show: { R1: ['line vty 0 4', 'transport input ssh'] } },
      { id: 'verify', text: 'Verify with show ip ssh', check: (c) => ran(c, 'R1', 'show ip ssh') && c.world.devices.R1.rsaBits && dev(c, 'R1').sshVersion === 2,
        hint: 'From configuration mode, put do in front of it.', show: { R1: ['do show ip ssh'] } },
    ],
  },

  // ---------------------------------------------------------------- reading the table
  {
    id: 'route-reading',
    title: 'Read the routing table',
    lights: ['t3-table', 't0-inspect'],
    story: 'A ticket says the branch is slow to reach the 3.3.3.3 server. Before anyone changes anything, read R1\'s table and answer what the router itself says.',
    start: 'R1',
    devices: ['R1', 'R2', 'R3'],
    links: [
      { id: 'r1-r2', ends: [['R1', 'GigabitEthernet0/0'], ['R2', 'GigabitEthernet0/0']] },
      { id: 'r2-r3', ends: [['R2', 'GigabitEthernet0/1'], ['R3', 'GigabitEthernet0/0']] },
      { id: 'lan1', segment: true, ends: [['R1', 'GigabitEthernet0/1']] },
      { id: 'isp', segment: true, ends: [['R1', 'GigabitEthernet0/2']] },
      { id: 'lan3', segment: true, ends: [['R3', 'GigabitEthernet0/1']] },
    ],
    topology: 'ISP ── Gi0/2 R1 Gi0/0 ── R2 ── R3 (LAN 192.168.3.0/24, Lo0 3.3.3.3)',
    build() {
      return build({
        devices: ['R1', 'R2', 'R3'], links: this.links, saved: ['R1', 'R2', 'R3'],
        ifs: { R3: [...G3, 'Loopback0'] },
        setup: {
          R1: ['hostname R1', 'int g0/0', 'ip add 10.0.12.1 255.255.255.0', 'no shut', 'int g0/1', 'ip add 192.168.1.1 255.255.255.0', 'no shut', 'int g0/2', 'ip add 203.0.113.2 255.255.255.252', 'no shut',
            'ip route 0.0.0.0 0.0.0.0 203.0.113.1', 'router ospf 1', 'router-id 1.1.1.1', 'network 10.0.12.0 0.0.0.255 area 0', 'network 192.168.1.0 0.0.0.255 area 0', 'passive-interface g0/1'],
          R2: ['hostname R2', 'int g0/0', 'ip add 10.0.12.2 255.255.255.0', 'no shut', 'int g0/1', 'ip add 10.0.23.2 255.255.255.0', 'no shut', 'router ospf 1', 'router-id 2.2.2.2', 'network 10.0.0.0 0.255.255.255 area 0'],
          R3: ['hostname R3', 'int g0/0', 'ip add 10.0.23.3 255.255.255.0', 'no shut', 'int g0/1', 'ip add 192.168.3.1 255.255.255.0', 'no shut', 'int lo0', 'ip add 3.3.3.3 255.255.255.255',
            'router ospf 1', 'router-id 3.3.3.3', 'network 10.0.23.0 0.0.0.255 area 0', 'network 192.168.3.0 0.0.0.255 area 0', 'network 3.3.3.3 0.0.0.0 area 0'],
        },
      });
    },
    goals: [
      { id: 'read', text: 'Show R1\'s routing table', check: (c) => ran(c, 'R1', 'show ip route'),
        hint: 'show ip route, from privileged EXEC.', show: { R1: ['enable', 'show ip route'] } },
      { id: 'exit', text: 'Which interface does R1 use to reach 192.168.3.0/24?', ask: 'Interface, e.g. Gi0/1',
        check: (c) => INTERFACE_ANSWER(route(c, 'R1', '192.168.3.0', 24)?.hops[0].intf)(c.answers.exit),
        hint: 'Find the 192.168.3.0/24 line. The interface is at the end of it.', show: { R1: ['show ip route ospf'] } },
      { id: 'admet', text: 'What are the administrative distance and metric of the route to 3.3.3.3/32?', ask: 'AD/metric, e.g. 110/5',
        check: (c) => { const r = route(c, 'R1', '3.3.3.3', 32); return Boolean(r) && String(c.answers.admet ?? '').replace(/[\s[\]]/g, '') === `${r.ad}/${r.metric}`; },
        hint: 'The two numbers in square brackets: [AD/metric]. A loopback shows up as a /32.', show: { R1: ['show ip route ospf'] } },
      { id: 'gw', text: 'What is R1\'s gateway of last resort?', ask: 'An IP address',
        check: (c) => String(c.answers.gw ?? '').trim() === '203.0.113.1',
        hint: 'It is printed above the routes, and the S* line agrees with it.', show: { R1: ['show ip route static'] } },
      { id: 'nbr', text: 'What is the router ID of R1\'s OSPF neighbor?', ask: 'A router ID, e.g. 9.9.9.9',
        check: (c) => String(c.answers.nbr ?? '').trim() === '2.2.2.2',
        hint: 'show ip ospf neighbor lists neighbors by router ID.', show: { R1: ['show ip ospf neighbor'] } },
    ],
  },

  // ---------------------------------------------------------------- static routing
  {
    id: 'static-basic',
    title: 'Static routes end to end',
    lights: ['t3-static'],
    story: 'Three routers, two office LANs, no routing protocol allowed. Make 192.168.1.0/24 and 192.168.3.0/24 reach each other with static routes.',
    start: 'R1',
    devices: ['R1', 'R2', 'R3'],
    links: [
      { id: 'r1-r2', ends: [['R1', 'GigabitEthernet0/0'], ['R2', 'GigabitEthernet0/0']] },
      { id: 'r2-r3', ends: [['R2', 'GigabitEthernet0/1'], ['R3', 'GigabitEthernet0/0']] },
      { id: 'lan1', segment: true, ends: [['R1', 'GigabitEthernet0/1']] },
      { id: 'lan3', segment: true, ends: [['R3', 'GigabitEthernet0/1']] },
    ],
    topology: 'LAN 192.168.1.0/24 ── R1 ─10.0.12.0/24─ R2 ─10.0.23.0/24─ R3 ── LAN 192.168.3.0/24',
    build() {
      return build({
        devices: ['R1', 'R2', 'R3'], links: this.links, saved: ['R1', 'R2', 'R3'],
        setup: {
          R1: ['hostname R1', 'int g0/0', 'ip add 10.0.12.1 255.255.255.0', 'no shut', 'int g0/1', 'ip add 192.168.1.1 255.255.255.0', 'no shut'],
          R2: ['hostname R2', 'int g0/0', 'ip add 10.0.12.2 255.255.255.0', 'no shut', 'int g0/1', 'ip add 10.0.23.2 255.255.255.0', 'no shut'],
          R3: ['hostname R3', 'int g0/0', 'ip add 10.0.23.3 255.255.255.0', 'no shut', 'int g0/1', 'ip add 192.168.3.1 255.255.255.0', 'no shut'],
        },
      });
    },
    goals: [
      { id: 'r1', text: 'On R1, route 192.168.3.0/24 via R2 (10.0.12.2)', check: (c) => route(c, 'R1', '192.168.3.0', 24)?.type === 'static',
        hint: 'ip route NETWORK MASK NEXT-HOP, in global configuration on R1.', show: { R1: ['enable', 'configure terminal', 'ip route 192.168.3.0 255.255.255.0 10.0.12.2'] } },
      { id: 'r3', text: 'On R3, add a default route via R2 (10.0.23.2)', check: (c) => route(c, 'R3', '0.0.0.0', 0)?.type === 'static',
        hint: 'A default route is network 0.0.0.0 with mask 0.0.0.0.', show: { R3: ['enable', 'configure terminal', 'ip route 0.0.0.0 0.0.0.0 10.0.23.2'] } },
      { id: 'r2', text: 'On R2, add routes to both LANs', check: (c) => route(c, 'R2', '192.168.1.0', 24)?.type === 'static' && route(c, 'R2', '192.168.3.0', 24)?.type === 'static',
        hint: 'R2 sits in the middle and knows neither LAN. Each next hop is the router on that side.', show: { R2: ['enable', 'configure terminal', 'ip route 192.168.1.0 255.255.255.0 10.0.12.1', 'ip route 192.168.3.0 255.255.255.0 10.0.23.3'] } },
      { id: 'ping', text: 'From R1, ping 192.168.3.1 sourced from 192.168.1.1', check: (c) => pinged(c, 'R1', '192.168.3.1', '192.168.1.1'),
        hint: 'A plain ping uses Gi0/0 as the source. Add source so the reply has to find its way back to the LAN.', show: { R1: ['do ping 192.168.3.1 source 192.168.1.1'] } },
    ],
  },
  {
    id: 'static-floating',
    title: 'Floating backup route',
    lights: ['t3-static'],
    story: 'R1 and R3 got a direct backup link on Gi0/2. Traffic should use the path through R2, and fall back to the backup link only if R2 dies.',
    start: 'R1',
    devices: ['R1', 'R2', 'R3'],
    links: [
      { id: 'r1-r2', ends: [['R1', 'GigabitEthernet0/0'], ['R2', 'GigabitEthernet0/0']] },
      { id: 'r2-r3', ends: [['R2', 'GigabitEthernet0/1'], ['R3', 'GigabitEthernet0/0']] },
      { id: 'r1-r3', ends: [['R1', 'GigabitEthernet0/2'], ['R3', 'GigabitEthernet0/2']] },
      { id: 'lan1', segment: true, ends: [['R1', 'GigabitEthernet0/1']] },
      { id: 'lan3', segment: true, ends: [['R3', 'GigabitEthernet0/1']] },
    ],
    topology: 'R1 ─10.0.12.0/24─ R2 ─10.0.23.0/24─ R3, plus backup R1 Gi0/2 ─10.0.13.0/24─ Gi0/2 R3',
    build() {
      return build({
        devices: ['R1', 'R2', 'R3'], links: this.links, saved: ['R1', 'R2', 'R3'],
        setup: {
          R1: ['hostname R1', 'int g0/0', 'ip add 10.0.12.1 255.255.255.0', 'no shut', 'int g0/1', 'ip add 192.168.1.1 255.255.255.0', 'no shut', 'int g0/2', 'ip add 10.0.13.1 255.255.255.0', 'no shut', 'ip route 192.168.3.0 255.255.255.0 10.0.12.2'],
          R2: ['hostname R2', 'int g0/0', 'ip add 10.0.12.2 255.255.255.0', 'no shut', 'int g0/1', 'ip add 10.0.23.2 255.255.255.0', 'no shut', 'ip route 192.168.1.0 255.255.255.0 10.0.12.1', 'ip route 192.168.3.0 255.255.255.0 10.0.23.3'],
          R3: ['hostname R3', 'int g0/0', 'ip add 10.0.23.3 255.255.255.0', 'no shut', 'int g0/1', 'ip add 192.168.3.1 255.255.255.0', 'no shut', 'int g0/2', 'ip add 10.0.13.3 255.255.255.0', 'no shut', 'ip route 192.168.1.0 255.255.255.0 10.0.23.2'],
        },
      });
    },
    goals: [
      { id: 'float1', text: 'On R1, add a backup route to 192.168.3.0/24 via 10.0.13.3 that stays hidden while the main one works', check: (c) => dev(c, 'R1').statics.some(s => s.net === ip('192.168.3.0') && s.nh === ip('10.0.13.3') && s.ad > 1),
        hint: 'Give the backup a worse administrative distance than the main static route (1). Anything above 1 works; 200 is common.', show: { R1: ['enable', 'configure terminal', 'ip route 192.168.3.0 255.255.255.0 10.0.13.3 200'] } },
      { id: 'float3', text: 'On R3, add the same kind of backup route back to 192.168.1.0/24 via 10.0.13.1', check: (c) => dev(c, 'R3').statics.some(s => s.net === ip('192.168.1.0') && s.nh === ip('10.0.13.1') && s.ad > 1),
        hint: 'Traffic has to come back too. Same idea on R3.', show: { R3: ['enable', 'configure terminal', 'ip route 192.168.1.0 255.255.255.0 10.0.13.1 200'] } },
      { id: 'hidden', text: 'Check R1\'s table: the backup is not in it while the main path is up', check: (c) => {
        const added = lastSeq(c, e => e.device === 'R1' && e.kind === 'command' && e.key === 'ip route');
        return added > 0 && route(c, 'R1', '192.168.3.0', 24)?.hops[0].nh === ip('10.0.12.2') && ran(c, 'R1', 'show ip route', added);
      }, hint: 'Look for 192.168.3.0/24. It should still say [1/0] via 10.0.12.2.', show: { R1: ['do show ip route static'] } },
      { id: 'fail', text: 'Simulate R2 dying: shut both of its interfaces', check: (c) => iface(c, 'R2', 'GigabitEthernet0/0').shutdown && iface(c, 'R2', 'GigabitEthernet0/1').shutdown,
        hint: 'A static route only notices a failure on its own link, so take R2 out on both sides. On R2: shutdown on Gi0/0 and on Gi0/1.', show: { R2: ['enable', 'configure terminal', 'interface g0/0', 'shutdown', 'interface g0/1', 'shutdown'] } },
      { id: 'failover', text: 'Prove the backup took over: ping 192.168.3.1 from R1, sourced from 192.168.1.1', check: (c) => {
        const down = lastSeq(c, e => e.device === 'R2' && e.kind === 'command' && e.key === 'shutdown');
        return down > 0 && pinged(c, 'R1', '192.168.3.1', '192.168.1.1', down);
      }, hint: 'Same ping as before; this time it rides the backup link. Look at R1\'s table too: the AD 200 route is in it now.', show: { R1: ['do ping 192.168.3.1 source 192.168.1.1'] } },
      { id: 'restore', text: 'Bring R2 back and watch the main route return', check: (c) => lastSeq(c, e => e.device === 'R2' && e.key === 'shutdown') > 0 && isUp(c, 'R1', 'GigabitEthernet0/0') && isUp(c, 'R3', 'GigabitEthernet0/0') && route(c, 'R1', '192.168.3.0', 24)?.hops[0].nh === ip('10.0.12.2'),
        hint: 'no shutdown on both of R2\'s interfaces, then look at R1\'s table again.', show: { R2: ['interface g0/0', 'no shutdown', 'interface g0/1', 'no shutdown'], R1: ['do show ip route static'] } },
    ],
  },

  // ---------------------------------------------------------------- OSPF
  {
    id: 'ospf-basic',
    title: 'OSPF across three routers',
    lights: ['t3-ospf'],
    story: 'Replace hand-built routes with OSPF. One process, area 0, fixed router IDs, and no hellos leaking onto the office LANs.',
    start: 'R1',
    devices: ['R1', 'R2', 'R3'],
    links: [
      { id: 'r1-r2', ends: [['R1', 'GigabitEthernet0/0'], ['R2', 'GigabitEthernet0/0']] },
      { id: 'r2-r3', ends: [['R2', 'GigabitEthernet0/1'], ['R3', 'GigabitEthernet0/0']] },
      { id: 'lan1', segment: true, ends: [['R1', 'GigabitEthernet0/1']] },
      { id: 'lan3', segment: true, ends: [['R3', 'GigabitEthernet0/1']] },
    ],
    topology: 'LAN 192.168.1.0/24 ── R1 ─10.0.12.0/24─ R2 ─10.0.23.0/24─ R3 ── LAN 192.168.3.0/24',
    build() {
      return build({
        devices: ['R1', 'R2', 'R3'], links: this.links, saved: ['R1', 'R2', 'R3'],
        setup: {
          R1: ['hostname R1', 'int g0/0', 'ip add 10.0.12.1 255.255.255.0', 'no shut', 'int g0/1', 'ip add 192.168.1.1 255.255.255.0', 'no shut'],
          R2: ['hostname R2', 'int g0/0', 'ip add 10.0.12.2 255.255.255.0', 'no shut', 'int g0/1', 'ip add 10.0.23.2 255.255.255.0', 'no shut'],
          R3: ['hostname R3', 'int g0/0', 'ip add 10.0.23.3 255.255.255.0', 'no shut', 'int g0/1', 'ip add 192.168.3.1 255.255.255.0', 'no shut'],
        },
      });
    },
    goals: [
      { id: 'rid', text: 'Run OSPF process 1 on all three, with router IDs 1.1.1.1, 2.2.2.2 and 3.3.3.3', check: (c) => ['R1', 'R2', 'R3'].every((d, i) => dev(c, d).ospf?.pid === 1 && dev(c, d).ospf.routerId === ip(`${i + 1}.${i + 1}.${i + 1}.${i + 1}`)),
        hint: 'router ospf 1, then router-id, on each router. Set the router ID before the network statements.', show: { R1: ['enable', 'configure terminal', 'router ospf 1', 'router-id 1.1.1.1'], R2: ['enable', 'configure terminal', 'router ospf 1', 'router-id 2.2.2.2'], R3: ['enable', 'configure terminal', 'router ospf 1', 'router-id 3.3.3.3'] } },
      { id: 'networks', text: 'Put every link and LAN in area 0', check: (c) => ['R1', 'R2', 'R3'].every(d => ['GigabitEthernet0/0', 'GigabitEthernet0/1'].every(n => ospfEnabled(c.world, d, n))),
        hint: 'network ADDRESS WILDCARD area 0. The wildcard is the inverse of the mask: /24 is 0.0.0.255.', show: { R1: ['network 10.0.12.0 0.0.0.255 area 0', 'network 192.168.1.0 0.0.0.255 area 0'], R2: ['network 10.0.12.0 0.0.0.255 area 0', 'network 10.0.23.0 0.0.0.255 area 0'], R3: ['network 10.0.23.0 0.0.0.255 area 0', 'network 192.168.3.0 0.0.0.255 area 0'] } },
      { id: 'passive', text: 'Stop hellos on the LAN interfaces', check: (c) => dev(c, 'R1').ospf?.passive.includes('GigabitEthernet0/1') && dev(c, 'R3').ospf?.passive.includes('GigabitEthernet0/1'),
        hint: 'passive-interface, under router ospf. The LAN is still advertised; it just gets no hellos.', show: { R1: ['passive-interface g0/1'], R3: ['passive-interface g0/1'] } },
      { id: 'full', text: 'R2 has two FULL neighbors (check with show ip ospf neighbor)', check: (c) => neighbors(c.world, 'R2').filter(n => n.state === 'FULL').length === 2 && ran(c, null, 'show ip ospf neighbor'),
        hint: 'Run it on R2. Each neighbor should read FULL.', show: { R2: ['do show ip ospf neighbor'] } },
      { id: 'learned', text: 'R1 learns 192.168.3.0/24 through OSPF', check: (c) => route(c, 'R1', '192.168.3.0', 24)?.type === 'ospf',
        hint: 'Look for the O code in R1\'s table.', show: { R1: ['do show ip route ospf'] } },
      { id: 'ping', text: 'From R1, ping 192.168.3.1 sourced from 192.168.1.1', check: (c) => pinged(c, 'R1', '192.168.3.1', '192.168.1.1'),
        hint: 'Source it from the LAN so the reply needs a route back too.', show: { R1: ['do ping 192.168.3.1 source 192.168.1.1'] } },
    ],
  },
  {
    id: 'ospf-dr',
    title: 'Rig the DR election',
    lights: ['t3-ospf'],
    story: 'Three routers share one switch. The network team wants R1 as the designated router and R3 never to be DR or BDR. The catch: an OSPF election is not preemptive.',
    start: 'R2',
    devices: ['R1', 'R2', 'R3'],
    links: [{ id: 'core', segment: true, ends: [['R1', 'GigabitEthernet0/0'], ['R2', 'GigabitEthernet0/0'], ['R3', 'GigabitEthernet0/0']] }],
    topology: 'R1 (.1), R2 (.2), R3 (.3) on one switch, 10.0.0.0/24',
    build() {
      const ospf = (n) => ['router ospf 1', `router-id ${n}.${n}.${n}.${n}`, 'network 10.0.0.0 0.0.0.255 area 0'];
      return build({
        devices: ['R1', 'R2', 'R3'], links: this.links, saved: ['R1', 'R2', 'R3'],
        setup: {
          R1: ['hostname R1', 'int g0/0', 'ip add 10.0.0.1 255.255.255.0', 'no shut', ...ospf(1)],
          R2: ['hostname R2', 'int g0/0', 'ip add 10.0.0.2 255.255.255.0', 'no shut', ...ospf(2)],
          R3: ['hostname R3', 'int g0/0', 'ip add 10.0.0.3 255.255.255.0', 'no shut', ...ospf(3)],
        },
      });
    },
    goals: [
      { id: 'who', text: 'Who is the DR right now? (router ID)', ask: 'A router ID',
        check: (c) => String(c.answers.who ?? '').trim() === '3.3.3.3',
        hint: 'show ip ospf neighbor on R2 shows each neighbor\'s role. With equal priorities, the highest router ID won.', show: { R2: ['enable', 'show ip ospf neighbor'] } },
      { id: 'r1prio', text: 'Raise R1\'s priority on Gi0/0 above everyone else\'s', check: (c) => iface(c, 'R1', 'GigabitEthernet0/0').ospf.priority > Math.max(iface(c, 'R2', 'GigabitEthernet0/0').ospf.priority, iface(c, 'R3', 'GigabitEthernet0/0').ospf.priority),
        hint: 'ip ospf priority, on the interface. The default is 1; the highest is 255.', show: { R1: ['enable', 'configure terminal', 'interface g0/0', 'ip ospf priority 255'] } },
      { id: 'r3zero', text: 'Make R3 ineligible to be DR or BDR', check: (c) => iface(c, 'R3', 'GigabitEthernet0/0').ospf.priority === 0,
        hint: 'Priority 0 takes a router out of the election entirely.', show: { R3: ['enable', 'configure terminal', 'interface g0/0', 'ip ospf priority 0'] } },
      { id: 'elected', text: 'Get R1 elected DR', check: (c) => c.world.elections.core?.dr === 'R1',
        hint: 'The election does not rerun by itself. Clear the OSPF process on the router that is DR now, so its BDR takes over. Check show ip ospf neighbor between steps.', show: { R2: ['enable', 'clear ip ospf process', 'yes'] } },
      { id: 'confirm', text: 'Confirm from R2: R1 shows FULL/DR', check: (c) => {
        const done = lastSeq(c, e => e.kind === 'clear-ospf');
        return c.world.elections.core?.dr === 'R1' && ran(c, 'R2', 'show ip ospf neighbor', done);
      }, hint: 'show ip ospf neighbor on R2.', show: { R2: ['show ip ospf neighbor'] } },
    ],
  },
];

export const labById = (id) => LABS.find(l => l.id === id) ?? null;
export const labsForBranch = (branchId) => LABS.filter(l => l.lights.includes(branchId));

// A running lab: the world, one console session per router, typed answers.
export function startLab(lab) {
  const world = lab.build();
  const sessions = Object.fromEntries(lab.devices.map(d => [d, createSession(world, d)]));
  return { lab, world, sessions, answers: {}, help: { hints: new Set(), shown: new Set() } };
}

export function labContext(run) {
  const evs = Object.values(run.sessions).flatMap(s => s.events).sort((a, b) => a.seq - b.seq);
  return { world: run.world, sessions: run.sessions, events: evs, answers: run.answers };
}

// A ticked goal stays ticked: the floating-route lab shuts a link and then
// restores it, and the "shut it" box should not untick when you do.
export function goalStates(run) {
  const ctx = labContext(run);
  run.latched ??= new Set();
  return run.lab.goals.map(g => {
    let done = run.latched.has(g.id);
    if (!done) {
      try { done = Boolean(g.check(ctx)); } catch { done = false; }
      if (done) run.latched.add(g.id);
    }
    return { id: g.id, done };
  });
}

export { formatIp };

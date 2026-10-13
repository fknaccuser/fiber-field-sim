// Generated routing questions: routing table lookups (longest match, next
// hop, exit interface, gateway of last resort, route sources) and OSPF
// neighbor and adjacency faults. Fresh numbers and a fresh fault each time.

import { Q } from '../bank/qb.js';
import { X, int, pick, shuffle, sample, privateBase, subnetIn, addHost, inPrefix, toInt, choices, pad } from './kit.js';

const AGE = (rnd) => `00:${String(int(rnd, 1, 59)).padStart(2, '0')}:${String(int(rnd, 0, 59)).padStart(2, '0')}`;
const CODES = { C: 'connected', L: 'local', S: 'static', O: 'OSPF' };
const AD = { C: 0, L: 0, S: 1, O: 110 };

// A small router: two point-to-point links, a LAN, an internet link, and a
// nested set of learned routes inside one private block.
function buildTable(rnd, { withDefault }) {
  const base = privateBase(rnd);
  const l12 = `10.0.${int(rnd, 10, 99)}.0`;
  const l13 = `10.0.${int(rnd, 100, 199)}.0`;
  const isp = `203.0.113.${pick(rnd, [0, 4, 8, 12, 16])}`;
  // The LAN sits in a different private range from the learned block.
  const lan = base.startsWith('192.168.') ? `10.${int(rnd, 200, 250)}.${int(rnd, 0, 255)}.0` : `192.168.${int(rnd, 1, 254)}.0`;
  const r2 = addHost(l12, 2), r3 = addHost(l13, 2), ispHop = addHost(isp, 1);
  const wide = base.startsWith('192.168.') ? { net: base, len: 24 } : { net: base, len: 16 };
  // A mid-size route inside the wide one, and a small one inside that.
  const midLen = wide.len === 24 ? 26 : 24;
  const mid = subnetIn(rnd, base, midLen);
  const smallLen = midLen + int(rnd, 2, 4);
  const small = addHost(mid, int(rnd, 0, 2 ** (smallLen - midLen) - 1) * 2 ** (32 - smallLen));
  const routes = [
    { code: 'C', net: l12, len: 30, iface: 'GigabitEthernet0/0' },
    { code: 'L', net: addHost(l12, 1), len: 32, iface: 'GigabitEthernet0/0' },
    { code: 'C', net: l13, len: 30, iface: 'GigabitEthernet0/1' },
    { code: 'L', net: addHost(l13, 1), len: 32, iface: 'GigabitEthernet0/1' },
    { code: 'C', net: lan, len: 24, iface: 'GigabitEthernet0/2' },
    { code: 'L', net: addHost(lan, 1), len: 32, iface: 'GigabitEthernet0/2' },
    { code: 'O', net: wide.net, len: wide.len, hop: r2, iface: 'GigabitEthernet0/0', metric: int(rnd, 2, 5) },
    { code: pick(rnd, ['O', 'S']), net: mid, len: midLen, hop: r3, iface: 'GigabitEthernet0/1', metric: int(rnd, 10, 40) },
    { code: 'S', net: small, len: smallLen, hop: r2, iface: 'GigabitEthernet0/0', metric: 0 },
  ];
  if (withDefault) {
    routes.push({ code: 'C', net: isp, len: 30, iface: 'GigabitEthernet0/3' }, { code: 'L', net: addHost(isp, 2), len: 32, iface: 'GigabitEthernet0/3' });
    routes.push({ code: 'S*', net: '0.0.0.0', len: 0, hop: ispHop, iface: 'GigabitEthernet0/3', metric: 0 });
  }
  for (const r of routes) if (r.code === 'S' || r.code === 'S*') r.metric = 0;
  routes.sort((a, b) => toInt(a.net) - toInt(b.net) || a.len - b.len);
  return { routes, wide, mid: { net: mid, len: midLen }, small: { net: small, len: smallLen }, ispHop, r2, r3, lan };
}

const routeText = (r) => `${r.net}/${r.len}`;
function lineOf(rnd, r) {
  const code = pad(r.code, 6);
  if (r.code === 'C' || r.code === 'L') return `${code}${routeText(r)} is directly connected, ${r.iface}`;
  const ad = r.code.startsWith('S') ? 1 : 110;
  if (r.code.startsWith('S')) return `${code}${routeText(r)} [${ad}/${r.metric}] via ${r.hop}`;
  return `${code}${routeText(r)} [${ad}/${r.metric}] via ${r.hop}, ${AGE(rnd)}, ${r.iface}`;
}
function tableText(rnd, t, name) {
  const gw = t.routes.find(r => r.code === 'S*');
  return [
    `${name}#show ip route`,
    'Codes: L - local, C - connected, S - static, O - OSPF, * - candidate default',
    gw ? `Gateway of last resort is ${gw.hop} to network 0.0.0.0` : 'Gateway of last resort is not set',
    '',
    ...t.routes.map(r => lineOf(rnd, r)),
  ].join('\n');
}
const tableMarks = (name) => [
  [`${name}#`, 'prompt'], ['show ip route', 'cmd'], [/^(S\*|C|L|O|S)(?= )/m, 'code'], [/\[\d+\/\d+\]/, 'metric'],
  [/Gateway of last resort is [\d.]+|Gateway of last resort is not set/, 'gw', 'Gateway of last resort'],
  [/via [\d.]+/, 'hop'], [/GigabitEthernet0\/\d/, 'iface'], [/\d+\.\d+\.\d+\.\d+\/\d+/, 'ip', 'Destination prefix'],
];

const describe = (r) => (r.code === 'S*' ? 'The default route, 0.0.0.0/0' : `${CODES[r.code[0]][0].toUpperCase()}${CODES[r.code[0]].slice(1)} route ${routeText(r)}`);

// Which route, next hop or exit interface does a destination use?
export const RT_LOOKUP = {
  id: 'g-rt-lookup', domain: 'IPC', branch: 't3-table',
  make(rnd) {
    const withDefault = rnd() < 0.75;
    const t = buildTable(rnd, { withDefault });
    const name = pick(rnd, ['R1', 'BR1', 'EDGE1']);
    // Pick a destination: inside the small route, the mid but not the small,
    // the wide only, or outside everything.
    const target = pick(rnd, ['small', 'mid', 'wide', 'none', 'small', 'mid']);
    let dest;
    const insideNot = (inside, notIn, tries = 200) => {
      for (let i = 0; i < tries; i += 1) {
        const span = 2 ** (32 - inside.len);
        const ip = addHost(inside.net, int(rnd, 1, span - 2));
        if (!notIn || !inPrefix(ip, notIn.net, notIn.len)) return ip;
      }
      return null;
    };
    if (target === 'small') dest = insideNot(t.small);
    else if (target === 'mid') dest = insideNot(t.mid, t.small);
    else if (target === 'wide') dest = insideNot(t.wide, t.mid);
    else dest = `${pick(rnd, [8, 23, 45, 77, 151, 199])}.${int(rnd, 0, 255)}.${int(rnd, 0, 255)}.${int(rnd, 1, 254)}`;
    const matches = t.routes.filter(r => r.code !== 'L' && inPrefix(dest, r.net, r.len));
    const best = matches.sort((a, b) => b.len - a.len)[0] ?? null;
    const others = t.routes.filter(r => r !== best && r.code !== 'L' && r.code !== 'C');
    const ask = pick(rnd, ['route', 'hop', 'iface']);
    const exhibit = X(tableText(rnd, t, name), ...tableMarks(name));
    const why = best
      ? `${dest} matches ${matches.map(routeText).join(', ')}. The longest prefix, /${best.len}, wins regardless of AD or metric, so the packet ${best.hop ? `goes to ${best.hop}` : 'is delivered directly'} out ${best.iface}.`
      : `${dest} matches no route and there is no default route, so ${name} drops the packet and sends ICMP unreachable back to the source.`;
    let list;
    if (ask === 'route') {
      list = choices(
        [best ? describe(best) : 'None: the packet is dropped', 'The longest matching prefix.'],
        shuffle(rnd, [
          ...matches.filter(r => r !== best).map(r => [describe(r), `It matches, but /${r.len} is less specific.`]),
          ...others.filter(r => !matches.includes(r)).map(r => [describe(r), `${dest} is not inside ${routeText(r)}.`]),
          ...(best ? [['None: the packet is dropped', 'A matching route exists.']] : []),
        ]),
      );
    } else if (ask === 'hop') {
      const hops = [...new Set(t.routes.filter(r => r.hop).map(r => r.hop))];
      list = choices(
        [best ? (best.hop ?? 'None: it is directly connected') : 'None: the packet is dropped', 'From the winning route.'],
        shuffle(rnd, [
          ...hops.filter(h => h !== best?.hop).map(h => [h, 'That next hop belongs to a different route.']),
          ['None: the packet is dropped', best ? 'A matching route exists.' : ''],
          [`${dest}`, 'That is the destination, not the next hop.'],
        ].filter(([, w]) => w)),
      );
    } else {
      const ifs = ['GigabitEthernet0/0', 'GigabitEthernet0/1', 'GigabitEthernet0/2', ...(withDefault ? ['GigabitEthernet0/3'] : [])];
      list = choices(
        [best ? best.iface : 'None: the packet is dropped', 'The exit interface of the winning route.'],
        shuffle(rnd, [
          ...ifs.filter(i => i !== best?.iface).map(i => [i, 'That interface belongs to a different route.']),
          ['None: the packet is dropped', 'A matching route exists.'],
        ].filter(([t2]) => best || t2 !== 'None: the packet is dropped')),
      );
    }
    const prompt = ask === 'route' ? `Which route does ${name} use for a packet to ${dest}?`
      : ask === 'hop' ? `To which next hop does ${name} send a packet for ${dest}?`
        : `Out which interface does ${name} send a packet for ${dest}?`;
    return Q('g-rt-lookup', 'IPC', 't3-table', prompt, list, `${why} Longest match first, then administrative distance, then metric: that order answers every lookup question.`, { exhibit });
  },
};

// How was a route learned, and with what AD?
export const RT_SOURCE = {
  id: 'g-rt-source', domain: 'IPC', branch: 't3-table',
  make(rnd) {
    const t = buildTable(rnd, { withDefault: rnd() < 0.6 });
    const name = pick(rnd, ['R1', 'R2', 'HQ1']);
    const r = pick(rnd, t.routes.filter(x => x.code !== 'L'));
    const ad = AD[r.code[0]];
    const answer = r.code === 'S*' ? 'A static default route, AD 1' : `${CODES[r.code[0]][0].toUpperCase()}${CODES[r.code[0]].slice(1)}, AD ${ad}`;
    const pool = [
      ['Connected, AD 0', 'Connected routes show C and "directly connected".'],
      ['Static, AD 1', 'Static routes show S with [1/0].'],
      ['OSPF, AD 110', 'OSPF routes show O with [110/cost].'],
      ['A static default route, AD 1', 'That is the S* line.'],
      ['OSPF, AD 1', 'OSPF uses AD 110.'],
      ['Static, AD 110', 'Static routes default to AD 1.'],
    ];
    const exhibit = X(tableText(rnd, t, name), ...tableMarks(name));
    return Q('g-rt-source', 'IPC', 't3-table', `How did ${name} learn the route to ${routeText(r)}, and what is its administrative distance?`,
      choices([answer, 'Read the code letter and the first number in brackets.'], shuffle(rnd, pool.filter(p => p[0] !== answer))),
      `The code letter names the source (C connected, L local, S static, O OSPF, * candidate default) and [AD/metric] gives the administrative distance first. Connected routes have AD 0 and print "directly connected" instead of brackets.`, { exhibit });
  },
};

// OSPF neighbor table: what does each state mean?
export const OSPF_NBR = {
  id: 'g-ospf-nbr', domain: 'IPC', branch: 't3-ospf',
  make(rnd) {
    const name = pick(rnd, ['R1', 'R4', 'BR2']);
    const ids = sample(rnd, ['2.2.2.2', '3.3.3.3', '4.4.4.4', '5.5.5.5', '6.6.6.6', '7.7.7.7'], 3);
    const ask = pick(rnd, ['dr', 'exstart', 'init', 'twoway']);
    const net = `10.${int(rnd, 1, 250)}.${int(rnd, 0, 255)}.0`;
    const states = {
      dr: ['FULL/DR', 'FULL/BDR', '2WAY/DROTHER'],
      exstart: ['EXSTART/DR', 'FULL/BDR', '2WAY/DROTHER'],
      init: ['INIT/DROTHER', 'FULL/DR', 'FULL/BDR'],
      twoway: ['2WAY/DROTHER', 'FULL/DR', 'FULL/BDR'],
    }[ask];
    const rows = shuffle(rnd, states.map((s, i) => ({ id: ids[i], state: s, addr: addHost(net, i + 2) })));
    const text = [
      `${name}#show ip ospf neighbor`,
      'Neighbor ID     Pri   State           Dead Time   Address         Interface',
      ...rows.map(r => `${pad(r.id, 16)}${pad('  1', 6)}${pad(r.state, 16)}00:00:3${int(rnd, 1, 9)}    ${pad(r.addr, 16)}GigabitEthernet0/0`),
    ].join('\n');
    const exhibit = X(text, [`${name}#`, 'prompt'], ['show ip ospf neighbor', 'cmd'], [/^\d\.\d\.\d\.\d/m, 'key', 'Neighbor router ID'],
      [/FULL\/(DR|BDR)/, 'ok', 'Full adjacency'], ['2WAY/DROTHER', 'state', '2-Way'], [/EXSTART\/DR|INIT\/DROTHER/, 'fail', 'Stuck'], [/00:00:\d\d/, 'count', 'Dead timer'], [/10\.\d+\.\d+\.\d+/, 'ip'], [/GigabitEthernet0\/0/, 'iface']);
    const row = (s) => rows.find(r => r.state === s);
    if (ask === 'dr') {
      const dr = row('FULL/DR');
      return Q('g-ospf-nbr', 'IPC', 't3-ospf', 'Which neighbor is the designated router on this segment?', choices([dr.id, 'Its state reads FULL/DR.'], rows.filter(r => r !== dr).map(r => [r.id, `Its role is ${r.state.split('/')[1]}.`]).concat([[name, 'The table lists neighbors\' roles, not this router\'s.']])),
        'The State column shows the adjacency state and the neighbor\'s role. DR and BDR are elected by highest priority, then highest router ID, and there is no preemption. A dash in place of the role means a point-to-point link with no election.', { exhibit });
    }
    if (ask === 'exstart') {
      const bad = row('EXSTART/DR');
      return Q('g-ospf-nbr', 'IPC', 't3-ospf', `Neighbor ${bad.id} has stayed in this state for ten minutes. What is the most likely cause?`, choices(['An MTU mismatch on the link', 'Database description packets are dropped, so EXSTART never ends.'], [['Mismatched areas', 'With mismatched areas no neighbor would be listed at all.'], ['Mismatched hello timers', 'Mismatched timers stop the neighbor before 2-Way.'], ['Nothing; this is normal for a DROTHER', 'DROTHERs settle in 2-Way, not EXSTART.']]),
        'Hellos are small and pass, so neighbors reach 2-Way. The database exchange uses large packets; if one side has a smaller MTU they are dropped and the pair loops in EXSTART or EXCHANGE. Compare MTU with show interfaces on both ends.', { exhibit });
    }
    if (ask === 'init') {
      const bad = row('INIT/DROTHER');
      return Q('g-ospf-nbr', 'IPC', 't3-ospf', `What does the state of neighbor ${bad.id} tell you?`, choices([`${name} hears its hellos, but ${bad.id} is not hearing ${name}'s`, 'INIT means one direction only.'], [['The adjacency is complete', 'Complete is FULL.'], ['There is an MTU mismatch', 'That stalls in EXSTART.'], [`${bad.id} is the DR`, 'Roles are settled after 2-Way.']]),
        'A hello lists every neighbor its sender has heard. INIT means the neighbor\'s hellos arrive but do not yet list this router, so traffic is reaching only one way: look for an ACL filtering OSPF, a unidirectional link, or multicast problems.', { exhibit });
    }
    const two = row('2WAY/DROTHER');
    return Q('g-ospf-nbr', 'IPC', 't3-ospf', `Is the state of neighbor ${two.id} a problem?`, choices(['No: DROTHERs form FULL only with the DR and BDR and stay 2-Way with each other', 'This is the design.'], [['Yes: the MTU is mismatched', 'That shows EXSTART or EXCHANGE.'], ['Yes: the hello timers differ', 'There would be no neighbor at all.'], ['Yes: it should be FULL with every router', 'Only with the DR and BDR.']]),
      'On a multiaccess segment each router builds full adjacencies only with the DR and BDR, which keeps flooding down. Two DROTHERs therefore stop at 2-Way, and that is healthy.', { exhibit });
  },
};

// Two OSPF interfaces that should be neighbors: what stops them?
export const OSPF_MISMATCH = {
  id: 'g-ospf-mismatch', domain: 'IPC', branch: 't3-ospf',
  make(rnd) {
    const fault = pick(rnd, ['timers', 'area', 'subnet', 'rid']);
    const net = `10.${int(rnd, 1, 250)}.${int(rnd, 0, 255)}.${pick(rnd, [0, 4, 8, 12])}`;
    const a = { name: 'R1', ip: addHost(net, 1), len: 30, area: 0, hello: 10, dead: 40, rid: '1.1.1.1' };
    const b = { name: 'R2', ip: addHost(net, 2), len: 30, area: 0, hello: 10, dead: 40, rid: '2.2.2.2' };
    if (fault === 'timers') { b.hello = pick(rnd, [5, 15, 30]); b.dead = b.hello * 4; }
    if (fault === 'area') b.area = pick(rnd, [1, 2, 10]);
    if (fault === 'subnet') b.len = pick(rnd, [24, 29]);
    if (fault === 'rid') b.rid = a.rid;
    const block = (r) => [
      `${r.name}#show ip ospf interface g0/0 | include Internet|Router ID|Timer`,
      `  Internet Address ${r.ip}/${r.len}, Area ${r.area}, Attached via Network Statement`,
      `  Process ID 1, Router ID ${r.rid}, Network Type BROADCAST, Cost: 1`,
      `  Timer intervals configured, Hello ${r.hello}, Dead ${r.dead}, Wait ${r.dead}, Retransmit 5`,
    ].join('\n');
    const exhibit = X(`${block(a)}\n${block(b)}`, [/R[12]#/, 'prompt'], [/show ip ospf interface g0\/0 \| include Internet\|Router ID\|Timer/, 'cmd'],
      [/\d+\.\d+\.\d+\.\d+(?=\/)/, 'ip'], [/\/\d+(?=,)/, 'mask'], [/Area \d+/, 'key', 'Area'], [/Router ID \d\.\d\.\d\.\d/, 'key', 'Router ID'], [/Hello \d+, Dead \d+/, 'key', 'Timers']);
    const answers = {
      timers: ['The hello and dead timers differ', `R1 uses ${a.hello}/${a.dead} and R2 uses ${b.hello}/${b.dead}; hellos with different timers are ignored.`],
      area: ['The interfaces are in different areas', `R1 is in area ${a.area} and R2 in area ${b.area}; both ends of a link must share an area.`],
      subnet: ['The masks differ, so the routers disagree on the subnet', `R1 uses /${a.len} and R2 uses /${b.len}; on broadcast networks the masks must match.`],
      rid: ['Both routers use the same router ID', `Both show ${a.rid}; OSPF requires unique router IDs and logs a duplicate.`],
    };
    const right = answers[fault];
    const wrong = Object.entries(answers).filter(([k]) => k !== fault).map(([, [text]]) => [text, 'Compare the two outputs: that value matches on both routers.']);
    return Q('g-ospf-mismatch', 'IPC', 't3-ospf', 'R1 and R2 are cabled together on Gi0/0 and both run OSPF process 1, but they never become neighbors. Why?',
      choices(right, shuffle(rnd, wrong)),
      `${right[1]} Neighbors must agree on area, subnet and mask, hello and dead timers, authentication and area type, and must have different router IDs. Process IDs may differ.`, { exhibit });
  },
};

export const ROUTING_TEMPLATES = [RT_LOOKUP, RT_SOURCE, OSPF_NBR, OSPF_MISMATCH];

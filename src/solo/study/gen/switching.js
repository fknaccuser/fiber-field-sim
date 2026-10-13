// Generated switching questions: VLAN membership, trunk faults, the MAC
// address table, spanning tree roles and EtherChannel states. Fresh ports,
// VLANs, MACs and faults each time.

import { Q } from '../bank/qb.js';
import { X, int, pick, shuffle, sample, macsOf, choices, pad } from './kit.js';

const VLAN_NAMES = ['STAFF', 'VOICE', 'GUEST', 'PRINTERS', 'CAMERAS', 'LAB', 'SALES', 'ENG', 'MGMT', 'WIFI'];
const ports = (n, from = 1) => Array.from({ length: n }, (_, i) => `Gi0/${from + i}`);

// show vlan brief: membership, and fixing a port in the wrong VLAN.
export const VLAN_BRIEF = {
  id: 'g-vlan-brief', domain: 'NA', branch: 't2-vlans',
  make(rnd) {
    const name = pick(rnd, ['SW1', 'ACC1', 'ACC2']);
    const ids = sample(rnd, [10, 20, 30, 40, 50, 60, 70, 99, 110, 120], 3).sort((a, b) => a - b);
    const names = sample(rnd, VLAN_NAMES, 3);
    const all = shuffle(rnd, ports(10));
    const groups = { 1: all.slice(0, 2), [ids[0]]: all.slice(2, 5), [ids[1]]: all.slice(5, 8), [ids[2]]: all.slice(8, 10) };
    const sortP = (l) => [...l].sort((a, b) => Number(a.split('/')[1]) - Number(b.split('/')[1]));
    const row = (id, nm, list) => `${pad(id, 5)}${pad(nm, 33)}${pad('active', 10)}${sortP(list).join(', ')}`;
    const text = [
      `${name}#show vlan brief`,
      'VLAN Name                             Status    Ports',
      '---- -------------------------------- --------- -------------------------------',
      row(1, 'default', groups[1]),
      ...ids.map((id, i) => row(id, names[i], groups[id])),
      `${pad(ids[2] + 1, 5)}${pad('PARKING', 33)}active`,
    ].join('\n');
    const exhibit = X(text, [`${name}#`, 'prompt'], ['show vlan brief', 'cmd'], [/^\d+(?= )/m, 'vlan'], [/Gi0\/\d+/, 'iface'], [/active/, 'state']);
    const ask = pick(rnd, ['which', 'fix', 'empty']);
    if (ask === 'which') {
      const vi = int(rnd, 0, 2);
      const port = pick(rnd, groups[ids[vi]]);
      const opts = [String(ids[vi]), '1', ...ids.filter((_, i) => i !== vi).map(String)];
      return Q('g-vlan-brief', 'NA', 't2-vlans', `Which VLAN is ${port} in?`,
        choices([opts[0], `${port} is listed on the VLAN ${ids[vi]} row.`], opts.slice(1).map(v => [v, `${port} is not on the VLAN ${v} row.`])),
        'show vlan brief lists each VLAN with its access ports. Trunk ports are left out on purpose; find those with show interfaces trunk. A port nobody configured stays in VLAN 1, the default.', { exhibit });
    }
    if (ask === 'fix') {
      const port = pick(rnd, groups[1]);
      const want = ids[int(rnd, 0, 2)];
      return Q('g-vlan-brief', 'NA', 't2-vlans', `A user on ${port} belongs in VLAN ${want}. Which interface commands fix it?`,
        choices([`switchport mode access, then switchport access vlan ${want}`, `${port} is still in VLAN 1.`], [
          [`switchport trunk native vlan ${want}`, 'That is a trunk setting.'],
          [`vlan ${want}`, 'That creates or edits the VLAN, it does not move the port.'],
          [`switchport voice vlan ${want}`, 'That sets the phone VLAN, not the data VLAN.'],
        ]),
        `${port} is listed under VLAN 1 default, so it was never assigned. Under the interface, fix the mode and assign the access VLAN; the change shows in show vlan brief immediately.`, { exhibit });
    }
    return Q('g-vlan-brief', 'NA', 't2-vlans', 'Which VLAN exists on this switch but has no access ports?',
      choices([String(ids[2] + 1), 'Its row lists no ports.'], [[String(ids[0]), 'It has ports.'], [String(ids[1]), 'It has ports.'], ['1', 'It has ports.']]),
      'A VLAN with no access ports can still be in use on trunks (show interfaces trunk) or be a parking VLAN for shut, unused ports. An SVI for such a VLAN stays down until a port in it is active.', { exhibit });
  },
};

// show interfaces trunk: why does VLAN v not cross?
export const TRUNK = {
  id: 'g-trunk', domain: 'NA', branch: 't2-trunks',
  make(rnd) {
    const name = pick(rnd, ['SW1', 'SW2', 'DIST1']);
    const port = pick(rnd, ['Gi0/24', 'Gi0/48', 'Gi1/0/1']);
    const vlans = sample(rnd, [10, 20, 30, 40, 50, 60, 99, 110], 4).sort((a, b) => a - b);
    const native = pick(rnd, [1, 99, 999]);
    const v = pick(rnd, vlans);
    const fault = pick(rnd, ['allowed', 'exists', 'stp', 'ok']);
    const allowed = fault === 'allowed' ? vlans.filter(x => x !== v) : vlans;
    const active = fault === 'exists' ? allowed.filter(x => x !== v) : allowed;
    const fwd = fault === 'stp' ? active.filter(x => x !== v) : active;
    const join = (l) => l.join(',');
    const text = [
      `${name}#show interfaces trunk`,
      'Port        Mode         Encapsulation  Status        Native vlan',
      `${pad(port, 12)}on           802.1q         trunking      ${native}`,
      '',
      'Port        Vlans allowed on trunk',
      `${pad(port, 12)}${join(allowed)}`,
      '',
      'Port        Vlans allowed and active in management domain',
      `${pad(port, 12)}${join(active)}`,
      '',
      'Port        Vlans in spanning tree forwarding state and not pruned',
      `${pad(port, 12)}${join(fwd)}`,
    ].join('\n');
    const exhibit = X(text, [`${name}#`, 'prompt'], ['show interfaces trunk', 'cmd'], [new RegExp(port.replace('/', '\\/'), 'g'), 'iface'], ['trunking', 'ok', 'Trunk is up'],
      [new RegExp(`(?<=trunking {6})${native}`), 'vlan', 'Native VLAN'], [/(?<= {2,12})\d+(,\d+)*$/m, 'vlan', 'VLAN list']);
    const options = {
      allowed: [`VLAN ${v} is not in the trunk's allowed list`, `It is missing from the first VLAN list. Fix: switchport trunk allowed vlan add ${v}.`],
      exists: [`VLAN ${v} is allowed but was never created on ${name}`, `It is allowed but missing from "allowed and active". Fix: vlan ${v}.`],
      stp: [`Spanning tree is blocking VLAN ${v} on this trunk`, 'It is active but missing from the forwarding block; another path is forwarding for it.'],
      ok: [`VLAN ${v} crosses this trunk; the problem is elsewhere`, 'It appears in all three VLAN lists.'],
    };
    return Q('g-trunk', 'NA', 't2-trunks', `Hosts in VLAN ${v} cannot reach the other side of ${port}. What does this output show?`,
      choices(options[fault], shuffle(rnd, Object.entries(options).filter(([k]) => k !== fault).map(([, [t]]) => [t, 'Trace VLAN ' + v + ' through the three lists: that is not where it drops out.']))),
      `Read the trunk output top to bottom and find where VLAN ${v} disappears: allowed (configured on the trunk), allowed and active (exists on this switch), forwarding (not blocked by STP). ${options[fault][1]}`, { exhibit });
  },
};

// show mac address-table: where does a MAC live, and which port is an uplink?
export const MAC_TABLE = {
  id: 'g-mac-table', domain: 'NF', branch: 't1-switching',
  make(rnd) {
    const name = pick(rnd, ['SW1', 'ACC1', 'ACC2']);
    const macs = macsOf(rnd, 6);
    const uplink = pick(rnd, ['Gi0/24', 'Gi0/48', 'Gi0/23']);
    const vl = sample(rnd, [10, 20, 30, 40], 2);
    const access = sample(rnd, ports(12), 3);
    const rows = shuffle(rnd, [
      { vlan: vl[0], mac: macs[0], port: access[0] },
      { vlan: vl[0], mac: macs[1], port: access[1] },
      { vlan: vl[1], mac: macs[2], port: access[2] },
      { vlan: vl[0], mac: macs[3], port: uplink },
      { vlan: vl[1], mac: macs[4], port: uplink },
      { vlan: vl[0], mac: macs[5], port: uplink },
    ]);
    const text = [
      `${name}#show mac address-table dynamic`,
      'Vlan    Mac Address       Type        Ports',
      '----    -----------       --------    -----',
      ...rows.map(r => `${lpad2(r.vlan)}    ${r.mac}    DYNAMIC     ${r.port}`),
    ].join('\n');
    const exhibit = X(text, [`${name}#`, 'prompt'], ['show mac address-table dynamic', 'cmd'], [/^ *\d+(?= {4})/m, 'vlan'], [/[0-9a-f]{4}\.[0-9a-f]{4}\.[0-9a-f]{4}/, 'mac'], [/DYNAMIC/, 'state', 'Learned'], [/Gi0\/\d+/, 'iface']);
    const ask = pick(rnd, ['port', 'uplink', 'vlan']);
    const allPorts = [...new Set(rows.map(r => r.port))];
    if (ask === 'port') {
      const r = pick(rnd, rows.filter(x => x.port !== uplink));
      return Q('g-mac-table', 'NF', 't1-switching', `Out which port does ${name} send a frame for ${r.mac}?`,
        choices([r.port, 'The table maps that MAC to it.'], [...allPorts.filter(p => p !== r.port).map(p => [p, 'A different MAC is learned there.']), ['It floods the frame', 'The MAC is known, so no flooding.']]),
        'A switch learns source MACs as frames arrive and forwards by destination MAC. Known destinations go out one port; unknown ones are flooded within the VLAN. Entries age out after 300 seconds without traffic.', { exhibit });
    }
    if (ask === 'uplink') {
      return Q('g-mac-table', 'NF', 't1-switching', 'Which port most likely connects to another switch?',
        choices([uplink, 'Several MACs, in several VLANs, are learned there.'], allPorts.filter(p => p !== uplink).map(p => [p, 'Only one MAC is learned there, typical of an end device.'])),
        'Count entries per port. Access ports usually show one MAC (two with a phone and PC). A port with many MACs across VLANs leads to more devices: another switch, an AP, or a virtualization host.', { exhibit });
    }
    const r = pick(rnd, rows);
    return Q('g-mac-table', 'NF', 't1-switching', `In which VLAN was ${r.mac} learned?`,
      choices([String(r.vlan), 'The Vlan column on its row.'], [...vl.filter(x => x !== r.vlan).map(x => [String(x), 'Another MAC\'s VLAN.']), ['1', 'No entry is in VLAN 1.'], ['All VLANs', 'Each entry belongs to one VLAN.']]),
      'The MAC table is kept per VLAN: the same MAC in two VLANs is two entries. That is why show mac address-table vlan N is a quick way to see who is in a VLAN.', { exhibit });
  },
};
const lpad2 = (n) => String(n).padStart(4, ' ');

// show spanning-tree vlan: roles, root, and priorities.
export const STP = {
  id: 'g-stp', domain: 'NA', branch: 't2-stp',
  make(rnd) {
    const name = pick(rnd, ['SW2', 'SW3', 'ACC1']);
    const vlan = pick(rnd, [1, 10, 20, 30, 99]);
    const vid = `VLAN${String(vlan).padStart(4, '0')}`;
    const isRoot = rnd() < 0.3;
    const [rootMac, myMac] = macsOf(rnd, 2);
    const rootPri = isRoot ? 24576 : pick(rnd, [4096, 8192, 24576]);
    const myPri = isRoot ? rootPri : 32768;
    const p = shuffle(rnd, ['Gi0/1', 'Gi0/2', 'Gi0/3', 'Gi0/4']);
    const roles = isRoot
      ? [[p[0], 'Desg', 'FWD', 4, 'P2p'], [p[1], 'Desg', 'FWD', 4, 'P2p'], [p[2], 'Desg', 'FWD', 19, 'P2p Edge']]
      : [[p[0], 'Root', 'FWD', 4, 'P2p'], [p[1], 'Altn', 'BLK', 4, 'P2p'], [p[2], 'Desg', 'FWD', 19, 'P2p Edge']];
    roles.sort((a, b) => a[0].localeCompare(b[0]));
    const text = [
      `${name}#show spanning-tree vlan ${vlan}`,
      vid,
      '  Spanning tree enabled protocol rstp',
      `  Root ID    Priority    ${rootPri + vlan}`,
      `             Address     ${isRoot ? myMac : rootMac}`,
      ...(isRoot ? ['             This bridge is the root'] : [`             Cost        4`]),
      '',
      `  Bridge ID  Priority    ${myPri + vlan}  (priority ${myPri} sys-id-ext ${vlan})`,
      `             Address     ${myMac}`,
      '',
      'Interface           Role Sts Cost      Prio.Nbr Type',
      '------------------- ---- --- --------- -------- ------------',
      ...roles.map(([i, r, s, c, t], k) => `${pad(i, 20)}${r} ${s} ${pad(c, 10)}128.${k + 1}    ${t}`),
    ].join('\n');
    const exhibit = X(text, [`${name}#`, 'prompt'], [`show spanning-tree vlan ${vlan}`, 'cmd'], [vid, 'vlan'], [/This bridge is the root/, 'ok', 'This switch is root'],
      [/(?<=Root ID {4}Priority {4})\d+/, 'key', 'Root priority'], [/(?<=Bridge ID  Priority {4})\d+/, 'key', 'This switch\'s priority'],
      [/[0-9a-f]{4}\.[0-9a-f]{4}\.[0-9a-f]{4}/, 'mac'], [/Gi0\/\d/, 'iface'], [/Root FWD/, 'ok', 'Root port, forwarding'], [/Altn BLK/, 'fail', 'Alternate, blocking'], [/Desg FWD/, 'role', 'Designated, forwarding'], [/Edge/, 'key', 'PortFast edge']);
    const ask = isRoot ? pick(rnd, ['isroot', 'rootprio']) : pick(rnd, ['rootport', 'blocking', 'isroot', 'rootprio']);
    const pf = (role) => roles.find(r => r[1] === role)?.[0];
    if (ask === 'rootport') {
      return Q('g-stp', 'NA', 't2-stp', `Which port is ${name}'s root port for VLAN ${vlan}?`,
        choices([pf('Root'), 'Role Root, forwarding.'], roles.filter(r => r[1] !== 'Root').map(r => [r[0], `Its role is ${r[1]}.`]).concat([['None; this switch is the root', 'Root ID and Bridge ID differ, so it is not.']])),
        'Every non-root switch has exactly one root port: its best path to the root bridge by lowest cost, then lowest sender bridge ID, then lowest sender port. The root itself has none; all its ports are designated.', { exhibit });
    }
    if (ask === 'blocking') {
      return Q('g-stp', 'NA', 't2-stp', `Which port is blocking for VLAN ${vlan}, and why?`,
        choices([`${pf('Altn')}: it is an alternate path to the root, discarding to prevent a loop`, 'Altn BLK.'], [
          [`${pf('Root')}: it is the root port`, 'Root ports forward.'],
          [`${pf('Desg')}: it is an edge port`, 'Edge ports forward.'],
          ['None; all ports forward', 'One port shows BLK.'],
        ]),
        'RSTP keeps one loop-free tree: root and designated ports forward, alternate and backup ports discard. If the root port fails, the alternate takes over in about a second.', { exhibit });
    }
    if (ask === 'isroot') {
      return Q('g-stp', 'NA', 't2-stp', `Is ${name} the root bridge for VLAN ${vlan}?`,
        choices(isRoot ? ['Yes: the Root ID matches its own Bridge ID', 'And IOS says "This bridge is the root".'] : ['No: the Root ID shows a different bridge', 'Its own Bridge ID differs.'],
          isRoot ? [['No: it has no root port', 'That is exactly because it is root.'], ['No: its priority is too high', 'It has the lowest bridge ID.'], ['Cannot tell from this output', 'The output says so directly.']]
            : [['Yes: it has a root port', 'Only non-root switches have a root port.'], ['Yes: its priority is the default', 'Default priority does not make it root.'], ['Cannot tell from this output', 'Compare Root ID with Bridge ID.']]),
        'Compare the two ID blocks. When they match, the switch is root, has no root port, and every port is designated. Root is the lowest priority, then the lowest MAC.', { exhibit });
    }
    return Q('g-stp', 'NA', 't2-stp', `What priority was configured on the root bridge for VLAN ${vlan}?`,
      choices([String(rootPri), `${rootPri + vlan} minus the VLAN ID ${vlan}.`], [[String(rootPri + vlan), 'That includes the system ID extension.'], ['32768', 'That is the default.'], [String(rootPri + 4096), 'Not shown.']]),
      'With PVST+ and Rapid PVST+, the advertised priority is the configured value (a multiple of 4096) plus the VLAN ID. root primary sets 24576, or 4096 below the current root.', { exhibit });
  },
};

// show etherchannel summary: is the bundle healthy, and if not, why?
export const ETHERCHANNEL = {
  id: 'g-etherchannel', domain: 'NA', branch: 't2-etherchannel',
  make(rnd) {
    const name = pick(rnd, ['SW1', 'DIST1', 'ACC1']);
    const grp = int(rnd, 1, 9);
    const [a, b] = sample(rnd, ['Gi0/1', 'Gi0/2', 'Gi0/3', 'Gi0/4', 'Gi0/23', 'Gi0/24'], 2).sort();
    const fault = pick(rnd, ['ok', 'passive', 'suspended', 'l3']);
    const chan = { ok: 'SU', passive: 'SD', suspended: 'SU', l3: 'RU' }[fault];
    const fa = { ok: 'P', passive: 'I', suspended: 'P', l3: 'P' }[fault];
    const fb = { ok: 'P', passive: 'I', suspended: 's', l3: 'P' }[fault];
    const text = [
      `${name}#show etherchannel summary | begin Group`,
      'Group  Port-channel  Protocol    Ports',
      '------+-------------+-----------+-----------------------------------------------',
      `${pad(grp, 7)}Po${grp}(${chan})         LACP      ${a}(${fa})    ${b}(${fb})`,
      ...(fault === 'passive' ? [`${name}#show run | include channel-group`, ` channel-group ${grp} mode passive`, ` channel-group ${grp} mode passive`, '(the neighbor is also set to passive)'] : []),
    ].join('\n');
    const exhibit = X(text, [`${name}#`, 'prompt'], [/show etherchannel summary \| begin Group|show run \| include channel-group/, 'cmd'], [`Po${grp}`, 'iface', 'Port-channel'],
      [/\((SU|RU)\)/, 'ok', 'In use'], ['(SD)', 'fail', 'Down'], [/\(P\)/, 'ok', 'Bundled'], [/\((I|s)\)/, 'fail', 'Not bundled'], [/Gi0\/\d+(?=\()/, 'iface'], [/mode passive/, 'fail', 'Passive']);
    const options = {
      ok: ['A healthy Layer 2 bundle with both members bundled', '(SU) and (P) on both members.'],
      passive: ['It is down because both ends use LACP passive, so neither starts negotiation', '(SD) with stand-alone members, passive on both ends.'],
      suspended: [`${b} is suspended because its settings do not match the other member`, '(s) on one member.'],
      l3: ['A healthy Layer 3 (routed) bundle', '(RU): R for Layer 3, U for in use.'],
    };
    return Q('g-etherchannel', 'NA', 't2-etherchannel', `What does this output say about Po${grp}?`,
      choices(options[fault], shuffle(rnd, Object.entries(options).filter(([k]) => k !== fault).map(([, [t]]) => [t, 'Check the flags: they say otherwise.']))),
      `Channel flags: S Layer 2, R Layer 3, U in use, D down. Member flags: P bundled, I stand-alone, s suspended, D down. ${options[fault][1]}`, { exhibit });
  },
};

export const SWITCHING_TEMPLATES = [VLAN_BRIEF, TRUNK, MAC_TABLE, STP, ETHERCHANNEL];

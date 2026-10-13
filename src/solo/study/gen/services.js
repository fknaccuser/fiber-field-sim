// Generated services and security questions: NAT translations, DHCP
// bindings, ACL first-match, port security and HSRP. Fresh addresses,
// ports, rules and faults each time.

import { Q } from '../bank/qb.js';
import { X, int, pick, shuffle, sample, macsOf, addHost, inPrefix, maskOf, wildcardOf, choices, pad } from './kit.js';

// show ip nat translations (PAT): who is behind which public socket?
export const NAT_TRANS = {
  id: 'g-nat', domain: 'IPS', branch: 't4-nat',
  make(rnd) {
    const name = pick(rnd, ['R1', 'EDGE1', 'BR1']);
    const pub = `203.0.113.${int(rnd, 2, 250)}`;
    const lan = `10.${int(rnd, 1, 250)}.${int(rnd, 0, 255)}`;
    const hosts = sample(rnd, Array.from({ length: 200 }, (_, i) => `${lan}.${i + 20}`), 3);
    const server = pick(rnd, ['93.184.216.34', '198.51.100.80', '192.0.2.44']);
    const ports = sample(rnd, [1024, 1025, 1026, 1027, 1030, 1041], 3);
    const src = sample(rnd, [49152, 50311, 51515, 53002, 55120, 60001], 3);
    const staticIn = `${lan}.${int(rnd, 5, 15)}`;
    const staticOut = `203.0.113.${int(rnd, 2, 250)}`;
    if (staticOut === pub) return NAT_TRANS.make(rnd);
    const rows = hosts.map((h, i) => ({ h, pub: `${pub}:${ports[i]}`, loc: `${h}:${src[i]}` }));
    const text = [
      `${name}#show ip nat translations`,
      'Pro Inside global        Inside local       Outside local      Outside global',
      `--- ${pad(staticOut, 21)}${pad(staticIn, 19)}---                ---`,
      ...rows.map(r => `tcp ${pad(r.pub, 21)}${pad(r.loc, 19)}${pad(`${server}:443`, 19)}${server}:443`),
    ].join('\n');
    const exhibit = X(text, [`${name}#`, 'prompt'], ['show ip nat translations', 'cmd'], [new RegExp(`${pub.replace(/\./g, '\\.')}(?=:)|${staticOut.replace(/\./g, '\\.')}`), 'ip', 'Inside global (public)'],
      [new RegExp(`${lan.replace(/\./g, '\\.')}\\.\\d+`), 'ip', 'Inside local (private)'], [new RegExp(server.replace(/\./g, '\\.')), 'hop', 'Outside host'], [/:\d+/, 'key', 'Port'], [/^---(?= )/m, 'state', 'Static entry']);
    const ask = pick(rnd, ['who', 'appears', 'static']);
    if (ask === 'who') {
      const r = pick(rnd, rows);
      return Q('g-nat', 'IPS', 't4-nat', `A reply arrives for ${r.pub}. Which inside host receives it?`,
        choices([r.loc, 'The inside local socket on that row.'], [...rows.filter(x => x !== r).map(x => [x.loc, 'That host owns a different public port.']), [`${server}:443`, 'That is the outside server.']]),
        'With PAT, every inside socket gets a unique port on the shared public address. Replies come back to that public port, and the router looks it up to restore the inside address and port.', { exhibit });
    }
    if (ask === 'appears') {
      const r = pick(rnd, rows);
      return Q('g-nat', 'IPS', 't4-nat', `To the server, what source address does ${r.h} appear to use?`,
        choices([pub, 'The inside global address.'], [[r.h, 'Private addresses never leave the router.'], [staticOut, 'That belongs to the static mapping.'], [server, 'That is the server itself.']]),
        'Inside local is the private address on the LAN; inside global is what the outside world sees. With PAT many inside hosts share one inside global address, told apart by port.', { exhibit });
    }
    return Q('g-nat', 'IPS', 't4-nat', 'Which line is a static NAT mapping?',
      choices([`${staticIn} to ${staticOut}`, 'No protocol and no ports: a permanent one-to-one entry.'], rows.map(r => [`${r.loc} to ${r.pub}`, 'A dynamic PAT entry with ports.'])),
      'Static entries exist before any traffic and show --- in the protocol and outside columns. They make an inside server reachable from outside. PAT entries appear per flow and time out.', { exhibit });
  },
};

const clientId = (mac) => {
  const hex = `01${mac.replace(/\./g, '')}`;
  return hex.match(/.{1,4}/g).join('.');
};

// show ip dhcp binding: which address did a client get?
export const DHCP_BIND = {
  id: 'g-dhcp-bind', domain: 'IPS', branch: 't4-dhcp-dns',
  make(rnd) {
    const name = pick(rnd, ['R1', 'BR1', 'SW1']);
    const net = `10.${int(rnd, 1, 250)}.${int(rnd, 0, 255)}`;
    const macs = macsOf(rnd, 3);
    const ips = sample(rnd, Array.from({ length: 200 }, (_, i) => `${net}.${i + 11}`), 3);
    const day = int(rnd, 14, 28);
    const rows = macs.map((m, i) => ({ mac: m, cid: clientId(m), ip: ips[i] }));
    const text = [
      `${name}#show ip dhcp binding`,
      'IP address      Client-ID/              Lease expiration        Type',
      '                Hardware address',
      ...rows.map((r, i) => `${pad(r.ip, 16)}${pad(r.cid, 24)}Oct ${day + i} 2026 0${int(rnd, 1, 9)}:${int(rnd, 10, 59)} PM    Automatic`),
    ].join('\n');
    const exhibit = X(text, [`${name}#`, 'prompt'], ['show ip dhcp binding', 'cmd'], [new RegExp(`${net.replace(/\./g, '\\.')}\\.\\d+`), 'ip', 'Leased address'], [/01[0-9a-f]{2}\.[0-9a-f]{4}\.[0-9a-f]{4}\.[0-9a-f]{2}/, 'mac', 'Client ID: 01 + MAC'], [/Oct \d+ 2026 \d\d:\d\d PM/, 'count', 'Lease expiry']);
    const r = pick(rnd, rows);
    return Q('g-dhcp-bind', 'IPS', 't4-dhcp-dns', `Which address did the DHCP server lease to the PC with MAC ${r.mac}?`,
      choices([r.ip, `Its client ID is 01 followed by ${r.mac}.`], [...rows.filter(x => x !== r).map(x => [x.ip, 'Leased to a different MAC.']), [`${net}.1`, 'That is normally the excluded gateway address.']]),
      'Ethernet clients identify themselves with a client ID of 01 (the hardware type) followed by their MAC, so drop the 01 and match the rest. A client missing from the list never completed DORA: check the VLAN, the helper address and the pool.', { exhibit });
  },
};

// ACLs: first match wins.
export const ACL_MATCH = {
  id: 'g-acl-match', domain: 'SECF', branch: 't5-acl',
  make(rnd) {
    const name = pick(rnd, ['R1', 'BR1']);
    const users = `10.${int(rnd, 1, 250)}.${int(rnd, 0, 254)}.0`;
    const server = `10.${int(rnd, 1, 250)}.${int(rnd, 0, 255)}.${int(rnd, 10, 250)}`;
    const len = pick(rnd, [24, 25, 26]);
    const svc = pick(rnd, [['22', 'ssh', 'SSH'], ['23', 'telnet', 'Telnet'], ['443', '443', 'HTTPS'], ['80', 'www', 'HTTP']]);
    const special = addHost(users, int(rnd, 2, 2 ** (32 - len) - 3));
    const rules = shuffle(rnd, [
      { kind: 'host', text: `permit tcp host ${special} host ${server} eq ${svc[1]}`, test: (s, p) => s === special && p === svc[0], act: 'permit' },
      { kind: 'net', text: `deny tcp ${users} ${wildcardOf(len)} host ${server} eq ${svc[1]}`, test: (s, p) => inPrefix(s, users, len) && p === svc[0], act: 'deny' },
    ]);
    rules.push({ kind: 'any', text: 'permit ip any any', test: () => true, act: 'permit' });
    const lines = rules.map((r, i) => ({ ...r, seq: (i + 1) * 10 }));
    const src = pick(rnd, [special, addHost(users, 1), `172.${int(rnd, 16, 31)}.${int(rnd, 0, 255)}.${int(rnd, 1, 254)}`]);
    const port = rnd() < 0.8 ? svc[0] : '25';
    const hit = lines.find(l => l.test(src, port));
    const text = [
      `${name}#show access-lists`,
      'Extended IP access list FILTER-IN',
      ...lines.map(l => `    ${l.seq} ${l.text}`),
    ].join('\n');
    const exhibit = X(text, [`${name}#`, 'prompt'], ['show access-lists', 'cmd'], [/^ {4}\d0(?= )/m, 'key', 'Sequence number'], [/permit/, 'ok', 'Permit'], [/deny/, 'fail', 'Deny'],
      [new RegExp(`host (${special.replace(/\./g, '\\.')}|${server.replace(/\./g, '\\.')})`), 'ip'], [new RegExp(users.replace(/\./g, '\\.')), 'ip', 'Network'], [wildcardOf(len), 'mask', 'Wildcard'], [/eq \w+/, 'key', 'Port match']);
    const portName = port === '25' ? 'SMTP (TCP 25)' : `${svc[2]} (TCP ${svc[0]})`;
    const answer = `Line ${hit.seq}: ${hit.act === 'permit' ? 'permitted' : 'denied'}`;
    const wrongs = lines.filter(l => l !== hit).map(l => [`Line ${l.seq}: ${l.act === 'permit' ? 'permitted' : 'denied'}`, 'An earlier line matches first, or this one does not match.'])
      .concat([['No line matches: denied by the implicit deny', 'The final line matches everything.']]);
    return Q('g-acl-match', 'SECF', 't5-acl', `A packet from ${src} to ${server}, ${portName}, arrives inbound. Which line matches, and what happens?`,
      choices([answer, 'The first line that matches decides.'], shuffle(rnd, wrongs)),
      `ACLs are read top down and stop at the first match. ${users} ${wildcardOf(len)} covers ${users} to ${addHost(users, 2 ** (32 - len) - 1)} (a /${len}, mask ${maskOf(len)}). Here line ${hit.seq} is the first that matches ${src} with ${portName}, so the packet is ${hit.act === 'permit' ? 'permitted' : 'denied'}. Order specific lines before broad ones.`, { exhibit });
  },
};

// show port-security interface: what happened on this port?
export const PSEC = {
  id: 'g-psec', domain: 'SECF', branch: 't5-l2sec',
  make(rnd) {
    const name = pick(rnd, ['SW1', 'ACC1', 'ACC2']);
    const port = `Gi0/${int(rnd, 1, 24)}`;
    const fault = pick(rnd, ['shutdown', 'restrict', 'ok', 'protect']);
    const max = pick(rnd, [1, 2]);
    const [mac] = macsOf(rnd, 1);
    const vlan = pick(rnd, [10, 20, 30]);
    const count = fault === 'ok' || fault === 'protect' ? 0 : int(rnd, 1, 40);
    const status = fault === 'shutdown' ? 'Secure-shutdown' : 'Secure-up';
    const mode = { shutdown: 'Shutdown', restrict: 'Restrict', ok: 'Shutdown', protect: 'Protect' }[fault];
    const text = [
      `${name}#show port-security interface ${port}`,
      'Port Security              : Enabled',
      `Port Status                : ${status}`,
      `Violation Mode             : ${mode}`,
      `Maximum MAC Addresses      : ${max}`,
      `Total MAC Addresses        : ${max}`,
      `Last Source Address:Vlan   : ${mac}:${vlan}`,
      `Security Violation Count   : ${count}`,
    ].join('\n');
    const exhibit = X(text, [`${name}#`, 'prompt'], [`show port-security interface ${port}`, 'cmd'], [status, status === 'Secure-up' ? 'ok' : 'fail', 'Port status'], [`Violation Mode             : ${mode}`, 'key', 'Violation mode'],
      [`Maximum MAC Addresses      : ${max}`, 'key', 'Limit'], [mac, 'mac'], [new RegExp(`(?<=:)${vlan}$`, 'm'), 'vlan'], [`Security Violation Count   : ${count}`, count ? 'fail' : 'count', 'Violations']);
    const options = {
      shutdown: ['A violation err-disabled the port; remove the extra device, then shutdown and no shutdown', 'Secure-shutdown with violations.'],
      restrict: ['Extra devices are being dropped and logged while the port stays up', 'Restrict mode with violations counted.'],
      ok: ['Port security is working with no violations so far', 'Secure-up, count 0.'],
      protect: ['Extra devices would be dropped silently, so the violation count stays at 0 even if they exist', 'Protect mode never counts.'],
    };
    return Q('g-psec', 'SECF', 't5-l2sec', `What does this output tell you about ${port}?`,
      choices(options[fault], shuffle(rnd, Object.entries(options).filter(([k]) => k !== fault).map(([, [t]]) => [t, 'The status, mode and counter say otherwise.']))),
      `Violation modes: shutdown err-disables the port (default), restrict drops, logs and counts, protect drops silently. ${options[fault][1]} Port security needs the port in access (or trunk) mode first.`, { exhibit });
  },
};

// show standby brief: who forwards, and is there a backup?
export const HSRP = {
  id: 'g-hsrp', domain: 'IPC', branch: 't3-fhrp',
  make(rnd) {
    const name = pick(rnd, ['R1', 'R2', 'DIST1']);
    const net = `10.${int(rnd, 1, 250)}.${int(rnd, 0, 255)}`;
    const vip = `${net}.${pick(rnd, [1, 254])}`;
    const peer = `${net}.${int(rnd, 2, 5)}`;
    const grp = int(rnd, 1, 20);
    const fault = pick(rnd, ['active', 'standby', 'unknown']);
    const pri = fault === 'standby' ? pick(rnd, [90, 100]) : pick(rnd, [100, 110, 150]);
    const preempt = rnd() < 0.6 ? 'P' : ' ';
    const state = fault === 'standby' ? 'Standby' : 'Active';
    const active = fault === 'standby' ? peer : 'local';
    const standby = fault === 'standby' ? 'local' : fault === 'unknown' ? 'unknown' : peer;
    const text = [
      `${name}#show standby brief`,
      '                     P indicates configured to preempt.',
      'Interface   Grp  Pri P State   Active          Standby         Virtual IP',
      `Gi0/1       ${pad(grp, 5)}${pad(pri, 4)}${preempt} ${pad(state, 8)}${pad(active, 16)}${pad(standby, 16)}${vip}`,
    ].join('\n');
    const exhibit = X(text, [`${name}#`, 'prompt'], ['show standby brief', 'cmd'], [/^Gi0\/1/m, 'iface'], [new RegExp(`(?<=Gi0/1 +${grp} +)${pri}`), 'key', 'Priority'],
      [/(Active|Standby)(?= +(local|\d))/, 'state', 'This router\'s state'], ['unknown', 'fail', 'No standby heard'], [/local/, 'role', 'This router'], [new RegExp(peer.replace(/\./g, '\\.')), 'ip', 'Peer router'], [new RegExp(`${vip.replace(/\./g, '\\.')}$`), 'gw', 'Virtual IP (hosts\' gateway)']);
    const ask = pick(rnd, ['forwarder', 'gateway', 'health']);
    if (ask === 'gateway') {
      return Q('g-hsrp', 'IPC', 't3-fhrp', 'What default gateway should hosts on this VLAN use?',
        choices([vip, 'The virtual IP, shared by the group.'], [[peer, 'That is a physical router address; failover would break.'], [`${net}.0`, 'That is the network address.'], ['The active router\'s MAC address', 'Hosts configure an IP gateway.']]),
        'Hosts point at the virtual IP and ARP resolves it to the group\'s virtual MAC, which whichever router is active answers. Pointing hosts at a router\'s own address defeats the redundancy.', { exhibit });
    }
    if (ask === 'forwarder') {
      const right = fault === 'standby' ? `The peer, ${peer}` : `This router, ${name}`;
      return Q('g-hsrp', 'IPC', 't3-fhrp', `Which router is forwarding traffic sent to ${vip}?`,
        choices([right, 'The Active column names it ("local" means this router).'], [[fault === 'standby' ? `This router, ${name}` : `The peer, ${peer}`, 'That router is not active.'], ['Both routers, load-balanced', 'HSRP has one active router per group.'], ['Neither', 'One router is active.']]),
        'In HSRP one router per group is active and forwards for the virtual IP; the standby waits for hellos to stop (hold time 10 seconds by default) and takes over. GLBP is the Cisco protocol that load-balances.', { exhibit });
    }
    const health = {
      active: ['Redundant: this router is active and a standby is ready', 'Active with a named standby.'],
      standby: ['Redundant: this router is standby, ready to take over', 'Standby, with the peer active.'],
      unknown: ['Not redundant: no standby router is heard', 'Standby shows unknown.'],
    };
    return Q('g-hsrp', 'IPC', 't3-fhrp', 'Is this gateway redundant right now?',
      choices(health[fault], shuffle(rnd, Object.entries(health).filter(([k]) => k !== fault).map(([, [t]]) => [t, 'The State and Standby columns say otherwise.']))),
      `"unknown" in the Standby column means the partner's hellos are not arriving: it is down, in another VLAN, or using a different group number. ${health[fault][1]}`, { exhibit });
  },
};

export const SERVICES_TEMPLATES = [NAT_TRANS, DHCP_BIND, ACL_MATCH, PSEC, HSRP];

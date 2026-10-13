// Generated addressing questions: interface status, subnet math from an
// interface address, Windows ipconfig faults, and two ends of a link that
// may or may not share a subnet. Fresh numbers and a fresh fault each time.

import { Q } from '../bank/qb.js';
import { X, int, pick, shuffle, addHost, networkOf, broadcastOf, maskOf, hostsOf, choices, pad } from './kit.js';

const STATES = {
  up: ['up', 'up'],
  phys: ['down', 'down'],
  admin: ['administratively down', 'down'],
  l2: ['up', 'down'],
};

// show ip interface brief: which interface has which kind of problem?
export const IP_BRIEF = {
  id: 'g-ip-brief', domain: 'NF', branch: 't0-inspect',
  make(rnd) {
    const name = pick(rnd, ['R1', 'R2', 'BR1', 'HQ1']);
    const ask = pick(rnd, ['admin', 'phys', 'l2', 'up']);
    const others = shuffle(rnd, Object.keys(STATES).filter(k => k !== ask)).slice(0, 2);
    const kinds = shuffle(rnd, [ask, ...others, ask === 'up' ? 'phys' : 'up'].slice(0, 4));
    const names = ['GigabitEthernet0/0', 'GigabitEthernet0/1', 'GigabitEthernet0/2', 'Serial0/0/0'];
    const rows = kinds.map((k, i) => ({ iface: names[i], ip: `10.${int(rnd, 1, 250)}.${int(rnd, 0, 255)}.${int(rnd, 1, 254)}`, kind: k }));
    // Make the asked state unique in the table.
    const target = rows.find(r => r.kind === ask);
    for (const r of rows) if (r !== target && r.kind === ask) r.kind = ask === 'up' ? 'phys' : 'up';
    const text = [
      `${name}#show ip interface brief`,
      'Interface              IP-Address      OK? Method Status                Protocol',
      ...rows.map(r => `${pad(r.iface, 23)}${pad(r.ip, 16)}YES manual ${pad(STATES[r.kind][0], 22)}${STATES[r.kind][1]}`),
    ].join('\n');
    const exhibit = X(text, [`${name}#`, 'prompt'], ['show ip interface brief', 'cmd'], [/^(GigabitEthernet0\/\d|Serial0\/0\/0)/m, 'iface'], [/\d+\.\d+\.\d+\.\d+/, 'ip'],
      ['administratively down', 'fail', 'Shut down in the config'], [/up {20}down/, 'fail', 'Layer 1 up, Layer 2 down'], [/down {18}down/, 'fail', 'Layer 1 down'], [/up {20}up/, 'ok', 'Up and up']);
    const prompts = {
      admin: ['Which interface was turned off in the configuration?', 'administratively down means shutdown is configured; no shutdown fixes it.'],
      phys: ['Which interface most likely has a cable or far-end problem?', 'down/down without "administratively" means no signal: unplugged, bad cable, or the far end is off.'],
      l2: ['Which interface has a working physical link but a failed data link layer?', 'up/down: the signal is there but the line protocol is not, often encapsulation, clocking or keepalives on serial links.'],
      up: ['Which interface is fully working?', 'up/up means both Layer 1 and Layer 2 are working.'],
    };
    const [prompt, whyRight] = prompts[ask];
    return Q('g-ip-brief', 'NF', 't0-inspect', prompt,
      choices([target.iface, whyRight], rows.filter(r => r !== target).map(r => [r.iface, `It shows ${STATES[r.kind].join('/')}.`])),
      `Read Status as Layer 1 and Protocol as Layer 2. up/up works, down/down is physical, up/down is a data link problem, and administratively down is a shutdown command. ${whyRight}`, { exhibit });
  },
};

// show interfaces: subnet math from the configured address.
export const IFACE_SUBNET = {
  id: 'g-iface-subnet', domain: 'NF', branch: 't1-ipv4',
  make(rnd) {
    const len = pick(rnd, [20, 21, 22, 23, 25, 26, 27, 28, 29, 30]);
    const ip = `${pick(rnd, [10, 172, 192])}.${int(rnd, 16, 31)}.${int(rnd, 0, 255)}.${int(rnd, 1, 254)}`;
    const net = networkOf(ip, len);
    const bc = broadcastOf(ip, len);
    if (ip === net || ip === bc) return IFACE_SUBNET.make(rnd);
    const first = addHost(net, 1);
    const lastHost = addHost(net, 2 ** (32 - len) - 2);
    const name = pick(rnd, ['R1', 'SW1', 'BR1']);
    const iface = pick(rnd, ['GigabitEthernet0/1', 'GigabitEthernet0/2', 'Vlan10']);
    const text = [`${name}#show interfaces ${iface} | include Internet`, `  Internet address is ${ip}/${len}`].join('\n');
    const exhibit = X(text, [`${name}#`, 'prompt'], [/show interfaces .* \| include Internet/, 'cmd'], [ip, 'ip', 'Interface address'], [`/${len}`, 'mask', 'Prefix length']);
    const ask = pick(rnd, ['network', 'broadcast', 'last', 'hosts', 'mask']);
    const blockWhy = `A /${len} is ${maskOf(len)}; the block runs ${net} to ${bc}.`;
    const nearby = (a, n) => addHost(a, n);
    const asks = {
      network: [`What is the network address of the subnet ${iface} is in?`, [net, 'The first address of the block.'], [[ip, 'That is the interface address.'], [networkOf(ip, len - 1), 'That uses a prefix one bit shorter.'], [networkOf(ip, Math.min(30, len + 1)), 'That uses a prefix one bit longer.'], [first, 'That is the first usable host.'], [bc, 'That is the broadcast address.']]],
      broadcast: [`What is the broadcast address of the subnet ${iface} is in?`, [bc, 'The last address of the block.'], [[lastHost, 'That is the last usable host.'], [net, 'That is the network address.'], [nearby(bc, 1), 'That is the next subnet\'s network address.'], [ip, 'That is the interface address.']]],
      last: [`What is the last usable host address in the subnet of ${iface}?`, [lastHost, 'One below the broadcast.'], [[bc, 'That is the broadcast address.'], [first, 'That is the first usable host.'], [nearby(bc, 1), 'That is outside the block.'], [net, 'That is the network address.']]],
      hosts: [`How many usable host addresses does the subnet of ${iface} have?`, [String(hostsOf(len)), `2 to the ${32 - len} minus 2.`], [[String(2 ** (32 - len)), 'That forgets the network and broadcast addresses.'], [String(hostsOf(Math.min(30, len + 1))), 'That is one prefix length longer.'], [String(hostsOf(Math.max(8, len - 1))), 'That is one prefix length shorter.']]],
      mask: [`What subnet mask matches the prefix on ${iface}?`, [maskOf(len), `/${len} written in dotted decimal.`], [[maskOf(Math.min(30, len + 1)), 'That is one bit longer.'], [maskOf(Math.max(8, len - 1)), 'That is one bit shorter.'], [`0.0.${len <= 24 ? 2 ** (24 - len) - 1 : 0}.${len <= 24 ? 255 : 2 ** (32 - len) - 1}`, 'That is the wildcard mask.']]],
    };
    const [prompt, right, wrongs] = asks[ask];
    return Q('g-iface-subnet', 'NF', 't1-ipv4', prompt, choices(right, shuffle(rnd, wrongs)),
      `${blockWhy} The network is ${net}, usable hosts are ${first} to ${lastHost} (${hostsOf(len)} of them), and the broadcast is ${bc}. Find the interesting octet, take the block size, and count in blocks.`, { exhibit });
  },
};

// Windows ipconfig: what is wrong with this host?
export const IPCONFIG = {
  id: 'g-ipconfig', domain: 'NF', branch: 't1-client',
  make(rnd) {
    const fault = pick(rnd, ['apipa', 'gateway', 'dns', 'ok']);
    const net = `192.168.${int(rnd, 1, 254)}.0`;
    const len = pick(rnd, [24, 24, 25, 26]);
    const host = addHost(net, int(rnd, 20, (2 ** (32 - len)) - 20));
    const gw = addHost(net, 1);
    let ip = host, mask = maskOf(len), gateway = gw, dns = `10.${int(rnd, 1, 250)}.${int(rnd, 0, 255)}.${int(rnd, 2, 250)}`;
    let scenario;
    if (fault === 'apipa') { ip = `169.254.${int(rnd, 1, 254)}.${int(rnd, 1, 254)}`; mask = '255.255.0.0'; gateway = ''; dns = ''; scenario = 'The user has no network access at all.'; }
    if (fault === 'gateway') {
      gateway = `192.168.${(Number(net.split('.')[2]) + int(rnd, 1, 5)) % 255}.1`;
      scenario = 'The user can reach printers on the same floor but nothing else.';
    }
    if (fault === 'dns') scenario = `The user can ping ${pick(rnd, ['8.8.8.8', '1.1.1.1', '9.9.9.9'])} but no website opens by name, and nslookup times out.`;
    if (fault === 'ok') scenario = 'The user says the network is slow, but everything loads.';
    const text = [
      'C:\\>ipconfig /all',
      'Ethernet adapter Ethernet0:',
      '   DHCP Enabled. . . . . . . . . . . : Yes',
      `   ${fault === 'apipa' ? 'Autoconfiguration IPv4 Address. .' : 'IPv4 Address. . . . . . . . . . .'} : ${ip}(Preferred)`,
      `   Subnet Mask . . . . . . . . . . . : ${mask}`,
      `   Default Gateway . . . . . . . . . : ${gateway}`,
      `   DNS Servers . . . . . . . . . . . : ${dns}`,
    ].join('\n');
    const marks = [['ipconfig /all', 'cmd'], [ip, fault === 'apipa' ? 'fail' : 'ip', fault === 'apipa' ? 'Self-assigned address' : 'IP address'], [mask, 'mask']];
    if (gateway) marks.push([gateway, fault === 'gateway' ? 'fail' : 'gw', fault === 'gateway' ? 'Gateway in another subnet' : 'Default gateway']);
    if (dns) marks.push([dns, fault === 'dns' ? 'fail' : 'dns', fault === 'dns' ? 'DNS server not answering' : 'DNS server']);
    const exhibit = X(text, ...marks);
    const options = {
      apipa: ['DHCP failed, so the PC gave itself an APIPA address', '169.254.x.x is self-assigned.'],
      gateway: ['The default gateway is not in the PC\'s subnet', `${gateway} is outside ${networkOf(host, len)}/${len}.`],
      dns: ['The DNS server is wrong or unreachable', 'IP connectivity works; name lookups do not.'],
      ok: ['Nothing in this configuration is wrong; look elsewhere', 'Address, mask, gateway and DNS are consistent.'],
    };
    return Q('g-ipconfig', 'NF', 't1-client', 'Based on this output, what is the problem?',
      choices(options[fault], shuffle(rnd, Object.entries(options).filter(([k]) => k !== fault).map(([, [t]]) => [t, 'The output does not show that.']))),
      `${options[fault][1]} Check in order: is the address self-assigned (DHCP), is the gateway inside the subnet the mask defines (off-subnet traffic), and does the DNS server answer (names). Each failure gives a different symptom.`, { exhibit, scenario });
  },
};

// Two ends of a link: will they talk?
export const LINK_PAIR = {
  id: 'g-link-pair', domain: 'NF', branch: 't1-ipv4',
  make(rnd) {
    const len = pick(rnd, [29, 30, 30, 28]);
    const block = 2 ** (32 - len);
    const base = `10.${int(rnd, 1, 250)}.${int(rnd, 0, 255)}.${block * int(rnd, 0, Math.floor(256 / block) - 2)}`;
    const fault = pick(rnd, ['ok', 'split', 'network', 'broadcast']);
    const a = addHost(base, 1);
    let b = addHost(base, 2);
    if (fault === 'split') b = addHost(base, block + 1 + int(rnd, 0, block - 3));
    if (fault === 'network') b = base;
    if (fault === 'broadcast') b = addHost(base, block - 1);
    const mask = maskOf(len);
    const text = [
      `R1(config-if)#ip address ${a} ${mask}`,
      `R2(config-if)#ip address ${b} ${mask}`,
    ].join('\n');
    const exhibit = X(text, [/R[12]\(config-if\)#/, 'prompt'], [a, 'ip', 'R1'], [b, fault === 'ok' ? 'ip' : 'fail', fault === 'ok' ? 'R2' : 'R2: the problem'], [/255\.255\.255\.\d+/, 'mask']);
    const options = {
      ok: ['They are in the same subnet and can communicate', `Both are usable hosts in ${base}/${len}.`],
      split: ['They are in different subnets', `${b} belongs to ${networkOf(b, len)}/${len}, not ${base}/${len}.`],
      network: ['R2 is using the subnet\'s network address, which IOS rejects', `${b} is the network address of ${base}/${len}.`],
      broadcast: ['R2 is using the subnet\'s broadcast address, which IOS rejects', `${b} is the broadcast address of ${base}/${len}.`],
    };
    return Q('g-link-pair', 'NF', 't1-ipv4', 'R1 and R2 are cabled together. Will they be able to ping each other with these addresses?',
      choices(options[fault], shuffle(rnd, Object.entries(options).filter(([k]) => k !== fault).map(([, [t]]) => [t, 'Work out the block: that is not what the addresses show.']))),
      `A /${len} has blocks of ${block}: ${base} is the network, ${addHost(base, 1)} to ${addHost(base, block - 2)} are hosts and ${addHost(base, block - 1)} is the broadcast. ${options[fault][1]}`, { exhibit });
  },
};

export const ADDRESSING_TEMPLATES = [IP_BRIEF, IFACE_SUBNET, IPCONFIG, LINK_PAIR];

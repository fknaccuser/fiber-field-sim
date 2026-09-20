// Subnet drill: generated timed practice for the one exam skill that is
// speed rather than knowledge. A question bank cannot train it, because the
// answers get memorised. These are generated, so the only thing to learn is
// the method.
//
// Pure and DOM-free. Randomness goes through an injected source so tests can
// pin a sequence and the app can pass Math.random.

export const IP = {
  toInt: (ip) => ip.split('.').reduce((a, o) => a * 256 + Number(o), 0),
  toIp: (n) => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.'),
  mask: (cidr) => (cidr === 0 ? 0 : (0xFFFFFFFF << (32 - cidr)) >>> 0),
  maskDotted: (cidr) => IP.toIp(IP.mask(cidr)),
  cidrFromDotted: (m) => m.split('.').reduce((a, o) => a + ((Number(o) >>> 0).toString(2).match(/1/g) || []).length, 0),
  network: (ip, cidr) => IP.toIp((IP.toInt(ip) & IP.mask(cidr)) >>> 0),
  broadcast: (ip, cidr) => IP.toIp(((IP.toInt(ip) & IP.mask(cidr)) | (~IP.mask(cidr) >>> 0)) >>> 0),
  firstUsable: (ip, cidr) => (cidr >= 31 ? IP.network(ip, cidr) : IP.toIp((IP.toInt(IP.network(ip, cidr)) + 1) >>> 0)),
  lastUsable: (ip, cidr) => (cidr >= 31 ? IP.broadcast(ip, cidr) : IP.toIp((IP.toInt(IP.broadcast(ip, cidr)) - 1) >>> 0)),
  usableHosts: (cidr) => (cidr >= 31 ? (cidr === 31 ? 2 : 1) : Math.pow(2, 32 - cidr) - 2),
  // Size of the step in whichever octet the mask is cutting, which is the
  // number a tech actually counts in.
  blockSize: (cidr) => Math.pow(2, (8 - (cidr % 8)) % 8 || 8),
  sameSubnet: (a, b, cidr) => IP.network(a, cidr) === IP.network(b, cidr),
};


// Binary form of the mask, octet by octet. The warm tier shows it, because
// seeing where the mask cuts is what makes block size stop being magic.
export function maskBinary(cidr) {
  return IP.maskDotted(cidr).split('.')
    .map(o => Number(o).toString(2).padStart(8, '0'))
    .join('.');
}

// Which octet the mask cuts in, 1-indexed. A mask landing exactly on a
// boundary is treated as cutting the octet before it.
export function cuttingOctet(cidr) {
  return cidr % 8 === 0 ? Math.max(1, cidr / 8) : Math.floor(cidr / 8) + 1;
}


// The first few subnet boundaries inside a single octet. An octet only holds
// values 0 to 255, so the list stops there rather than running past it.
function subnetStarts(block) {
  const all = [];
  for (let v = 0; v < 256; v += block) all.push(v);
  if (all.length <= 4) return all.join(', ');
  return `${all.slice(0, 4).join(', ')} and so on, up to ${all[all.length - 1]}`;
}

// The worked arithmetic behind an answer, as lines. Shown on the warm tier
// always, and on a miss at any tier, because a miss is the teaching moment.
function workFor(kind, { cidr, ip, net, from }) {
  const aligned = cidr % 8 === 0;
  const octet = cuttingOctet(cidr);
  const block = IP.blockSize(cidr);
  const hostBits = 32 - cidr;
  switch (kind) {
    case 'hosts':
      return [
        `/${cidr} means ${cidr} network bits, so ${hostBits} host bits are left.`,
        `mask  ${IP.maskDotted(cidr)}`,
        `bits  ${maskBinary(cidr)}`,
        `2^${hostBits} = ${Math.pow(2, hostBits)} addresses in the block.`,
        `Subtract the network address and the broadcast address: ${Math.pow(2, hostBits)} - 2 = ${IP.usableHosts(cidr)}.`,
      ];
    case 'mask':
      return [
        `Write ${cidr} one-bits from the left, then fill the rest with zeros.`,
        `bits  ${maskBinary(cidr)}`,
        `Each octet converts on its own: ${IP.maskDotted(cidr).split('.').map((o, i) => `${maskBinary(cidr).split('.')[i]} = ${o}`).join(', ')}.`,
      ];
    case 'cidr':
      return [
        `CIDR is a count of the one-bits in the mask.`,
        `bits  ${maskBinary(cidr)}`,
        `${IP.maskDotted(cidr).split('.').map((o, i) => `${o} contributes ${(maskBinary(cidr).split('.')[i].match(/1/g) || []).length}`).join(', ')}.`,
        `Total ${cidr}, written /${cidr}.`,
      ];
    case 'network': {
      if (aligned) {
        return [
          `/${cidr} ends exactly on an octet boundary, so no arithmetic is needed.`,
          `Keep the first ${cidr / 8} octet${cidr / 8 === 1 ? '' : 's'} of ${ip} and zero the rest.`,
          `Network ${net}.`,
        ];
      }
      const value = Number(ip.split('.')[octet - 1]);
      return [
        `mask  ${IP.maskDotted(cidr)}`,
        `The mask cuts octet ${octet}, leaving a block size of ${block} there.`,
        `Subnets in that octet start at ${subnetStarts(block)}.`,
        `Octet ${octet} of ${ip} is ${value}. The largest multiple of ${block} at or below ${value} is ${Math.floor(value / block) * block}.`,
        `Network ${net}.`,
      ];
    }
    case 'broadcast':
      return [
        `Find the network first: ${net}.`,
        aligned
          ? `/${cidr} is octet-aligned, so every host octet becomes 255.`
          : `Block size is ${block} in octet ${octet}, so the next subnet starts ${block} higher.`,
        `The broadcast is the address one below the next subnet.`,
        `Broadcast ${IP.broadcast(ip, cidr)}.`,
      ];
    case 'first':
      return [
        `Find the network first: ${net}.`,
        `The network address itself cannot be assigned to a host.`,
        `First usable is network plus one: ${IP.firstUsable(ip, cidr)}.`,
      ];
    case 'last':
      return [
        `Find the broadcast first: ${IP.broadcast(ip, cidr)}.`,
        `The broadcast address cannot be assigned to a host.`,
        `Last usable is broadcast minus one: ${IP.lastUsable(ip, cidr)}.`,
      ];
    case 'subnets':
      return [
        `Going from /${from} to /${cidr} borrows ${cidr - from} bit${cidr - from === 1 ? '' : 's'} from the host portion.`,
        `Each borrowed bit doubles the number of subnets.`,
        `2^${cidr - from} = ${Math.pow(2, cidr - from)} subnets.`,
        `Count subnets with the bits you borrowed, and hosts with the bits you left.`,
      ];
    default:
      return [
        `Apply the same mask to both addresses and compare the results.`,
        `mask  ${IP.maskDotted(cidr)}`,
      ];
  }
}

export const TIERS = [
  { id: 'warm', label: 'Warm', seconds: 40, teach: true, cidrs: [8, 16, 24, 25, 26, 28], kinds: ['hosts', 'mask', 'network'] },
  { id: 'field', label: 'Field', seconds: 25, teach: false, cidrs: [17, 18, 19, 20, 21, 22, 23, 25, 26, 27, 28, 29, 30], kinds: ['hosts', 'mask', 'cidr', 'network', 'broadcast', 'first', 'last', 'subnets'] },
  { id: 'exam', label: 'Exam', seconds: 14, teach: false, cidrs: [12, 13, 14, 17, 18, 19, 20, 21, 22, 23, 25, 26, 27, 28, 29, 30], kinds: ['hosts', 'cidr', 'network', 'broadcast', 'first', 'last', 'subnets', 'same'] },
];

export const tierById = (id) => TIERS.find(t => t.id === id) ?? TIERS[0];

const pick = (list, rnd) => list[Math.floor(rnd() * list.length)];

function randomIp(rnd) {
  const which = Math.floor(rnd() * 3);
  const oct = () => Math.floor(rnd() * 256);
  const host = () => 1 + Math.floor(rnd() * 254);
  if (which === 0) return `10.${oct()}.${oct()}.${host()}`;
  if (which === 1) return `172.${16 + Math.floor(rnd() * 16)}.${oct()}.${host()}`;
  return `192.168.${oct()}.${host()}`;
}

// Returns { kind, prompt, answer, rule }. The rule is what the trainee gets
// on a miss: the method that reaches the answer, rather than the answer.
export function generate(tierId, rnd = Math.random) {
  const tier = tierById(tierId);
  const kind = pick(tier.kinds, rnd);
  const cidr = pick(tier.cidrs, rnd);
  const ip = randomIp(rnd);
  const net = IP.network(ip, cidr);

  switch (kind) {
    case 'hosts':
      return { kind, cidr, prompt: `How many usable host addresses in a /${cidr}?`, answer: String(IP.usableHosts(cidr)),
        rule: `2^(32-${cidr}) = ${Math.pow(2, 32 - cidr)} addresses, minus network and broadcast.`,
        work: workFor(kind, { cidr }) };
    case 'mask':
      return { kind, cidr, prompt: `What is /${cidr} as a dotted decimal mask?`, answer: IP.maskDotted(cidr),
        rule: `${cidr} one-bits from the left, zeros for the rest.`,
        work: workFor(kind, { cidr }) };
    case 'cidr':
      return { kind, cidr, prompt: `What is ${IP.maskDotted(cidr)} in CIDR notation?`, answer: `/${cidr}`,
        rule: `Count the one-bits: ${cidr}.`,
        work: workFor(kind, { cidr }) };
    case 'network':
      return { kind, cidr, ip, prompt: `What network does ${ip}/${cidr} belong to?`, answer: net,
        rule: `Block size ${IP.blockSize(cidr)} in the octet the mask cuts, so the block starts at ${net}.`,
        work: workFor(kind, { cidr, ip, net }) };
    case 'broadcast':
      return { kind, cidr, ip, prompt: `What is the broadcast address of ${ip}/${cidr}?`, answer: IP.broadcast(ip, cidr),
        rule: `One below the next subnet. Network ${net}, block size ${IP.blockSize(cidr)}.`,
        work: workFor(kind, { cidr, ip, net }) };
    case 'first':
      return { kind, cidr, ip, prompt: `What is the first usable address in ${ip}/${cidr}?`, answer: IP.firstUsable(ip, cidr),
        rule: `Network ${net}, plus one.`,
        work: workFor(kind, { cidr, ip, net }) };
    case 'last':
      return { kind, cidr, ip, prompt: `What is the last usable address in ${ip}/${cidr}?`, answer: IP.lastUsable(ip, cidr),
        rule: `Broadcast ${IP.broadcast(ip, cidr)}, minus one.`,
        work: workFor(kind, { cidr, ip, net }) };
    case 'subnets': {
      const from = Math.max(8, cidr - (2 + Math.floor(rnd() * 3)));
      return { kind, cidr, from, prompt: `How many /${cidr} subnets fit inside a /${from}?`, answer: String(Math.pow(2, cidr - from)),
        rule: `${cidr - from} borrowed bits, so 2^${cidr - from}.`,
        work: workFor(kind, { cidr, from }) };
    }
    default: {
      const inSubnet = rnd() < 0.5;
      const other = inSubnet
        ? IP.toIp((IP.toInt(net) + 1 + Math.floor(rnd() * Math.max(1, IP.usableHosts(cidr)))) >>> 0)
        : randomIp(rnd);
      const yes = IP.sameSubnet(ip, other, cidr);
      return { kind: 'same', cidr, ip, prompt: `Are ${ip} and ${other} in the same /${cidr}? (yes or no)`,
        answer: yes ? 'yes' : 'no',
        rule: `${ip} sits in ${net}. ${other} sits in ${IP.network(other, cidr)}.`,
        work: [...workFor('same', { cidr }), `${ip} masks to ${net}.`, `${other} masks to ${IP.network(other, cidr)}.`, yes ? 'Same network, so yes.' : 'Different networks, so no.'] };
    }
  }
}

const normalise = (v) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, '').replace(/,/g, '').replace(/^\/+/, '/');

// Accepts any form a tech would reasonably type: "24" for "/24", "y" for yes,
// "1,022" with a separator. Everything else is wrong, including near misses.
export function isCorrect(given, answer) {
  const g = normalise(given);
  const a = normalise(answer);
  if (!g) return false;
  if (g === a) return true;
  if (a.startsWith('/') && g === a.slice(1)) return true;
  if (a === 'yes' && (g === 'y' || g === 'true')) return true;
  if (a === 'no' && (g === 'n' || g === 'false')) return true;
  return false;
}

// Session scoring kept here so it is testable rather than living in the view.
export function emptySession(tierId = 'warm') {
  return { tierId, asked: 0, correct: 0, streak: 0, best: 0, times: [] };
}

export function record(session, { correct, seconds, timedOut }) {
  const next = { ...session, asked: session.asked + 1, times: [...session.times] };
  if (correct && !timedOut) {
    next.correct += 1;
    next.streak += 1;
    next.best = Math.max(next.best, next.streak);
    next.times.push(seconds);
  } else {
    next.streak = 0;
  }
  return next;
}

export function averageSeconds(session) {
  if (!session.times.length) return null;
  return session.times.reduce((a, b) => a + b, 0) / session.times.length;
}

// Warm is the teaching tier, so it shows the arithmetic whether or not the
// answer was right. Faster tiers show it only after a miss.
export function shouldShowWork(tierId, wasCorrect) {
  return tierById(tierId).teach === true || !wasCorrect;
}

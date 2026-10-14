// IPv6 arithmetic for the labs. Addresses are 128-bit BigInts inside,
// colon-hex text at the edges, written the way RFC 5952 says: lowercase,
// leading zeros dropped, the longest run of zero groups as "::".

const ALL = (1n << 128n) - 1n;

export function parse6(text) {
  const t = String(text ?? '').trim().toLowerCase();
  if (!/^[0-9a-f:]+$/.test(t) || t.split('::').length > 2) return null;
  const [head, tail] = t.includes('::') ? t.split('::') : [t, null];
  const hs = head ? head.split(':') : [];
  const ts = tail ? tail.split(':') : [];
  if ([...hs, ...ts].some(g => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  const fill = tail === null ? 0 : 8 - hs.length - ts.length;
  if (tail === null ? hs.length !== 8 : fill < 1) return null;
  const groups = [...hs, ...Array(fill).fill('0'), ...ts];
  return groups.reduce((n, g) => (n << 16n) | BigInt(parseInt(g, 16)), 0n);
}

export function format6(n, upper = false) {
  const groups = Array.from({ length: 8 }, (_, k) => Number((n >> BigInt(112 - 16 * k)) & 0xffffn));
  let best = { at: -1, len: 0 };
  for (let i = 0; i < 8;) {
    if (groups[i] !== 0) { i += 1; continue; }
    let j = i;
    while (j < 8 && groups[j] === 0) j += 1;
    if (j - i > best.len && j - i > 1) best = { at: i, len: j - i };
    i = j;
  }
  const hex = groups.map(g => g.toString(16));
  let out;
  if (best.at < 0) out = hex.join(':');
  else out = `${hex.slice(0, best.at).join(':')}::${hex.slice(best.at + best.len).join(':')}`;
  return upper ? out.toUpperCase() : out;
}

// "2001:db8::1/64" -> { addr, len } or null.
export function parsePrefix6(text) {
  const m = /^([0-9a-fA-F:]+)\/(\d{1,3})$/.exec(String(text ?? '').trim());
  if (!m) return null;
  const addr = parse6(m[1]);
  const len = Number(m[2]);
  if (addr === null || len > 128) return null;
  return { addr, len };
}

export const mask6 = (len) => (len === 0 ? 0n : (ALL << BigInt(128 - len)) & ALL);
export const net6 = (addr, len) => addr & mask6(len);
export const inPrefix6 = (addr, net, len) => net6(addr, len) === net6(net, len);

// The interface ID IOS and SLAAC build from a MAC: flip the U/L bit, put
// FFFE in the middle.
export function eui64(mac) {
  const hex = String(mac).replace(/[^0-9a-f]/gi, '').toLowerCase();
  const b = hex.match(/../g).map(x => parseInt(x, 16));
  b[0] ^= 0x02;
  const bytes = [b[0], b[1], b[2], 0xff, 0xfe, b[3], b[4], b[5]];
  return bytes.reduce((n, x) => (n << 8n) | BigInt(x), 0n);
}

export const LINK_LOCAL = parse6('fe80::');
export const linkLocalOf = (mac) => LINK_LOCAL | eui64(mac);
export const isLinkLocal = (a) => net6(a, 10) === LINK_LOCAL;

export function kind6(a) {
  if (a === 0n) return 'unspecified';
  if (a === 1n) return 'loopback';
  if (isLinkLocal(a)) return 'link-local';
  if (net6(a, 8) === parse6('ff00::')) return 'multicast';
  if (net6(a, 7) === parse6('fc00::')) return 'unique local';
  if (net6(a, 3) === parse6('2000::')) return 'global unicast';
  return 'other';
}

// The solicited-node multicast group for an address: ff02::1:ffXX:XXXX.
export const solicited = (a) => parse6('ff02::1:ff00:0') | (a & 0xffffffn);

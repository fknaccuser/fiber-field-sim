// IPv4 arithmetic for the labs. Addresses are unsigned 32-bit integers inside,
// dotted quads at the edges.

export function parseIp(text) {
  const parts = String(text ?? '').trim().split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const v = Number(p);
    if (v > 255) return null;
    n = n * 256 + v;
  }
  return n >>> 0;
}

export function formatIp(n) {
  return [24, 16, 8, 0].map(s => (n >>> s) & 255).join('.');
}

export const isIp = (text) => parseIp(text) !== null;

export function maskToLen(mask) {
  const n = typeof mask === 'number' ? mask : parseIp(mask);
  if (n === null) return null;
  let len = 0;
  for (let bit = 31; bit >= 0; bit -= 1) {
    if ((n >>> bit) & 1) len += 1;
    else break;
  }
  // A mask has to be a solid run of ones.
  return ((lenToMask(len) >>> 0) === (n >>> 0)) ? len : null;
}

export function lenToMask(len) {
  return len === 0 ? 0 : (0xffffffff << (32 - len)) >>> 0;
}

export const isMask = (text) => maskToLen(text) !== null;

export function network(ip, len) {
  return (ip & lenToMask(len)) >>> 0;
}

export function inSubnet(ip, net, len) {
  return network(ip, len) === network(net, len);
}

// An OSPF network statement matches when the address agrees with it on every
// bit the wildcard leaves at zero.
export function wildcardMatch(ip, stmtIp, wildcard) {
  const care = (~wildcard) >>> 0;
  return ((ip & care) >>> 0) === ((stmtIp & care) >>> 0);
}

export function classfulLen(ip) {
  const first = ip >>> 24;
  if (first < 128) return 8;
  if (first < 192) return 16;
  return 24;
}

export const prefixText = (net, len) => `${formatIp(net)}/${len}`;

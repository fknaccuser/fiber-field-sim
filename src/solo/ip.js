// IPv4 parsing and subnet arithmetic (ENGINE_RULES.md "Files and exports"). Pure.

export function parseIPv4(text) {
  if (typeof text !== 'string') return null;
  const parts = text.split('.');
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet < 0 || octet > 255) return null;
    value = value * 256 + octet;
  }
  return value >>> 0;
}

function toBinaryString(value) {
  return (value >>> 0).toString(2).padStart(32, '0');
}

export function prefixFromMask(text) {
  const value = parseIPv4(text);
  if (value === null) return null;
  const bits = toBinaryString(value);
  if (!/^1*0*$/.test(bits)) return null;
  const firstZero = bits.indexOf('0');
  return firstZero === -1 ? 32 : firstZero;
}

function maskFromPrefix(prefix) {
  if (prefix <= 0) return 0;
  if (prefix >= 32) return 0xffffffff >>> 0;
  return (0xffffffff << (32 - prefix)) >>> 0;
}

export function inSubnet(ip, network, prefix) {
  const ipValue = parseIPv4(ip);
  const networkValue = parseIPv4(network);
  if (ipValue === null || networkValue === null) return false;
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return false;
  const mask = maskFromPrefix(prefix);
  return (ipValue & mask) >>> 0 === (networkValue & mask) >>> 0;
}

// The kit for generated console questions: a seeded random source, IPv4
// arithmetic, and small builders for interfaces, MACs and choices.
//
// Pure and DOM-free. The same seed always builds the same question, so a
// test can sweep hundreds of seeds and a bug report can name one.

import { markRanges } from '../exhibit.js';

export function rngOf(seed) {
  let a = (Number(seed) >>> 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const int = (rnd, lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
export const pick = (rnd, list) => list[Math.floor(rnd() * list.length)];
export function shuffle(rnd, list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
// n distinct picks from a list.
export const sample = (rnd, list, n) => shuffle(rnd, list).slice(0, n);

// ---------- IPv4 ----------
export const toInt = (ip) => ip.split('.').reduce((n, o) => (n * 256) + Number(o), 0) >>> 0;
export const toIp = (n) => [24, 16, 8, 0].map(s => (n >>> s) & 255).join('.');
export const maskInt = (len) => (len === 0 ? 0 : (0xffffffff << (32 - len)) >>> 0);
export const maskOf = (len) => toIp(maskInt(len));
export const wildcardOf = (len) => toIp(~maskInt(len) >>> 0);
export const networkOf = (ip, len) => toIp((toInt(ip) & maskInt(len)) >>> 0);
export const broadcastOf = (ip, len) => toIp((toInt(networkOf(ip, len)) | (~maskInt(len) >>> 0)) >>> 0);
export const inPrefix = (ip, net, len) => ((toInt(ip) & maskInt(len)) >>> 0) === toInt(networkOf(net, len));
export const hostsOf = (len) => (len >= 31 ? (len === 31 ? 2 : 1) : (2 ** (32 - len)) - 2);
export const addHost = (net, n) => toIp((toInt(net) + n) >>> 0);

// A random private /16 to work inside, so every question has fresh numbers.
export function privateBase(rnd) {
  const kind = int(rnd, 0, 2);
  if (kind === 0) return `10.${int(rnd, 1, 254)}.0.0`;
  if (kind === 1) return `172.${int(rnd, 16, 31)}.0.0`;
  return `192.168.${int(rnd, 0, 255)}.0`;
}

// A random subnet of the given length inside a /16 (or /24 for 192.168).
export function subnetIn(rnd, base, len) {
  const baseLen = base.startsWith('192.168.') ? 24 : 16;
  const span = 2 ** (32 - baseLen);
  const block = 2 ** (32 - len);
  const slots = Math.max(1, Math.floor(span / block));
  return addHost(base, int(rnd, 0, slots - 1) * block);
}

// ---------- names ----------
const MAC_HEX = '0123456789abcdef';
export function macOf(rnd) {
  const quad = () => Array.from({ length: 4 }, () => MAC_HEX[int(rnd, 0, 15)]).join('');
  return `${pick(rnd, ['0050', '00a0', '0019', '5c5a', 'a4b1', '7c21'])}.${quad()}.${quad()}`;
}
export function macsOf(rnd, n) {
  const seen = new Set();
  const out = [];
  while (out.length < n) { const m = macOf(rnd); if (!seen.has(m)) { seen.add(m); out.push(m); } }
  return out;
}
// Column padding that always leaves at least one space, as IOS does when
// a value overflows its column.
export const pad = (s, n) => (String(s).length >= n ? `${s} ` : String(s).padEnd(n, ' '));
export const lpad = (s, n) => String(s).padStart(n, ' ');
export const routerName = (rnd) => pick(rnd, ['R1', 'R2', 'R3', 'EDGE1', 'BR1', 'HQ1']);
export const switchName = (rnd) => pick(rnd, ['SW1', 'SW2', 'ACC1', 'ACC2', 'DIST1']);

// choices(rnd, right, wrongs): a correct answer and up to three distinct
// wrong ones, each [text, why]. Duplicates of the right answer are dropped,
// so a generated question never offers the same text twice.
export function choices(right, wrongs, n = 4) {
  const seen = new Set([right[0]]);
  const out = [[right[0], true, right[1]]];
  for (const [text, why] of wrongs) {
    if (out.length >= n) break;
    if (seen.has(text)) continue;
    seen.add(text);
    out.push([text, false, why]);
  }
  return out;
}

// X for generated exhibits: like the bank's X, but a mark whose needle is
// absent from this particular build is dropped, since generated output
// only contains some of the states a template knows how to paint.
export function X(text, ...marks) {
  const clean = text.replace(/^\n/, '').replace(/\n\s*$/, '');
  const present = marks.filter(m => markRanges({ text: clean, marks: [m] }).missing.length === 0);
  return { text: clean, marks: present };
}

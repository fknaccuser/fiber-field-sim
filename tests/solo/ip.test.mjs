import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIPv4, prefixFromMask, inSubnet } from '../../src/solo/ip.js';

test('parseIPv4 parses a valid dotted-decimal address', () => {
  assert.equal(parseIPv4('10.42.10.130'), (10 << 24 | 42 << 16 | 10 << 8 | 130) >>> 0);
  assert.equal(parseIPv4('0.0.0.0'), 0);
  assert.equal(parseIPv4('255.255.255.255'), 0xffffffff);
});

test('parseIPv4 rejects octets outside 0-255', () => {
  assert.equal(parseIPv4('10.42.10.256'), null);
  assert.equal(parseIPv4('999.1.1.1'), null);
});

test('parseIPv4 rejects nonnumeric tokens and the wrong number of parts', () => {
  assert.equal(parseIPv4('10.42.10.abc'), null);
  assert.equal(parseIPv4('10.42.10'), null);
  assert.equal(parseIPv4('10.42.10.130.1'), null);
  assert.equal(parseIPv4(''), null);
  assert.equal(parseIPv4(null), null);
});

test('prefixFromMask converts a contiguous mask (255.255.254.0 gives 23)', () => {
  assert.equal(prefixFromMask('255.255.254.0'), 23);
  assert.equal(prefixFromMask('255.255.255.0'), 24);
  assert.equal(prefixFromMask('255.255.255.255'), 32);
  assert.equal(prefixFromMask('0.0.0.0'), 0);
});

test('prefixFromMask rejects a noncontiguous mask (255.0.255.0 is invalid)', () => {
  assert.equal(prefixFromMask('255.0.255.0'), null);
  assert.equal(prefixFromMask('not-a-mask'), null);
});

test('inSubnet: 10.42.10.130 belongs to 10.42.10.0/24; .20.20 does not', () => {
  assert.equal(inSubnet('10.42.10.130', '10.42.10.0', 24), true);
  assert.equal(inSubnet('10.42.20.20', '10.42.10.0', 24), false);
});

test('inSubnet returns false for malformed input rather than throwing', () => {
  assert.equal(inSubnet('nope', '10.42.10.0', 24), false);
  assert.equal(inSubnet('10.42.10.130', '10.42.10.0', 99), false);
});

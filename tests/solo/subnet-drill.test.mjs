import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IP, TIERS, generate, isCorrect, emptySession, record, averageSeconds } from '../../src/solo/drills/subnet.js';

// Arithmetic written independently of IP, so a bug in the helpers cannot
// validate itself.
const toInt = ip => ip.split('.').reduce((a, o) => a * 256 + Number(o), 0);
const toIp = n => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
const mask = c => (c === 0 ? 0 : (0xFFFFFFFF << (32 - c)) >>> 0);

// A deterministic source so a failure can be reproduced exactly.
function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

test('the address helpers agree with independent arithmetic', () => {
  for (const [ip, cidr] of [['10.42.45.14', 20], ['192.168.1.200', 26], ['172.20.7.9', 30], ['10.0.0.1', 8]]) {
    assert.equal(IP.network(ip, cidr), toIp((toInt(ip) & mask(cidr)) >>> 0), `network ${ip}/${cidr}`);
    assert.equal(IP.broadcast(ip, cidr), toIp(((toInt(ip) & mask(cidr)) | (~mask(cidr) >>> 0)) >>> 0), `broadcast ${ip}/${cidr}`);
    assert.equal(IP.usableHosts(cidr), Math.pow(2, 32 - cidr) - 2, `hosts /${cidr}`);
    assert.equal(IP.cidrFromDotted(IP.maskDotted(cidr)), cidr, `round trip /${cidr}`);
  }
  assert.equal(IP.network('172.16.45.14', 20), '172.16.32.0');
  assert.equal(IP.broadcast('10.10.10.1', 29), '10.10.10.7');
  assert.equal(IP.firstUsable('10.10.10.128', 25), '10.10.10.129');
  assert.equal(IP.lastUsable('10.10.10.128', 25), '10.10.10.254');
  assert.equal(IP.blockSize(20), 16);
  assert.equal(IP.blockSize(26), 64);
});

test('a /31 has two usable addresses and a /32 has one', () => {
  assert.equal(IP.usableHosts(31), 2);
  assert.equal(IP.usableHosts(32), 1);
});

test('every generated question is answerable and correct, across many draws', () => {
  const kinds = new Set();
  for (const tier of TIERS) {
    const rnd = seeded(20260920);
    for (let n = 0; n < 600; n += 1) {
      const q = generate(tier.id, rnd);
      kinds.add(q.kind);
      assert.ok(q.prompt, 'no prompt');
      assert.ok(q.rule, `no rule for ${q.kind}`);
      assert.ok(q.answer !== undefined && q.answer !== '', `no answer for ${q.kind}`);
      assert.equal(isCorrect(q.answer, q.answer), true, `${q.kind} rejects its own answer`);

      const cidr = Number((q.prompt.match(/\/(\d+)/) || [])[1]);
      const ip = (q.prompt.match(/(\d+\.\d+\.\d+\.\d+)/) || [])[1];
      if (q.kind === 'hosts') assert.equal(q.answer, String(Math.pow(2, 32 - cidr) - 2), q.prompt);
      if (q.kind === 'mask') assert.equal(q.answer, toIp(mask(cidr)), q.prompt);
      if (q.kind === 'network') assert.equal(q.answer, toIp((toInt(ip) & mask(cidr)) >>> 0), q.prompt);
      if (q.kind === 'broadcast') assert.equal(q.answer, toIp(((toInt(ip) & mask(cidr)) | (~mask(cidr) >>> 0)) >>> 0), q.prompt);
      if (q.kind === 'first') assert.equal(q.answer, toIp(((toInt(ip) & mask(cidr)) + 1) >>> 0), q.prompt);
      if (q.kind === 'last') assert.equal(q.answer, toIp((((toInt(ip) & mask(cidr)) | (~mask(cidr) >>> 0)) - 1) >>> 0), q.prompt);
      if (q.kind === 'subnets') {
        const [, small, big] = q.prompt.match(/\/(\d+) subnets fit inside a \/(\d+)/).map(Number);
        assert.ok(small > big, `asks for /${small} inside /${big}`);
        assert.equal(q.answer, String(Math.pow(2, small - big)), q.prompt);
      }
      if (q.kind === 'same') {
        const both = q.prompt.match(/(\d+\.\d+\.\d+\.\d+)/g);
        const want = (toInt(both[0]) & mask(cidr)) === (toInt(both[1]) & mask(cidr)) ? 'yes' : 'no';
        assert.equal(q.answer, want, q.prompt);
      }
    }
  }
  assert.deepEqual([...kinds].sort(), ['broadcast', 'cidr', 'first', 'hosts', 'last', 'mask', 'network', 'same', 'subnets']);
});

test('the same seed produces the same question', () => {
  const a = generate('exam', seeded(7));
  const b = generate('exam', seeded(7));
  assert.deepEqual(a, b);
});

test('a tier only draws the masks and kinds it declares', () => {
  const rnd = seeded(99);
  const warm = TIERS[0];
  for (let n = 0; n < 300; n += 1) {
    const q = generate('warm', rnd);
    assert.ok(warm.kinds.includes(q.kind), `warm drew ${q.kind}`);
    assert.ok(warm.cidrs.includes(q.cidr), `warm drew /${q.cidr}`);
  }
});

test('answers are accepted in the forms a tech would type', () => {
  for (const [typed, answer] of [['24', '/24'], ['/24', '/24'], [' 255.255.255.0 ', '255.255.255.0'], ['1,022', '1022'], ['y', 'yes'], ['N', 'no'], ['YES', 'yes']]) {
    assert.equal(isCorrect(typed, answer), true, `"${typed}" should pass for ${answer}`);
  }
  for (const [typed, answer] of [['25', '/24'], ['', '/24'], ['10.0.0.2', '10.0.0.1'], ['maybe', 'yes'], ['no', 'yes']]) {
    assert.equal(isCorrect(typed, answer), false, `"${typed}" should fail for ${answer}`);
  }
});

test('a streak survives correct answers and dies on a miss or a timeout', () => {
  let s = emptySession('field');
  s = record(s, { correct: true, seconds: 4 });
  s = record(s, { correct: true, seconds: 6 });
  assert.equal(s.streak, 2);
  assert.equal(s.best, 2);
  s = record(s, { correct: false, seconds: 9 });
  assert.equal(s.streak, 0);
  assert.equal(s.best, 2, 'best is a high-water mark');
  assert.equal(s.correct, 2);
  assert.equal(s.asked, 3);
  assert.equal(averageSeconds(s), 5, 'only correct answers count toward the average');

  const timedOut = record(emptySession(), { correct: true, seconds: 40, timedOut: true });
  assert.equal(timedOut.streak, 0, 'running out of time breaks the streak');
  assert.equal(timedOut.correct, 0);
  assert.equal(averageSeconds(timedOut), null);
});

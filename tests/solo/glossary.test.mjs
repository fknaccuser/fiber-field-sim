import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GLOSSARY, searchGlossary } from '../../src/solo/glossary/terms.js';
import { findTerms } from '../../src/solo/glossary/link.js';
import { branchById } from '../../src/solo/tree/ccna.js';

test('every term has both layers, a home branch and a unique id', () => {
  assert.ok(GLOSSARY.length >= 200, `only ${GLOSSARY.length} terms`);
  const ids = new Set();
  for (const t of GLOSSARY) {
    assert.ok(!ids.has(t.id), `duplicate ${t.id}`);
    ids.add(t.id);
    assert.ok(branchById(t.branch), `${t.term}: unknown branch ${t.branch}`);
    assert.ok(t.plain.length >= 20 && t.exam.length >= 20, `${t.term} is thin`);
    assert.ok(!/—/.test(t.plain + t.exam), `${t.term} uses an em dash`);
  }
});

test('every branch of the map has at least one term', () => {
  const covered = new Set(GLOSSARY.map(t => t.branch));
  for (const id of ['t0-nav', 't1-ipv4', 't2-stp', 't3-ospf', 't4-nat', 't5-acl', 't6-json']) assert.ok(covered.has(id), id);
});

test('no alias or name points at two different terms', () => {
  const owner = new Map();
  for (const t of GLOSSARY) for (const n of [t.term, ...t.aka]) {
    const k = n.toLowerCase();
    assert.ok(!owner.has(k) || owner.get(k) === t.id, `"${n}" belongs to ${owner.get(k)} and ${t.id}`);
    owner.set(k, t.id);
  }
});

const ids = (text) => findTerms(text).map(h => h.id);

test('terms are found whole, longest first, and acronyms keep their case', () => {
  assert.deepEqual(ids('Set the native VLAN on the trunk.'), ['native-vlan', 'trunk']);
  assert.deepEqual(ids('The 802.1Q tag'), ['802-1q']);
  assert.deepEqual(ids('OSPF elects a DR'), ['ospf', 'dr']);
  assert.deepEqual(ids('the dr said ospf'), [], 'lowercase acronyms are other words');
  assert.deepEqual(ids('subtrunked'), [], 'no matches inside words');
  assert.deepEqual(ids('a floating static route'), ['floating-static-route']);
});

test('common words are not linked, but stay searchable', () => {
  assert.deepEqual(ids('the router and the switch'), []);
  assert.equal(searchGlossary('router')[0].term, 'Router');
});

test('search ranks an exact name first and finds aliases', () => {
  assert.equal(searchGlossary('trunk')[0].term, 'Trunk');
  assert.equal(searchGlossary('dot1q')[0].term, '802.1Q');
  assert.equal(searchGlossary('PAT')[0].term, 'PAT');
  assert.ok(searchGlossary('').length === GLOSSARY.length);
});

test('a lone capital letter at the start of a term keeps its case', () => {
  assert.deepEqual(ids('leaves a record of who logged in'), []);
  assert.deepEqual(ids('The A record points the name at the server'), ['a-record']);
});

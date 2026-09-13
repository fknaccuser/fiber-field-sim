// Fault injection and deterministic case generation (SCENARIOS.md's eight
// fault recipes and tier4 pairs, DATA_CONTRACTS.md's Attempt creation). Pure:
// no DOM, no fetch, no Date.now, no direct randomness — nextCase's seed text
// comes only from the caller-supplied candidateSeed().

import { parameters } from './seed.js';
import { createHealthyLayout, deriveRequirements } from './layouts.js';
import { cloneNetwork } from './model.js';

const LABELS = ['plain', 'customer', 'site'];
const MAX_SEED_LENGTH = 24;

// SCENARIOS.md "Eight fault recipes". Each mutates a clone of the healthy
// network directly; x/host are the case's own generated values so addresses
// stay inside the case's actual /24s.
const RECIPES = {
  P1: (network) => {
    const link = network.links.find((l) => l.aPortId === 'PC1:eth0' || l.bPortId === 'PC1:eth0');
    link.connected = false;
  },
  P2: (network) => {
    network.ports.find((p) => p.id === 'SW1:Gi0/1').adminUp = false;
  },
  I1: (network, x, host) => {
    network.devices.find((d) => d.id === 'PC1').ip = `10.${x}.99.${host}`;
  },
  I2: (network, x) => {
    network.devices.find((d) => d.id === 'PC1').gateway = `10.${x}.10.254`;
  },
  V1: (network) => {
    network.ports.find((p) => p.id === 'SW1:Gi0/1').accessVlan = 20;
  },
  V2: (network) => {
    const port = network.ports.find((p) => p.id === 'SW1:Gi0/24');
    port.allowedVlans = port.allowedVlans.filter((vlan) => vlan !== 10);
  },
  D1: (network, x) => {
    network.devices.find((d) => d.id === 'PC1').dns = `10.${x}.30.54`;
  },
  D2: (network, x) => {
    network.dnsRecords.find((r) => r.name === 'portal.northline.test').address = `10.${x}.30.80`;
  },
};

export function applyRecipe(network, recipeId, x, host) {
  const mutate = RECIPES[recipeId];
  if (!mutate) throw new Error(`Unknown recipe "${recipeId}".`);
  const next = cloneNetwork(network);
  mutate(next, x, host);
  return next;
}

// generateCase(caseCode) -> initial Attempt, or throws a user-presentable
// validation error (ENGINE_RULES.md). id/startedAt are left null: app.js
// fills them in before saving (DATA_CONTRACTS.md "Attempt creation").
export function generateCase(caseCode) {
  let params;
  try {
    params = parameters(caseCode);
  } catch {
    throw new Error(`"${caseCode}" is not a valid case code.`);
  }

  const label = LABELS[params.label] ?? 'plain';
  const healthyNetwork = createHealthyLayout(params.layout, params.x, params.host, label);
  const requirements = deriveRequirements(healthyNetwork);

  let faultedNetwork = cloneNetwork(healthyNetwork);
  for (const recipeId of params.recipes) {
    faultedNetwork = applyRecipe(faultedNetwork, recipeId, params.x, params.host);
  }

  return {
    schema: 1,
    id: null,
    caseCode,
    tier: params.tier,
    detail: params.detail,
    initialNetwork: faultedNetwork,
    network: cloneNetwork(faultedNetwork),
    recipeIds: params.recipes,
    targetClientId: 'PC1',
    protectedClientId: 'PC2',
    targetName: 'portal.northline.test',
    startedAt: null,
    elapsedMs: 0,
    assisted: false,
    events: [],
    selectedFindingIds: [],
    completionNote: null,
    status: 'active',
    mode: 'repair',
    requirements,
    hintLevels: {},
    compactedEventCount: 0,
  };
}

// Fingerprint is JSON of [layout,tier,x,host,recipes,label,detail], in that
// order (SCENARIOS.md "Fixed generator details").
export function fingerprintFor(params) {
  return JSON.stringify([params.layout, params.tier, params.x, params.host, params.recipes, params.label, params.detail]);
}

export function fingerprintForCode(caseCode) {
  return fingerprintFor(parameters(caseCode));
}

// nextCase(settings, recentFingerprints) -> case-code string.
// settings: {layout, tier, family, candidateSeed}. candidateSeed is the
// caller-injected seed-text supplier (SCENARIOS.md: "nextCase receives a
// caller-provided candidateSeed callback and does not call randomness
// itself"). Rejects a fingerprint seen in the last 20 runs, up to 50 base
// tries, then up to 50 suffixed tries (truncating the base to leave room for
// the numeric suffix within the 24-character code-seed limit); after 100
// total failed candidates, throws a visible "Choose a seed manually" error.
export function nextCase(settings, recentFingerprints) {
  const { layout, tier, family, candidateSeed } = settings;
  const recent = new Set(recentFingerprints ?? []);

  function tryCandidate(seedText) {
    const code = `TF1-${layout}-${tier}-${family}-${seedText}`;
    let params;
    try {
      params = parameters(code);
    } catch {
      return null;
    }
    if (recent.has(fingerprintFor(params))) return null;
    return code;
  }

  for (let i = 0; i < 50; i += 1) {
    const code = tryCandidate(String(candidateSeed()));
    if (code) return code;
  }

  for (let i = 0; i < 50; i += 1) {
    const suffix = String(i + 1);
    const base = String(candidateSeed()).slice(0, Math.max(1, MAX_SEED_LENGTH - suffix.length));
    const code = tryCandidate(base + suffix);
    if (code) return code;
  }

  throw new Error('Choose a seed manually.');
}

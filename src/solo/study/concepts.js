// Concepts are the join between the two halves of the app. Each one names a
// thing a technician has to understand, the Field faults and jobs that make
// you use it, and the study material that teaches it.
//
// Without this table the farm and the Field are two apps sharing a repo.
// With it, finishing a ticket can point at exactly what to drill, and a
// concept you have used under pressure can be told apart from one you have
// only read about.
//
// Every id here is checked against the real bank, deck, recipes and jobs in
// tests, so a renamed question fails the suite rather than a link silently
// pointing at nothing.

export const CONCEPTS = [
  {
    id: 'physical-link',
    label: 'Physical links and cabling',
    recipes: ['P1'],
    jobs: ['job-port-up'],
    questions: ['nf-012', 'nf-016', 'nf-018', 'nf-010'],
    cards: ['cmd-int-brief', 'cmd-cdp'],
    drill: null,
  },
  {
    id: 'port-state',
    label: 'Port state and err-disable',
    recipes: ['P2'],
    jobs: ['job-port-up'],
    questions: ['na-016', 'na-004', 'na-013'],
    cards: ['cmd-int-brief', 'cmd-portfast', 'cmd-bpduguard'],
    drill: null,
  },
  {
    id: 'subnet-boundaries',
    label: 'Subnet boundaries and addressing',
    recipes: ['I1'],
    jobs: ['job-workstation'],
    questions: ['nf-001', 'nf-005', 'nf-006', 'nf-014', 'nf-015', 'nf-004'],
    cards: ['num-link-local'],
    drill: 'field',
  },
  {
    id: 'default-gateway',
    label: 'Default gateways and first-hop routing',
    recipes: ['I2'],
    jobs: ['job-workstation'],
    questions: ['ipc-007', 'ipc-018', 'ipc-022', 'ipc-003', 'ipc-005'],
    cards: ['cmd-default', 'cmd-route'],
    drill: null,
  },
  {
    id: 'access-vlan',
    label: 'Access ports and VLAN assignment',
    recipes: ['V1'],
    jobs: ['job-access-vlan'],
    questions: ['na-005', 'na-006', 'na-007', 'na-011', 'nf-003'],
    cards: ['cmd-access', 'cmd-access-vlan', 'cmd-vlan-brief'],
    drill: null,
  },
  {
    id: 'trunk-allowed',
    label: 'Trunks and allowed VLAN lists',
    recipes: ['V2'],
    jobs: ['job-trunk'],
    questions: ['na-001', 'na-014', 'na-018', 'na-005'],
    cards: ['cmd-trunk', 'cmd-trunk-mode', 'cmd-trunk-allowed', 'cmd-native'],
    drill: null,
  },
  {
    id: 'dns-resolver',
    label: 'DNS client configuration',
    recipes: ['D1'],
    jobs: ['job-resolver', 'job-workstation'],
    questions: ['ips-013', 'ips-014', 'ips-015', 'ips-020', 'ips-009'],
    cards: ['cmd-ipconfig-all', 'cmd-nslookup', 'cmd-name-server', 'port-dns'],
    drill: null,
  },
  {
    id: 'dns-records',
    label: 'DNS records',
    recipes: ['D2'],
    jobs: [],
    questions: ['ips-019', 'ips-004', 'ips-016', 'ips-017', 'ips-018'],
    cards: ['cmd-nslookup', 'port-dns'],
    drill: null,
  },
];

export const conceptById = (id) => CONCEPTS.find(c => c.id === id) ?? null;

export function conceptsForRecipes(recipeIds) {
  const wanted = new Set(recipeIds ?? []);
  return CONCEPTS.filter(c => c.recipes.some(r => wanted.has(r)));
}

export function conceptsForJob(jobId) {
  return CONCEPTS.filter(c => c.jobs.includes(jobId));
}

// Concepts whose study material is too thin to teach from. Reported rather
// than hidden, so the gap stays visible until someone writes the questions.
export function thinConcepts(minimum = 3) {
  return CONCEPTS
    .map(c => ({ id: c.id, label: c.label, material: c.questions.length + c.cards.length }))
    .filter(c => c.material < minimum);
}

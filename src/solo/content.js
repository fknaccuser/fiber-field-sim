// Authored copy: hint text, customer facts, harmless tier3 details. SCENARIOS.md
// "Hint copy" gives nudge/clue/step verbatim (rendering X/addresses from the
// actual generated case where noted); debrief text is a later task's addition
// (SCENARIOS.md gives no debrief copy, and S12.md's own scope names only
// three hint levels). Customer-fact answers are original authored content
// (SCENARIOS.md/MASTER_DESIGN.md require this, not a generated conversation).

export const HINTS = {
  P1: {
    nudge: "Check the endpoint's local connection.",
    clue: 'The cable is not seated at both ends.',
    step: "Reconnect the client's cable to its assigned access port.",
  },
  P2: {
    nudge: 'Compare physical connection and port status.',
    clue: 'The cable is connected, but the switch reports administrative shutdown.',
    step: "Enable the client's access port.",
  },
  I1: {
    nudge: 'Compare the client address with the gateway network.',
    clue: 'The client is in a different subnet from its intended LAN.',
    step: (x) => `Assign an unused 10.${x}.10 host address with /24.`,
  },
  I2: {
    nudge: 'Check where off-subnet traffic is sent.',
    clue: 'No device owns the configured default-gateway address.',
    step: 'Use the router target-LAN address as the gateway.',
  },
  V1: {
    nudge: "Check the switch's logical port assignment.",
    clue: "The endpoint port belongs to the other department's VLAN.",
    step: 'Set that access port to VLAN 10.',
  },
  V2: {
    nudge: 'Inspect the interswitch path.',
    clue: 'The trunk does not carry the target VLAN.',
    step: 'Allow VLAN 10 while retaining VLAN 20.',
  },
  D1: {
    nudge: 'Compare a direct IP test with a name test.',
    clue: 'The configured resolver is not reachable as a DNS service.',
    step: (x) => `Set the client resolver to the service server's address (10.${x}.30.53).`,
  },
  D2: {
    nudge: 'Inspect the address returned by name resolution.',
    clue: 'The name resolves to a host that does not provide the portal.',
    step: 'Correct the portal record to the portal server address.',
  },
};

export function renderHintText(hintText, x) {
  return typeof hintText === 'function' ? hintText(x) : hintText;
}

// Three suggested customer questions (S12.md); DATA_CONTRACTS.md's worked
// example for TF1-HM-1-P-START ("began this morning; customer workstation
// affected; no confirmed configuration change") matches this exact triplet.
// MASTER_DESIGN.md §6 paraphrases the same idea slightly differently ("What
// stopped working? When did it start? Did anything change?") — a small,
// non-blocking wording inconsistency between the two docs; following the
// worked example and this task's own explicit list.
export const CUSTOMER_QUESTIONS = [
  { id: 'whenItBegan', prompt: 'When did it start?' },
  { id: 'whoIsAffected', prompt: 'Who is affected?' },
  { id: 'whatChanged', prompt: 'Did anything change?' },
];

export const CUSTOMER_FACTS = {
  P1: {
    whenItBegan: 'This morning, right when they got in.',
    whoIsAffected: 'Just this workstation.',
    whatChanged: 'Nothing on purpose; someone may have bumped the cable during cleaning.',
  },
  P2: {
    whenItBegan: 'This morning.',
    whoIsAffected: 'Just this workstation.',
    whatChanged: 'No known change from the user.',
  },
  I1: {
    whenItBegan: 'This morning.',
    whoIsAffected: 'Just this workstation.',
    whatChanged: 'IT mentioned reimaging this machine recently.',
  },
  I2: {
    whenItBegan: 'This morning.',
    whoIsAffected: 'Just this workstation.',
    whatChanged: 'The workstation was moved to a different desk last week.',
  },
  V1: {
    whenItBegan: 'This morning.',
    whoIsAffected: 'Just this workstation.',
    whatChanged: 'The switch port was touched during a cable cleanup.',
  },
  V2: {
    whenItBegan: 'This morning.',
    whoIsAffected: 'This workstation and everyone on the same department switch.',
    whatChanged: 'A technician was working on the interswitch link yesterday.',
  },
  D1: {
    whenItBegan: 'This morning.',
    whoIsAffected: 'Just this workstation.',
    whatChanged: 'DNS settings were adjusted during a routine check.',
  },
  D2: {
    whenItBegan: 'This morning.',
    whoIsAffected: 'Both workstations.',
    whatChanged: 'The DNS server had a record updated recently.',
  },
};

// One harmless report detail, tier3 only (SCENARIOS.md), indexed by the
// case's own generated `detail` value. Never changes actual network state.
export const HARMLESS_DETAILS = [
  'The customer mentioned they just replaced their monitor.',
  "There's an unrelated printer problem on another shared device.",
  'The customer noted an old, already-resolved ISP outage notice.',
];

// MASTER_DESIGN.md §5 "Time" column. null means untimed.
export const TIER_GOAL_MS = {
  1: null,
  2: 15 * 60 * 1000,
  3: 12 * 60 * 1000,
  4: 20 * 60 * 1000,
};

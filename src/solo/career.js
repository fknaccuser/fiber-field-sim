// The guided career campaign: a themed junior-tech → engineer progression
// layered on top of the existing mission engine. Pure (no DOM, no storage) —
// it derives everything from the stored profile's completedRuns, exactly like
// progress.js, so career progress can never diverge from real completions.
//
// Each assignment maps to a mission start the app already knows how to run:
//   start.kind === 'code'   → attemptStartMission(state, start.code)
//   start.kind === 'family' → startNewVariation(state, 'BR', tier, family)
// and is considered complete when a matching repair run exists.

export const RANKS = [
  {
    id: 'junior',
    title: 'Junior Technician',
    badge: 'JR',
    tagline: 'Week one on the help desk',
    blurb:
      'You’ve been hired at Northline. Tickets land in your queue one at a time — a single thing is broken, and your mentor walks you through every step. Learn to read the symptom before you touch anything.',
    assignments: [
      {
        id: 'j-port',
        title: 'Ticket #1 — “I can’t get on the network”',
        story: 'A workstation went dark after a desk move. Nothing fancy — follow the cable and get the user back online.',
        skill: 'Physical link & switch ports',
        family: 'P',
        tier: 1,
        start: { kind: 'code', code: 'TF1-HM-1-P-START' },
      },
      {
        id: 'j-ip',
        title: 'Ticket #2 — “Wrong neighborhood”',
        story: 'A PC has an address, but it can’t reach anything. Compare what it’s configured with against where it’s supposed to live.',
        skill: 'IPv4 addressing & gateways',
        family: 'I',
        tier: 1,
        start: { kind: 'family', family: 'I', tier: 1 },
      },
      {
        id: 'j-vlan',
        title: 'Ticket #3 — “Two desks, two worlds”',
        story: 'One desk works, the one next to it doesn’t. The difference is which VLAN the switch port is handing out.',
        skill: 'VLANs & access ports',
        family: 'V',
        tier: 1,
        start: { kind: 'family', family: 'V', tier: 1 },
      },
      {
        id: 'j-dns',
        title: 'Ticket #4 — “The name won’t open”',
        story: 'The portal loads by IP but not by name. Learn to tell a naming problem from a connectivity problem.',
        skill: 'DNS name resolution',
        family: 'D',
        tier: 1,
        start: { kind: 'family', family: 'D', tier: 1 },
      },
    ],
  },
  {
    id: 'tech',
    title: 'Network Technician',
    badge: 'NT',
    tagline: 'Off the training wheels',
    blurb:
      'You’ve earned the console. Faults are subtler now and the hand-holding steps back — you’re expected to inspect, form a theory, and prove it with a test before you change anything.',
    assignments: [
      {
        id: 't-link',
        title: 'Escalation — intermittent floor',
        story: 'A whole floor reports flaky access. Work it at tier 2, where the obvious first guess is often wrong.',
        skill: 'Link & port faults, tier 2',
        family: 'P',
        tier: 2,
        start: { kind: 'family', family: 'P', tier: 2 },
      },
      {
        id: 't-routing',
        title: 'Escalation — “some sites, not others”',
        story: 'Addressing looks fine at a glance. Dig into the subnet and gateway details to find why traffic stalls.',
        skill: 'Addressing faults, tier 2',
        family: 'I',
        tier: 2,
        start: { kind: 'family', family: 'I', tier: 2 },
      },
      {
        id: 't-mixed',
        title: 'On-call — two things at once',
        story: 'A mixed-cause outage: more than one fault is stacked. Isolate them one at a time.',
        skill: 'Mixed causes',
        family: 'M',
        tier: 2,
        start: { kind: 'family', family: 'M', tier: 2 },
      },
    ],
  },
  {
    id: 'engineer',
    title: 'Network Engineer',
    badge: 'NE',
    tagline: 'You own the network',
    blurb:
      'Console-only, multi-fault, high tier. You’re trusted to work without prompts — and to design, not just repair. Clear the hardest cases, then take the studio and build a network from scratch.',
    assignments: [
      {
        id: 'e-hard',
        title: 'Major incident — tier 3',
        story: 'A serious outage with layered causes. No guidance rails. Prove every fix with evidence.',
        skill: 'Complex multi-cause repair',
        family: 'M',
        tier: 3,
        start: { kind: 'family', family: 'M', tier: 3 },
      },
      {
        id: 'e-design',
        title: 'Capstone — design the campus',
        story: 'Open the Network Studio and build a connected, working topology of your own.',
        skill: 'Network design',
        family: null,
        tier: null,
        start: { kind: 'design' },
      },
    ],
  },
];

// A repair run satisfies an assignment when its family matches (mixed 'M' for
// mixed assignments) at or above the assignment's tier. Higher-tier work on the
// same skill counts too. Design assignments complete when any design/configure
// run has been completed.
function assignmentComplete(profile, assignment) {
  const runs = profile?.completedRuns ?? [];
  if (assignment.start.kind === 'design') {
    return runs.some((run) => run.mode === 'configure' || run.caseCode?.includes('DESIGN'));
  }
  return runs.some(
    (run) =>
      run.mode === 'repair' &&
      (run.tier ?? 0) >= assignment.tier &&
      (assignment.family === 'M' ? run.family === 'M' : run.family === assignment.family),
  );
}

// Derives the full campaign state from the profile: every assignment tagged
// done | active | locked (strictly sequential — the next ticket unlocks when
// the previous is complete), plus per-rank rollups and overall totals.
export function careerProgress(profile) {
  const flat = RANKS.flatMap((rank) => rank.assignments.map((a) => ({ ...a, rankId: rank.id })));
  const doneFlags = flat.map((a) => assignmentComplete(profile, a));
  let activeIndex = doneFlags.indexOf(false);
  const allComplete = activeIndex === -1;
  if (allComplete) activeIndex = flat.length;

  const statusFor = (i) => (doneFlags[i] ? 'done' : i === activeIndex ? 'active' : 'locked');
  const tagged = flat.map((a, i) => ({ ...a, status: statusFor(i) }));

  const ranks = RANKS.map((rank) => {
    const items = tagged.filter((a) => a.rankId === rank.id);
    return {
      ...rank,
      items,
      complete: items.every((a) => a.status === 'done'),
      unlocked: items.some((a) => a.status !== 'locked'),
      doneCount: items.filter((a) => a.status === 'done').length,
    };
  });

  const activeAssignment = allComplete ? null : tagged[activeIndex];
  return {
    ranks,
    activeAssignment,
    currentRankId: activeAssignment?.rankId ?? RANKS[RANKS.length - 1].id,
    completedCount: doneFlags.filter(Boolean).length,
    total: flat.length,
    allComplete,
  };
}

// Look up an assignment by id (for launching from the view).
export function assignmentById(id) {
  for (const rank of RANKS) {
    const found = rank.assignments.find((a) => a.id === id);
    if (found) return found;
  }
  return null;
}

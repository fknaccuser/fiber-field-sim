/**
 * The day talking back. A real outage is not a quiet lab: customers keep calling, a senior
 * tech wants to know what you are seeing, and at the higher grades an executive wants a
 * status while you are still holding a meter.
 *
 * Seeded from the run, so a replay reproduces the same day with the same interruptions at
 * the same moments. Nothing here can leak the answer: a reply option is only offered when
 * the action log already contains the observation it claims, so you cannot tell anyone
 * something you have not actually seen.
 */
import { createRng, deriveSeed } from '../world';
import type { WorldState } from '../world';
import { ROLE_POLICY, type Role } from './roles';


export type CommsKind = 'customer-call' | 'text' | 'phone-call' | 'email' | 'field-note';
export type CommsFrom = 'customer' | 'senior' | 'manager' | 'tech' | 'exec' | 'personal';

/** What a reply may claim. Each is checked against the log before the option is shown. */
export type ClaimKey = 'none' | 'saw-los' | 'metered' | 'ruled-out-drop' | 'on-site' | 'shot-otdr';

export interface CommsReply {
  id: string;
  text: string;
  requires: ClaimKey;
  /** Seconds this reply costs — a considered answer takes longer than a brush-off. */
  seconds: number;
}

export interface CommsEvent {
  id: string;
  atSimSeconds: number;
  kind: CommsKind;
  from: CommsFrom;
  fromName: string;
  subject: string;
  body: string;
  /** Blocking events must be dealt with; only the senior grades get them. */
  blocking: boolean;
  replies: CommsReply[];
}

const STATUS_REPLIES: CommsReply[] = [
  { id: 'los', text: 'Confirmed loss of signal on the PON — the ONTs are dark, not offline.', requires: 'saw-los', seconds: 45 },
  { id: 'metered', text: 'I have light readings now; I am working out where it stops.', requires: 'metered', seconds: 45 },
  { id: 'otdr', text: 'I have a trace. I can put a distance on the event.', requires: 'shot-otdr', seconds: 50 },
  { id: 'drop', text: 'Drop is clean — whatever it is, it is upstream of the customer.', requires: 'ruled-out-drop', seconds: 45 },
  { id: 'nothing', text: 'Still isolating. Nothing solid to give you yet.', requires: 'none', seconds: 25 },
];

interface Template {
  kind: CommsKind;
  from: CommsFrom;
  fromName: string;
  subject: string;
  body: string;
  blocking?: boolean;
  replies?: CommsReply[];
  /** Lowest comms intensity that sees this at all. */
  minIntensity: number;
}

const TEMPLATES: Template[] = [
  {
    kind: 'text', from: 'senior', fromName: 'Ramos (Senior Tech)', subject: 'what are you seeing?',
    body: 'saw the ticket come through. what are you seeing out there?', minIntensity: 1, replies: STATUS_REPLIES,
  },
  {
    kind: 'text', from: 'senior', fromName: 'Ramos (Senior Tech)', subject: 'paperwork',
    body: 'if it smells like a splice, pull the sheet before you cut anything. that closure has been touched twice this year.', minIntensity: 1,
    replies: [{ id: 'ack', text: 'Copy. Pulling records now.', requires: 'none', seconds: 20 }],
  },
  {
    kind: 'text', from: 'manager', fromName: 'Delgado (Ops Manager)', subject: 'ETA?',
    body: 'customer escalated to the account team. i need an ETA i can give them.', minIntensity: 2, blocking: true, replies: STATUS_REPLIES,
  },
  {
    kind: 'phone-call', from: 'exec', fromName: 'CTO office', subject: 'status on the outage',
    body: 'What is the holdup? I have people asking me and I have nothing to tell them.', minIntensity: 3, blocking: true, replies: STATUS_REPLIES,
  },
  {
    kind: 'phone-call', from: 'tech', fromName: 'Whitaker (L1, Zone 4)', subject: 'need a hand',
    body: 'Got an ONT showing green PON but the customer has no service. Where would you look first?', minIntensity: 3, blocking: true,
    replies: [
      { id: 'l2', text: 'Light is fine, so it is above the fibre. Get them to check addressing on the laptop.', requires: 'none', seconds: 70 },
      { id: 'olt', text: 'Ask the OLT what it thinks of that ONT before you touch anything.', requires: 'none', seconds: 60 },
      { id: 'busy', text: 'Cannot help right now, I am mid-job.', requires: 'none', seconds: 15 },
    ],
  },
  {
    kind: 'text', from: 'personal', fromName: 'Sam', subject: 'dinner',
    body: 'are you going to make it back for dinner or should i eat without you', minIntensity: 2,
    replies: [
      { id: 'late', text: 'Going to be late. Big one today.', requires: 'none', seconds: 15 },
      { id: 'soon', text: 'Should be done in an hour.', requires: 'none', seconds: 15 },
    ],
  },
  {
    kind: 'field-note', from: 'manager', fromName: 'Dispatch', subject: 'locate crew',
    body: 'Locate crew has marked the street. Orange paint is telecom; stay outside the tolerance zone.', minIntensity: 1,
  },
  {
    kind: 'email', from: 'manager', fromName: 'Delgado (Ops Manager)', subject: 'help is coming',
    body: 'Sending Ruiz your way once he clears his second job. Should be about forty minutes out.', minIntensity: 2,
  },
];

/**
 * Only the fields a claim check actually reads. Declared structurally on purpose: the UI
 * holds a *redacted* log (ground truth stripped) and must be able to ask this question
 * without ever being handed the full one.
 */
export type ClaimableAction = {
  type: string;
  facts?: ReadonlyArray<{ kind: string; status?: string }>;
  dbm?: number | null;
  leaks?: readonly unknown[];
};

/** Does the log already contain the observation a reply claims? */
export function canClaim(key: ClaimKey, log: readonly ClaimableAction[]): boolean {
  switch (key) {
    case 'none':
      return true;
    case 'saw-los':
      return log.some((a) => a.type === 'cli' && (a.facts ?? []).some((f) => f.kind === 'ont-status-observed' && f.status === 'los'));
    case 'metered':
      return log.some((a) => a.type === 'power-meter');
    case 'shot-otdr':
      return log.some((a) => a.type === 'otdr-shot');
    case 'ruled-out-drop':
      return log.some((a) => (a.type === 'power-meter' && a.dbm !== null) || (a.type === 'vfl' && (a.leaks ?? []).length === 0));
    case 'on-site':
      return log.some((a) => a.type === 'truck-roll');
  }
}

/** Replies the trainee is actually entitled to give, right now. */
export function availableReplies(event: CommsEvent, log: readonly ClaimableAction[]): CommsReply[] {
  return event.replies.filter((r) => canClaim(r.requires, log));
}

/**
 * The day's traffic. Spread across the scenario's time budget so calls land while you are
 * working rather than all at once.
 */
export function scheduleComms(seed: number, role: Role, timeBudgetMinutes: number | undefined, world: WorldState): CommsEvent[] {
  const intensity = ROLE_POLICY[role].commsIntensity;
  if (intensity === 0) return [];

  const rng = createRng(deriveSeed(seed, 'comms', role));
  const span = (timeBudgetMinutes ?? 60) * 60;
  const eligible = TEMPLATES.filter((t) => t.minIntensity <= intensity);
  const count = Math.min(eligible.length, 1 + intensity);

  // Extra customers calling in, drawn from premises that are not already reporting.
  const reporting = new Set(world.customerReports.map((r) => r.premiseNodeId));
  const quiet = world.topology.nodes.filter((n) => n.kind === 'customer-premise' && !reporting.has(n.id));

  const events: CommsEvent[] = [];
  const pool = [...eligible];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const t = pool.splice(rng.int(0, pool.length - 1), 1)[0];
    events.push({
      id: `cm-${i}`,
      // Never in the first two minutes; you get a moment to read the ticket first.
      atSimSeconds: Math.round(120 + rng.next() * Math.max(240, span - 240)),
      kind: t.kind,
      from: t.from,
      fromName: t.fromName,
      subject: t.subject,
      body: t.body,
      blocking: !!t.blocking && ROLE_POLICY[role].mustAnswerComms,
      replies: t.replies ?? [],
    });
  }

  if (quiet.length > 0 && intensity >= 1) {
    const premise = quiet[rng.int(0, quiet.length - 1)];
    const useful = rng.next() < 0.5;
    events.push({
      id: 'cm-cust',
      atSimSeconds: Math.round(180 + rng.next() * Math.max(240, span - 300)),
      kind: 'customer-call',
      from: 'customer',
      fromName: premise.label,
      subject: useful ? 'my neighbour is out too' : 'slow in the evenings',
      body: useful
        ? `Calling from ${premise.label}. My neighbour says theirs went out at the same time as mine.`
        : `Calling from ${premise.label}. It is not out exactly, it just goes slow around eight most nights.`,
      blocking: false,
      replies: [
        { id: 'log', text: 'Thanks — logging that. It helps narrow where I look.', requires: 'none', seconds: 60 },
        { id: 'later', text: 'Understood. I will raise a separate ticket for that.', requires: 'none', seconds: 30 },
      ],
    });
  }

  return events.sort((a, b) => a.atSimSeconds - b.atSimSeconds);
}

/** Everything that has landed by now and has not been dealt with. */
export function pendingComms(events: readonly CommsEvent[], clockSeconds: number, handled: readonly string[]): CommsEvent[] {
  return events.filter((e) => e.atSimSeconds <= clockSeconds && !handled.includes(e.id));
}

/**
 * The day talking back. A real outage is not a quiet lab: NOC keeps updating the ticket, a
 * senior tech wants to know what you are seeing, and at the higher grades somebody upstairs
 * wants a status while you are still holding a meter.
 *
 * Nobody here is a customer. Infrastructure talks to NOC about outages and escalations and
 * to their own people about everything else; the subscriber's own phone call reached NOC
 * hours ago and is on the ticket. So the interruptions come from the people who actually
 * interrupt: NOC, a senior, dispatch, an ops manager, and — because the day does not stop
 * for the outage — somebody at home.
 *
 * Seeded from the run, so a replay reproduces the same day with the same interruptions at
 * the same moments. Nothing here can leak the answer: a reply option is only offered when
 * the action log already contains the observation it claims, so you cannot tell anyone
 * something you have not actually seen.
 */
import { createRng, deriveSeed } from '../world';
import type { WorldState } from '../world';
import { ROLE_POLICY, type Role } from './roles';


export type CommsKind = 'noc-update' | 'text' | 'phone-call' | 'email' | 'field-note';
export type CommsFrom = 'noc' | 'senior' | 'manager' | 'tech' | 'exec' | 'personal';

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
    kind: 'phone-call', from: 'noc', fromName: 'NOC — outage bridge', subject: 'ETA for the bridge',
    body: 'We have the bridge open on this ticket and the account team is asking. Give me something I can put on it.', minIntensity: 2, blocking: true, replies: STATUS_REPLIES,
  },
  {
    kind: 'noc-update', from: 'noc', fromName: 'NOC — ticket update', subject: 'two more just dropped',
    body: 'Two more ONTs went to LOS on the same PON in the last ten minutes. Same branch as the ones you already have.', minIntensity: 1,
    replies: [{ id: 'ack', text: 'Copy — that fits what I am looking at.', requires: 'none', seconds: 25 }],
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

  // An extra premise NOC has heard from, drawn from those not already on the ticket.
  const reporting = new Set(world.nocReports.map((r) => r.premiseNodeId));
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
      id: 'cm-noc-extra',
      atSimSeconds: Math.round(180 + rng.next() * Math.max(240, span - 300)),
      kind: 'noc-update',
      from: 'noc',
      fromName: 'NOC — ticket update',
      subject: useful ? 'another address on the ticket' : 'unrelated report, same street',
      // One of these is scope and one is noise, and NOC cannot tell you which. That is the
      // point: a report arriving is not evidence that it belongs to your outage.
      body: useful
        ? `Adding ${premise.label} to the ticket — reported out at the same time as the others.`
        : `Separate report from ${premise.label}: not out, just slow around eight most nights. Logging it against its own ticket unless you say otherwise.`,
      blocking: false,
      replies: [
        { id: 'log', text: 'Copy — noted. It helps narrow where I look.', requires: 'none', seconds: 40 },
        { id: 'later', text: 'Keep that on its own ticket. It is not this outage.', requires: 'none', seconds: 30 },
      ],
    });
  }

  return events.sort((a, b) => a.atSimSeconds - b.atSimSeconds);
}

/** Everything that has landed by now and has not been dealt with. */
export function pendingComms(events: readonly CommsEvent[], clockSeconds: number, handled: readonly string[]): CommsEvent[] {
  return events.filter((e) => e.atSimSeconds <= clockSeconds && !handled.includes(e.id));
}

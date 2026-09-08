/**
 * The locate ticket, and why you cannot just start digging.
 *
 * This is the one part of the job with legal teeth rather than a company policy behind it.
 * In California, excavation requires notifying the regional notification centre — DigAlert
 * in the south, dial 811 — and then *waiting*. The wait is not advisory. Cutting somebody
 * else's utility because the marks were not down yet is the single most expensive mistake
 * an outside-plant crew can make, and it is entirely preventable by a phone call and a
 * calendar.
 *
 * ON THE NUMBERS. California Government Code §4216 is the governing statute: notify at
 * least two working days before excavating, and the ticket has a limited life. Those are
 * the figures encoded here. They are stated as the rule this trainer teaches, with the
 * statute named so a trainee can go and read it — but statutes are amended, and anyone
 * relying on this for real work should check the current text rather than a simulator.
 * `LEGAL_BASIS` carries that caveat so the UI can show it.
 *
 * Pure date arithmetic. No timezone handling beyond the local day, because the rule counts
 * working days, not hours.
 */

export const LEGAL_BASIS = {
  jurisdiction: 'California',
  centre: 'DigAlert (Underground Service Alert of Southern California) · 811',
  statute: 'California Government Code §4216',
  /** Working days between notification and the earliest lawful excavation. */
  noticeWorkingDays: 2,
  /** Calendar days a ticket remains valid before it must be renewed. */
  ticketLifeDays: 28,
  caveat:
    'Encoded from the rule as commonly applied. Statutes are amended — confirm the current text of §4216 before relying on this for real excavation.',
} as const;

export type LocateStatus =
  /** No ticket has been opened. Digging now is unlawful, not merely unwise. */
  | 'not-requested'
  /** Called in, but the notice period has not run. The marks may not be down yet. */
  | 'waiting'
  /** Notice period served and the ticket is live. */
  | 'valid'
  /** The ticket outlived its window and must be renewed before work continues. */
  | 'expired';

export interface LocateTicket {
  id: string;
  requestedAt: Date;
  /** Earliest lawful start, once the notice period has run. */
  validFrom: Date;
  /** After this the ticket must be renewed. */
  expiresAt: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function isWeekend(d: Date): boolean {
  const day = d.getDay();
  return day === 0 || day === 6;
}

/**
 * Advance by whole working days, skipping weekends.
 *
 * Public holidays are deliberately not modelled: the notification centres observe them and
 * a real crew would lose those days too, but a simulator that silently invents a holiday
 * calendar teaches a schedule the trainee cannot reproduce. Weekends are unambiguous.
 */
export function addWorkingDays(from: Date, days: number): Date {
  let d = startOfDay(from);
  let remaining = days;
  while (remaining > 0) {
    d = new Date(d.getTime() + DAY_MS);
    if (!isWeekend(d)) remaining--;
  }
  return d;
}

/** Open a ticket. The day of the call does not count toward the notice period. */
export function requestLocate(id: string, requestedAt: Date): LocateTicket {
  return {
    id: id,
    requestedAt: new Date(requestedAt.getTime()),
    validFrom: addWorkingDays(requestedAt, LEGAL_BASIS.noticeWorkingDays),
    expiresAt: new Date(startOfDay(requestedAt).getTime() + LEGAL_BASIS.ticketLifeDays * DAY_MS),
  };
}

export function statusAt(ticket: LocateTicket | null, now: Date): LocateStatus {
  if (!ticket) return 'not-requested';
  const t = startOfDay(now).getTime();
  if (t < startOfDay(ticket.validFrom).getTime()) return 'waiting';
  if (t > startOfDay(ticket.expiresAt).getTime()) return 'expired';
  return 'valid';
}

export interface ExcavationCheck {
  allowed: boolean;
  status: LocateStatus;
  /** What to tell the trainee, in the terms the rule is actually argued in. */
  reason: string;
  /** Whole days until the ticket goes live. Zero once it has. */
  daysToWait: number;
}

/** The gate every excavation step has to pass through. */
export function canExcavate(ticket: LocateTicket | null, now: Date): ExcavationCheck {
  const status = statusAt(ticket, now);

  if (status === 'not-requested') {
    return {
      allowed: false, status: status, daysToWait: -1,
      reason: `No locate ticket. Excavating without notifying ${LEGAL_BASIS.centre} is a violation of ${LEGAL_BASIS.statute}, not a shortcut.`,
    };
  }
  if (status === 'waiting') {
    const wait = Math.max(0, Math.ceil((startOfDay(ticket!.validFrom).getTime() - startOfDay(now).getTime()) / DAY_MS));
    return {
      allowed: false, status: status, daysToWait: wait,
      reason: `Notice period has not run. ${LEGAL_BASIS.noticeWorkingDays} working days are required before breaking ground; ${wait} day${wait === 1 ? '' : 's'} left. The marks may not even be down yet.`,
    };
  }
  if (status === 'expired') {
    return {
      allowed: false, status: status, daysToWait: -1,
      reason: `Ticket expired after ${LEGAL_BASIS.ticketLifeDays} days. Paint fades and the ground changes — renew it before any further excavation.`,
    };
  }
  return { allowed: true, status: status, daysToWait: 0, reason: 'Locate is valid. Verify the marks on site against the ticket before breaking ground.' };
}

/**
 * Paint and flag colours. Hitting the wrong utility is usually a failure to read what is
 * already on the ground, so the colours are content, not decoration.
 */
export const MARK_COLORS: ReadonlyArray<{ color: string; hex: string; means: string }> = [
  { color: 'white',  hex: '#F2F4F8', means: 'Proposed excavation — what you marked out yourself' },
  { color: 'pink',   hex: '#FF80B0', means: 'Temporary survey markings' },
  { color: 'red',    hex: '#FF3B30', means: 'Electric power lines, cables, conduit, lighting' },
  { color: 'yellow', hex: '#FFD426', means: 'Gas, oil, steam, petroleum, other flammables' },
  { color: 'orange', hex: '#FF6B00', means: 'Communications, alarm or signal lines, cable, conduit — this is you' },
  { color: 'blue',   hex: '#0A84FF', means: 'Potable water' },
  { color: 'purple', hex: '#AF52DE', means: 'Reclaimed water, irrigation, slurry' },
  { color: 'green',  hex: '#34C759', means: 'Sewer and drain lines' },
];

/**
 * The tolerance zone: hand-dig within this distance either side of a mark rather than
 * using power equipment. Getting this wrong is how a locate that was done correctly still
 * ends with a cut cable.
 */
export const TOLERANCE_ZONE_INCHES = 24;

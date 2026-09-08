/**
 * The people, and what assigning them work does to them.
 *
 * A manager's job in this trade is not scheduling. It is deciding who goes where, knowing
 * that the decision changes the person: the right job just past someone's reach builds
 * them, the same job two grades too hard breaks their confidence and costs a rework, and a
 * technician left on work they mastered a year ago quietly stops caring.
 *
 * That is the model here. Skill moves according to the *stretch* between the job and the
 * person, not according to hours logged — which is why a manager who always sends the
 * strongest technician to the hardest job ends up with one strong technician and a crew
 * that never grew. The simulator should let that happen, and then show it.
 *
 * Fatigue and morale are tracked separately on purpose. A tired technician still cares and
 * makes slips; a technician who has stopped caring is a different and worse problem, and
 * collapsing them into one "condition" bar would hide it.
 *
 * Pure and seeded, like the rest of the engine.
 */
import { createRng, deriveSeed } from '../world';
import { ROLE_ORDER, type Role } from '../session/roles';

/** The competencies a work order can exercise. Matches JobTemplate.domains. */
export type Domain =
  | 'splicing'
  | 'diagnosis'
  | 'testing'
  | 'construction'
  | 'configuration'
  | 'records'
  | 'planning';

export const DOMAINS: readonly Domain[] = [
  'splicing', 'diagnosis', 'testing', 'construction', 'configuration', 'records', 'planning',
];

export interface Technician {
  id: string;
  name: string;
  grade: Role;
  /** 0–100 per domain. Competence, not confidence. */
  skills: Record<Domain, number>;
  /** Hours logged this week. Overtime is where fatigue comes from. */
  hoursThisWeek: number;
  /** 0–100. Slips, not attitude. */
  fatigue: number;
  /** 0–100. Whether they still care. */
  morale: number;
}

/** A week beyond this is where fatigue starts compounding rather than resetting overnight. */
export const SUSTAINABLE_HOURS = 45;
/** Past this, the crew is being spent rather than worked. */
export const BURNOUT_HOURS = 55;

/** How hard a job is, derived from the grade that can hold it alone. */
const GRADE_DIFFICULTY: Record<Role, number> = { l1: 20, l2: 38, l3: 56, senior: 74, manager: 88 };

export function difficultyOf(minRole: Role): number {
  return GRADE_DIFFICULTY[minRole];
}

/** Where a technician stands in the domains a job exercises. */
export function competence(tech: Technician, domains: readonly Domain[]): number {
  if (domains.length === 0) return 50;
  const known = domains.filter((d) => d in tech.skills);
  if (known.length === 0) return 50;
  return known.reduce((sum, d) => sum + tech.skills[d], 0) / known.length;
}

export type Fit = 'under-used' | 'comfortable' | 'stretching' | 'over-their-head';

/**
 * The judgement a manager is actually making.
 *
 * The productive band is narrow and sits slightly *above* current competence. Everything
 * else is a cost of some kind — boredom below it, failure above it — and the point of
 * naming four bands rather than returning a number is that a manager should be able to see
 * at a glance which of those four costs they are choosing to pay.
 */
export function fitFor(tech: Technician, difficulty: number, domains: readonly Domain[]): Fit {
  const stretch = difficulty - competence(tech, domains);
  if (stretch < -18) return 'under-used';
  if (stretch <= 14) return 'comfortable';
  if (stretch <= 32) return 'stretching';
  return 'over-their-head';
}

export interface Assignment {
  techId: string;
  /** Difficulty of the work order, 0–100. */
  difficulty: number;
  domains: Domain[];
  hours: number;
}

export interface Outcome {
  fit: Fit;
  /** Did the work get finished to standard? */
  completed: boolean;
  /** 0–100. What the job was worth as a piece of work. */
  quality: number;
  /** Per-domain skill movement. Negative is real: a job that goes badly costs confidence. */
  skillDelta: Partial<Record<Domain, number>>;
  fatigueDelta: number;
  moraleDelta: number;
  /** What the manager should take from it, in one line. */
  note: string;
}

/**
 * Run one assignment.
 *
 * Fatigue degrades the *chance of completion*, not the skill gained — a tired technician
 * who gets through a stretching job still learned from it. Morale degrades both, because
 * someone who has stopped caring is not absorbing anything either.
 */
export function performAssignment(seed: number, tech: Technician, a: Assignment): Outcome {
  const rng = createRng(deriveSeed(seed, 'assignment', tech.id, String(a.difficulty)));
  const fit = fitFor(tech, a.difficulty, a.domains);
  const skill = competence(tech, a.domains);

  // Chance of getting through it cleanly.
  const base: Record<Fit, number> = {
    'under-used': 0.97,
    comfortable: 0.93,
    stretching: 0.76,
    'over-their-head': 0.38,
  };
  const drag = (tech.fatigue / 100) * 0.28 + ((100 - tech.morale) / 100) * 0.16;
  const completed = rng.next() < Math.max(0.05, base[fit] - drag);

  // Quality tracks competence, penalised by condition and by reaching too far.
  let quality = skill - (a.difficulty - skill) * 0.35 - tech.fatigue * 0.22 - (100 - tech.morale) * 0.12;
  if (!completed) quality -= 25;
  quality = Math.max(0, Math.min(100, Math.round(quality)));

  // Learning. The stretch band teaches most; over their head teaches nothing and takes
  // confidence with it when it fails.
  const gain: Record<Fit, number> = { 'under-used': 0.3, comfortable: 1.4, stretching: 3.2, 'over-their-head': 0.6 };
  let delta = gain[fit];
  if (!completed) delta = fit === 'over-their-head' ? -2.4 : -0.8;
  // Diminishing returns near the top of a domain.
  delta *= 1 - skill / 140;

  const skillDelta: Partial<Record<Domain, number>> = {};
  for (const d of a.domains) skillDelta[d] = Math.round(delta * 10) / 10;

  // Condition.
  const overtime = Math.max(0, tech.hoursThisWeek + a.hours - SUSTAINABLE_HOURS);
  const fatigueDelta = Math.round((a.hours * 0.9 + overtime * 1.8 + (fit === 'over-their-head' ? 8 : 0)) * 10) / 10;

  let moraleDelta = 0;
  if (fit === 'under-used') moraleDelta = -1.8;
  else if (fit === 'comfortable') moraleDelta = 0.6;
  else if (fit === 'stretching') moraleDelta = completed ? 3.4 : -2.2;
  else moraleDelta = completed ? 1.0 : -6.5;
  if (tech.hoursThisWeek + a.hours > BURNOUT_HOURS) moraleDelta -= 3;

  const note = !completed
    ? fit === 'over-their-head'
      ? `${tech.name} was out of their depth and it did not get finished. That is an assignment problem, not a performance problem.`
      : `${tech.name} did not finish it. Check the hours before reading anything into it.`
    : fit === 'stretching'
      ? `${tech.name} was reaching and got there. This is the band that actually builds people.`
      : fit === 'under-used'
        ? `${tech.name} could do this in their sleep, and it shows in how little they got from it.`
        : `${tech.name} handled it comfortably.`;

  return {
    fit: fit,
    completed: completed,
    quality: quality,
    skillDelta: skillDelta,
    fatigueDelta: fatigueDelta,
    moraleDelta: Math.round(moraleDelta * 10) / 10,
    note: note,
  };
}

/** Apply an outcome. Returns a new technician; nothing mutates. */
export function applyOutcome(tech: Technician, a: Assignment, out: Outcome): Technician {
  const skills = { ...tech.skills };
  for (const d of Object.keys(out.skillDelta) as Domain[]) {
    skills[d] = Math.max(0, Math.min(100, Math.round((skills[d] + (out.skillDelta[d] ?? 0)) * 10) / 10));
  }
  return {
    ...tech,
    skills: skills,
    hoursThisWeek: Math.round((tech.hoursThisWeek + a.hours) * 10) / 10,
    fatigue: Math.max(0, Math.min(100, Math.round((tech.fatigue + out.fatigueDelta) * 10) / 10)),
    morale: Math.max(0, Math.min(100, Math.round((tech.morale + out.moraleDelta) * 10) / 10)),
  };
}

/** A night off, a weekend, a light day. Fatigue recovers; morale drifts back slowly. */
export function rest(tech: Technician, hours: number): Technician {
  return {
    ...tech,
    fatigue: Math.max(0, Math.round((tech.fatigue - hours * 1.6) * 10) / 10),
    morale: Math.min(100, Math.round((tech.morale + hours * 0.25) * 10) / 10),
  };
}

/** Monday morning. Hours reset; fatigue does not fully. */
export function newWeek(tech: Technician): Technician {
  return { ...tech, hoursThisWeek: 0, fatigue: Math.max(0, Math.round(tech.fatigue * 0.55 * 10) / 10) };
}

export type CrewFlag = 'burning-out' | 'stagnating' | 'stretched-thin' | 'ready-to-step-up';

export interface CrewNote {
  techId: string;
  flag: CrewFlag;
  detail: string;
}

/**
 * What a manager should be seeing without being told.
 *
 * Deliberately flags stagnation as loudly as burnout. Overwork announces itself; a
 * technician quietly capped out on work they mastered two years ago does not, and losing
 * them is just as expensive.
 */
export function crewNotes(crew: readonly Technician[]): CrewNote[] {
  const notes: CrewNote[] = [];
  for (const t of crew) {
    if (t.hoursThisWeek > BURNOUT_HOURS || t.fatigue > 75) {
      notes.push({
        techId: t.id, flag: 'burning-out',
        detail: `${t.name}: ${t.hoursThisWeek} h this week, fatigue ${Math.round(t.fatigue)}. Mistakes from here are yours, not theirs.`,
      });
    } else if (t.hoursThisWeek > SUSTAINABLE_HOURS) {
      notes.push({
        techId: t.id, flag: 'stretched-thin',
        detail: `${t.name} is into overtime at ${t.hoursThisWeek} h. Sustainable for a week, not for a month.`,
      });
    }

    if (t.morale < 45) {
      notes.push({
        techId: t.id, flag: 'stagnating',
        detail: `${t.name}'s morale is ${Math.round(t.morale)}. Look at what they have been given lately before you look at them.`,
      });
    }

    // Someone whose competence has outgrown their grade.
    const best = Math.max(...DOMAINS.map((d) => t.skills[d] ?? 0));
    const ceiling = difficultyOf(t.grade);
    if (best > ceiling + 16 && t.grade !== 'manager') {
      const next = ROLE_ORDER[Math.min(ROLE_ORDER.indexOf(t.grade) + 1, ROLE_ORDER.length - 1)];
      notes.push({
        techId: t.id, flag: 'ready-to-step-up',
        detail: `${t.name} is working above their grade. Give them ${next.toUpperCase()} work before somebody else does.`,
      });
    }
  }
  return notes;
}

/** A starting crew, so a manager shift opens with people rather than an empty roster. */
export function startingCrew(): Technician[] {
  const mk = (id: string, name: string, grade: Role, s: Partial<Record<Domain, number>>): Technician => ({
    id, name, grade,
    skills: {
      splicing: 30, diagnosis: 30, testing: 30, construction: 30,
      configuration: 20, records: 35, planning: 25, ...s,
    },
    hoursThisWeek: 0, fatigue: 10, morale: 72,
  });
  return [
    mk('ramos', 'Ramos', 'senior', { splicing: 88, diagnosis: 80, testing: 78, construction: 70, records: 62, configuration: 45 }),
    mk('delgado', 'Delgado', 'l3', { splicing: 66, diagnosis: 58, testing: 61, construction: 72, records: 48 }),
    mk('whitaker', 'Whitaker', 'l1', { splicing: 24, diagnosis: 31, testing: 28, construction: 22, records: 40 }),
    mk('ruiz', 'Ruiz', 'l2', { splicing: 52, diagnosis: 44, testing: 49, construction: 38, records: 30 }),
  ];
}

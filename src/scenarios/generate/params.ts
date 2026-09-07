/**
 * Parameters for a procedurally generated scenario. The parameters are encoded in the
 * scenario id (`t3-gen-plant-medium`) so the ordinary `/run/:scenarioId?seed=N` route,
 * persistence, resume, replay, and share codes all work unchanged: id + seed fully
 * determines the definition, exactly as it does for a bundled YAML.
 */
export type GeneratorTier = 1 | 2 | 3 | 4 | 5;
export type GeneratorFocus = 'cpe' | 'drop' | 'plant' | 'network' | 'compliance' | 'any';
export type GeneratorSize = 'small' | 'medium' | 'large';

export interface GeneratorParams {
  tier: GeneratorTier;
  focus: GeneratorFocus;
  size: GeneratorSize;
}

export type ConcreteFocus = Exclude<GeneratorFocus, 'any'>;

/** Which fault families are appropriate at each difficulty tier (mirrors the taxonomy's minTier ladder). */
export const FOCUS_BY_TIER: Record<GeneratorTier, ConcreteFocus[]> = {
  1: ['cpe'],
  2: ['cpe', 'drop', 'network'],
  3: ['drop', 'plant', 'network', 'compliance'],
  4: ['drop', 'plant', 'network', 'compliance'],
  5: ['plant', 'network'],
};

export const FOCUS_LABELS: Record<GeneratorFocus, string> = {
  cpe: 'Customer equipment',
  drop: 'Drop / demarc',
  plant: 'Outside plant',
  network: 'Network / OLT',
  compliance: 'Safety & compliance',
  any: 'Surprise me',
};

export const SIZE_LABELS: Record<GeneratorSize, string> = {
  small: 'One street',
  medium: 'A neighbourhood',
  large: 'Two hubs',
};

const ID_RE = /^t([1-5])-gen-(cpe|drop|plant|network|compliance|any)-(small|medium|large)$/;

export function generatedId(params: GeneratorParams): string {
  return `t${params.tier}-gen-${params.focus}-${params.size}`;
}

export function parseGeneratedId(id: string): GeneratorParams | null {
  const m = ID_RE.exec(id);
  if (!m) return null;
  return { tier: Number(m[1]) as GeneratorTier, focus: m[2] as GeneratorFocus, size: m[3] as GeneratorSize };
}

export function isGeneratedId(id: string): boolean {
  return ID_RE.test(id);
}

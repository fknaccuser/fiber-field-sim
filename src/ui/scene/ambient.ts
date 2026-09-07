/**
 * Time of day and weather, actually rendered.
 *
 * Every scenario has carried `environment.timeOfDay` and `environment.weather` since the
 * generator was written, and nothing but a shift label ever read them. A 07:00 marine-layer
 * job and a 15:00 clear one looked identical, which quietly told the trainee that the
 * conditions do not matter — when in this trade they are half of why a job is hard.
 *
 * Pure: a string in, lighting out, so the whole lighting model is unit-testable without a
 * renderer.
 */
export type Vec3Tuple = [number, number, number];

export interface Ambient {
  /** Sky and fog colour — the same value, so distant geometry dissolves into the sky. */
  sky: string;
  fogNear: number;
  fogFar: number;
  sun: { position: Vec3Tuple; intensity: number; color: string };
  ambientIntensity: number;
  hemisphere: { sky: string; ground: string; intensity: number };
  /** For UI chrome that wants to agree with the scene. */
  label: string;
}

/** Minutes past midnight, or null if the string is not a clock. */
export function minutesOf(timeOfDay: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(timeOfDay.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function mixHex(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `#${pa.map((v, i) => Math.round(lerp(v, pb[i], t)).toString(16).padStart(2, '0')).join('')}`;
}

/** Key points through a working day. Interpolated between, so the light moves continuously. */
const KEYS: Array<{ at: number; sky: string; sun: string; sunI: number; ambient: number; elevation: number }> = [
  { at: 6 * 60, sky: '#8a97ad', sun: '#ffb27a', sunI: 0.55, ambient: 0.42, elevation: 12 },
  { at: 9 * 60, sky: '#a8bcd2', sun: '#ffe4c4', sunI: 1.1, ambient: 0.58, elevation: 38 },
  { at: 13 * 60, sky: '#b3c6d8', sun: '#fff6e8', sunI: 1.35, ambient: 0.66, elevation: 62 },
  { at: 17 * 60, sky: '#a9b2c0', sun: '#ffd9a8', sunI: 1.0, ambient: 0.55, elevation: 30 },
  { at: 19 * 60 + 30, sky: '#6d7488', sun: '#ff9d5c', sunI: 0.5, ambient: 0.38, elevation: 8 },
  { at: 21 * 60, sky: '#2b3446', sun: '#9fc0ff', sunI: 0.22, ambient: 0.3, elevation: 6 },
];

const WEATHER: Record<string, { skyMix: string; skyT: number; sunScale: number; ambientScale: number; fogNear: number; fogFar: number; label: string }> = {
  clear: { skyMix: '#bcd2e6', skyT: 0.15, sunScale: 1, ambientScale: 1, fogNear: 70, fogFar: 280, label: 'Clear' },
  overcast: { skyMix: '#9aa5b2', skyT: 0.6, sunScale: 0.55, ambientScale: 1.15, fogNear: 50, fogFar: 200, label: 'Overcast' },
  // The coastal grey that sits on this part of the county until mid-morning.
  'marine-layer': { skyMix: '#aeb6bd', skyT: 0.75, sunScale: 0.4, ambientScale: 1.2, fogNear: 22, fogFar: 110, label: 'Marine layer' },
  hot: { skyMix: '#d8d2be', skyT: 0.3, sunScale: 1.15, ambientScale: 0.95, fogNear: 90, fogFar: 320, label: 'Hot and hazy' },
};

const DEFAULT_WEATHER = WEATHER.clear;

/** The scene's light for a given moment and sky. */
export function ambientFor(timeOfDay: string, weather: string): Ambient {
  const minutes = minutesOf(timeOfDay) ?? 13 * 60;
  const w = WEATHER[weather] ?? DEFAULT_WEATHER;

  const clamped = Math.min(Math.max(minutes, KEYS[0].at), KEYS[KEYS.length - 1].at);
  let lo = KEYS[0];
  let hi = KEYS[KEYS.length - 1];
  for (let i = 0; i < KEYS.length - 1; i++) {
    if (clamped >= KEYS[i].at && clamped <= KEYS[i + 1].at) {
      lo = KEYS[i];
      hi = KEYS[i + 1];
      break;
    }
  }
  const t = hi.at === lo.at ? 0 : (clamped - lo.at) / (hi.at - lo.at);

  const skyBase = mixHex(lo.sky, hi.sky, t);
  const sky = mixHex(skyBase, w.skyMix, w.skyT);
  const elevation = lerp(lo.elevation, hi.elevation, t);
  // The sun tracks east to west across the day, so shadows and highlights change side.
  const dayFraction = (clamped - KEYS[0].at) / (KEYS[KEYS.length - 1].at - KEYS[0].at);
  const azimuth = lerp(-1, 1, dayFraction);

  return {
    sky,
    fogNear: w.fogNear,
    fogFar: w.fogFar,
    sun: {
      position: [azimuth * 45, Math.max(6, elevation), -20 + azimuth * 12],
      intensity: lerp(lo.sunI, hi.sunI, t) * w.sunScale,
      color: mixHex(lo.sun, hi.sun, t),
    },
    ambientIntensity: lerp(lo.ambient, hi.ambient, t) * w.ambientScale,
    hemisphere: { sky, ground: '#6b5a44', intensity: 0.5 * w.ambientScale },
    label: `${w.label} · ${timeOfDay}`,
  };
}

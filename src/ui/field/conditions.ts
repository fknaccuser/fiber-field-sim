/**
 * Time of day and weather, as words.
 *
 * These two fields have been on every scenario since the generator was written. They used
 * to drive a full lighting model for the 3D street — sun elevation, fog distance, sky
 * colour — and that street is gone. What survives is the part a technician actually acts
 * on: it is 07:00 and the marine layer is in, so you cannot see down the block and the
 * handhole is full of water. That is a sentence, not a light rig.
 *
 * Pure, so the shift and the conditions are testable without rendering anything.
 */

/** Minutes past midnight, or null if the string is not a clock. */
export function minutesOf(timeOfDay: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(timeOfDay.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

const WEATHER_LABELS: Record<string, string> = {
  clear: 'Clear',
  overcast: 'Overcast',
  // The coastal grey that sits on this part of the county until mid-morning.
  'marine-layer': 'Marine layer',
  hot: 'Hot and hazy',
};

/** What the sky is doing, in the words it would be said in. Unknown skies read as clear. */
export function weatherLabel(weather: string): string {
  return WEATHER_LABELS[weather] ?? WEATHER_LABELS.clear;
}

/** Conditions for the header: "Marine layer · 07:15". */
export function conditionsLabel(timeOfDay: string, weather: string): string {
  return `${weatherLabel(weather)} · ${timeOfDay}`;
}

/** Which shift you are on, which is what decides who you can call for help. */
export function shiftOf(timeOfDay: string): string {
  const minutes = minutesOf(timeOfDay);
  if (minutes === null) return 'DAY SHIFT';
  const hour = Math.floor(minutes / 60);
  if (hour < 6) return 'NIGHT SHIFT';
  if (hour < 12) return 'DAY SHIFT';
  if (hour < 18) return 'SWING SHIFT';
  return 'NIGHT SHIFT';
}

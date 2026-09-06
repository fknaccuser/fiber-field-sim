/**
 * Pure OTDR physics formulas. Every function here is a small, independently testable
 * piece of the trace; trace.ts composes them. Nothing instrument- or fiber-specific is
 * a literal here -- it all comes from the NetworkProfile / InstrumentProfile passed in.
 */
import type { FiberSpan } from '../../world';
import type { InstrumentProfile, NetworkProfile } from '../../profiles';
import { wavelengthKey, type WavelengthKey } from '../shared/eventLoss';
import { C_M_PER_S } from './constants';

export { wavelengthKey };
export type { WavelengthKey };

/** Fiber attenuation (dB/km) for this span at the given wavelength, including the water-peak excess on 'legacy' fiber. At the standard 1310/1550/1625 test wavelengths this excess is negligible (<0.01 dB/km) -- it exists for correctness, not because any Stage 1 scenario depends on it. */
export function alpha(span: Pick<FiberSpan, 'fiberGeneration'>, network: NetworkProfile, wavelengthNm: number): number {
  const key = wavelengthKey(wavelengthNm);
  const base = network.fiberAttenuationDbPerKm[key] ?? 0;
  if (span.fiberGeneration !== 'legacy') return base;
  const waterPeakNm = network.waterPeakNm ?? 1383;
  const sigma = network.waterPeakSigmaNm;
  const bump = network.waterPeakExcessDbPerKm * Math.exp(-(((wavelengthNm - waterPeakNm) / sigma) ** 2));
  return base + bump;
}

/** The group index of refraction actually governing propagation on this span (its own override, else the network default at this wavelength). */
export function trueIor(span: { iorOverride?: { '1310'?: number; '1550'?: number; '1625'?: number } }, network: NetworkProfile, wavelengthNm: number): number {
  const key = wavelengthKey(wavelengthNm);
  return span.iorOverride?.[key] ?? network.iorDefault[key] ?? 1.47;
}

/** Event dead zone (displayed-distance meters), using the instrument's setting IOR. */
export function eventDeadZoneMeters(pulseWidthNs: number, nSetting: number): number {
  return (pulseWidthNs * 1e-9 * C_M_PER_S) / (2 * nSetting);
}

/** Attenuation dead zone (displayed-distance meters): a multiple of the event dead zone. */
export function attenuationDeadZoneMeters(pulseWidthNs: number, nSetting: number, attenuationDeadZoneFactor: number): number {
  return attenuationDeadZoneFactor * eventDeadZoneMeters(pulseWidthNs, nSetting);
}

/** Event dead zone in *true*-distance meters (pulse smear width along the actual fiber), using a span's own true IOR. Used to shape non-reflective ramps and reflective peaks at their true position. */
export function trueEventDeadZoneMeters(pulseWidthNs: number, nTrue: number): number {
  return (pulseWidthNs * 1e-9 * C_M_PER_S) / (2 * nTrue);
}

/** Maps a true distance to its displayed position: d_disp = d_true * (n_true / n_setting). This ratio is the IOR teachable. */
export function displayDistanceMeters(trueDistanceMeters: number, nTrue: number, nSetting: number): number {
  return trueDistanceMeters * (nTrue / nSetting);
}

/** Round-trip Rayleigh backscatter coefficient (dB) for this wavelength and pulse width. */
export function backscatterCoefficientDb(network: NetworkProfile, wavelengthNm: number, pulseWidthNs: number): number {
  const key = wavelengthKey(wavelengthNm);
  const coef1ns = network.backscatterCoefficientDb1ns[key] ?? -80;
  return coef1ns + 10 * Math.log10(pulseWidthNs);
}

/** Raw reflective-peak height (dB) above the local baseline, before saturation clamping: H = (R - bsCoef) / 2. Shorter pulses (more negative bsCoef) produce taller peaks for the same reflectance -- this is why short pulses show tall spikes. */
export function reflectionPeakHeightDbRaw(reflectanceDb: number, bsCoefDb: number): number {
  return (reflectanceDb - bsCoefDb) / 2;
}

/** Clamps a peak height so the displayed level (baselineDb + H) never exceeds the instrument's saturation headroom above the launch level (0 dB). */
export function clampPeakHeightDb(rawHeightDb: number, baselineDb: number, saturationHeadroomDb: number): number {
  return Math.min(rawHeightDb, saturationHeadroomDb - baselineDb);
}

/** Effective dynamic range (dB) under the current settings, relative to the instrument's quoted spec conditions. */
export function dynamicRangeEffDb(
  instrument: InstrumentProfile,
  wavelengthNm: number,
  pulseWidthNs: number,
  averagingSeconds: number,
  liveInBand: boolean,
): number {
  const key = wavelengthKey(wavelengthNm);
  const base = instrument.dynamicRangeDb[key] ?? 0;
  const cond = instrument.dynamicRangeSpecConditions;
  const pulseTerm = 5 * Math.log10(pulseWidthNs / cond.pulseWidthNs);
  const avgTerm = 2.5 * Math.log10(averagingSeconds / cond.averagingSeconds);
  const penalty = liveInBand ? instrument.liveTrafficNoisePenaltyDb : 0;
  return base + pulseTerm + avgTerm - penalty;
}

/** Noise floor (dB, displayed level scale) under the current settings. */
export function noiseFloorDb(
  instrument: InstrumentProfile,
  wavelengthNm: number,
  pulseWidthNs: number,
  averagingSeconds: number,
  liveInBand: boolean,
): number {
  return -dynamicRangeEffDb(instrument, wavelengthNm, pulseWidthNs, averagingSeconds, liveInBand);
}

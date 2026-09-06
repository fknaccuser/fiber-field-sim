import { describe, expect, it } from 'vitest';
import {
  alpha,
  attenuationDeadZoneMeters,
  backscatterCoefficientDb,
  dynamicRangeEffDb,
  eventDeadZoneMeters,
  reflectionPeakHeightDbRaw,
} from './physics';
import { loadDefaultProfileSet } from '../../profiles';

const { network, otdrInstrument } = loadDefaultProfileSet();

describe('dead zones', () => {
  it('doubling pulse width exactly doubles the event and attenuation dead zones', () => {
    const nSetting = 1.4682;
    const edz1 = eventDeadZoneMeters(100, nSetting);
    const edz2 = eventDeadZoneMeters(200, nSetting);
    expect(edz2 / edz1).toBeCloseTo(2, 9);

    const adz1 = attenuationDeadZoneMeters(100, nSetting, otdrInstrument.attenuationDeadZoneFactor);
    const adz2 = attenuationDeadZoneMeters(200, nSetting, otdrInstrument.attenuationDeadZoneFactor);
    expect(adz2 / adz1).toBeCloseTo(2, 9);
  });
});

describe('alpha (fiber attenuation)', () => {
  it('matches the network profile default at 1550 nm for modern fiber', () => {
    expect(alpha({ fiberGeneration: 'low-water-peak' }, network, 1550)).toBeCloseTo(0.21, 6);
  });

  it('the legacy water-peak excess at 1550 nm is negligible (<0.01 dB/km)', () => {
    const modern = alpha({ fiberGeneration: 'low-water-peak' }, network, 1550);
    const legacy = alpha({ fiberGeneration: 'legacy' }, network, 1550);
    expect(legacy - modern).toBeLessThan(0.01);
    expect(legacy - modern).toBeGreaterThanOrEqual(0);
  });
});

describe('reflection peak height', () => {
  it('is larger for a 10 ns pulse than a 1 us pulse at the same reflectance', () => {
    const bsCoef10ns = backscatterCoefficientDb(network, 1550, 10);
    const bsCoef1us = backscatterCoefficientDb(network, 1550, 1000);
    const h10 = reflectionPeakHeightDbRaw(-40, bsCoef10ns);
    const h1us = reflectionPeakHeightDbRaw(-40, bsCoef1us);
    expect(h10).toBeGreaterThan(h1us);
  });
});

describe('noise floor / dynamic range', () => {
  it('10x averaging time raises effective dynamic range by 2.5 dB', () => {
    const base = dynamicRangeEffDb(otdrInstrument, 1550, 1000, 15, false);
    const tenX = dynamicRangeEffDb(otdrInstrument, 1550, 1000, 150, false);
    expect(tenX - base).toBeCloseTo(2.5, 6);
  });

  it('10x pulse width raises effective dynamic range by 5 dB', () => {
    const base = dynamicRangeEffDb(otdrInstrument, 1550, 100, 15, false);
    const tenX = dynamicRangeEffDb(otdrInstrument, 1550, 1000, 15, false);
    expect(tenX - base).toBeCloseTo(5, 6);
  });
});

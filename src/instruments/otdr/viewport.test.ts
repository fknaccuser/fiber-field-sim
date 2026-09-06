import { describe, expect, it } from 'vitest';
import { cursorReadout, downsampleForWidth, fromPixelX, toPixel, zoomAround, type Viewport } from './viewport';
import type { OtdrTraceResult, TraceSample } from './types';

const vp: Viewport = { xMinMeters: 0, xMaxMeters: 2000, yMinDb: -40, yMaxDb: 2 };

describe('toPixel / fromPixelX', () => {
  it('round-trips a distance through pixel space', () => {
    const widthPx = 800;
    const distance = 733;
    const { x } = toPixel(vp, widthPx, 400, distance, -5);
    const back = fromPixelX(vp, widthPx, x);
    expect(back).toBeCloseTo(distance, 6);
  });
});

describe('zoomAround', () => {
  it('never produces a viewport outside [0, original max]', () => {
    let current = vp;
    for (let i = 0; i < 20; i++) {
      current = zoomAround(current, 500 + i * 10, 1.5);
      expect(current.xMinMeters).toBeGreaterThanOrEqual(0);
    }
    // zooming back out repeatedly should not blow past the region we started in either.
    for (let i = 0; i < 5; i++) {
      current = zoomAround(current, 500, 1 / 1.5);
      expect(current.xMinMeters).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('cursorReadout', () => {
  function fakeResult(samples: TraceSample[]): OtdrTraceResult {
    return {
      access: { accessNodeId: 'a', launchSpanId: 's' },
      settings: { wavelengthNm: 1550, pulseWidthNs: 100, rangeMeters: 2000, iorSetting: 1.4682, averagingSeconds: 30, launchCableMeters: 0, receiveCableMeters: 0 },
      samples,
      events: [],
      noiseFloorDb: -30,
      eventDeadZoneMeters: 10,
      attenuationDeadZoneMeters: 50,
      simulatedSecondsElapsed: 50,
      violations: [],
      warnings: [],
      hidden: { groundTruth: [], ghosts: [], pathSpanIds: [], trueTotalLengthMeters: 2000 },
    };
  }

  it('two-point loss equals the level difference between the cursors', () => {
    const samples: TraceSample[] = [
      { distanceMeters: 100, levelDb: -1 },
      { distanceMeters: 900, levelDb: -3 },
    ];
    const result = fakeResult(samples);
    const readout = cursorReadout(result, 100, 900);
    expect(readout.aLevelDb).toBeCloseTo(-1, 6);
    expect(readout.bLevelDb).toBeCloseTo(-3, 6);
    expect(readout.twoPointLossDb).toBeCloseTo(2, 6);
    expect(readout.slopeDbPerKm).toBeCloseTo((2 / 800) * 1000, 6);
  });
});

describe('downsampleForWidth', () => {
  it('preserves the maximum sample of a reflective peak when decimating', () => {
    const samples: TraceSample[] = [];
    for (let i = 0; i < 5000; i++) {
      samples.push({ distanceMeters: i, levelDb: -0.001 * i });
    }
    samples[2500] = { distanceMeters: 2500, levelDb: 20 }; // a sharp reflective spike
    const vpWide: Viewport = { xMinMeters: 0, xMaxMeters: 5000, yMinDb: -10, yMaxDb: 25 };
    const down = downsampleForWidth(samples, vpWide, 200);
    const maxLevel = Math.max(...down.map((s) => s.levelDb));
    expect(maxLevel).toBeCloseTo(20, 6);
  });
});

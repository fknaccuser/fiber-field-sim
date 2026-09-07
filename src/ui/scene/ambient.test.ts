import { describe, expect, it } from 'vitest';
import { ambientFor, minutesOf } from './ambient';

const HEX = /^#[0-9a-f]{6}$/;

describe('reading the clock', () => {
  it('parses a working-day time', () => {
    expect(minutesOf('7:00')).toBe(420);
    expect(minutesOf('13:45')).toBe(825);
    expect(minutesOf(' 09:15 ')).toBe(555);
  });

  it('rejects anything that is not a clock, rather than half-parsing it', () => {
    for (const bad of ['', 'morning', '25:00', '12:60', '12', '12:0']) expect(minutesOf(bad)).toBeNull();
  });
});

describe('the light through the day', () => {
  it('is brightest in the middle and dimmest at the ends', () => {
    const dawn = ambientFor('06:00', 'clear');
    const noon = ambientFor('13:00', 'clear');
    const dusk = ambientFor('21:00', 'clear');
    expect(noon.sun.intensity).toBeGreaterThan(dawn.sun.intensity);
    expect(noon.sun.intensity).toBeGreaterThan(dusk.sun.intensity);
    expect(dusk.sun.intensity).toBeLessThan(dawn.sun.intensity);
  });

  it('moves the sun across the sky rather than leaving it nailed in one place', () => {
    const morning = ambientFor('07:00', 'clear').sun.position;
    const evening = ambientFor('19:00', 'clear').sun.position;
    expect(morning[0]).toBeLessThan(evening[0]);
    // And it is higher at midday than at either end.
    expect(ambientFor('13:00', 'clear').sun.position[1]).toBeGreaterThan(morning[1]);
  });

  it('keeps the sun above the horizon, so the scene is never unlit', () => {
    for (let h = 0; h <= 23; h++) {
      const a = ambientFor(`${String(h).padStart(2, '0')}:00`, 'clear');
      expect(a.sun.position[1]).toBeGreaterThan(0);
      expect(a.sun.intensity).toBeGreaterThan(0);
      expect(a.ambientIntensity).toBeGreaterThan(0);
    }
  });

  it('always produces real colours', () => {
    for (const t of ['06:00', '08:30', '12:15', '17:45', '23:00', 'nonsense']) {
      for (const w of ['clear', 'overcast', 'marine-layer', 'hot', 'unheard-of']) {
        const a = ambientFor(t, w);
        expect(a.sky).toMatch(HEX);
        expect(a.sun.color).toMatch(HEX);
        expect(a.hemisphere.sky).toMatch(HEX);
      }
    }
  });
});

describe('weather', () => {
  it('flattens the sun and lifts the fill when it is grey', () => {
    const clear = ambientFor('11:00', 'clear');
    const overcast = ambientFor('11:00', 'overcast');
    expect(overcast.sun.intensity).toBeLessThan(clear.sun.intensity);
    expect(overcast.ambientIntensity).toBeGreaterThan(clear.ambientIntensity);
  });

  it('brings the marine layer in close, so you cannot see down the street', () => {
    expect(ambientFor('07:00', 'marine-layer').fogFar).toBeLessThan(ambientFor('07:00', 'clear').fogFar);
    expect(ambientFor('07:00', 'marine-layer').fogNear).toBeLessThan(ambientFor('07:00', 'clear').fogNear);
  });

  it('falls back to clear for a sky it has never heard of', () => {
    expect(ambientFor('11:00', 'volcanic')).toEqual(ambientFor('11:00', 'clear'));
  });

  it('names the conditions for the chrome to show', () => {
    expect(ambientFor('07:15', 'marine-layer').label).toBe('Marine layer · 07:15');
  });
});

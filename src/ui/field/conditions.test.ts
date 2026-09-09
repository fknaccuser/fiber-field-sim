import { describe, expect, it } from 'vitest';
import { conditionsLabel, minutesOf, shiftOf, weatherLabel } from './conditions';

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

describe('conditions', () => {
  it('names every sky the generator can produce', () => {
    for (const w of ['clear', 'overcast', 'marine-layer', 'hot']) expect(weatherLabel(w)).not.toBe('');
    expect(weatherLabel('marine-layer')).toBe('Marine layer');
  });

  it('falls back to clear for a sky it has never heard of', () => {
    expect(weatherLabel('volcanic')).toBe(weatherLabel('clear'));
  });

  it('reads out as one line for the header', () => {
    expect(conditionsLabel('07:15', 'marine-layer')).toBe('Marine layer · 07:15');
  });
});

describe('the shift', () => {
  it('names the shift from the hour', () => {
    expect(shiftOf('03:00')).toBe('NIGHT SHIFT');
    expect(shiftOf('09:30')).toBe('DAY SHIFT');
    expect(shiftOf('14:00')).toBe('SWING SHIFT');
    expect(shiftOf('20:00')).toBe('NIGHT SHIFT');
  });

  it('defaults to day shift rather than guessing from a broken clock', () => {
    expect(shiftOf('half past nine')).toBe('DAY SHIFT');
  });
});

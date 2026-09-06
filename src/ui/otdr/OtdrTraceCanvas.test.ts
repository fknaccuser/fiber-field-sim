import { describe, expect, it } from 'vitest';
import source from './OtdrTraceCanvas.tsx?raw';

describe('OtdrTraceCanvas renderer guard', () => {
  it('never references ground-truth data', () => {
    expect(source).not.toMatch(/hidden/i);
  });
});

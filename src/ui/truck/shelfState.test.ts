import { describe, expect, it } from 'vitest';
import { consumables, shelfSlots, TOOLS } from './shelfState';

const FULL = ['otdr', 'power-meter', 'vfl', 'inspection-scope', 'launch-cable-500m', 'laptop'];

describe('tool shelf', () => {
  it('shows every tool as present when the truck is fully loaded', () => {
    const slots = shelfSlots(FULL);
    expect(slots).toHaveLength(TOOLS.length);
    expect(slots.every((s) => s.present)).toBe(true);
  });

  it('leaves a gap on the shelf for a tool that was left behind', () => {
    const slots = shelfSlots(FULL.filter((i) => i !== 'vfl'));
    const vfl = slots.find((s) => s.tool.id === 'vfl')!;
    expect(vfl.present).toBe(false);
    // Everything else is still there — one missing tool does not blank the shelf.
    expect(slots.filter((s) => s.present)).toHaveLength(TOOLS.length - 1);
  });

  it('maps the inspection scope to its own inventory string, not its tool id', () => {
    expect(shelfSlots(['scope']).find((s) => s.tool.id === 'scope')!.present).toBe(false);
    expect(shelfSlots(['inspection-scope']).find((s) => s.tool.id === 'scope')!.present).toBe(true);
  });

  it('reads the launch reel length out of the inventory string', () => {
    expect(consumables(FULL)[0]).toMatchObject({ present: true, detail: '500 m' });
    expect(consumables(['otdr'])[0]).toMatchObject({ present: false, detail: 'none on the truck' });
    expect(consumables(['launch-cable-2000m'])[0].detail).toBe('2000 m');
  });

  it('every tool opens a real viewport', () => {
    const valid = new Set(['otdr', 'power-meter', 'vfl', 'scope', 'terminal']);
    for (const t of TOOLS) expect(valid.has(t.opens)).toBe(true);
  });
});

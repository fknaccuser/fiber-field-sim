import { describe, expect, it } from 'vitest';
import { loadEquipmentProfile } from './loader';

import defaultEquipment from './equipment/hexatronic-commscope.yaml?raw';
import altEquipment from './equipment/__fixtures__/alt-example.yaml?raw';

/**
 * Proves the architectural requirement: loading a different profile file changes
 * vendor identity, label format, and port counts with zero change to any engine or
 * loader code. If this ever fails because equipment data leaked into code instead of
 * profiles, that's the constraint being violated.
 */
describe('equipment profile is fully swappable', () => {
  it('the same loader function produces different vendor/label/port data for a different profile file', () => {
    const active = loadEquipmentProfile(defaultEquipment);
    const alternate = loadEquipmentProfile(altEquipment);

    expect(active.splitterFiberVendor).toBe('Hexatronic');
    expect(alternate.splitterFiberVendor).toBe('Corning');
    expect(active.splitterFiberVendor).not.toBe(alternate.splitterFiberVendor);

    expect(active.labelFormat.example).toMatch(/^SPL/);
    expect(alternate.labelFormat.example).toMatch(/^AFL/);

    const activePop = active.catalog.find((c) => c.kind === 'olt-chassis-capacity')!.portCount;
    const alternatePop = alternate.catalog.find((c) => c.kind === 'olt-chassis-capacity')!.portCount;
    expect(activePop).toBe(192);
    expect(alternatePop).toBe(96);
    expect(activePop).not.toBe(alternatePop);
  });

  it('both profiles pass validation through the identical schema', () => {
    expect(() => loadEquipmentProfile(defaultEquipment)).not.toThrow();
    expect(() => loadEquipmentProfile(altEquipment)).not.toThrow();
  });
});

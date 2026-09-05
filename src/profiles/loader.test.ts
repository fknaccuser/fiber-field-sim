import { describe, expect, it } from 'vitest';
import {
  loadEquipmentProfile,
  loadNetworkProfile,
  loadRegionProfile,
  loadVendorProfile,
} from './loader';
import { loadDefaultProfileSet } from './index';

import networkXgsPon from './network/xgs-pon.yaml?raw';
import oltCalixAxosE from './vendor/olt-calix-axos-e.yaml?raw';
import equipmentHexatronicCommscope from './equipment/hexatronic-commscope.yaml?raw';
import regionCaSouthOcDigalert from './region/ca-south-oc-digalert.yaml?raw';

describe('default profile set loads and validates', () => {
  it('loads all five profiles without throwing', () => {
    const set = loadDefaultProfileSet();
    expect(set.network.id).toBe('xgs-pon-default');
    expect(set.oltVendor.kind).toBe('olt');
    expect(set.switchVendor.kind).toBe('switch');
    expect(set.equipment.splitterFiberVendor).toBe('Hexatronic');
    expect(set.region.oneCallCenterName).toMatch(/DigAlert/);
  });

  it('the network profile carries XGS-PON service wavelengths distinct from OTDR test wavelengths', () => {
    const net = loadNetworkProfile(networkXgsPon);
    expect(net.wavelengths.serviceDownstreamNm).toBe(1577);
    expect(net.wavelengths.serviceUpstreamNm).toBe(1270);
    expect(net.wavelengths.otdrTestWavelengthsNm).toEqual([1310, 1550, 1625]);
  });

  it('rejects a network profile missing required fields', () => {
    expect(() => loadNetworkProfile('id: broken\ndisplayName: Broken\n')).toThrow();
  });

  it('flags the POP capacity field as needing confirmation, per the field data gap', () => {
    const equipment = loadEquipmentProfile(equipmentHexatronicCommscope);
    const pop = equipment.catalog.find((c) => c.id === 'pop-capacity-192')!;
    expect(pop.portCount).toBe(192);
    expect(pop.needsConfirmation).toBe(true);
  });

  it('rejects a vendor profile with an empty command set', () => {
    expect(() =>
      loadVendorProfile('id: x\nkind: switch\ndisplayName: X\npromptFormat: "#"\ncommandSet: []\nsyntaxErrorTemplate: err'),
    ).toThrow();
  });

  it('loads the region profile with the confirmed South OC / DigAlert values', () => {
    const region = loadRegionProfile(regionCaSouthOcDigalert);
    expect(region.id).toBe('ca-south-oc-digalert');
    expect(region.toleranceZoneInches).toBe(24);
  });

  it('an OLT vendor profile validates independently of a switch vendor profile', () => {
    const olt = loadVendorProfile(oltCalixAxosE);
    expect(olt.kind).toBe('olt');
  });
});

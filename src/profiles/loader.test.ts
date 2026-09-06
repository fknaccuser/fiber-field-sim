import { describe, expect, it } from 'vitest';
import {
  loadEquipmentProfile,
  loadInstrumentProfile,
  loadNetworkProfile,
  loadRegionProfile,
  loadVendorProfile,
} from './loader';
import { loadDefaultProfileSet } from './index';

import networkXgsPon from './network/xgs-pon.yaml?raw';
import oltCalixE72 from './vendor/olt-calix-e7-2.yaml?raw';
import hostWindows from './vendor/host-windows.yaml?raw';
import equipmentHexatronicCommscope from './equipment/hexatronic-commscope.yaml?raw';
import otdrExfoMaxTester730c from './instrument/otdr-exfo-maxtester-730c.yaml?raw';
import regionCaSouthOcDigalert from './region/ca-south-oc-digalert.yaml?raw';

describe('default profile set loads and validates', () => {
  it('loads all seven profiles without throwing', () => {
    const set = loadDefaultProfileSet();
    expect(set.network.id).toBe('xgs-pon-default');
    expect(set.oltVendor.kind).toBe('olt');
    expect(set.switchVendor.kind).toBe('switch');
    expect(set.hostShell.kind).toBe('host');
    expect(set.equipment.splitterFiberVendor).toBe('Hexatronic');
    expect(set.otdrInstrument.displayName).toMatch(/MaxTester/);
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
      loadVendorProfile(
        'id: x\nkind: switch\ndisplayName: X\nmodePrompts: {user-exec: ">", priv-exec: "#", global-config: "(config)#", interface-config: "(config-if)#", vlan-config: "(config-vlan)#"}\ncommandSet: []\nmessages: {syntaxError: err, ambiguousCommand: err, incompleteCommand: err, unknownHost: err}',
      ),
    ).toThrow();
  });

  it('loads the region profile with the confirmed South OC / DigAlert values', () => {
    const region = loadRegionProfile(regionCaSouthOcDigalert);
    expect(region.id).toBe('ca-south-oc-digalert');
    expect(region.toleranceZoneInches).toBe(24);
  });

  it('an OLT vendor profile validates independently of a switch vendor profile', () => {
    const olt = loadVendorProfile(oltCalixE72);
    expect(olt.kind).toBe('olt');
  });

  it('the host shell profile validates as kind host with all five mode prompts', () => {
    const host = loadVendorProfile(hostWindows);
    expect(host.kind).toBe('host');
    expect(host.modePrompts['user-exec']).toContain('C:\\Users\\tech>');
    expect(host.commandSet.some((c) => c.handler === 'host-ipconfig')).toBe(true);
  });

  it('the OTDR instrument profile carries a real pulse-width range and out-of-band live-test wavelengths', () => {
    const otdr = loadInstrumentProfile(otdrExfoMaxTester730c);
    expect(otdr.pulseWidthsNsRange.minNs).toBeLessThanOrEqual(5);
    expect(otdr.pulseWidthsNsRange.maxNs).toBeGreaterThanOrEqual(20000);
    expect(otdr.liveTestOutOfBandNm).toEqual(expect.arrayContaining([1625]));
    expect(otdr.needsConfirmation).toBe(true); // exact MaxTester model not yet confirmed
  });

  it('rejects an instrument profile with an unknown kind', () => {
    expect(() =>
      loadInstrumentProfile(
        'id: x\nkind: power-meter\ndisplayName: X\nuiStyle: tablet-touchscreen\npulseWidthsNsRange: {minNs: 3, maxNs: 20000}\ndynamicRangeDb: {}\nliveTestOutOfBandNm: []\nmaxSplitterSupported: "1x32"',
      ),
    ).toThrow();
  });
});

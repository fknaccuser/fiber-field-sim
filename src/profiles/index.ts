export * from './schema';
export * from './loader';
export * from './registry';

import networkXgsPon from './network/xgs-pon.yaml?raw';
import oltCalixE72 from './vendor/olt-calix-e7-2.yaml?raw';
import switchCiscoIos from './vendor/switch-cisco-ios.yaml?raw';
import hostWindows from './vendor/host-windows.yaml?raw';
import equipmentHexatronicCommscope from './equipment/hexatronic-commscope.yaml?raw';
import otdrExfoMaxTester730c from './instrument/otdr-exfo-maxtester-730c.yaml?raw';
import regionCaSouthOcDigalert from './region/ca-south-oc-digalert.yaml?raw';

import {
  loadEquipmentProfile,
  loadInstrumentProfile,
  loadNetworkProfile,
  loadRegionProfile,
  loadVendorProfile,
} from './loader';
import type { ProfileSet } from './schema';

/**
 * The team's confirmed default profile set. This is a convenience loader, not a
 * hardcoded dependency: any consumer can instead load a different combination of
 * YAML files (e.g. to point at a different vendor, equipment catalog, instrument,
 * or region) through the same loadXProfile functions with zero code changes elsewhere.
 */
export function loadDefaultProfileSet(): ProfileSet {
  return {
    network: loadNetworkProfile(networkXgsPon),
    oltVendor: loadVendorProfile(oltCalixE72),
    switchVendor: loadVendorProfile(switchCiscoIos),
    equipment: loadEquipmentProfile(equipmentHexatronicCommscope),
    otdrInstrument: loadInstrumentProfile(otdrExfoMaxTester730c),
    hostShell: loadVendorProfile(hostWindows),
    region: loadRegionProfile(regionCaSouthOcDigalert),
  };
}

import { load as parseYamlDocument } from 'js-yaml';
import {
  EquipmentProfileSchema,
  NetworkProfileSchema,
  RegionProfileSchema,
  VendorProfileSchema,
  type EquipmentProfile,
  type NetworkProfile,
  type RegionProfile,
  type VendorProfile,
} from './schema';

function parseYaml(text: string): unknown {
  return parseYamlDocument(text);
}

export function loadNetworkProfile(yamlText: string): NetworkProfile {
  return NetworkProfileSchema.parse(parseYaml(yamlText));
}

export function loadVendorProfile(yamlText: string): VendorProfile {
  return VendorProfileSchema.parse(parseYaml(yamlText));
}

export function loadEquipmentProfile(yamlText: string): EquipmentProfile {
  return EquipmentProfileSchema.parse(parseYaml(yamlText));
}

export function loadRegionProfile(yamlText: string): RegionProfile {
  return RegionProfileSchema.parse(parseYaml(yamlText));
}

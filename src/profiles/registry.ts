/**
 * Bundles every profile YAML shipped with the app and indexes it by id, so a WorldState's
 * `activeProfiles` (a set of ids) can be resolved to the actual parsed ProfileSet without
 * any consumer hardcoding which file backs which id.
 */
import type { ActiveProfileSet } from '../world/types';
import {
  loadEquipmentProfile,
  loadInstrumentProfile,
  loadNetworkProfile,
  loadRegionProfile,
  loadVendorProfile,
} from './loader';
import type { EquipmentProfile, InstrumentProfile, NetworkProfile, ProfileSet, RegionProfile, VendorProfile } from './schema';

export class ProfileNotFoundError extends Error {
  readonly code = 'PROFILE_NOT_FOUND';
  readonly kind: string;
  readonly id: string;
  constructor(kind: string, id: string) {
    super(`No ${kind} profile with id "${id}"`);
    this.name = 'ProfileNotFoundError';
    this.kind = kind;
    this.id = id;
  }
}

type AnyProfile = NetworkProfile | VendorProfile | EquipmentProfile | InstrumentProfile | RegionProfile;

const rawModules = import.meta.glob('./**/*.yaml', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

function directorySegment(path: string): string {
  // e.g. './network/xgs-pon.yaml' -> 'network'
  const parts = path.replace(/^\.\//, '').split('/');
  return parts[0];
}

function loaderForDirectory(dir: string): ((text: string) => AnyProfile) | null {
  switch (dir) {
    case 'network':
      return loadNetworkProfile;
    case 'vendor':
      return loadVendorProfile;
    case 'equipment':
      return loadEquipmentProfile;
    case 'instrument':
      return loadInstrumentProfile;
    case 'region':
      return loadRegionProfile;
    default:
      return null;
  }
}

interface IndexedProfiles {
  network: Map<string, NetworkProfile>;
  vendor: Map<string, VendorProfile>;
  equipment: Map<string, EquipmentProfile>;
  instrument: Map<string, InstrumentProfile>;
  region: Map<string, RegionProfile>;
}

let cachedIndex: IndexedProfiles | null = null;

function buildIndex(): IndexedProfiles {
  const index: IndexedProfiles = {
    network: new Map(),
    vendor: new Map(),
    equipment: new Map(),
    instrument: new Map(),
    region: new Map(),
  };
  for (const [path, text] of Object.entries(rawModules)) {
    if (path.includes('__fixtures__')) continue;
    const dir = directorySegment(path);
    const loader = loaderForDirectory(dir);
    if (!loader) continue;
    const profile = loader(text);
    (index[dir as keyof IndexedProfiles] as Map<string, AnyProfile>).set(profile.id, profile);
  }
  return index;
}

function index(): IndexedProfiles {
  if (!cachedIndex) cachedIndex = buildIndex();
  return cachedIndex;
}

function getFrom<T extends AnyProfile>(map: Map<string, T>, kind: string, id: string): T {
  const found = map.get(id);
  if (!found) throw new ProfileNotFoundError(kind, id);
  return found;
}

/** Resolves a WorldState's activeProfiles (ids) to the actual parsed ProfileSet. */
export function resolveProfileSet(active: ActiveProfileSet): ProfileSet {
  const idx = index();
  return {
    network: getFrom(idx.network, 'network', active.network),
    oltVendor: getFrom(idx.vendor, 'vendor', active.oltVendor),
    switchVendor: getFrom(idx.vendor, 'vendor', active.switchVendor),
    equipment: getFrom(idx.equipment, 'equipment', active.equipment),
    otdrInstrument: getFrom(idx.instrument, 'instrument', active.otdrInstrument),
    region: getFrom(idx.region, 'region', active.region),
  };
}

function toEntries(values: AnyProfile[]): Array<{ id: string; displayName: string }> {
  return values.map((p) => ({
    id: p.id,
    displayName: 'displayName' in p ? (p as { displayName: string }).displayName : p.id,
  }));
}

/** Lists every bundled profile of a given kind (id + displayName only), e.g. for a profile picker. */
export function listProfiles(kind: keyof ProfileSet): Array<{ id: string; displayName: string }> {
  const idx = index();
  switch (kind) {
    case 'network':
      return toEntries(Array.from(idx.network.values()));
    case 'oltVendor':
    case 'switchVendor':
      return toEntries(Array.from(idx.vendor.values()));
    case 'equipment':
      return toEntries(Array.from(idx.equipment.values()));
    case 'otdrInstrument':
      return toEntries(Array.from(idx.instrument.values()));
    case 'region':
      return toEntries(Array.from(idx.region.values()));
  }
}

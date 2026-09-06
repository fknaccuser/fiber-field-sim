import { describe, expect, it } from 'vitest';
import { ProfileNotFoundError, resolveProfileSet } from './registry';
import { loadDefaultProfileSet } from './index';
import type { ActiveProfileSet } from '../world/types';

const activeIds: ActiveProfileSet = {
  network: 'xgs-pon-default',
  oltVendor: 'olt-calix-e7-2',
  switchVendor: 'switch-cisco-ios',
  equipment: 'hexatronic-commscope-default',
  otdrInstrument: 'otdr-exfo-maxtester-730c',
  hostShell: 'host-windows',
  region: 'ca-south-oc-digalert',
};

describe('resolveProfileSet', () => {
  it('resolves the same ids used elsewhere to the same content as loadDefaultProfileSet', () => {
    const resolved = resolveProfileSet(activeIds);
    const direct = loadDefaultProfileSet();
    expect(resolved).toEqual(direct);
  });

  it('throws ProfileNotFoundError naming the kind and id for an unknown profile', () => {
    expect(() => resolveProfileSet({ ...activeIds, network: 'does-not-exist' })).toThrow(ProfileNotFoundError);
    try {
      resolveProfileSet({ ...activeIds, network: 'does-not-exist' });
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(ProfileNotFoundError);
      expect((e as ProfileNotFoundError).kind).toBe('network');
      expect((e as ProfileNotFoundError).id).toBe('does-not-exist');
      expect((e as Error).message).toMatch(/network/);
      expect((e as Error).message).toMatch(/does-not-exist/);
    }
  });

  it('throws for an unknown vendor/instrument/region id too', () => {
    expect(() => resolveProfileSet({ ...activeIds, oltVendor: 'nope' })).toThrow(ProfileNotFoundError);
    expect(() => resolveProfileSet({ ...activeIds, otdrInstrument: 'nope' })).toThrow(ProfileNotFoundError);
    expect(() => resolveProfileSet({ ...activeIds, region: 'nope' })).toThrow(ProfileNotFoundError);
  });
});

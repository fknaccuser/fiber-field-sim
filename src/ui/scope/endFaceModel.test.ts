import { describe, expect, it } from 'vitest';
import { buildEndFaceModel, zoneOf, ZONE_ORDER, ZONE_RADII_UM } from './endFaceModel';

const base = { seed: 1, spanId: 'sp-drop-114', eventId: 'ev-ont-jack' };

describe('buildEndFaceModel', () => {
  it('is deterministic for the same connector and identical inputs', () => {
    const a = buildEndFaceModel({ ...base, grade: 'fail', zones: { core: 3, cladding: 2, adhesive: 1, contact: 2 } });
    const b = buildEndFaceModel({ ...base, grade: 'fail', zones: { core: 3, cladding: 2, adhesive: 1, contact: 2 } });
    expect(a).toEqual(b);
  });

  it('differs between connectors', () => {
    const a = buildEndFaceModel({ ...base, grade: 'pass', zones: { core: 0, cladding: 0, adhesive: 0, contact: 2 } });
    const b = buildEndFaceModel({ ...base, eventId: 'ev-nap-port', grade: 'pass', zones: { core: 0, cladding: 0, adhesive: 0, contact: 2 } });
    expect(a.defects).not.toEqual(b.defects);
  });

  it('places exactly the counted defects the instrument reported, each inside its zone', () => {
    const zones = { core: 2, cladding: 3, adhesive: 1, contact: 2 };
    const model = buildEndFaceModel({ ...base, grade: 'fail', zones });
    for (const zone of ZONE_ORDER) {
      const counted = model.defects.filter((d) => d.counted && d.zone === zone);
      expect(counted).toHaveLength(zones[zone]);
      for (const d of counted) {
        const r = Math.hypot(d.x, d.y);
        expect(zoneOf(r)).toBe(zone);
        expect(r).toBeLessThanOrEqual(ZONE_RADII_UM[zone]);
      }
    }
  });

  it('a passing face has nothing in the core or cladding', () => {
    const model = buildEndFaceModel({ ...base, grade: 'pass', zones: { core: 0, cladding: 0, adhesive: 0, contact: 1 } });
    expect(model.defects.some((d) => d.zone === 'core' || d.zone === 'cladding')).toBe(false);
    expect(model.defects.some((d) => d.kind === 'oil')).toBe(false);
  });

  it('a heavily contaminated core also gets an oil film', () => {
    const model = buildEndFaceModel({ ...base, grade: 'fail', zones: { core: 4, cladding: 1, adhesive: 0, contact: 0 } });
    const oil = model.defects.filter((d) => d.kind === 'oil');
    expect(oil).toHaveLength(1);
    expect(oil[0].counted).toBe(false);
    expect(oil[0].lobes).toHaveLength(12);
  });
});

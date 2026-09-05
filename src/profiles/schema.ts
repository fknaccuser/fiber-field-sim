/**
 * Zod schemas for the profiles layer. Nothing about vendor identity, model number,
 * label/serial format, split ratio, port count, or regional compliance rule may be
 * written directly into engine or scenario code — it all comes from a profile loaded
 * through these schemas. Swapping a company's stack or a crew's region later means
 * authoring a new YAML file, never touching this schema or any engine code.
 */
import { z } from 'zod';

const wavelengthTripleSchema = z.object({
  '1310': z.number().optional(),
  '1550': z.number().optional(),
  '1625': z.number().optional(),
});

export const NetworkProfileSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  ponGeneration: z.enum(['xgs-pon', 'gpon', 'active-ethernet']),
  wavelengths: z.object({
    serviceDownstreamNm: z.number(),
    serviceUpstreamNm: z.number(),
    otdrTestWavelengthsNm: z.array(z.number()).min(1),
    liveTestOutOfBandNm: z.array(z.number()),
  }),
  lossBudgetClasses: z
    .array(z.object({ name: z.string(), minDb: z.number(), maxDb: z.number() }))
    .min(1),
  splitterLadder: z
    .array(z.object({ ratio: z.string(), nominalLossDb: z.number() }))
    .min(1),
  receivePower: z.object({
    minDbm: z.number(),
    maxDbm: z.number(),
    lossOfSignalBelowDbm: z.number(),
  }),
  fiberAttenuationDbPerKm: wavelengthTripleSchema,
  iorDefault: wavelengthTripleSchema,
  waterPeakNm: z.number().optional(),
  otdrPulseWidthsNs: z.array(z.number()).min(1),
  citation: z.string().optional(),
});
export type NetworkProfile = z.infer<typeof NetworkProfileSchema>;

export const VendorProfileSchema = z.object({
  id: z.string(),
  kind: z.enum(['olt', 'switch']),
  displayName: z.string(),
  promptFormat: z.string(), // e.g. "{hostname}#"
  commandSet: z
    .array(z.object({ pattern: z.string(), description: z.string() }))
    .min(1),
  syntaxErrorTemplate: z.string(),
  notes: z.string().optional(),
});
export type VendorProfile = z.infer<typeof VendorProfileSchema>;

export const EquipmentProfileSchema = z.object({
  id: z.string(),
  splitterFiberVendor: z.string(),
  cabinetVendor: z.string(),
  labelFormat: z.object({ pattern: z.string(), example: z.string() }),
  serialFormat: z.object({ pattern: z.string(), example: z.string() }),
  catalog: z
    .array(
      z.object({
        id: z.string(),
        kind: z.enum(['splitter', 'fdh-cabinet', 'distribution-terminal', 'olt-chassis-capacity']),
        portCount: z.number().int().positive(),
        needsConfirmation: z.boolean().optional(),
        notes: z.string().optional(),
      }),
    )
    .min(1),
});
export type EquipmentProfile = z.infer<typeof EquipmentProfileSchema>;

export const RegionProfileSchema = z.object({
  id: z.string(),
  oneCallCenterName: z.string(),
  statute: z.string(),
  advanceNoticeBusinessDays: z.number().positive(),
  ticketValidityDays: z.number().positive(),
  toleranceZoneInches: z.number().positive(),
  positiveResponseRequired: z.boolean(),
  citationNote: z.string().optional(),
});
export type RegionProfile = z.infer<typeof RegionProfileSchema>;

export interface ProfileSet {
  network: NetworkProfile;
  oltVendor: VendorProfile;
  switchVendor: VendorProfile;
  equipment: EquipmentProfile;
  region: RegionProfile;
}

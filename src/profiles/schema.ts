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
  /** Round-trip Rayleigh backscatter level relative to incident, for a 1 ns pulse (SMF-28-class defaults). */
  backscatterCoefficientDb1ns: wavelengthTripleSchema.default({ '1310': -79.4, '1550': -81.9, '1625': -82.5 }),
  /** Extra attenuation (dB/km) at the 1383 nm water peak on 'legacy' fiber spans, modeled as a Gaussian bump. */
  waterPeakExcessDbPerKm: z.number().default(1.0),
  waterPeakSigmaNm: z.number().default(30),
  /** XGS-PON OLT launch power (dBm), used by the power meter and ONT receive-power derivation. */
  oltTxPowerDbm: z.number().default(4.0),
  citation: z.string().optional(),
});
export type NetworkProfile = z.infer<typeof NetworkProfileSchema>;

export const CliModeSchema = z.enum(['user-exec', 'priv-exec', 'global-config', 'interface-config', 'vlan-config']);
export type CliMode = z.infer<typeof CliModeSchema>;

export const CommandEntrySchema = z.object({
  /** Tokens: literals or {param}; a final {...rest} swallows the remainder of the input. */
  pattern: z.string(),
  /** Vendor-neutral handler id (src/instruments/cli/handlers), validated against HANDLER_IDS at registry load. */
  handler: z.string(),
  modes: z.array(CliModeSchema).min(1),
  description: z.string(),
  transitionsTo: CliModeSchema.optional(),
});
export type CommandEntry = z.infer<typeof CommandEntrySchema>;

export const VendorProfileSchema = z.object({
  id: z.string(),
  kind: z.enum(['olt', 'switch', 'host']),
  displayName: z.string(),
  /** Prompt templates with {hostname}, keyed by CliMode. A 'host' profile only meaningfully uses 'user-exec' but must supply all keys. */
  modePrompts: z.record(CliModeSchema, z.string()),
  commandSet: z.array(CommandEntrySchema).min(1),
  messages: z.object({
    syntaxError: z.string(),
    ambiguousCommand: z.string(),
    incompleteCommand: z.string(),
    unknownHost: z.string(),
    enterConfig: z.string().optional(),
  }),
  interfaceFamilies: z
    .array(z.object({ prefix: z.string(), abbrev: z.string(), cdpAbbrev: z.string(), typeLabel: z.string(), bandwidthKbit: z.number() }))
    .default([]),
  cdpCapable: z.boolean().default(false),
  osVersionLine: z.string().optional(),
  transceiverThresholds: z
    .object({
      /** [highAlarm, highWarn, lowWarn, lowAlarm]. */
      temperatureC: z.tuple([z.number(), z.number(), z.number(), z.number()]),
      txDbm: z.tuple([z.number(), z.number(), z.number(), z.number()]),
      rxDbm: z.tuple([z.number(), z.number(), z.number(), z.number()]),
    })
    .optional(),
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

export const InstrumentProfileSchema = z.object({
  id: z.string(),
  kind: z.enum(['otdr']), // extend with 'power-meter', 'inspection-scope', etc. as later stages need them
  displayName: z.string(),
  uiStyle: z.enum(['tablet-touchscreen', 'button-panel']),
  /** In nanoseconds. The engine's simulated pulse-width list (network profile) should stay within this instrument's real range. */
  pulseWidthsNsRange: z.object({ minNs: z.number(), maxNs: z.number() }),
  dynamicRangeDb: wavelengthTripleSchema,
  liveTestOutOfBandNm: z.array(z.number()),
  maxSplitterSupported: z.string(),
  powerMeterMaxDbm: z.number().optional(),
  /** Dead zone beyond the event dead zone before attenuation measurement recovers; multiple of the event dead zone. Spec range 5-10. */
  attenuationDeadZoneFactor: z.number().default(5),
  /** The pulse width / averaging time at which dynamicRangeDb above is quoted, per the instrument's spec sheet. */
  dynamicRangeSpecConditions: z.object({ pulseWidthNs: z.number(), averagingSeconds: z.number() }).default({ pulseWidthNs: 20000, averagingSeconds: 180 }),
  averagingSecondsOptions: z.array(z.number()).default([5, 15, 30, 60, 180]),
  frontPanelReflectanceDb: z.number().default(-45),
  /** Maximum displayed level above the launch level before the trace is considered saturated/clipped. */
  saturationHeadroomDb: z.number().default(3),
  /** Extra noise-floor penalty (dB) applied when testing in-band on a live PON. */
  liveTrafficNoisePenaltyDb: z.number().default(10),
  ghostThresholdReflectanceDb: z.number().default(-35),
  ghostDecayDbPerOrder: z.number().default(6),
  sampleCount: z.number().default(4096),
  needsConfirmation: z.boolean().optional(),
  notes: z.string().optional(),
  citation: z.string().optional(),
});
export type InstrumentProfile = z.infer<typeof InstrumentProfileSchema>;

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
  otdrInstrument: InstrumentProfile;
  hostShell: VendorProfile;
  region: RegionProfile;
}

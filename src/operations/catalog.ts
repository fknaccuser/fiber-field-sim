/**
 * The hardware this crew actually opens.
 *
 * Diagnosis scenarios could stay generic — a splice is a splice. Construction and
 * maintenance work cannot: the number of trays in a FOSC 450 decides how you route,
 * a HexDome's dome-versus-inline form decides how you stand and where the slack goes,
 * and a tray's fibre capacity decides whether a 144f ribbon job fits at all.
 *
 * ON THE NUMBERS. The model designations here are the ones this crew named, and the
 * families are real. The individual capacities are **provisional** — variants of the same
 * family differ, and a trainer that teaches a wrong tray count is worse than one that
 * admits it does not know. Every entry therefore carries `verified`, and nothing in the
 * engine may treat an unverified figure as fact without saying so. Replace them from the
 * installation manuals and flip the flag; the shape of the data will not change.
 */

export type Vendor = 'commscope' | 'hexatronic';

/** Inline closures are re-entered lying down; domes stand on the pedestal or hang. */
export type ClosureForm = 'inline' | 'dome';

export interface ClosureModel {
  id: string;
  vendor: Vendor;
  /** Product family as printed on the housing. */
  family: string;
  designation: string;
  form: ClosureForm;
  /** Splice trays the base configuration carries. */
  trays: number;
  /** Single-fusion splices a tray holds. Ribbon sleeves consume more room per splice. */
  splicesPerTray: number;
  /** Manufacturer minimum bend radius for stored fibre, in millimetres. */
  minBendRadiusMm: number;
  /** Whether the capacities above have been checked against the installation manual. */
  verified: boolean;
  /** What it is actually for, in the words a technician would use. */
  note: string;
}

/**
 * A note on `minBendRadiusMm`: 30 mm is the long-standing floor for 250 µm coated fibre
 * stored in a tray, and it is the number a tray's radius limiters are moulded to. It is
 * a different figure from the cable's own bend radius during pulling, which is an
 * order of magnitude larger and belongs to the placing job, not the splicing job.
 */
export const CLOSURES: readonly ClosureModel[] = [
  {
    id: 'fosc-450',
    vendor: 'commscope',
    family: 'FOSC 450',
    designation: 'FOSC-450',
    form: 'inline',
    trays: 4,
    splicesPerTray: 24,
    minBendRadiusMm: 30,
    verified: false,
    note: 'Inline closure. Re-enterable, gel-free, the workhorse for a mid-span splice in a handhole.',
  },
  {
    id: 'fist-gc02-b',
    vendor: 'commscope',
    family: 'FIST-GC02',
    designation: 'FIST-GCO2-B',
    form: 'dome',
    trays: 4,
    splicesPerTray: 24,
    minBendRadiusMm: 30,
    verified: false,
    note: 'Round dome closure. Single-ended entry, so all cable slack is managed at the base.',
  },
  {
    id: 'hexdome-large',
    vendor: 'hexatronic',
    family: 'HexDome',
    designation: 'FCLD-LHDC-HS',
    form: 'dome',
    trays: 6,
    splicesPerTray: 24,
    minBendRadiusMm: 30,
    verified: false,
    note: 'Large HexDome. Higher tray count for branching a backbone tube into distribution.',
  },
  {
    id: 'hexdome-slim',
    vendor: 'hexatronic',
    family: 'HexDome',
    designation: 'FCLD-SHDC-HS',
    form: 'dome',
    trays: 3,
    splicesPerTray: 24,
    minBendRadiusMm: 30,
    verified: false,
    note: 'Slim HexDome. Fits a tighter handhole; the trade is working room, not capability.',
  },
];

export interface CabinetModel {
  id: string;
  vendor: Vendor;
  designation: string;
  /** Distribution ports the cabinet terminates. */
  ports: number;
  splitterShelves: number;
  minBendRadiusMm: number;
  verified: boolean;
  note: string;
}

export const CABINETS: readonly CabinetModel[] = [
  {
    id: 'hexdome-fdh',
    vendor: 'hexatronic',
    designation: 'HUS00042A',
    ports: 288,
    splitterShelves: 4,
    minBendRadiusMm: 30,
    verified: false,
    note: 'Large HexDome FDH. Feeder in, splitters on the shelves, distribution out to the NAPs.',
  },
];

/**
 * How the loose fibres become a ribbon.
 *
 * This crew does not buy bonded ribbon cable — they ribbonize on the truck. The fibres
 * arrive separate in a Hexatronic tube, get bonded with the glue method, and only then can
 * a mass-fusion splicer see them as one unit. That ordering is the whole reason the
 * procedure has the shape it does, and getting it wrong is the most expensive mistake on
 * the job because it is only visible after the splice.
 */
export type RibbonSource = 'loose-glued' | 'bonded-ribbon' | 'rollable-ribbon';

export interface RibbonSpec {
  source: RibbonSource;
  /** Fibres bonded side by side and spliced in one shot. */
  fibreCount: 4 | 8 | 12;
  label: string;
  note: string;
}

export const RIBBON_SPECS: readonly RibbonSpec[] = [
  {
    source: 'loose-glued',
    fibreCount: 12,
    label: '12f ribbonized on site',
    note: 'Loose fibres from the tube, bonded with the glue method, then stripped as one with the heat jacket tool.',
  },
  {
    source: 'loose-glued',
    fibreCount: 8,
    label: '8f ribbonized on site',
    note: 'Partial ribbon: the glue matrix must still be even, or the outer fibres sit proud in the holder.',
  },
  {
    source: 'bonded-ribbon',
    fibreCount: 12,
    label: '12f factory bonded',
    note: 'Arrives as a ribbon. Skips the glue step; everything downstream is identical.',
  },
];

export const TUBE_COLORS: readonly string[] = [
  'blue', 'orange', 'green', 'brown', 'slate', 'white',
  'red', 'black', 'yellow', 'violet', 'rose', 'aqua',
];

export function closureById(id: string): ClosureModel | undefined {
  return CLOSURES.find((c) => c.id === id);
}

/** Whole-closure splice capacity, which is what decides if a job fits in the box you brought. */
export function closureCapacity(model: ClosureModel): number {
  return model.trays * model.splicesPerTray;
}

/** Everything whose numbers still need checking against a manual, for the docs to list. */
export function unverified(): string[] {
  return [
    ...CLOSURES.filter((c) => !c.verified).map((c) => c.designation),
    ...CABINETS.filter((c) => !c.verified).map((c) => c.designation),
  ];
}

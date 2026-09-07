/**
 * What is actually on the truck. Pure, so "you left the VFL on the bench" is a testable
 * fact rather than a UI accident: a tool absent from `truckInventory` is absent from the
 * shelf, and the shelf shows an empty outline where it should have been.
 */
import type { TabId } from '../field/navigation';

export type ToolId = 'otdr' | 'power-meter' | 'vfl' | 'scope' | 'laptop';

export interface ToolDef {
  id: ToolId;
  /** What the trainee calls it. */
  name: string;
  /** FiberOps model number on the bezel. */
  model: string;
  /** The inventory string a scenario must list for this tool to be on the truck. */
  requires: string;
  /** Which viewport picking it up opens. */
  opens: TabId;
  blurb: string;
}

export const TOOLS: ToolDef[] = [
  { id: 'otdr', name: 'OTDR', model: 'MX-730', requires: 'otdr', opens: 'otdr', blurb: 'Locate events by distance along the fiber.' },
  { id: 'power-meter', name: 'Power meter', model: 'PM-320', requires: 'power-meter', opens: 'power-meter', blurb: 'Absolute light level at a point.' },
  { id: 'vfl', name: 'VFL', model: 'VL-7', requires: 'vfl', opens: 'vfl', blurb: 'Red light to find a break or bend by eye.' },
  { id: 'scope', name: 'Inspection scope', model: 'FS-400', requires: 'inspection-scope', opens: 'scope', blurb: 'End-face cleanliness, by zone.' },
  { id: 'laptop', name: 'Laptop', model: 'FO-BOOK', requires: 'laptop', opens: 'terminal', blurb: 'Console, plant records, and the work order.' },
];

/** Extra items the shelf shows as consumables rather than instruments. */
export interface Consumable {
  label: string;
  present: boolean;
  detail: string;
}

export interface ShelfSlot {
  tool: ToolDef;
  present: boolean;
}

export function shelfSlots(truckInventory: readonly string[]): ShelfSlot[] {
  return TOOLS.map((tool) => ({ tool, present: truckInventory.includes(tool.requires) }));
}

/** The launch reel is the one consumable an instrument rule already enforces. */
export function consumables(truckInventory: readonly string[]): Consumable[] {
  const reel = truckInventory.find((i) => /^launch-cable-(\d+)m$/.test(i));
  const metres = reel ? Number(/^launch-cable-(\d+)m$/.exec(reel)![1]) : 0;
  return [
    { label: 'Launch reel', present: metres > 0, detail: metres > 0 ? `${metres} m` : 'none on the truck' },
    { label: 'Cleaning kit', present: truckInventory.includes('cleaning-kit'), detail: truckInventory.includes('cleaning-kit') ? 'stocked' : 'not stocked' },
  ];
}

/** The apps that live on the laptop rather than being separate tools. */
export const LAPTOP_APPS: Array<{ label: string; opens: TabId; blurb: string }> = [
  { label: 'Console', opens: 'terminal', blurb: 'OLT, switches, customer host' },
  { label: 'Plant records', opens: 'records', blurb: 'Splice sheets, work orders, as-builts' },
  { label: 'Work order', opens: 'diagnose', blurb: 'File the diagnosis and cite evidence' },
];

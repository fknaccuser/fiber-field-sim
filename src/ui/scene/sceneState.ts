/**
 * What the visual layer is allowed to show, derived from the redacted session only. The
 * rule for every indicator here: a technician standing at the equipment may see its
 * physical state (an ONT's power LED), and anything the trainee has *measured or been
 * told* (a power-meter reading, an OLT status line) may be reflected back. Nothing is
 * computed from optical physics on the client -- that is the answer key.
 */
import type { UiActionEvent, UiSessionState } from '../../session/runner';
import type { LedStatus } from '../components/Led';

export interface OntLeds {
  /** False when the trainee is not standing at this ONT -- LEDs are then drawn unlit and unreadable. */
  visible: boolean;
  power: LedStatus;
  pon: LedStatus;
  los: LedStatus;
  lan: LedStatus;
  /** One line for the selection card explaining what the LEDs are based on. */
  basis: string;
}

export function ontIdFor(ui: UiSessionState, ontNodeId: string): string | null {
  for (const d of ui.world.devices) {
    for (const port of d.ponPorts ?? []) {
      const ont = port.onts.find((o) => o.ontNodeId === ontNodeId);
      if (ont) return ont.ontId;
    }
  }
  return null;
}

export function latestOntStatusObserved(ui: UiSessionState, ontNodeId: string): string | null {
  const ontId = ontIdFor(ui, ontNodeId);
  if (!ontId) return null;
  for (let i = ui.log.length - 1; i >= 0; i--) {
    const a = ui.log[i];
    if (a.type !== 'cli') continue;
    const f = a.facts.find((x) => x.kind === 'ont-status-observed' && x.ontId === ontId);
    if (f && f.kind === 'ont-status-observed') return f.status;
  }
  return null;
}

export function latestPowerReading(ui: UiSessionState, nodeId: string): Extract<UiActionEvent, { type: 'power-meter' }> | null {
  for (let i = ui.log.length - 1; i >= 0; i--) {
    const a = ui.log[i];
    if (a.type === 'power-meter' && a.nodeId === nodeId) return a;
  }
  return null;
}

export function ontLeds(ui: UiSessionState, ontNodeId: string): OntLeds {
  const node = ui.world.topology.nodes.find((n) => n.id === ontNodeId);
  const visible = ui.locationNodeId === ontNodeId;
  if (!node || !visible) return { visible: false, power: 'off', pon: 'off', los: 'off', lan: 'off', basis: 'Too far away to read the LEDs; roll to the premise.' };

  const powered = node.attributes?.powered !== false;
  if (!powered) return { visible: true, power: 'off', pon: 'off', los: 'off', lan: 'off', basis: 'Every LED is dark: the ONT has no power.' };

  const reading = latestPowerReading(ui, ontNodeId);
  const status = latestOntStatusObserved(ui, ontNodeId);
  const minDbm = ui.profiles.network.receivePower.minDbm;

  if (reading) {
    if (reading.dbm === null) return { visible: true, power: 'ok', pon: 'off', los: 'alarm', lan: 'off', basis: `Power on, LOS red: your meter read no light here (${reading.wavelengthNm} nm).` };
    if (reading.dbm < minDbm) return { visible: true, power: 'ok', pon: 'warn', los: 'off', lan: status === 'online' ? 'ok' : 'off', basis: `Power on, PON amber: ${reading.dbm.toFixed(1)} dBm is below the ${minDbm} dBm window.` };
    return { visible: true, power: 'ok', pon: 'ok', los: 'off', lan: status === 'online' || status === null ? 'ok' : 'off', basis: `Power on, PON green: ${reading.dbm.toFixed(1)} dBm at the input.` };
  }
  if (status === 'los') return { visible: true, power: 'ok', pon: 'off', los: 'alarm', lan: 'off', basis: 'Power on, LOS red: the OLT reported loss of signal for this ONT.' };
  if (status === 'online') return { visible: true, power: 'ok', pon: 'ok', los: 'off', lan: 'ok', basis: 'Power on, PON green: the OLT shows this ONT online.' };
  if (status === 'serial-mismatch' || status === 'unprovisioned') return { visible: true, power: 'ok', pon: 'warn', los: 'off', lan: 'off', basis: 'Power on, PON blinking: light is present but the ONT never ranged.' };
  if (status === 'rogue') return { visible: true, power: 'ok', pon: 'warn', los: 'off', lan: 'off', basis: 'Power on, PON blinking: the OLT flagged this ONT as misbehaving.' };
  return { visible: true, power: 'ok', pon: 'off', los: 'off', lan: 'off', basis: 'Power LED is on. Read the optical LEDs with a meter or the OLT before you trust them.' };
}

export type EnclosureState = Record<string, boolean>;

/** Which drawn equipment the trainee can physically open right now: only what they are standing at. */
export function canOpen(ui: UiSessionState, placementNodeId: string, parentNodeId: string | undefined): boolean {
  return ui.locationNodeId === placementNodeId || (parentNodeId !== undefined && ui.locationNodeId === parentNodeId) || ui.world.topology.nodes.some((n) => n.id === ui.locationNodeId && (n.attributes?.cabinetNodeId === placementNodeId || n.attributes?.cabinetNodeId === parentNodeId));
}

/** The last OTDR shot, for the trace view. */
export function lastOtdrShot(ui: UiSessionState): Extract<UiActionEvent, { type: 'otdr-shot' }> | null {
  for (let i = ui.log.length - 1; i >= 0; i--) {
    const a = ui.log[i];
    if (a.type === 'otdr-shot') return a;
  }
  return null;
}

/**
 * The World tab: the 3D plant plus its controls. Selecting an object here selects the real
 * topology entity, and the action card offers exactly what a technician standing there
 * could do with it — open it, roll to it, or hand it to an instrument.
 */
import { lazy, Suspense, useMemo } from 'react';
import type { UiSessionState } from '../../session/runner';
import type { Intent } from '../../session/types';
import { Chip } from '../components/Chip';
import { Led } from '../components/Led';
import { SoftKey } from '../components/SoftKey';
import { useViewportState } from '../viewport/viewportStore';
import { layoutScene, type Placement } from './sceneLayout';
import { canOpen, lastOtdrShot, ontLeds } from './sceneState';
import { availableModes, CAMERA_MODE_LABELS, poseFor, type CameraMode } from './camera';
import { CompassRose } from './CompassRose';
import { AccessibleList } from './AccessibleList';

const PlantScene = lazy(() => import('./PlantScene').then((m) => ({ default: m.PlantScene })));

const KIND_NOUN: Record<string, string> = {
  pop: 'Central office',
  fdh: 'Fiber distribution hub',
  splitter: 'Splitter module',
  handhole: 'Handhole',
  pedestal: 'NAP pedestal port',
  house: 'Customer premise',
  nid: 'Demarcation enclosure',
  ont: 'Optical network terminal',
  yard: 'Truck yard',
  device: 'Network equipment',
};

const OPEN_VERB: Record<string, [string, string]> = {
  fdh: ['Open cabinet', 'Close cabinet'],
  splitter: ['Open cabinet', 'Close cabinet'],
  handhole: ['Lift lid', 'Replace lid'],
  nid: ['Open cover', 'Close cover'],
  pop: ['Enter building', 'Step outside'],
};

/** The topology node a placement stands for when it is a purely visual sub-part (a NID belongs to its ONT). */
function boundNodeId(p: Placement): string {
  return p.kind === 'nid' && p.nodeId.endsWith('__nid') ? p.nodeId.slice(0, -'__nid'.length) : p.nodeId;
}

export function WorldViewport({ ui, dispatch }: { ui: UiSessionState; dispatch(intent: Intent): void }) {
  const layout = useMemo(() => layoutScene(ui.world.topology.nodes, ui.world.topology.spans, ui.world.hosts), [ui.world.topology.nodes, ui.world.topology.spans, ui.world.hosts]);
  const [selectedId, setSelectedId] = useViewportState<string | null>('world.selected', null);
  const [mode, setMode] = useViewportState<CameraMode>('world.mode', 'field');
  const [openIds, setOpenIds] = useViewportState<string[]>('world.open', []);
  const [selectedTray, setSelectedTray] = useViewportState<number | null>('world.tray', null);
  const [quality, setQuality] = useViewportState<'full' | 'reduced'>('world.quality', 'full');
  const [listMode, setListMode] = useViewportState<boolean>('world.list', false);
  const [cardOpen, setCardOpen] = useViewportState<boolean>('world.card', true);

  const focus = selectedId ? layout.placements.find((p) => p.nodeId === selectedId) ?? null : null;
  const tracedSpanIds = useMemo(() => lastOtdrShot(ui)?.pathSpanIds ?? [], [ui]);
  const hasTrace = tracedSpanIds.length > 0;
  const modes = availableModes(focus, hasTrace);
  const effectiveMode = modes.includes(mode) ? mode : 'field';

  const bound = focus ? boundNodeId(focus) : null;
  const boundNode = bound ? ui.world.topology.nodes.find((n) => n.id === bound) ?? null : null;
  const here = bound !== null && ui.locationNodeId === bound;
  const openable = focus ? OPEN_VERB[focus.kind] : undefined;
  const closureKey = focus && focus.kind === 'handhole' ? `${focus.nodeId}__closure` : null;
  const isOpen = focus ? openIds.includes(focus.nodeId) : false;
  const closureOpen = closureKey ? openIds.includes(closureKey) : false;
  const mayOpen = focus ? canOpen(ui, focus.nodeId, focus.parentNodeId) || here : false;
  const leds = focus && focus.kind === 'ont' ? ontLeds(ui, focus.nodeId) : null;

  const toggle = (key: string) => setOpenIds((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const select = (id: string | null) => {
    setSelectedId(id);
    if (id === null) setSelectedTray(null);
    if (id && (mode === 'equipment' || mode === 'cutaway')) return;
  };

  return (
    <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {listMode ? (
        <AccessibleList ui={ui} layout={layout} selectedId={selectedId} onSelect={select} dispatch={dispatch} />
      ) : (
        <Suspense fallback={<div style={{ padding: 16, color: 'var(--muted)' }}>Loading the plant…</div>}>
          <PlantScene ui={ui} layout={layout} mode={effectiveMode} focus={focus} selectedId={selectedId} openIds={openIds} selectedTray={selectedTray} quality={quality} onSelect={select} onSelectTray={setSelectedTray} />
        </Suspense>
      )}

      {/* One scrolling row of controls, so nothing collides on a short screen. */}
      <div style={{ position: 'absolute', top: 6, left: 6, right: 6, display: 'flex', gap: 6, overflowX: 'auto', alignItems: 'center', paddingBottom: 2 }}>
        {!listMode &&
          modes.map((m) => (
            <Chip key={m} active={effectiveMode === m} onClick={() => setMode(m)}>
              {CAMERA_MODE_LABELS[m]}
            </Chip>
          ))}
        {!listMode && <Chip onClick={() => setSelectedId(null)}>Reset</Chip>}
        <Chip active={listMode} onClick={() => setListMode(!listMode)}>
          {listMode ? '3D view' : 'List'}
        </Chip>
        {!listMode && (
          <Chip active={quality === 'reduced'} onClick={() => setQuality(quality === 'full' ? 'reduced' : 'full')}>
            {quality === 'full' ? 'Low graphics' : 'Full graphics'}
          </Chip>
        )}
      </div>

      {/* Which way you are facing, read off the same pose the camera uses. */}
      {!listMode && (
        <div style={{ position: 'absolute', top: 44, left: 8 }}>
          <CompassRose pose={poseFor(effectiveMode, layout, focus, tracedSpanIds)} />
        </div>
      )}

      {focus && !listMode && (
        <div className="bezel" style={{ position: 'absolute', left: 8, right: 8, bottom: 8, padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button type="button" onClick={() => setCardOpen(!cardOpen)} aria-label={cardOpen ? 'Collapse details' : 'Expand details'} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', fontSize: 12, minWidth: 20, minHeight: 32, padding: 0 }}>
              {cardOpen ? '▾' : '▸'}
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{focus.node.label}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {KIND_NOUN[focus.kind] ?? focus.kind}
                {here ? ' · you are here' : ''}
                {leds && cardOpen ? ` · ${leds.basis}` : ''}
              </div>
            </div>
            {leds && (
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <Led status={leds.power} label="PWR" />
                <Led status={leds.pon} label="PON" />
                <Led status={leds.los} label="LOS" />
              </div>
            )}
          </div>
          {cardOpen && (
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
              {openable && (
                <SoftKey
                  label={mayOpen ? (isOpen ? openable[1] : openable[0]) : `${openable[0]} — roll here first`}
                  active={isOpen}
                  disabled={!mayOpen}
                  onClick={() => toggle(focus.nodeId)}
                />
              )}
              {closureKey && isOpen && <SoftKey label={closureOpen ? 'Close closure' : 'Open closure'} active={closureOpen} disabled={!mayOpen} onClick={() => toggle(closureKey)} />}
              {boundNode && !here && <SoftKey label="Roll truck here" onClick={() => dispatch({ type: 'truck-roll', toNodeId: boundNode.id })} />}
              {boundNode && here && <SoftKey label="Records" onClick={() => dispatch({ type: 'records', nodeId: boundNode.id })} />}
              <SoftKey label="Look closer" active={effectiveMode === 'equipment'} onClick={() => setMode('equipment')} />
              {modes.includes('cutaway') && <SoftKey label="Cutaway" active={effectiveMode === 'cutaway'} onClick={() => setMode('cutaway')} />}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

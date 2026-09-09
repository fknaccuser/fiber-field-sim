import type { UiActionEvent, UiSessionState } from '../../session/runner';
import type { Intent } from '../../session/types';
import type { FiberTubeColor } from '../../world';
import { Chip } from '../components/Chip';
import { SevenSeg } from '../components/SevenSeg';
import { SoftKey } from '../components/SoftKey';
import { HeldDevice } from '../instrument/HeldDevice';
import { useViewportState } from '../viewport/viewportStore';

export function PowerMeter({ ui, dispatch }: { ui: UiSessionState; dispatch(intent: Intent): void }) {
  const { network } = ui.profiles;
  const wavelengths = Array.from(new Set([network.wavelengths.serviceDownstreamNm, network.wavelengths.serviceUpstreamNm, ...network.wavelengths.otdrTestWavelengthsNm])).sort((a, b) => a - b);
  const [wavelengthNm, setWavelengthNm] = useViewportState<number>('pm.wavelength', network.wavelengths.serviceDownstreamNm);
  const [strand, setStrand] = useViewportState<{ tubeColor: FiberTubeColor; fiberColor: FiberTubeColor } | null>('pm.strand', null);

  const spanHere = ui.world.topology.spans.find((s) => s.strands && (s.fromNodeId === ui.locationNodeId || s.toNodeId === ui.locationNodeId));
  const readings = ui.log.filter((a): a is Extract<UiActionEvent, { type: 'power-meter' }> => a.type === 'power-meter');
  const last = readings[readings.length - 1] ?? null;
  const locationLabel = ui.world.topology.nodes.find((n) => n.id === ui.locationNodeId)?.label ?? ui.locationNodeId;
  const showReading = last !== null;

  return (
    <HeldDevice
      ui={ui}
      id="power-meter"
      name="Power meter"
      status={last ? `Last: ${last.dbm === null ? 'no light' : `${last.dbm.toFixed(2)} dBm`}` : undefined}
      model="PM-320"
      form="handheld"
      bootLines={['FiberOps PM-320', 'optical power meter', 'InGaAs detector ... ok', 'calibration 2026-04-11']}
      softKeys={wavelengths.map((nm) => ({ label: `${nm}`, active: wavelengthNm === nm, onClick: () => setWavelengthNm(nm) }))}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 10 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
          <span className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>{wavelengthNm} nm</span>
          <span style={{ fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{locationLabel}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '6px 0' }}>
          <SevenSeg value={showReading ? (last.dbm === null ? '– –.–' : last.dbm.toFixed(2)) : '– –.–'} unit="dBm" size={38} />
        </div>
        {showReading && last.dbm !== null && (
          <div style={{ fontSize: 11, color: last.dbm < network.receivePower.minDbm ? 'var(--led-alarm)' : 'var(--led-ok)', textAlign: 'center' }}>
            {last.dbm < network.receivePower.minDbm ? 'Below the receive window' : last.dbm > network.receivePower.maxDbm ? 'Above the receive window' : 'Inside the receive window'} ({network.receivePower.minDbm} to {network.receivePower.maxDbm} dBm)
          </div>
        )}
        {showReading && last.dbm === null && <div style={{ fontSize: 11, color: 'var(--led-alarm)', textAlign: 'center' }}>No light on this fiber.</div>}
        {showReading && last.nodeId !== ui.locationNodeId && <div style={{ fontSize: 11, color: 'var(--muted)' }}>Last reading at {ui.world.topology.nodes.find((node) => node.id === last.nodeId)?.label ?? last.nodeId}. Measure again at this location.</div>}
        {spanHere?.strands && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
            {spanHere.strands.map((s) => (
              <Chip key={`${s.tubeColor}-${s.fiberColor}`} active={strand?.tubeColor === s.tubeColor && strand?.fiberColor === s.fiberColor} onClick={() => setStrand({ tubeColor: s.tubeColor, fiberColor: s.fiberColor })}>
                {s.tubeColor}/{s.fiberColor}
              </Chip>
            ))}
          </div>
        )}
        <SoftKey label="Measure" onClick={() => dispatch({ type: 'power-meter', nodeId: ui.locationNodeId, wavelengthNm, strand: strand ?? undefined })} />
      </div>
    </HeldDevice>
  );
}

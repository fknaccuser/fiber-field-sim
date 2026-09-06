import { useState } from 'react';
import type { UiActionEvent, UiSessionState } from '../../session/runner';
import type { Intent } from '../../session/types';
import type { FiberTubeColor } from '../../world';
import { Chip } from '../components/Chip';
import { SevenSeg } from '../components/SevenSeg';
import { SoftKey } from '../components/SoftKey';

export function PowerMeter({ ui, dispatch }: { ui: UiSessionState; dispatch(intent: Intent): void }) {
  const { network } = ui.profiles;
  const wavelengths = Array.from(new Set([network.wavelengths.serviceDownstreamNm, network.wavelengths.serviceUpstreamNm, ...network.wavelengths.otdrTestWavelengthsNm])).sort((a, b) => a - b);
  const [wavelengthNm, setWavelengthNm] = useState(network.wavelengths.serviceDownstreamNm);
  const [strand, setStrand] = useState<{ tubeColor: FiberTubeColor; fiberColor: FiberTubeColor } | undefined>(undefined);

  const spanHere = ui.world.topology.spans.find((s) => s.strands && (s.fromNodeId === ui.locationNodeId || s.toNodeId === ui.locationNodeId));

  const readings = ui.log.filter((a): a is Extract<UiActionEvent, { type: 'power-meter' }> => a.type === 'power-meter' && a.nodeId === ui.locationNodeId);
  const last = readings[readings.length - 1] ?? null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 8 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {wavelengths.map((nm) => (
          <Chip key={nm} active={wavelengthNm === nm} onClick={() => setWavelengthNm(nm)}>
            {nm} nm
          </Chip>
        ))}
      </div>
      {spanHere?.strands && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {spanHere.strands.map((s) => (
            <Chip key={`${s.tubeColor}-${s.fiberColor}`} active={strand?.tubeColor === s.tubeColor && strand?.fiberColor === s.fiberColor} onClick={() => setStrand({ tubeColor: s.tubeColor, fiberColor: s.fiberColor })}>
              {s.tubeColor}/{s.fiberColor}
            </Chip>
          ))}
        </div>
      )}
      <div className="bezel" style={{ padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <SevenSeg value={last ? (last.dbm === null ? '– –.–' : last.dbm.toFixed(1)) : '– –.–'} unit="dBm" size={40} />
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>at {ui.locationNodeId}</span>
      </div>
      <SoftKey label="Measure" onClick={() => dispatch({ type: 'power-meter', nodeId: ui.locationNodeId, wavelengthNm, strand })} />
    </div>
  );
}

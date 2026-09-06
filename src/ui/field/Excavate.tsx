import { useState } from 'react';
import type { UiSessionState } from '../../session/runner';
import type { Intent } from '../../session/types';
import { Chip } from '../components/Chip';
import { SoftKey } from '../components/SoftKey';

const COMPLIANCE_ATTRIBUTE_KEYS = ['locateTicket', 'safetyViolation', 'aerialStrandLasher', 'aerialMidspanSag', 'downGuyDamaged', 'clearanceViolation'];

export function excavateAvailable(ui: UiSessionState): boolean {
  const node = ui.world.topology.nodes.find((n) => n.id === ui.locationNodeId);
  if (!node?.attributes) return false;
  return COMPLIANCE_ATTRIBUTE_KEYS.some((key) => key in node.attributes!);
}

export function Excavate({ ui, dispatch }: { ui: UiSessionState; dispatch(intent: Intent): void }) {
  const [method, setMethod] = useState<'hand' | 'machine'>('hand');
  const [distance, setDistance] = useState(24);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 8 }}>
      <div style={{ fontSize: 12, color: 'var(--muted)' }}>Excavate at {ui.locationNodeId}. Confirm your locate ticket first -- a strike ends the session.</div>
      <div style={{ display: 'flex', gap: 6 }}>
        <Chip active={method === 'hand'} onClick={() => setMethod('hand')}>
          Hand dig
        </Chip>
        <Chip active={method === 'machine'} onClick={() => setMethod('machine')}>
          Machine dig
        </Chip>
      </div>
      <label style={{ fontSize: 12, color: 'var(--muted)' }}>
        Distance from marks (in){' '}
        <input
          type="number"
          value={distance}
          onChange={(e) => setDistance(Number(e.target.value))}
          style={{ width: 80, minHeight: 32, background: 'var(--panel-2)', border: '1px solid var(--bezel)', borderRadius: 6, color: 'var(--text)', padding: '4px 8px' }}
        />
      </label>
      <SoftKey label="Dig" onClick={() => dispatch({ type: 'excavate', nodeId: ui.locationNodeId, method, distanceFromMarksInches: distance })} />
    </div>
  );
}

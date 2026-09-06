import type { DetectedEvent } from '../../instruments/otdr';

export function EventTable({ events, selectedIndex, onSelect }: { events: DetectedEvent[]; selectedIndex: number | null; onSelect(event: DetectedEvent): void }) {
  return (
    <div style={{ overflowX: 'auto', maxHeight: 180, overflowY: 'auto' }}>
      <table className="mono" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ color: 'var(--muted)', textAlign: 'left', position: 'sticky', top: 0, background: 'var(--panel)' }}>
            <th style={{ padding: '4px 8px' }}>#</th>
            <th style={{ padding: '4px 8px' }}>Kind</th>
            <th style={{ padding: '4px 8px' }}>Dist (m)</th>
            <th style={{ padding: '4px 8px' }}>Loss (dB)</th>
            <th style={{ padding: '4px 8px' }}>Refl (dB)</th>
            <th style={{ padding: '4px 8px' }}>Quality</th>
          </tr>
        </thead>
        <tbody>
          {events.map((ev) => (
            <tr
              key={ev.index}
              onClick={() => onSelect(ev)}
              style={{
                cursor: 'pointer',
                background: ev.index === selectedIndex ? 'var(--panel-2)' : 'transparent',
                borderTop: '1px solid var(--grid)',
              }}
            >
              <td style={{ padding: '6px 8px' }}>{ev.index}</td>
              <td style={{ padding: '6px 8px' }}>{ev.kind}</td>
              <td style={{ padding: '6px 8px' }}>{ev.distanceMeters.toFixed(1)}</td>
              <td style={{ padding: '6px 8px' }}>{ev.lossDb === null ? '–' : ev.lossDb.toFixed(2)}</td>
              <td style={{ padding: '6px 8px' }}>{ev.reflectanceDb === null ? '–' : ev.reflectanceDb.toFixed(1)}</td>
              <td style={{ padding: '6px 8px', color: ev.quality === 'near-noise-floor' ? 'var(--led-warn)' : 'var(--muted)' }}>{ev.quality}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

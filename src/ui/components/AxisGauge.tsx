function colorFor(value: number): string {
  if (value >= 80) return 'var(--led-ok)';
  if (value >= 50) return 'var(--led-warn)';
  return 'var(--led-alarm)';
}

/** A labeled 0-100 bar gauge, used for the five score axes and the competency map (one per domain). */
export function AxisGauge({ label, value, detail }: { label: string; value: number; detail?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--muted)' }}>
        <span>{label}</span>
        <span className="mono" style={{ color: 'var(--text)' }}>
          {Math.round(value)}
        </span>
      </div>
      <div style={{ height: 8, borderRadius: 4, background: 'var(--grid)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: colorFor(value), transition: 'width 200ms ease' }} />
      </div>
      {detail && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{detail}</div>}
    </div>
  );
}

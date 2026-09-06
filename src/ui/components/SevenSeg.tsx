/** A numeric readout styled like an instrument's seven-segment display (power meter, VFL, scope readouts). */
export function SevenSeg({ value, unit, size = 32 }: { value: string; unit?: string; size?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
      <span
        className="mono"
        style={{
          fontSize: size,
          fontWeight: 700,
          color: 'var(--seg)',
          textShadow: '0 0 8px rgba(255,157,0,0.5)',
          letterSpacing: 1,
        }}
      >
        {value}
      </span>
      {unit && (
        <span className="mono" style={{ fontSize: size * 0.4, color: 'var(--muted)' }}>
          {unit}
        </span>
      )}
    </div>
  );
}

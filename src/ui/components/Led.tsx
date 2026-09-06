export type LedStatus = 'ok' | 'warn' | 'alarm' | 'off';

const COLORS: Record<LedStatus, string> = {
  ok: 'var(--led-ok)',
  warn: 'var(--led-warn)',
  alarm: 'var(--led-alarm)',
  off: 'var(--bezel)',
};

/** A small round status indicator, e.g. "on site" in LocationBar. */
export function Led({ status, label }: { status: LedStatus; label?: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted)' }}>
      <span
        aria-hidden
        style={{
          width: 10,
          height: 10,
          borderRadius: '50%',
          background: COLORS[status],
          boxShadow: status === 'off' ? 'none' : `0 0 6px ${COLORS[status]}`,
          display: 'inline-block',
        }}
      />
      {label}
    </span>
  );
}

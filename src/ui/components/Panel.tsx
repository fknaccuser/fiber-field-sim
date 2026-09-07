import type { CSSProperties, ReactNode } from 'react';

/**
 * A dashboard frame: glass surface, glowing hairline, machined corner accents, and an
 * optional header strip carrying a kicker and a status badge. `tone="alert"` swings the
 * whole frame orange for anything selected or demanding attention.
 */
export function Panel({
  title,
  badge,
  tone = 'default',
  actions,
  children,
  style,
  bodyStyle,
  onClick,
}: {
  /** Kicker along the header strip. Uppercased and tracked by the stylesheet. */
  title?: ReactNode;
  /** Small status pill on the right of the header. */
  badge?: ReactNode;
  tone?: 'default' | 'alert';
  /** Controls sitting on the header strip, right of the badge. */
  actions?: ReactNode;
  children: ReactNode;
  style?: CSSProperties;
  bodyStyle?: CSSProperties;
  onClick?: () => void;
}) {
  const hasHeader = title !== undefined || badge !== undefined || actions !== undefined;
  return (
    <div className={`bezel${tone === 'alert' ? ' alert' : ''}`} style={{ display: 'flex', flexDirection: 'column', minWidth: 0, ...style }} onClick={onClick}>
      {hasHeader && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 12px',
            borderBottom: `1px solid ${tone === 'alert' ? 'var(--orange-line)' : 'var(--cyan-line)'}`,
            flexShrink: 0,
          }}
        >
          {title !== undefined && (
            <span className="eyebrow" style={{ color: tone === 'alert' ? 'var(--orange)' : 'var(--cyan)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {title}
            </span>
          )}
          <span style={{ flex: 1 }} />
          {badge !== undefined && <span className={`panel-badge${tone === 'alert' ? ' alert' : ''}`}>{badge}</span>}
          {actions}
        </div>
      )}
      <div style={{ padding: 12, minWidth: 0, ...bodyStyle }}>{children}</div>
    </div>
  );
}

/** A labelled readout: tracked caps label over a large monospace value. */
export function Readout({ label, value, unit, tone = 'cyan', detail }: { label: string; value: ReactNode; unit?: string; tone?: 'cyan' | 'orange' | 'green' | 'amber' | 'red'; detail?: ReactNode }) {
  const color = `var(--${tone === 'cyan' ? 'cyan' : tone})`;
  return (
    <div style={{ minWidth: 0 }}>
      <div className="eyebrow" style={{ color: 'var(--ink-soft)', fontSize: 9 }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
        <span className="mono" style={{ fontSize: 26, fontWeight: 700, color, textShadow: `0 0 16px ${color}`, letterSpacing: 1 }}>
          {value}
        </span>
        {unit && (
          <span className="mono" style={{ fontSize: 11, color: 'var(--ink-soft)' }}>
            {unit}
          </span>
        )}
      </div>
      {detail !== undefined && <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 3 }}>{detail}</div>}
    </div>
  );
}

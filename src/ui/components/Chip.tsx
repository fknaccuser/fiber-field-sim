import type { ReactNode } from 'react';

/**
 * A console selector: squared off, letterspaced, and lit rather than filled. `tone` picks
 * which signal colour it lights in — cyan for what the instrument reports, orange for a
 * choice that commits you to something.
 */
export function Chip({
  children,
  onClick,
  active = false,
  disabled = false,
  title,
  tone = 'cyan',
}: {
  children: ReactNode;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  title?: string;
  tone?: 'cyan' | 'orange';
}) {
  const accent = tone === 'orange' ? 'var(--orange)' : 'var(--cyan)';
  const glow = tone === 'orange' ? 'rgba(255,106,19,' : 'rgba(59,232,216,';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        minHeight: 44,
        padding: '6px 13px',
        borderRadius: 2,
        border: `1px solid ${active ? accent : 'var(--line)'}`,
        background: active ? `${glow}0.08)` : 'transparent',
        color: disabled ? 'var(--ink-soft)' : active ? accent : 'var(--ink-soft)',
        textShadow: active ? `0 0 10px ${glow}0.55)` : 'none',
        boxShadow: active ? `0 0 12px ${glow}0.14) inset` : 'none',
        fontFamily: 'var(--font-label)',
        fontSize: 11,
        fontWeight: 800,
        letterSpacing: 1,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  );
}

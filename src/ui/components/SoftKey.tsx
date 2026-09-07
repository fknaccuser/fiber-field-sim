import type { ReactNode } from 'react';

/**
 * A soft key along an instrument bezel. Unlit it is a hairline outline; the primary action
 * on a screen lights orange, because orange is the colour of something that wants your
 * hands. Disabled keys stay present and dark, the way a real key does.
 */
export function SoftKey({
  label,
  onClick,
  disabled = false,
  active = false,
  tone = 'orange',
}: {
  label: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  tone?: 'orange' | 'cyan';
}) {
  const accent = tone === 'cyan' ? 'var(--cyan)' : 'var(--orange)';
  const glow = tone === 'cyan' ? 'rgba(59,232,216,' : 'rgba(255,106,19,';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        minHeight: 44,
        minWidth: 44,
        padding: '9px 13px',
        background: disabled ? 'transparent' : `${glow}${active ? '0.16' : '0.08'})`,
        color: disabled ? '#33465a' : accent,
        border: `1px solid ${disabled ? 'var(--line)' : accent}`,
        borderRadius: 2,
        fontFamily: 'var(--font-label)',
        fontSize: 12,
        fontWeight: 800,
        letterSpacing: 1.5,
        textShadow: disabled ? 'none' : `0 0 10px ${glow}0.45)`,
        boxShadow: disabled ? 'none' : `0 0 14px ${glow}${active ? '0.3' : '0.16'})`,
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      {label}
    </button>
  );
}

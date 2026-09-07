import type { ReactNode } from 'react';

/** A selector. Hairline when idle, lit and glowing when engaged. */
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
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={['hud-chip', tone === 'orange' ? 'hud-chip--orange' : '', active ? 'is-on' : ''].filter(Boolean).join(' ')}
    >
      {children}
    </button>
  );
}

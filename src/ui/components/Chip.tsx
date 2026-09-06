import type { ReactNode } from 'react';

export function Chip({
  children,
  onClick,
  active = false,
  disabled = false,
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        minHeight: 44,
        padding: '6px 14px',
        borderRadius: 999,
        border: `1px solid ${active ? 'var(--cursor-b)' : 'var(--bezel)'}`,
        background: active ? 'var(--panel-2)' : 'var(--panel)',
        color: disabled ? 'var(--muted)' : 'var(--text)',
        fontSize: 13,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  );
}

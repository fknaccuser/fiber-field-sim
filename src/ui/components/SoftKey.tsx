import type { ReactNode } from 'react';

/** A tablet-instrument soft key: a labeled button along a bezel edge (e.g. the OTDR's right-edge strip). */
export function SoftKey({ label, onClick, disabled = false, active = false }: { label: ReactNode; onClick?: () => void; disabled?: boolean; active?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        minHeight: 44,
        minWidth: 44,
        padding: '8px 10px',
        background: active ? 'var(--panel-2)' : 'var(--panel)',
        color: disabled ? 'var(--muted)' : 'var(--text)',
        border: '1px solid var(--bezel)',
        borderRadius: 6,
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: 0.3,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.45 : 1,
      }}
    >
      {label}
    </button>
  );
}

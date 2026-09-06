import type { ReactNode } from 'react';

/** A bottom sheet: truck-roll destination picker, records viewer, etc. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal
      style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}
    >
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} onClick={onClose} />
      <div
        className="bezel"
        style={{
          position: 'relative',
          maxHeight: '70vh',
          overflowY: 'auto',
          borderBottomLeftRadius: 0,
          borderBottomRightRadius: 0,
          padding: 16,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ fontSize: 15, margin: 0 }}>{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{ minHeight: 44, minWidth: 44, background: 'none', border: 'none', color: 'var(--muted)', fontSize: 20 }}
          >
            &times;
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

import { useRegisterSW } from 'virtual:pwa-register/react';

/** Shows a reload chip once a new service worker is waiting to take over. */
export function ServiceWorkerBridge() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;

  return (
    <button
      type="button"
      onClick={() => void updateServiceWorker(true)}
      className="bezel"
      style={{
        position: 'fixed',
        bottom: 12,
        right: 12,
        zIndex: 100,
        padding: '10px 14px',
        color: 'var(--cursor-a)',
        fontSize: 13,
        cursor: 'pointer',
      }}
    >
      Update ready — reload
    </button>
  );
}

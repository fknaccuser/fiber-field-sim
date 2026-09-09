import type { ComponentType, ReactNode } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { SessionStoreProvider } from '../store/sessionStore';
import { AppRoutes } from './routes';
import { BootScreen, useBootHold } from './BootScreen';
import { ServiceWorkerBridge } from './ServiceWorkerBridge';
import './theme.css';

/**
 * The router is a parameter with a default, for one reason: the standalone build.
 *
 * `npm run build:standalone` produces a single HTML file that runs from `file://` with no
 * server behind it, and path routing needs a server to rewrite unknown paths back to the
 * app. That build passes `HashRouter`. Everything served over HTTP -- dev, Pages, the PWA --
 * takes the default and behaves exactly as before.
 */
export function App({ Router = BrowserRouter }: { Router?: ComponentType<{ children: ReactNode }> } = {}) {
  const booted = useBootHold();
  return (
    <Router>
      <SessionStoreProvider>
        <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <AppRoutes />
        </div>
        <div className="scan" aria-hidden />
        {!booted && <BootScreen />}
        <ServiceWorkerBridge />
      </SessionStoreProvider>
    </Router>
  );
}

import { BrowserRouter } from 'react-router-dom';
import { SessionStoreProvider } from '../store/sessionStore';
import { AppRoutes } from './routes';
import { BootScreen, useBootHold } from './BootScreen';
import { ServiceWorkerBridge } from './ServiceWorkerBridge';
import './theme.css';

export function App() {
  const booted = useBootHold();
  return (
    <BrowserRouter>
      <SessionStoreProvider>
        <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <AppRoutes />
        </div>
        <div className="scan" aria-hidden />
        {!booted && <BootScreen />}
        <ServiceWorkerBridge />
      </SessionStoreProvider>
    </BrowserRouter>
  );
}

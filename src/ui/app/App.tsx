import { BrowserRouter } from 'react-router-dom';
import { SessionStoreProvider } from '../store/sessionStore';
import { AppRoutes } from './routes';
import { ServiceWorkerBridge } from './ServiceWorkerBridge';
import './theme.css';

export function App() {
  return (
    <BrowserRouter>
      <SessionStoreProvider>
        <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <AppRoutes />
        </div>
        <ServiceWorkerBridge />
      </SessionStoreProvider>
    </BrowserRouter>
  );
}

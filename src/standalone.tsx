/**
 * Entry point for the single-file build.
 *
 * Identical to `main.tsx` but on a hash router, because this bundle is opened from the
 * filesystem or handed around as one HTML file and there is no server to rewrite `/bench/tray`
 * back to the app. Routes become `#/bench/tray`; nothing else differs.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { App } from './ui/app/App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App Router={HashRouter} />
  </StrictMode>,
);

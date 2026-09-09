/**
 * Entry point for the single-file build.
 *
 * Same app as `main.tsx`; the only difference is how it routes, and that has to survive being
 * opened in places a normal deployment never is.
 *
 * A hash router is right for a file on disk: `#/bench/tray` needs no server to rewrite it, and
 * it keeps deep links and the back button working. But a hash router still reads
 * `window.location`, and some hosts do not give it a usable one -- an `about:srcdoc` iframe,
 * which is how HTML previews are often rendered, has no parseable location and react-router
 * throws `Failed to construct 'URL'` before anything paints. The page then shows its
 * background and nothing else, with the error in a console nobody has open.
 *
 * So: hash routing where there is a location to hash, memory routing where there is not. The
 * fallback loses deep links and the back button, which is a fair trade against not running.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, MemoryRouter } from 'react-router-dom';
import { App } from './ui/app/App.tsx';

function routerForThisHost() {
  try {
    const url = new URL(window.location.href);
    // `about:` and `blob:` have no path to route on even when they parse.
    return url.protocol === 'about:' ? MemoryRouter : HashRouter;
  } catch {
    return MemoryRouter;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App Router={routerForThisHost()} />
  </StrictMode>,
);

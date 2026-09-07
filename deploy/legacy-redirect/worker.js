/**
 * Replacement code for the legacy `fiber-sim.okimrollin.workers.dev` Worker.
 *
 * That hostname used to serve its own copy of the app, built months and a redesign ago.
 * Rather than maintain a second deployment that will drift again, it now forwards to the
 * Cloudflare Pages project, which is the single source of truth and updates itself on every
 * push to `main`. Any link already shared keeps working and always lands on the current
 * build.
 *
 * Two details that a naive redirect gets wrong:
 *
 * 1. THE STALE SERVICE WORKER. The old app registered a Workbox service worker at `/sw.js`,
 *    so every browser that ever opened this hostname has one installed. A service worker
 *    intercepts navigation *before the network*, so a redirect at the edge would never be
 *    reached — returning visitors, who are exactly the people holding the old link, would
 *    keep being served the cached old UI and would reasonably conclude nothing had changed.
 *    So `/sw.js` now answers with a script that unregisters itself, deletes its caches, and
 *    reloads any open tab. Browsers re-fetch `/sw.js` on navigation, so installs clean
 *    themselves up without anyone being told to hard-refresh.
 *
 * 2. PATH AND QUERY. A run is identified by its URL (`/run/<scenario>?seed=&role=&prep=`),
 *    so a redirect that drops the path or query would break every deep link it is supposed
 *    to preserve. Only the hostname is swapped.
 *
 * 302, not 301: a permanent redirect is cached hard by browsers and is unpleasant to undo
 * if this hostname is ever wanted for something else.
 */

const TARGET_HOST = 'fiber-field-sim.pages.dev';

/** Serves in place of the old Workbox service worker; removes itself and its caches. */
const SELF_DESTRUCT_SW = `// Replaces the retired FiberOps service worker on this origin.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch (e) {
      // Storage can be unavailable (private windows, blocked site data). Unregister anyway.
    }
    await self.registration.unregister();
    const clients = await self.clients.matchAll({ type: 'window' });
    for (const client of clients) client.navigate(client.url);
  })());
});
`;

export default {
  fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === '/sw.js') {
      return new Response(SELF_DESTRUCT_SW, {
        headers: {
          'content-type': 'text/javascript; charset=utf-8',
          // Never cache the kill switch, or it cannot be withdrawn later.
          'cache-control': 'no-store',
        },
      });
    }

    url.protocol = 'https:';
    url.hostname = TARGET_HOST;
    url.port = '';
    return Response.redirect(url.toString(), 302);
  },
};

# Retiring the legacy `workers.dev` deployment

## What this is

`fiber-sim.okimrollin.workers.dev` is a **second, separate deployment** that predates the
redesign. It is not built from this repo's current `main` and does not update when you push:
verified on 2026-09-07, its bundle contained none of the pre-trip, probe-tip, laptop or
phone-slab work. Anyone given that link sees the old UI.

The live, current deployment is the Cloudflare **Pages** project:

    https://fiber-field-sim.pages.dev

It is connected to this repository and rebuilds itself on every push to `main`.

`worker.js` in this directory replaces the old Worker's code so that the old hostname
forwards to Pages instead of serving its own stale copy. One source of truth, and links
already shared keep working.

## Why it is not just a one-line redirect

The old app registered a Workbox **service worker** at `/sw.js`. A service worker intercepts
navigation *before the network*, so an edge redirect alone would never be reached by anyone
who had already opened the old link — they would keep getting the cached old UI and would
reasonably conclude nothing had changed. `worker.js` therefore also serves a self-destruct
script at `/sw.js` that unregisters the old worker, clears its caches and reloads open tabs.

It also preserves path and query, because a run is identified by its URL
(`/run/<scenario>?seed=&role=&prep=`).

## Deploying it — dashboard (no CLI, no tokens)

1. Cloudflare dashboard → **Workers & Pages** → open the Worker serving
   `fiber-sim.okimrollin.workers.dev` (the name is most likely `fiber-sim`).
2. **Edit code** / Quick Edit.
3. Replace the entire contents with `worker.js` from this directory.
4. **Deploy**.

## Deploying it — CLI

Requires being logged in as yourself; no config file is needed.

```bash
npx wrangler login
```

```bash
npx wrangler deploy deploy/legacy-redirect/worker.js --name fiber-sim --compatibility-date 2026-09-07
```

Replace `fiber-sim` if the Worker is named something else — the dashboard shows the real
name above its `*.workers.dev` URL.

## Checking it worked

```bash
curl -s -o /dev/null -w "%{http_code} -> %{redirect_url}\n" "https://fiber-sim.okimrollin.workers.dev/run/t4-wrong-roll-closure-7?seed=11"
```

Expect `302 -> https://fiber-field-sim.pages.dev/run/t4-wrong-roll-closure-7?seed=11` — the
path and query carried across.

```bash
curl -s "https://fiber-sim.okimrollin.workers.dev/sw.js" | head -3
```

Expect the self-destruct script, not Workbox.

## A note on why this is not `wrangler.toml` at the repo root

Cloudflare Pages reads a root-level `wrangler.toml` and lets it override the dashboard build
settings. This project's build config already had to be corrected once by hand (Cloudflare
auto-detected VitePress because of the `docs/` folder), and it is currently working. A stray
root config could silently take precedence and break the Pages build, so the deploy command
above passes its flags inline instead and nothing is added to the repo root.

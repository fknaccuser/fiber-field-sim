# Retiring the legacy `workers.dev` deployment

## What this is

There are **three** deployments in the Cloudflare account, and two of them are stale:

| URL | What it is | Repo | State |
| --- | --- | --- | --- |
| `fiber-field-sim.pages.dev` | Pages project `fiber-field-sim` | `fknaccuser/fiber-field-sim` | **Current.** Rebuilds on every push to `main`. |
| `fiber-sim.okimrollin.workers.dev` | Worker `fiber-sim` (Static Assets) | `fknaccuser/fiber-sim` | Stale — predates the redesign. |
| `fiber-sim.pages.dev` | Pages project `fiber-sim` | `fknaccuser/fiber-sim` | Stale — serves the identical old bundle. |

Both stale deployments serve the same old bundle (`index-D1JACAzR.js`, verified 2026-09-07)
and are wired to the superseded `fknaccuser/fiber-sim` repository, so neither updates when
you push here. This directory deals with the Worker. The stale Pages project is a separate
thing and has to be deleted or disconnected in the dashboard — a Worker script cannot
affect it.

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

## Deploying it — CLI only. The dashboard paste does NOT work.

`fiber-sim` is a **Workers Static Assets** deployment, and that changes everything about how
to replace it. From Cloudflare's docs:

> By default, if a requested URL matches a file in the static assets directory, that file
> will be served — without invoking Worker code.

and, since the `assets_navigation_prefers_asset_serving` default of 2025-04-01, navigation
requests prefer asset serving *even when an exact asset match cannot be found*, so an SPA's
`index.html` is returned ahead of invoking any Worker script.

So editing the code in the dashboard's Quick Edit would appear to succeed and change
nothing: `/` would still match the old `index.html`, `/sw.js` would still match the real
Workbox service worker, and this Worker would never run.

The deploy below replaces the Worker with a **plain script and no assets**, so every request
reaches it.

```bash
npx wrangler login
```

```bash
npx wrangler deploy deploy/legacy-redirect/worker.js --name fiber-sim --compatibility-date 2026-09-07
```

Run it from the repo root. No config file is involved, and nothing is added to the repo root
that Cloudflare Pages could mistake for build configuration.

If you would rather keep the old assets in place, the documented alternative is to redeploy
with `assets.run_worker_first = true`, which forces the script to run ahead of asset
serving. That needs an `[assets]` directory in a Wrangler config and is more moving parts
for no benefit here — the whole point is that this hostname stops serving its own copy.

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

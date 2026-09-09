/**
 * The single-file build.
 *
 * Produces one self-contained HTML file that runs with no server, no network and no install:
 * every chunk, stylesheet and font inlined. It exists so the simulator can be looked at, or
 * handed to somebody, without deploying it anywhere -- and because a trainer for people who
 * work in handholes should survive being opened off a USB stick with no signal.
 *
 * Three things differ from the normal build and only these three:
 *  - the entry is `standalone.tsx`, which runs the app on a hash router (no server to rewrite paths);
 *  - the PWA is disabled, since a service worker on `file://` is meaningless and its virtual
 *    module still has to resolve, which is what `disable` gives us;
 *  - nothing is code-split, so there is one script to inline.
 *
 * `scripts/build-standalone.mjs` does the inlining afterwards.
 */
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  plugins: [react(), VitePWA({ disable: true })],
  build: {
    outDir: 'dist-standalone',
    emptyOutDir: true,
    cssCodeSplit: false,
    // Everything imported becomes a data URI rather than a second file to lose.
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    rollupOptions: {
      input: 'standalone.html',
      output: {
        codeSplitting: false,
        /**
         * A classic script, not an ES module.
         *
         * Module scripts are subject to origin rules that `file://` cannot satisfy: Safari
         * and Firefox refuse them outright from a local file, and sandboxed HTML previews
         * refuse them too. The page then paints its CSS and runs nothing -- a dark background
         * and no app, with no error anywhere a person would look.
         *
         * An IIFE has none of that. It is the whole reason this build exists, so it is not
         * optional here.
         */
        format: 'iife',
      },
    },
  },
});

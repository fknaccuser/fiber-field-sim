// Reviewer-run check (too slow for the Vitest suite): builds the app and confirms the
// PWA artifacts item 6's definition of done requires actually landed in dist/.
import { existsSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

execSync('npm run build', { stdio: 'inherit' });

const required = ['dist/manifest.webmanifest', 'dist/sw.js'];
const missing = required.filter((f) => !existsSync(f));
if (missing.length > 0) {
  console.error(`Missing PWA build artifacts: ${missing.join(', ')}`);
  process.exit(1);
}

const html = readFileSync('dist/index.html', 'utf8');
if (!html.includes('manifest.webmanifest')) {
  console.error('dist/index.html does not reference the manifest');
  process.exit(1);
}

console.log('PWA build artifacts present: manifest, service worker, and index.html reference.');

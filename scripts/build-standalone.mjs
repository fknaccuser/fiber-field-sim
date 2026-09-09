/**
 * Fold the standalone build into one HTML file.
 *
 * Vite gets it down to one script and one stylesheet; this puts those, and the fonts, inside
 * the HTML so what comes out is a single file that runs off a filesystem, a USB stick or an
 * email attachment with no server and no network.
 *
 * The fonts matter more than they look. This interface is most of the way to being a piece of
 * equipment and the typefaces are doing a lot of that work; falling back to Helvetica makes it
 * look like a form. They are ~70 kB of woff2 in total, so they go in.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist-standalone');
const out = path.join(root, 'fiber-field-sim.html');

/**
 * A closing tag inside the bundle would end the element early and the rest of the app would
 * be parsed as text. Case-insensitive, because the HTML parser is: `</SCRIPT` closes a script
 * just as well as `</script`, and minified third-party code is not careful about case.
 */
const escapeForTag = (text, tag) => text.replace(new RegExp(`</(?=${tag})`, 'gi'), '<\\/');

let inlinedFonts = 0;

function inlineFonts(css) {
  // Vite rewrites the source's absolute `/fonts/x.woff2` to a path relative to the emitted
  // stylesheet, so match on the filename rather than on the leading directory.
  return css.replace(/url\(['"]?[^'")]*\/fonts\/([^'")/]+)['"]?\)/g, (whole, file) => {
    const asset = path.join(root, 'public', 'fonts', file);
    if (!fs.existsSync(asset)) {
      console.warn(`  ! font not found, leaving as a URL: ${file}`);
      return whole;
    }
    inlinedFonts++;
    return `url(data:font/woff2;base64,${fs.readFileSync(asset).toString('base64')})`;
  });
}

console.log('building…');
execFileSync('npx', ['vite', 'build', '--config', 'vite.config.standalone.ts'], { cwd: root, stdio: 'inherit' });

const html = fs.readFileSync(path.join(dist, 'standalone.html'), 'utf8');
const assets = path.join(dist, 'assets');
const files = fs.readdirSync(assets);
const jsFile = files.find((f) => f.endsWith('.js'));
const cssFile = files.find((f) => f.endsWith('.css'));
if (!jsFile) throw new Error('no script in the build output — did code splitting come back?');

const js = fs.readFileSync(path.join(assets, jsFile), 'utf8');
const css = cssFile ? inlineFonts(fs.readFileSync(path.join(assets, cssFile), 'utf8')) : '';

/**
 * Replacer FUNCTIONS, not strings, and this is not a style preference.
 *
 * `String.replace` interprets `$&`, `` $` ``, `$'` and `$1` inside a replacement *string* --
 * and minified JavaScript is full of all four. Passing the bundle as a string silently
 * rewrites parts of it into other parts of itself: the first attempt at this produced a file
 * that threw `Unexpected identifier` and rendered two megabytes of source code as a wall of
 * text. A function replacement disables that substitution entirely.
 */
let single = html
  .replace(/<script[^>]*\bsrc="[^"]*"[^>]*><\/script>/i, () => `<script type="module">${escapeForTag(js, 'script')}</script>`)
  .replace(/<link[^>]*rel="stylesheet"[^>]*>/i, () => (css ? `<style>${escapeForTag(css, 'style')}</style>` : ''));

if (single.includes(jsFile)) throw new Error('the script tag was not replaced — the bundle is still a separate file');

// Anything still pointing at a file beside it would 404 from a filesystem; there is nothing
// beside it. Drop the icon links rather than ship a broken reference.
single = single.replace(/<link[^>]*rel="(?:icon|apple-touch-icon|manifest)"[^>]*>\s*/g, '');

fs.writeFileSync(out, single);

// Scan the shell only. The bundle's own text contains plenty of things that look like URLs
// -- template literals, chunk names, source paths -- and none of them are fetched.
const shell = single.replace(/<script[\s\S]*?<\/script>/g, '<script></script>').replace(/<style[\s\S]*?<\/style>/g, '<style></style>');
const remaining = [...shell.matchAll(/(?:src|href)="(?!data:|#)([^"]+)"/g)].map((m) => m[1]);
console.log(`\nwrote ${path.relative(root, out)} — ${(Buffer.byteLength(single) / 1e6).toFixed(2)} MB`);
console.log(`inlined ${inlinedFonts} font file(s)`);
console.log(remaining.length === 0 ? 'self-contained: no external references' : `! still references: ${remaining.join(', ')}`);

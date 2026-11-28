/**
 * THE /hub/commander PLAYER PAGES ARE #SMARTERDESIGN (Dan, 2026-11-27, BINDING).
 *
 * Dan: "CLUB COMMANDER NEEDS THE SAME #SMARTERDESIGN UPGRADE TO EVERY SINGLE
 * PAGE, SUBPAGE, BUTTON AND EVERYTHING ELSE, EXACTLY LIKE WE'VE DONE FOR EVERY
 * OTHER WORLD HUB PAGE." The staff app shipped in Commander #166. These are the
 * 37 player pages under pages/hub/commander, which were still on the Facebook
 * dark palette and the retired "futuristic" chrome (rivets, corner lights, glow
 * strips) until 2026-11-28.
 *
 * Pinned here:
 *   1. No prohibited hue (yellow, gold, amber, purple, violet, lavender, pink,
 *      magenta) anywhere in the player pages, their components or their
 *      stylesheet - checked by actual hue, not by a list, because the palette
 *      script's fixed map missed #FCD34D, #4C1D95, #CD7F32 and #C5962E.
 *   2. The palette script's --check is clean on the same trees.
 *   3. The stylesheet's #SMARTERDESIGN layer: retired decoration never renders,
 *      and both header forms (.cmd-header-full and a <header> .cmd-header-bar)
 *      are page image headers.
 *   4. CommanderPageShell supplies the scene, the one painted "?" and seats the
 *      hamburger beside it inside the header, never over it.
 *   5. Every page on the shell renders a page header, except the two screens
 *      that are not pages (a transient join status card and a TV clock).
 *   6. No static description sentence under a header title: contextual
 *      descriptions live behind the "?" (docs/SMARTERDESIGN.md).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const PAGES_DIR = 'pages/hub/commander';
const TREES = [PAGES_DIR, 'src/components/commander', 'src/styles/commander-futuristic.css'];
const SHELL = 'src/components/commander/CommanderPageShell.jsx';
const CSS = 'src/styles/commander-futuristic.css';

function walk(rel) {
  const abs = path.join(ROOT, rel);
  if (fs.statSync(abs).isFile()) return [rel];
  return fs.readdirSync(abs).flatMap((name) => (name.startsWith('.') ? [] : walk(path.join(rel, name))));
}
const sourceFiles = () => TREES.flatMap(walk).filter((f) => /\.(m?jsx?|tsx?|css)$/.test(f));
const maskComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

function hsl(hex) {
  let h = hex.slice(1);
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (!d) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let hue = max === r ? 60 * (((g - b) / d) % 6) : max === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
  if (hue < 0) hue += 360;
  return { h: hue, s, l };
}
export function prohibitedHue(hex) {
  const { h, s, l } = hsl(hex);
  if (s < 0.3 || l < 0.12 || l > 0.95) return null;
  if (h >= 28 && h < 70) return 'yellow/gold/amber';
  if (h >= 255 && h < 345) return 'purple/violet/pink/magenta';
  return null;
}

test('the hue rule itself: gold and purple are caught, the #SMARTERDESIGN palette is not', () => {
  for (const hex of ['#FCD34D', '#F59E0B', '#D4AF37', '#CD7F32', '#C5962E', '#4C1D95', '#8B5CF6', '#EC4899', '#D946EF']) {
    assert.ok(prohibitedHue(hex), `${hex} must be prohibited`);
  }
  for (const hex of ['#040D18', '#0A1829', '#F2F7FF', '#BDD0E2', '#86DAFF', '#22D3EE', '#0C55C0', '#1981EC', '#5AA9FF', '#31A24C', '#EF4444', '#445E77']) {
    assert.equal(prohibitedHue(hex), null, `${hex} is an approved colour`);
  }
});

test('no prohibited hue anywhere in the Commander player pages, components or stylesheet', () => {
  const offenders = [];
  for (const file of sourceFiles()) {
    const src = maskComments(read(file));
    for (const m of src.matchAll(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![0-9a-fA-F\w])/g)) {
      const why = prohibitedHue(m[0]);
      if (why) offenders.push(`${file}:${src.slice(0, m.index).split('\n').length} ${m[0]} (${why})`);
    }
    for (const m of src.matchAll(/\b(?:text|bg|border|from|via|to|ring|fill|stroke)-(?:yellow|amber|purple|violet|fuchsia|pink)-\d{2,3}\b/g)) {
      offenders.push(`${file}:${src.slice(0, m.index).split('\n').length} ${m[0]}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test('the palette migration has nothing left to change on these trees', () => {
  const out = execFileSync(process.execPath, ['scripts/smarterdesign-palette.mjs', '--check', PAGES_DIR, 'src/components/commander', 'vendor/commander-shared/src'], { cwd: ROOT, encoding: 'utf8' });
  assert.match(out, /would change 0 file\(s\)/i);
});

test('the stylesheet carries the #SMARTERDESIGN layer and both header forms are image headers', () => {
  const css = read(CSS);
  const layer = css.slice(css.indexOf('#SMARTERDESIGN LAYER'));
  assert.ok(css.includes('#SMARTERDESIGN LAYER'), 'the layer is missing');
  assert.match(layer, /\.cmd-rivet, \.cmd-rivet-sm, \.cmd-light, \.cmd-glow-strip, \.cmd-pipe, \.cmd-pipe-h \{ display: none !important; \}/);
  for (const selector of ['.cmd-header-full', 'header.cmd-header-bar']) {
    assert.ok(layer.includes(`${selector}::before`), `${selector} has no scene layer`);
    assert.ok(layer.includes(`${selector} h1`), `${selector} title is not styled`);
  }
  assert.match(layer, /var\(--sd-scene, none\)/);
  assert.match(layer, /chrome-readout\.webp/);
  assert.match(layer, /chrome-active-v2\.webp/);
});

test('CommanderPageShell gives every page the global header, its scene and one painted "?"', () => {
  const shell = maskComments(read(SHELL));
  assert.match(shell, /export function sceneFor\(/);
  assert.match(shell, /--sd-scene/);
  assert.match(shell, /querySelector\('header\.cmd-header-full, header\.cmd-header-bar'\)/);
  assert.equal((shell.match(/className="sd-header-help"/g) || []).length, 1, 'exactly one painted "?"');
  assert.match(shell, /SD_HEADER_HELP_ICON/);
  assert.match(shell, /import UniversalHeader from '\.\.\/ui\/UniversalHeader'/);
  assert.match(shell, /<UniversalHeader \/>/, 'every player page shows the approved global header');
  assert.doesNotMatch(shell, /position: 'fixed'|commander-page-shell__menu-trigger/, 'no floating hamburger over the painted "?"');
  for (const match of shell.matchAll(/\['(\/hub\/commander[^']*)', '([\w-]+)'\]/g)) {
    const art = `public/images/smarterdesign/headers/${match[2]}-scene.webp`;
    assert.ok(fs.existsSync(path.join(ROOT, art)), `${match[1]} points at missing art ${art}`);
  }
});

const NOT_PAGES = new Set([
  'pages/hub/commander/home-games/join.js', // a transient join status card
  'pages/hub/commander/tournament/[id]/clock.js', // a TV tournament clock
]);

test('every Commander player page renders a page image header', () => {
  const missing = [];
  for (const file of walk(PAGES_DIR).filter((f) => f.endsWith('.js'))) {
    if (NOT_PAGES.has(file)) continue;
    const src = read(file);
    if (!/CommanderPageShell/.test(src)) {
      missing.push(`${file} (not on CommanderPageShell)`);
      continue;
    }
    if (!/<header className="(?:cmd-header-full|cmd-header-bar)\b/.test(src)) missing.push(`${file} (no page header)`);
  }
  assert.deepEqual(missing, []);
});

test('no static description sentence under a header title', () => {
  const offenders = [];
  for (const file of walk(PAGES_DIR).filter((f) => f.endsWith('.js'))) {
    const src = read(file);
    for (const header of src.matchAll(/<header className="(?:cmd-header-full|cmd-header-bar)[^"]*">([\s\S]*?)<\/header>/g)) {
      for (const p of header[1].matchAll(/<p[^>]*>([^<{]*)<\/p>/g)) {
        const text = p[1].trim();
        if (text.split(/\s+/).length >= 3) offenders.push(`${file}: "${text}"`);
      }
    }
  }
  assert.deepEqual(offenders, []);
});

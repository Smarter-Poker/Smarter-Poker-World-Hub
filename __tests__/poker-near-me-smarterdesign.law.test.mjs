/**
 * POKER NEAR ME IS #SMARTERDESIGN (Dan, 2026-11-27, BINDING).
 *
 * Dan, verbatim: "POKER NEAR ME ... NEEDS THE SAME #SMARTERDESIGN UPGRADE TO
 * EVERY SINGLE PAGE, SUBPAGE, BUTTON AND EVERYTHING ELSE, EXACTLY LIKE WE'VE
 * DONE FOR EVERY OTHER WORLD HUB PAGE", and earlier the same day: "NO DO NOT
 * USE THOSE BULKY FRAMES, THATS THE OLD STYLE... USE THE #SMARTERDESIGN STYLE".
 *
 * This law pins the three things that make that true and that a later change
 * could quietly undo:
 *   1. every Poker Near Me destination opens on a #SMARTERDESIGN image header
 *      with its own seal and scene (and so the one painted chrome "?");
 *   2. every painted plate button, input well and three-slice panel declared
 *      by a Poker Near Me stylesheet is re-skinned by the #SMARTERDESIGN layer,
 *      which loads after all of them;
 *   3. no gold, amber, yellow, purple or pink colour survives in Poker Near Me
 *      source.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const LAYER = 'src/styles/worlds/poker-near-me-smarterdesign.css';

test('every Poker Near Me destination opens on its own #SMARTERDESIGN image header', async () => {
  const header = read('src/components/poker-near-me/PnmImageHeader.jsx');
  assert.match(header, /import BankrollImageHeader from '\.\.\/bankroll\/BankrollImageHeader'/);
  const art = [...header.matchAll(/'?([a-z-]+)'?: 'pnm-([a-z]+)'/g)].map((m) => m[2]);
  assert.ok(art.length >= 14, 'every route has an art key');
  assert.equal(new Set(art).size, art.length, 'no two destinations share a header');
  for (const key of art) {
    for (const part of ['seal', 'scene']) {
      assert.ok(existsSync(new URL(`public/images/smarterdesign/headers/pnm-${key}-${part}.webp`, ROOT)), `pnm-${key}-${part}.webp`);
    }
  }
  const pages = {
    'pages/hub/poker-near-me/lobby.js': /<PnmImageHeader route="lobby" \/>/,
    'pages/hub/poker-near-me/[pnmTab].js': /<PnmImageHeader route=\{canonicalSlug\} \/>/,
    'pages/hub/events-calendar.js': /<PnmImageHeader route="events-calendar" \/>/,
    'pages/hub/poker-tours.js': /<PnmImageHeader route="tours" \/>/,
    'pages/hub/home-games.js': /<PnmImageHeader route="home-games"/,
    'pages/hub/daily-tournaments.js': /<PnmImageHeader route="daily-tournaments"/,
    'src/components/poker-near-me/PokerNearMeLocationPage.jsx': /<PnmImageHeader route="locations"/,
    'pages/hub/poker-series.js': /<PnmImageHeader route="series" \/>/,
    'pages/hub/venues/[id].js': /<PnmImageHeader route="venues" title="Poker Room" heading="p" \/>/,
    'pages/hub/series/[id].js': /<PnmImageHeader route="series" title="Poker Series" heading="p" \/>/,
    'pages/hub/tours/[code].js': /<PnmImageHeader route="tours" title="Poker Tour" heading="p" \/>/,
    'pages/hub/home-games/[slug].js': /<PnmImageHeader route="home-games" title="Home Game" heading="p" \/>/,
  };
  for (const [file, pin] of Object.entries(pages)) assert.match(read(file), pin, file);
});

test('the #SMARTERDESIGN layer loads after every Poker Near Me stylesheet', () => {
  const app = read('pages/_app.js');
  const layerAt = app.indexOf("import '../src/styles/worlds/poker-near-me-smarterdesign.css';");
  assert.ok(layerAt > 0, 'the layer is imported');
  for (const m of app.matchAll(/import '\.\.\/(?:src\/)?styles\/(?:worlds\/)?poker-near-me[^']*\.css';/g)) {
    if (m[0].includes('smarterdesign')) continue;
    assert.ok(m.index < layerAt, `${m[0]} loads before the #SMARTERDESIGN layer`);
  }
});

test('no painted plate button, input well or three-slice panel remains in Poker Near Me', () => {
  // Painted icon holders (map markers, logo halos, avatar wells) are artwork
  // and may stay; every control and section surface is a #SMARTERDESIGN rim.
  const ICON_HOLDER = /pnm-painted-marker|pnm-painted-cluster|leaflet-control-zoom|pnc-icon|identity-mark__halo|gso-holder|pnm-location-card__mark|instructions > div|map-dossier__logo-machine|vc3-logo|avatar--initial|rating-choice/;
  const files = [
    ...readdirSync(new URL('src/styles/worlds/', ROOT)).filter((f) => /^poker-near-me.*\.css$/.test(f)).map((f) => `src/styles/worlds/${f}`),
    ...readdirSync(new URL('src/components/poker-near-me/', ROOT)).filter((f) => /\.(jsx?|css)$/.test(f)).map((f) => `src/components/poker-near-me/${f}`),
    'styles/poker-near-me.css', 'pages/hub/poker-near-me/lobby.js', 'pages/hub/poker-near-me/[pnmTab].js',
    'pages/hub/events-calendar.js', 'pages/hub/poker-tours.js', 'pages/hub/poker-series.js', 'pages/hub/daily-tournaments.js',
    'pages/hub/home-games.js', 'pages/hub/series/[id].js', 'pages/hub/tours/[code].js', 'pages/hub/home-games/[slug].js',
  ];
  assert.ok(files.length >= 50, `found ${files.length} Poker Near Me sources`);
  const left = [];
  for (const file of files) {
    const src = stripComments(read(file));
    for (const m of src.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
      if (!/painted-(?:panels-v1\/panel|controls-v1\/(?:button|search-well|utility-well))/.test(m[2])) continue;
      if (ICON_HOLDER.test(m[1])) continue;
      left.push(`${file}: ${m[1].trim().split('\n').pop().slice(0, 120)}`);
    }
    for (const m of src.matchAll(/["'`]url\('\/images\/pnm-console\/painted-controls-v1\/(?:button-(?:primary|secondary)\.png|search-well\.webp)'\)/g)) left.push(`${file}: inline ${m[0]}`);
  }
  assert.deepEqual(left, []);
  const layer = read(LAYER);
  assert.match(layer, /chrome-readout\.webp/);
  assert.match(layer, /\.pnc\[data-pnm-console='painted-chassis-v1'\] > \.pnc__head \{[^}]*aspect-ratio: auto !important;/);
});

test('no gold, amber, yellow, purple or pink colour survives in Poker Near Me source', () => {
  const files = [
    ...readdirSync(new URL('src/components/poker-near-me/', ROOT)).filter((f) => /\.(jsx?|css)$/.test(f)).map((f) => `src/components/poker-near-me/${f}`),
    ...readdirSync(new URL('src/components/poker-near-me/lobby/', ROOT)).filter((f) => /\.jsx?$/.test(f)).map((f) => `src/components/poker-near-me/lobby/${f}`),
    ...readdirSync(new URL('src/styles/worlds/', ROOT)).filter((f) => /^poker-near-me.*\.css$/.test(f)).map((f) => `src/styles/worlds/${f}`),
    'styles/poker-near-me.css',
    'pages/hub/poker-near-me/lobby.js',
    'pages/hub/poker-near-me/[pnmTab].js',
    'pages/hub/events-calendar.js',
    'pages/hub/poker-tours.js',
    'pages/hub/daily-tournaments.js',
    'pages/hub/poker-series.js',
  ];
  const offenders = [];
  const hls = (r, g, b) => {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b); const min = Math.min(r, g, b); const l = (max + min) / 2;
    if (max === min) return [0, 0, l];
    const d = max - min; const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h * 60, s, l];
  };
  const warm = (r, g, b) => {
    const [h, s, l] = hls(r, g, b);
    return s >= 0.35 && l >= 0.18 && l <= 0.97 && ((h >= 28 && h <= 68) || (h >= 255 && h <= 345));
  };
  assert.ok(files.length >= 50, `found ${files.length} Poker Near Me sources`);
  for (const file of files) {
    const src = read(file);
    for (const m of src.matchAll(/#([0-9a-fA-F]{6})\b/g)) {
      const n = parseInt(m[1], 16);
      if (warm(n >> 16, (n >> 8) & 255, n & 255)) offenders.push(`${file}: #${m[1]}`);
    }
    for (const m of src.matchAll(/rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/g)) {
      if (warm(+m[1], +m[2], +m[3])) offenders.push(`${file}: ${m[0]}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test('no Poker Near Me label is shouted by an uppercase transform', () => {
  // #SMARTERDESIGN labels are Title Case in the source text itself. A
  // text-transform: uppercase (CSS or a React style object) turns that Title
  // Case into capitals at render time, so it is refused everywhere in the
  // family: stylesheets, in-page <style> blocks and inline styles.
  const walk = (dir) => readdirSync(new URL(dir, ROOT), { withFileTypes: true }).flatMap((entry) => (
    entry.isDirectory() ? walk(`${dir}${entry.name}/`) : [`${dir}${entry.name}`]
  ));
  const files = [
    ...walk('src/components/poker-near-me/').filter((f) => /\.(jsx?|mjs|css)$/.test(f)),
    ...readdirSync(new URL('src/styles/worlds/', ROOT)).filter((f) => /^poker-near-me.*\.css$/.test(f)).map((f) => `src/styles/worlds/${f}`),
    'styles/poker-near-me.css',
    'src/components/poker/VenueReviews.js',
    'pages/hub/poker-near-me/lobby.js', 'pages/hub/poker-near-me/[pnmTab].js', 'pages/hub/poker-near-me/index.js',
    'pages/hub/events-calendar.js', 'pages/hub/poker-tours.js', 'pages/hub/poker-series.js',
    'pages/hub/series/[id].js', 'pages/hub/tours/[code].js', 'pages/hub/home-games.js',
    'pages/hub/home-games/[slug].js', 'pages/hub/venues/[id].js', 'pages/hub/daily-tournaments.js',
  ];
  assert.ok(files.length >= 50, `found ${files.length} Poker Near Me sources`);
  const shouting = [];
  for (const file of files) {
    const src = stripComments(read(file));
    for (const m of src.matchAll(/text-transform\s*:\s*uppercase|textTransform\s*:\s*['"`]uppercase/g)) {
      shouting.push(`${file}:${src.slice(0, m.index).split('\n').length}`);
    }
  }
  assert.deepEqual(shouting, []);
});

test('every Poker Near Me popup carries a labeled 44px Close control', () => {
  const dialogs = {
    'src/components/poker-near-me/CasinoActionDialog.jsx': /className="pnm-console-dialog__close"[\s\S]*?aria-label=\{`Close \$\{title \|\| 'confirmation'\} dialog`\}[\s\S]*?>\s*Close\s*</,
    'src/components/poker-near-me/modals/LoginPromptModal.js': /className="pnm-console-dialog__close"[\s\S]*?aria-label="Close sign in dialog"[\s\S]*?>\s*Close\s*</,
    'src/components/poker-near-me/modals/ManualLocationModal.js': /className="pnm-console-dialog__close"[\s\S]*?>\s*Close\s*</,
    'src/components/poker-near-me/modals/LocationEnablePopup.js': /className="pnm-console-dialog__close"/,
    'src/components/poker-near-me/VenueReviews.jsx': /className="pnm-console-dialog__close"[\s\S]*?>\s*Close\s*</,
    'src/components/poker-near-me/ReportGameModal.jsx': /aria-label="Close report game dialog"[\s\S]*?minWidth: 44, minHeight: 44[\s\S]*?<span>Close<\/span>/,
    'src/components/poker-near-me/SocialLayer.jsx': /className="sl-modal-close" aria-label="Close invite dialog"[\s\S]*?<span>Close<\/span>/,
    'src/components/poker-near-me/GlobalSearchOverlay.jsx': /className="gso-back sp-icon-btn"[^>]*aria-label="Close"[^>]*'--sp-btn-size': '44px'/,
  };
  for (const [file, pin] of Object.entries(dialogs)) assert.match(read(file), pin, file);
  const css = read('src/styles/worlds/poker-near-me-console-dialogs.css');
  assert.match(css, /\.pnm-console-dialog__close \{[^}]*min-height: 44px;/);
});

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const bytes = (path) => readFileSync(new URL(path, root));

function pngInfo(path) {
  const data = bytes(path);
  assert.equal(data.subarray(1, 4).toString('ascii'), 'PNG', `${path} must be PNG`);
  return {
    width: data.readUInt32BE(16),
    height: data.readUInt32BE(20),
    colorType: data[25],
    sha256: createHash('sha256').update(data).digest('hex'),
  };
}

const PANEL_ASSETS = Object.freeze({
  'panel-head.png': [1000, 112, 'e457613763aa85109cf163cf98fd7de0c472c67f2408f717bda7a865d6be863e'],
  'panel-mid.png': [1000, 8, '3643e1688ff20e0383d8c14acf17e848731765b8fd38f69af5afa4d57e4fa6e3'],
  'panel-foot.png': [1000, 72, '9e68d4067af5b1caaa69d73de2dd14d28c9301d41ee17f56b83af686e7d4e138'],
});

const BUTTON_ASSETS = Object.freeze({
  'button-primary.png': [348, 114, '612777b4518ef8c731c495e84f683a927a420b23c5cb63af3fd4f0f1d8f45a59'],
  'button-secondary.png': [348, 114, 'bcdb0a6999c94233b85b2053dd119f1bb93a5c7d487d122f4f99d2c990d397b1'],
});

test('painted console masters retain exact native geometry and immutable hashes', () => {
  for (const [name, [width, height, sha256]] of Object.entries(PANEL_ASSETS)) {
    const path = `public/images/pnm-console/painted-panels-v1/${name}`;
    const info = pngInfo(path);
    assert.deepEqual([info.width, info.height], [width, height], `${name} geometry drifted`);
    assert.equal(info.sha256, sha256, `${name} pixels drifted`);
    assert.ok([4, 6].includes(info.colorType), `${name} must preserve alpha transparency`);
  }

  const head = pngInfo('public/images/pnm-console/painted-chassis-v1/top-locator.png');
  const plates = pngInfo('public/images/pnm-console/painted-chassis-v1/bottom-plates.png');
  assert.deepEqual([head.width, head.height], [1000, 348]);
  assert.deepEqual([plates.width, plates.height], [1000, 277]);
});

// The runtime icon folder; PNM_ICON_DIR points the pictogram test at another
// copy (for example the pre-2026-09-21 fixed-cell crops, which must fail it).
const ICON_DIR = process.env.PNM_ICON_DIR
  ? resolve(process.env.PNM_ICON_DIR)
  : fileURLToPath(new URL('public/images/pnm-console/painted-controls-v1/', root));

// A minimal PNG decoder: 8-bit, non-interlaced, gray+alpha (4) or RGBA (6),
// scanline filters 0-4. It returns the alpha plane and Rec. 601 luma.
function decodePng(data) {
  assert.equal(data.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'not a PNG file');
  let header = null;
  const idat = [];
  for (let at = 8; at + 8 <= data.length; ) {
    const length = data.readUInt32BE(at);
    const type = data.toString('ascii', at + 4, at + 8);
    const body = data.subarray(at + 8, at + 8 + length);
    if (type === 'IHDR') {
      header = {
        width: body.readUInt32BE(0),
        height: body.readUInt32BE(4),
        depth: body[8],
        colorType: body[9],
        interlace: body[12],
      };
    } else if (type === 'IDAT') {
      idat.push(body);
    } else if (type === 'IEND') {
      break;
    }
    at += length + 12;
  }
  assert.ok(header, 'PNG has no IHDR chunk');
  const { width, height, depth, colorType, interlace } = header;
  const channels = { 4: 2, 6: 4 }[colorType];
  assert.ok(channels, `colour type ${colorType} has no true alpha channel`);
  assert.equal(depth, 8, 'only 8-bit samples are decoded');
  assert.equal(interlace, 0, 'interlaced PNGs are not decoded');
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  assert.equal(raw.length, height * (stride + 1), 'PNG image data is truncated');
  const pixels = new Uint8Array(height * stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const line = y * (stride + 1) + 1;
    const out = y * stride;
    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? pixels[out + x - channels] : 0;
      const up = y > 0 ? pixels[out + x - stride] : 0;
      const corner = x >= channels && y > 0 ? pixels[out + x - stride - channels] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = (left + up) >> 1;
      else if (filter === 4) {
        const estimate = left + up - corner;
        const toLeft = Math.abs(estimate - left);
        const toUp = Math.abs(estimate - up);
        const toCorner = Math.abs(estimate - corner);
        predictor = toLeft <= toUp && toLeft <= toCorner ? left : toUp <= toCorner ? up : corner;
      } else if (filter !== 0) {
        throw new Error(`unknown PNG filter type ${filter} on row ${y}`);
      }
      pixels[out + x] = (raw[line + x] + predictor) & 0xff;
    }
  }
  const alpha = new Uint8Array(width * height);
  const luma = new Float64Array(width * height);
  for (let index = 0; index < width * height; index += 1) {
    const at = index * channels;
    alpha[index] = pixels[at + channels - 1];
    luma[index] = channels === 4
      ? 0.299 * pixels[at] + 0.587 * pixels[at + 1] + 0.114 * pixels[at + 2]
      : pixels[at];
  }
  return { width, height, colorType, alpha, luma };
}

// Sizes of the 8-connected components of a 0/1 mask.
function componentSizes(mask, width, height) {
  const seen = new Uint8Array(mask.length);
  const stack = new Int32Array(mask.length);
  const sizes = [];
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || seen[start]) continue;
    let top = 0;
    let size = 0;
    stack[top++] = start;
    seen[start] = 1;
    while (top) {
      const index = stack[--top];
      size += 1;
      const x = index % width;
      const y = (index - x) / width;
      for (let ny = Math.max(0, y - 1); ny <= Math.min(height - 1, y + 1); ny += 1) {
        for (let nx = Math.max(0, x - 1); nx <= Math.min(width - 1, x + 1); nx += 1) {
          const next = ny * width + nx;
          if (mask[next] && !seen[next]) {
            seen[next] = 1;
            stack[top++] = next;
          }
        }
      }
    }
    sizes.push(size);
  }
  return sizes;
}

test('every reusable pictogram is a substantial transparent painted object', () => {
  const icons = [
    'search', 'location', 'fullscreen', 'back', 'close', 'saved',
    'share', 'phone', 'globe', 'directions', 'calendar', 'home',
    'menu', 'edit', 'event-ticket', 'live-games', 'roadtrip', 'trophy',
    'alert', 'filter', 'community', 'info', 'review', 'more',
  ];
  const PAINTED = 32; // alpha above this is part of a painted object
  const SOLID = 200; // alpha above this is the holder's solid body
  const failures = [];
  for (const icon of icons) {
    const file = join(ICON_DIR, `icon-${icon}.png`);
    if (!existsSync(file)) {
      failures.push(`${icon}: holder is missing`);
      continue;
    }
    let png;
    try {
      png = decodePng(readFileSync(file));
    } catch (error) {
      failures.push(`${icon}: ${error.message}`);
      continue;
    }
    const { width, height, alpha, luma } = png;
    if (width < 280 || height < 280) failures.push(`${icon}: ${width}x${height} holder is too small`);

    const edges = { top: 0, bottom: 0, left: 0, right: 0 };
    for (let x = 0; x < width; x += 1) {
      if (alpha[x]) edges.top += 1;
      if (alpha[(height - 1) * width + x]) edges.bottom += 1;
    }
    for (let y = 0; y < height; y += 1) {
      if (alpha[y * width]) edges.left += 1;
      if (alpha[y * width + width - 1]) edges.right += 1;
    }
    const clipped = Object.entries(edges).filter(([, count]) => count > 0);
    if (clipped.length) {
      const sides = clipped.map(([side, count]) => `${side} ${count}px`).join(', ');
      failures.push(`${icon}: non-transparent pixels on the outer edge (${sides}): the holder is clipped`);
    }

    const painted = alpha.map((value) => (value > PAINTED ? 1 : 0));
    const objects = componentSizes(painted, width, height).filter((size) => size > 30);
    if (objects.length !== 1) {
      failures.push(`${icon}: ${objects.length} painted objects (${objects.join(', ')} px); expected one holder and no neighbour fragments`);
    }
    const coverage = painted.reduce((sum, value) => sum + value, 0) / (width * height);
    if (!(coverage >= 0.45 && coverage <= 0.95)) {
      failures.push(`${icon}: painted coverage ${coverage.toFixed(3)} is outside 0.45-0.95`);
    }

    let count = 0;
    let sum = 0;
    let sumSquares = 0;
    for (let index = 0; index < alpha.length; index += 1) {
      if (alpha[index] <= SOLID) continue;
      count += 1;
      sum += luma[index];
      sumSquares += luma[index] * luma[index];
    }
    const deviation = count ? Math.sqrt(Math.max(0, sumSquares / count - (sum / count) ** 2)) : 0;
    if (deviation < 40) failures.push(`${icon}: luminance deviation ${deviation.toFixed(1)} < 40, painted detail lost`);
  }
  assert.deepEqual(failures, [], `pictograms read from ${ICON_DIR}`);
});

test('painted button plates follow their chamfer instead of an opaque rectangle', () => {
  const failures = [];
  for (const [name, [expectedWidth, expectedHeight, expectedHash]] of Object.entries(BUTTON_ASSETS)) {
    const path = `public/images/pnm-console/painted-controls-v1/${name}`;
    const info = pngInfo(path);
    const png = decodePng(bytes(path));
    assert.deepEqual([info.width, info.height], [expectedWidth, expectedHeight], `${name} geometry drifted`);
    assert.equal(info.sha256, expectedHash, `${name} pixels drifted`);
    assert.ok([4, 6].includes(info.colorType), `${name} must preserve alpha transparency`);

    for (let y = 0; y < png.height; y += 1) {
      for (let x = 0; x < png.width; x += 1) {
        const cornerDistance = Math.min(
          x + y,
          (png.width - 1 - x) + y,
          x + (png.height - 1 - y),
          (png.width - 1 - x) + (png.height - 1 - y),
        );
        if (cornerDistance <= 20 && png.alpha[y * png.width + x] !== 0) {
          failures.push(`${name}: opaque corner matte at ${x},${y}`);
        }
      }
    }
    assert.ok(png.alpha[Math.floor(png.height / 2) * png.width + Math.floor(png.width / 2)] > 200);
  }
  assert.deepEqual(failures, []);

  const surgery = read('scripts/art/clean-pnm-button-alpha.py');
  assert.match(surgery, /RGB pixels changed/);
  assert.match(surgery, /distance >= SOLID_FROM/);
  assert.match(surgery, /if digest != expected\["clean"\]:/);
  assert.match(surgery, /generated \{source\.name\} hash drifted/);
});

test('console components keep master slices separate and live values in DOM zones', () => {
  const component = read('src/components/poker-near-me/PokerNearMeConsole.jsx');
  const css = read('src/styles/worlds/poker-near-me-console.css');

  assert.match(component, /data-pnm-console="painted-chassis-v1"/);
  assert.match(component, /data-pnm-console="painted-panel-v1"/);
  assert.match(component, /pnc-panel__head[\s\S]*pnc-panel__body[\s\S]*pnc-panel__foot/);
  assert.match(component, /completePlatePair/);
  assert.match(component, /ResizeObserver/);
  assert.match(css, /panel-head\.png/);
  assert.match(css, /panel-mid\.png[^;]*repeat-y/);
  assert.match(css, /panel-foot\.png/);
  assert.doesNotMatch(css, /(?:linear|radial|conic)-gradient\(/i);
  assert.doesNotMatch(css, /:hover/i);
});

test('final Poker Near Me console layers load after legacy visual compatibility layers', () => {
  const app = read('pages/_app.js');
  const legacy = app.indexOf("import '../src/styles/worlds/poker-near-me-command-surfaces.css';");
  const required = [
    'poker-near-me-console.css',
    'poker-near-me-console-deep.css',
    'poker-near-me-console-search.css',
    'poker-near-me-console-nav.css',
    'poker-near-me-console-dialogs.css',
    'poker-near-me-console-surfaces.css',
    'poker-near-me-console-map.css',
    'poker-near-me-console-cards.css',
    'poker-near-me-console-tools.css',
    'poker-near-me-console-menu.css',
  ];
  for (const file of required) {
    const at = app.indexOf(`import '../src/styles/worlds/${file}';`);
    assert.ok(at > legacy, `${file} must be a final console cascade layer`);
  }
});

test('Poker Near Me hamburger drawer uses complete painted controls without generic vector chrome', () => {
  const menu = read('src/components/ui/HamburgerMenu.jsx');
  const css = read('src/styles/worlds/poker-near-me-console-menu.css');
  const source = pngInfo('public/images/pnm-console/painted-controls-v1/source/icon-sheet-command.png');

  assert.deepEqual([source.width, source.height], [1448, 1086]);
  assert.equal(source.sha256, '3b7f2e34a8f018188a9c4fa3c7c12933c65309b829c7b43bb20a9b53644be59e');
  assert.match(menu, /data-pnm-console=.*painted-command-drawer-v1/);
  assert.match(menu, /sp-command-item-icon--\$\{pokerNearMeCommandIcon/);
  assert.doesNotMatch(menu, /data-world-command-menu='poker-near-me'[\s\S]{0,240}(?:linear|radial|conic)-gradient/i);
  for (const asset of ['icon-menu.png', 'icon-edit.png', 'icon-close.png', 'button-primary.png', 'button-secondary.png', 'search-well.webp']) {
    assert.match(css, new RegExp(asset.replace('.', '\\.')));
  }
  assert.match(css, /min-height:\s*44px/);
  assert.doesNotMatch(css, /(?:linear|radial|conic)-gradient\(|:hover/i);
});

test('lobby, daily listings, discovery tools and location indexes use painted controls', () => {
  const lobby = read('src/components/poker-near-me/lobby/LobbyOverlay.jsx');
  const daily = read('src/components/poker-near-me/DailyTournamentsTabPanel.jsx');
  const more = read('src/components/poker-near-me/MoreTabPanel.jsx');
  const locations = read('src/components/poker-near-me/PokerNearMeLocationPage.jsx');
  const css = read('src/styles/worlds/poker-near-me-console-surfaces.css');

  for (const [name, source] of Object.entries({ lobby, daily, more })) {
    assert.doesNotMatch(source, /<svg\b/i, `${name} cannot draw generic vector controls`);
    assert.doesNotMatch(source, /(?:linear|radial|conic)-gradient\(/i, `${name} cannot fake materials`);
  }
  assert.match(lobby, /PokerNearMeConsoleIcon/);
  assert.match(lobby, /PokerNearMePanelShell/);
  assert.match(daily, /PokerNearMePanelShell/);
  assert.match(more, /PokerNearMePanelShell/);
  assert.match(locations, /PokerNearMePanelShell/);
  assert.match(css, /search-well\.webp/);
  assert.match(css, /button-primary\.png/);
  assert.match(css, /button-secondary\.png/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /@media \(orientation: landscape\)[\s\S]*?\[data-global-bottom-nav='true'\][\s\S]*?position:\s*relative !important/);
  assert.doesNotMatch(css, /(?:linear|radial|conic)-gradient\(|:hover/i);
});

test('console artwork provenance and no-baked-data policy ship with the assets', () => {
  for (const path of [
    'public/images/pnm-console/painted-chassis-v1/source/README.md',
    'public/images/pnm-console/painted-controls-v1/source/README.md',
    'public/images/pnm-console/painted-panels-v1/README.md',
  ]) {
    const provenance = read(path);
    assert.match(provenance, /SHA-256|SHA-256|hash/i);
    assert.match(provenance, /dynamic|live value|DOM content/i);
  }
});

test('a painted label used as a heading keeps its own size and can wrap', () => {
  // A global `h2 { font-size: 1.5rem !important }` outranks .pnc-label, so a
  // heading carrying the label style rendered at 24px and `white-space: nowrap`
  // clipped it. Home Games Near Me lost the end of "Browse Home Games By City"
  // on every phone width. Both halves of the repair are pinned here.
  const css = read('src/styles/worlds/poker-near-me-console.css');
  assert.match(
    css,
    /h1\.pnc-label[\s\S]*?h6\.pnc-label\s*\{[^}]*font-size:\s*2\.7cqw\s*!important/,
    'a heading label must beat the global h2 font-size',
  );
  assert.match(
    css,
    /h6\.pnc-label,\s*\n\s*p\.pnc-label\s*\{[^}]*white-space:\s*normal/,
    'a block level label must wrap instead of clipping',
  );
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

// Shared #SMARTERDESIGN paint contract for the Diamond Store / Marketplace
// design-guard tests (docs/SMARTERDESIGN.md, styles/smarterdesign.css).
//
// The 2026-09 contracts banned every gradient, every url() and every image
// surface, and asked for 1px restrained hairline boxes. The #SMARTERDESIGN
// standard replaces that with a closed set of materials: four exact gradients,
// the chrome nine-slice border images, the Cashier-style image headers, and
// the product/package art the redesign kept. Anything else is off-standard.

const normalise = (value) =>
  value
    .replace(/\s+/g, ' ')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .replace(/\s*,\s*/g, ', ')
    .trim()
    .toLowerCase();

export const SMARTERDESIGN_GRADIENTS = Object.freeze({
  navy: 'linear-gradient(155deg, #182d43 0%, #0b1c2c 43%, #050e18 87%)',
  card: 'linear-gradient(155deg, #162a3f 0%, #0a1a2a 43%, #050e18 87%)',
  control: 'linear-gradient(180deg, #263f58, #112338 39%, #071420 77%, #12283c)',
  cobalt: 'linear-gradient(180deg, #1981ec, #0c55c0 26%, #07377e 76%, #125bba)',
});

// Circular chrome seal rings (header seal, starter-pack seal, VIP crest) and the
// Cashier-style image header backdrop / scene fade. Only these extra paints are
// allowed, and only because they are part of the approved header and seal kit.
export const SMARTERDESIGN_SEAL_AND_HEADER_PAINT = Object.freeze([
  'conic-gradient(from 25deg, #6d94b1, #d8e7f3 12%, #3c5369 23%, #0d263b 35%, #a6c8e0 50%, #465d72 64%, #f4f9ff 78%, #234968 90%, #6d94b1)',
  'conic-gradient(from 210deg, #f4f8fc, #7f93a6 12%, #2a3a4a 24%, #c9d6e2 37%, #f7fbff 46%, #5f7387 58%, #1d2a38 70%, #b4c4d3 83%, #f4f8fc)',
  'radial-gradient(ellipse at 20% 102%, #233f63 0, #102337 38%, #07121e 78%)',
  'linear-gradient(90deg, transparent, #0002 18%, #0006 43%, #0009 68%, #000)',
  'linear-gradient(90deg, transparent, #0002 22%, #0006 52%, #0009 76%, #000f)',
  // The store image header's painted-scene fade (StoreImageHeader desktop and
  // phone): the low-key painted scenes need a shorter fade to read.
  'linear-gradient(90deg, transparent, #0004 16%, #000a 40%, #000 62%)',
  'linear-gradient(90deg, transparent, #0005 18%, #000b 42%, #000 60%)',
  // The VIP image header (VipKit VipMasthead and the VipDialog head): its
  // backdrop and the crown-scene fade, kept exactly as approved.
  'radial-gradient(ellipse at 18% 104%, #23466f 0, #0f2338 40%, #06111d 80%)',
  'linear-gradient(90deg, transparent, #0003 20%, #0009 52%, #000 82%)',
]);

const ALLOWED_GRADIENTS = new Set(
  [...Object.values(SMARTERDESIGN_GRADIENTS), ...SMARTERDESIGN_SEAL_AND_HEADER_PAINT].map(normalise)
);

// url() is allowed for the #SMARTERDESIGN kit and for product/package art the
// redesign kept, plus runtime product media bound from data (`url(${...})`).
export const SMARTERDESIGN_URL_ALLOWLIST = Object.freeze([
  /^\/images\/smarterdesign\/chrome-(?:readout|stat|row|active)\.webp$/,
  /^\/images\/smarterdesign\/headers\/[a-z0-9-]+\.webp$/,
  /^\/images\/smarterdesign\/header-help\.webp$/,
  /^\/images\/smarterdesign\/plates\/vip-[a-z0-9-]+\.png$/,
  /^\/images\/store-v3\/diamond-packages-sheet\.(?:webp|png)$/,
  /^\/images\/store-v3\/club-shop-product-atlas-v2\.(?:webp|png)$/,
  /^\/images\/merch\/neural-steel\/[a-z0-9-]+\.webp$/,
  /^\/images\/global-header\/global-header-desktop\.png$/,
  /^\$\{[^}]+\}$/,
]);

// The 2026-09 rejected painted art. None of it may come back as a surface.
export const REJECTED_PAINTED_ART =
  /marketplace-console-v1|shark-panel|navigation\/nav-shell|nav-shell\.|wallet-row-shell|spade-console|\/bay(?:[-_/.]|\b)/i;

// Gold, amber, yellow, orange, purple, violet, pink and magenta are artwork
// colours only, never text.
const BANNED_TEXT_HUES =
  '#f59e0b|#fbbf24|#facc15|#eab308|#fcd34d|#fde047|#ffd700|#d4af37|#f97316|#fb923c|#a855f7|#8b5cf6|#7c3aed|#c084fc|#ec4899|#f472b6|#d946ef|\\bgold(?:enrod)?\\b|\\bamber\\b|\\byellow\\b|\\borange\\b|\\bpurple\\b|\\bviolet\\b|\\bpink\\b|\\bmagenta\\b|\\bfuchsia\\b';
export const BANNED_TEXT_COLOUR = new RegExp(
  `(?:^|[;{\\s'"])(?:-webkit-text-fill-)?color\\s*:\\s*['"]?[^;'"\\n}]*(?:${BANNED_TEXT_HUES})`,
  'im'
);

export const withoutComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

// Every gradient call in a source, with balanced parentheses.
export const gradientsIn = (source) => {
  const found = [];
  const text = withoutComments(source);
  const opener = /(?:repeating-)?(?:linear|radial|conic)-gradient\s*\(/gi;
  let match;
  while ((match = opener.exec(text))) {
    let depth = 0;
    let end = match.index + match[0].length - 1;
    for (; end < text.length; end += 1) {
      if (text[end] === '(') depth += 1;
      else if (text[end] === ')') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    found.push(text.slice(match.index, end + 1));
    opener.lastIndex = end + 1;
  }
  return found;
};

export const urlsIn = (source) =>
  [...withoutComments(source).matchAll(/url\(\s*(['"`]?)([^'"`)]*?(?:\$\{[^}]*\})?[^'"`)]*)\1\s*\)/g)].map(
    ([, , target]) => target.trim()
  );

export const isStandardGradient = (gradient) => ALLOWED_GRADIENTS.has(normalise(gradient));
export const isStandardUrl = (target) => SMARTERDESIGN_URL_ALLOWLIST.some((rule) => rule.test(target));

// Everything in `source` that is paint outside the #SMARTERDESIGN materials:
// unknown gradients, unknown url() targets, and any rejected painted art.
export const offStandardPaint = (source) => {
  const offenders = [];
  for (const gradient of gradientsIn(source)) {
    if (!isStandardGradient(gradient)) offenders.push(`gradient: ${normalise(gradient)}`);
  }
  for (const target of urlsIn(source)) {
    if (!isStandardUrl(target)) offenders.push(`url: ${target}`);
  }
  const art = withoutComments(source).match(new RegExp(REJECTED_PAINTED_ART.source, 'gi'));
  for (const hit of art || []) offenders.push(`rejected art: ${hit}`);
  return offenders;
};

// A CSS rule block for an exact selector line, e.g. ruleFor(css, '.panel').
export const ruleFor = (source, selector) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return source.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{[\\s\\S]*?\\n\\}`))?.[0] || '';
};

// The four #SMARTERDESIGN frames: chrome nine-slice border over a standard fill.
export const SD_FRAME = {
  panel: /border:\s*[45]px solid transparent(?:\s*!important)?;[\s\S]*?border-image:\s*url\('\/images\/smarterdesign\/chrome-readout\.webp'\)/,
  well: /border:\s*3px solid transparent(?:\s*!important)?;[\s\S]*?border-image:\s*url\('\/images\/smarterdesign\/chrome-stat\.webp'\)/,
  control: /border:\s*3px solid transparent(?:\s*!important)?;[\s\S]*?border-image:\s*url\('\/images\/smarterdesign\/chrome-row\.webp'\)/,
  active: /border-image:\s*url\('\/images\/smarterdesign\/chrome-active\.webp'\)/,
  any: /border:\s*\d+px solid transparent(?:\s*!important)?;[\s\S]*?border-image:\s*url\('\/images\/smarterdesign\/chrome-(?:readout|stat|row|active)\.webp'\)/,
};

export const SD_FILL = new RegExp(
  `background:\\s*(?:${Object.values(SMARTERDESIGN_GRADIENTS)
    .map((g) => g.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')}|var\\(--sd-(?:card|navy|control|cobalt)-bg\\))`
);

// One frame per surface: a rule carrying a chrome nine-slice must not also
// carry a second outline (a hairline border or an inset ring shadow).
export const hasSecondFrame = (rule) =>
  /box-shadow:[^;]*inset 0 0 0 [1-9]px/.test(rule) || /outline:\s*[1-9]px solid(?![^;]*#9ee3ff)/.test(rule);

// Panels and controls are square; only circular seals/avatars (50%) are round.
export const ROUNDED_CORNER = /border-radius:(?!\s*(?:0(?:px)?|50%)\s*(?:!important\s*)?;)[^;]+;/;

// This module is named *.test.mjs so it ships with the compact Vercel test
// upload (.vercelignore keeps /__tests__/*.test.mjs only). Its self-checks run
// only when it is the entry file, never when another contract imports it.
const isEntry = import.meta.url === pathToFileURL(process.argv[1] || '').href;

if (isEntry) {
  test('the four standard gradients, seal rings and kit urls are the only allowed paint', () => {
    for (const gradient of Object.values(SMARTERDESIGN_GRADIENTS)) {
      assert.deepEqual(offStandardPaint(`background: ${gradient};`), []);
    }
    assert.deepEqual(
      offStandardPaint("border-image: url('/images/smarterdesign/chrome-row.webp') 13 / 4px stretch;"),
      []
    );
    assert.deepEqual(offStandardPaint('background: linear-gradient(#000, #fff);'), [
      'gradient: linear-gradient(#000, #fff)',
    ]);
    assert.ok(offStandardPaint("background: url('/images/marketplace-console-v1/shark-panel/mid.png');").length);
    assert.ok(offStandardPaint("background: url('/images/random.png');").length);
  });

  test('banned text colours and rounded corners are detected without false positives', () => {
    assert.match('.a {\n  color: #fbbf24;\n}', BANNED_TEXT_COLOUR);
    assert.match("{ color: 'gold' }", BANNED_TEXT_COLOUR);
    assert.doesNotMatch('background-color: gold; border-color: #fbbf24;', BANNED_TEXT_COLOUR);
    assert.doesNotMatch('.a { color: #86daff; }', BANNED_TEXT_COLOUR);
    assert.match('border-radius: 8px;', ROUNDED_CORNER);
    assert.doesNotMatch('border-radius: 0; border-radius: 50% !important;', ROUNDED_CORNER);
  });
}

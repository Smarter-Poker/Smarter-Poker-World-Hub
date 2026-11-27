/**
 * Phase 10 Regression Guard: OG Hand Card, Share Hand Page, Virtual Sandbox Lander & SEO Markdown
 *
 * Permanently verifies all Phase 10 fixes across:
 *  1. pages/api/og/hand-card.js: #SmarterDesign obsidian-navy canvas, 1200x630 resolution,
 *     readable >=15px labels, privacy/cache response headers, case-insensitive 'T'->'10' cards,
 *     sanitized/bounded non-review query params, and honest neutral fallbacks (zero fabricated defaults).
 *  2. pages/share/hand.js: pre-hydration image error fallback (setImageError(true) when complete && naturalWidth===0),
 *     relative /api/og/hand-card <img src>, absolute og:image/twitter:image with 1200x630 dimensions,
 *     case-insensitive 'T'->'10' card parsing, whitelisted og:url query params, honest non-review defaults,
 *     zero trailing-space H1, and clean 'Board' divider (replacing 'Vs').
 *  3. pages/features/virtual-poker-sandbox.js: honest Post-Session Analysis / Leak Finder / Audited Spot Study /
 *     Poker Odds Calculator copy (zero 3D/WebGL/drag/10,000-runout fabrications) and scrollable mobile comparison
 *     table with normal word wrapping and 0px document overflow.
 *  4. src/lib/seo/markdownIngestion.mjs: honest renderVirtualSandboxMarkdown pointing crawlers to
 *     /hub/personal-assistant/leaks and /tools/poker-odds-calculator (zero 3D or retired /sandbox links).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('1. pages/api/og/hand-card.js uses #SmarterDesign obsidian-navy theme, 1200x630 resolution, and readable >=15px labels', () => {
  const src = read('pages/api/og/hand-card.js');

  // Obsidian-navy canvas, steel border, royal-blue/cyan accents, and beveled 4-color cards
  assert.match(src, /linear-gradient\(135deg,\s*#040D18 0%,\s*#091727 52%,\s*#05080C 100%\)/);
  assert.match(src, /rgba\(174,192,208,0\.28\)/);
  assert.match(src, /#087CFA/);
  assert.match(src, /#56D8FF/);
  assert.match(src, /#83DEFF/);
  assert.match(src, /linear-gradient\(180deg,\s*#132238 0%,\s*#08101C 100%\)/);
  assert.match(src, /const SUIT_COLORS = \{\s*c:\s*'#4DE0A5',\s*d:\s*'#56D8FF',\s*h:\s*'#FF6B7A',\s*s:\s*'#F1F5FC'\s*\}/);

  // Zero legacy purple/indigo/yellow/flat suit colors
  assert.doesNotMatch(src, /#0a0a1e|#1a1a3e|#2a2a5e|#0d0d2e|#FFD700|#FFA500|#2ECC71|#3498DB|#E74C3C|#ECF0F1/i);

  // 1200x630 resolution with headers passed to ImageResponse
  assert.match(src, /\{\s*width:\s*1200,\s*height:\s*630,\s*headers\s*\}/);
  assert.doesNotMatch(src, /width:\s*800,\s*height:\s*420/);

  // Crisp readable typography (>=14px-16px) and high-contrast #9EB4C8 labels (no tiny 11px/12px low-contrast)
  assert.doesNotMatch(src, /fontSize:\s*(?:1[0-3]|[1-9])\b/);
  assert.doesNotMatch(src, /rgba\(255,\s*255,\s*255,\s*0\.[24]\)/);
  assert.match(src, /color:\s*'#9EB4C8'/);
  assert.match(src, /fontSize:\s*16,[\s\S]{0,220}Smarter\.Poker/);
});

test('2. pages/api/og/hand-card.js enforces privacy/cache headers, case-insensitive card ranks, bounded params, and honest fallbacks', () => {
  const src = read('pages/api/og/hand-card.js');

  // Privacy headers for view=review and public cache headers for standard snapshots
  assert.match(src, /'Cache-Control':\s*'private, no-store, max-age=0'/);
  assert.match(src, /'X-Robots-Tag':\s*'noindex, nofollow'/);
  assert.match(src, /'Cache-Control':\s*'public, max-age=3600, s-maxage=86400'/);

  // Case-insensitive 'T' / lowercase card rank formatting
  assert.match(src, /const rank = cardStr\.slice\(0,\s*-1\)\.toUpperCase\(\)\.replace\(\/\^T\$\/,\s*'10'\);/);

  // Behavioral verification of the exact card-rank normalization
  const normalizeRank = (cardStr) => cardStr.slice(0, -1).toUpperCase().replace(/^T$/, '10');
  assert.equal(normalizeRank('th'), '10');
  assert.equal(normalizeRank('Th'), '10');
  assert.equal(normalizeRank('10s'), '10');
  assert.equal(normalizeRank('ah'), 'A');
  assert.equal(normalizeRank('kd'), 'K');
  assert.equal(normalizeRank('9c'), '9');

  // Bounded/sanitized params (up to 6 hero cards for PLO4/5/6) and zero fabricated defaults
  assert.match(src, /reviewCards\(searchParams\.get\('hero'\),\s*6\)/);
  assert.match(src, /reviewCards\(searchParams\.get\('board'\),\s*5\)/);
  assert.match(src, /reviewText\(searchParams\.get\('result'\),\s*24\)/);
  assert.match(src, /reviewText\(searchParams\.get\('amount'\),\s*24\)/);
  assert.match(src, /reviewText\(searchParams\.get\('pot'\),\s*24\)/);
  assert.match(src, /Hand Snapshot/);
  assert.match(src, /Not Shared/);
  assert.doesNotMatch(src, /\+\$1,250/);
  assert.doesNotMatch(src, /Ah,Kh/);
  assert.doesNotMatch(src, /\$2,500/);
  assert.doesNotMatch(src, /searchParams\.get\('stakes'\)\s*\|\|\s*'\$1\/\$3 NLH'/);
});

test('3. pages/share/hand.js fixes pre-hydration image error fallback, relative <img> src, 1200x630 meta, case-insensitive cards, og:url whitelist, honest defaults, and Board divider', () => {
  const src = read('pages/share/hand.js');

  // Pre-hydration failure sets imageError(true) when complete && naturalWidth === 0 (never setImageLoaded(true))
  assert.match(
    src,
    /if \(imgRef\.current\?\.complete\)\s*\{\s*if \(imgRef\.current\.naturalWidth > 0\)\s*\{\s*setImageLoaded\(true\);\s*\}\s*else\s*\{\s*setImageError\(true\);\s*\}\s*\}/
  );

  // Absolute https://smarter.poker OG meta tags, relative /api/og/hand-card for visible <img>
  assert.match(src, /const ogImagePath = ogQueryString[\s\S]{0,80}\/api\/og\/hand-card/);
  assert.match(src, /const ogImageUrl = `https:\/\/smarter\.poker\$\{ogImagePath\}`;/);
  assert.match(src, /<meta key="og-image" property="og:image" content=\{ogImageUrl\} \/>/);
  assert.match(src, /<meta key="twitter-image" name="twitter:image" content=\{ogImageUrl\} \/>/);
  assert.match(src, /<img[\s\S]{0,80}src=\{ogImagePath\}/);

  // Lockstep 1200x630 OG image dimensions
  assert.match(src, /<meta key="og-image-width" property="og:image:width" content="1200" \/>/);
  assert.match(src, /<meta key="og-image-height" property="og:image:height" content="630" \/>/);

  // Case-insensitive 'T' / lowercase rank parsing
  assert.match(src, /const rank = str\.slice\(0,\s*-1\)\.toUpperCase\(\)\.replace\(\/\^T\$\/,\s*'10'\);/);

  // Zero fabricated non-review defaults and clean heading without trailing space
  assert.doesNotMatch(src, /\+\$1,250/);
  assert.doesNotMatch(src, /Ah,Kh/);
  assert.doesNotMatch(src, /\$1\/\$3 NLH/);
  assert.doesNotMatch(src, /\$2,500/);
  assert.match(src, /Smarter\.Poker Hand Snapshot/);
  assert.match(src, /Shared A Hand/);
  assert.doesNotMatch(src, /'Played'\} \$\{amount \|\| ''\}/);

  // Whitelisted og:url query params (does not blindly pass resolvedQuery to URLSearchParams)
  assert.match(src, /const allowedShareKeys = isReview/);
  assert.doesNotMatch(src, /new URLSearchParams\(resolvedQuery\)/);

  // Clean 'Board' label/divider replacing inaccurate 'Vs'
  assert.doesNotMatch(src, />Vs<\/div>/);
  assert.match(src, /data-testid="share-board-label"[\s\S]{0,120}>Board<\/div>/);
});

test('4. pages/features/virtual-poker-sandbox.js ships honest copy and a touch-scrollable comparison table with normal word wrapping', () => {
  const src = read('pages/features/virtual-poker-sandbox.js');

  // Zero inaccurate 3D / WebGL / drag / 10,000-runout claims or em dashes
  assert.doesNotMatch(src, /WebGL/i);
  assert.doesNotMatch(src, /\b3D\b/);
  assert.doesNotMatch(src, /Custom 3D Table Configuration/i);
  assert.doesNotMatch(src, /Drag Cards To Assign Hands/i);
  assert.doesNotMatch(src, /10,000 Turn And River/i);
  assert.equal(src.includes('—'), false, 'virtual-poker-sandbox.js must contain zero em dashes');

  // Honest descriptions of verified Smarter.Poker tools
  assert.match(src, /Post-Session Hand Analysis/);
  assert.match(src, /Automated Leak Finder/);
  assert.match(src, /Audited Spot Study/);
  assert.match(src, /Poker Odds Calculator/);
  assert.match(src, /\/tools\/poker-odds-calculator/);
  assert.match(src, /\/hub\/personal-assistant\/leaks/);

  // Scrollable mobile comparison table with sensible column min-width, normal word wrapping, and 0px doc overflow
  assert.match(src, /overflow-x:\s*clip/);
  assert.doesNotMatch(src, /overflow-x:\s*hidden/);
  assert.match(src, /overflow-x:\s*auto/);
  assert.match(src, /-webkit-overflow-scrolling:\s*touch/);
  assert.match(src, /\.virtual-sandbox-lander table\s*\{[\s\S]*min-width:\s*640px/);
  assert.match(src, /\.virtual-sandbox-lander th,\s*\.virtual-sandbox-lander td\s*\{[\s\S]*min-width:\s*140px[\s\S]*word-break:\s*normal/);
});

test('5. src/lib/seo/markdownIngestion.mjs publishes honest Virtual Poker Study Lab markdown pointing to Leak Finder and Poker Odds Calculator', async () => {
  const { renderVirtualSandboxMarkdown } = await import('../src/lib/seo/markdownIngestion.mjs');
  const md = renderVirtualSandboxMarkdown();

  assert.doesNotMatch(md, /Responsive 3D Rendering/i);
  assert.doesNotMatch(md, /\b3D\b/);
  assert.doesNotMatch(md, /WebGL/i);
  assert.doesNotMatch(md, /\/hub\/personal-assistant\/sandbox/);
  assert.doesNotMatch(md, /\/hub\/sandbox\b/);
  assert.equal(md.includes('—'), false, 'renderVirtualSandboxMarkdown must contain zero em dashes');

  assert.match(md, /https:\/\/smarter\.poker\/hub\/personal-assistant\/leaks/);
  assert.match(md, /https:\/\/smarter\.poker\/tools\/poker-odds-calculator/);
  assert.match(md, /Post-Session Hand Analysis/);
  assert.match(md, /Automated Leak Finder/);
  assert.match(md, /Audited Spot Study/);
  assert.match(md, /Poker Odds Calculator/);

  // Directory entry in markdownIngestion.mjs also avoids stale 3D / runout claims
  const raw = read('src/lib/seo/markdownIngestion.mjs');
  assert.doesNotMatch(raw, /https:\/\/smarter\.poker\/hub\/personal-assistant\/sandbox/);
  assert.doesNotMatch(raw, /Responsive 3D Rendering/);
});

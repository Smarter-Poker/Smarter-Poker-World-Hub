/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  FORENSIC HARDENING CI FORTRESS (2026-11-27)
 * ═══════════════════════════════════════════════════════════════════════════
 * Permanent regression locks for every bug, gap, hydration crash, redirect
 * hole, banned color leak, dead link, and wiring mismatch found and fixed
 * during the full-site forensic audit:
 *   1. Deterministic SSR hydration on /hub/tournaments/this-weekend (no #425/#418)
 *   2. Wildcard :slug* 308 redirects for all 10 removed YouTube video IDs
 *   3. Zero /login? redirect hops & free signup path in /hub/bankroll-manager
 *   4. 100% SmarterAccountUnlockGate coverage on lobby, tours, home-games, about
 *   5. Zero banned gold hexes in poker-near-me/lobby.js and poker-series.js
 *   6. Zero dead href="#" anchors in pages/hub/venues/[id].js
 *   7. 100% variant-key parity between SmarterAccountUnlockGate & SmarterUnlockedWelcomeBanner
 *   8. Repo-wide valid variant= and vertical= prop enforcement across all pages & components
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BANKROLL_MANAGER_PAGE, bankrollManagerSource } from './helpers/bankroll-manager-source.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// The page reads as itself plus its section modules (the 2026-11-28 split;
// __tests__/helpers/bankroll-manager-source.mjs).
const read = (rel) => (rel === BANKROLL_MANAGER_PAGE ? bankrollManagerSource() : fs.readFileSync(path.join(ROOT, rel), 'utf8'));

function walkCode(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.next' || e.name === '.git') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walkCode(full, out);
    else if (/\.(jsx?|tsx?)$/.test(e.name)) out.push(full);
  }
  return out;
}

test('FORENSIC LAW 1 — /hub/tournaments/this-weekend hydrates deterministically without render-time new Date().toISOString()', () => {
  const src = read('pages/hub/tournaments/this-weekend.js');
  assert.match(src, /export async function getServerSideProps\s*\(/, 'this-weekend.js must export getServerSideProps for fresh deterministic weekendInfo');
  assert.match(src, /initialWeekendInfo:\s*getWeekendDates\(/, 'getServerSideProps must supply initialWeekendInfo');
  assert.doesNotMatch(src, /new Date\(\)\.toISOString\(\)/, 'this-weekend.js must never call new Date().toISOString() inside render');
  assert.match(src, /`\$\{weekendInfo\.friday\}T00:00:00Z`/, 'JSON-LD dateModified must be anchored to deterministic weekendInfo.friday');
});

test('FORENSIC LAW 2 — All 10 removed YouTube video IDs have permanent :slug* wildcard redirects in next.config.js', () => {
  const cfg = read('next.config.js');
  const expectedWildcards = [
    ['gy5wNpDc_f4', '/learn/best-poker-players'],
    ['gW_J_uIbE20', '/hub/video-library'],
    ['xxM8Q76ddHI', '/hub/video-library'],
    ['u_Yk0kC_4c4', '/hub/video-library'],
    ['IGYA_OwBpYY', '/poker-rooms/first-time-guide'],
    ['JVVD7d59zuE', '/hub/video-library'],
    ['Qz2tz1JkvfI', '/hub/video-library'],
    ['7X5iF4ERDcE', '/hub/video-library'],
    ['bWtzp1aDAUk', '/hub/video-library'],
    ['xjqzhy4XgkU', '/hub/video-library'],
  ];
  for (const [id, dest] of expectedWildcards) {
    const re = new RegExp(
      `source:\\s*'\\/hub\\/video-library\\/watch\\/${id}\\/:slug\\*'[\\s\\S]{0,120}destination:\\s*'${dest.replace(/\//g, '\\/')}'[\\s\\S]{0,60}permanent:\\s*true`,
    );
    assert.match(cfg, re, `Missing wildcard :slug* permanent redirect for removed video ID ${id} -> ${dest}`);
  }
});

test('FORENSIC LAW 3 — /hub/bankroll-manager has zero /login? redirect hops and visibly renders Create Free Account + SmarterAccountUnlockGate outside helpContent', () => {
  const src = read('pages/hub/bankroll-manager.js');
  assert.doesNotMatch(src, /['"]\/login\?/, 'bankroll-manager.js must route directly to /auth/login, never legacy /login?');
  assert.match(src, /\/auth\/login\?redirect=\/hub\/bankroll-manager/);
  assert.match(src, /openQuickSignup\(/, 'bankroll-manager sign-in modal must offer 1-click Create Free Account');
  assert.match(src, /<SmarterAccountUnlockGate\b/, 'bankroll-manager.js must mount SmarterAccountUnlockGate for guests');
  const helpBlock = src.match(/helpContent=\{[\s\S]*?\}\s*>/)?.[0] || '';
  assert.doesNotMatch(
    helpBlock,
    /<SmarterAccountUnlockGate\b/,
    'SmarterAccountUnlockGate must be rendered in the visible page body, never buried inside the collapsed helpContent popover',
  );
});

test('FORENSIC LAW 4 — Public hub lobby, tour details, home-games, and /about all mount #SMARTERDESIGN conversion funnels', () => {
  for (const rel of [
    'pages/hub/poker-near-me/lobby.js',
    'pages/hub/tours/[code].js',
    'pages/hub/home-games.js',
    'pages/about.js',
  ]) {
    const src = read(rel);
    assert.match(src, /import SmarterAccountUnlockGate\b/, `${rel} must import SmarterAccountUnlockGate`);
    assert.match(src, /<SmarterAccountUnlockGate\b/, `${rel} must render SmarterAccountUnlockGate`);
  }
  const aboutSrc = read('pages/about.js');
  assert.match(aboutSrc, /<SmarterConversionCta\b/, 'pages/about.js must render #SMARTERDESIGN SmarterConversionCta');
  assert.doesNotMatch(aboutSrc, /borderRadius:\s*12/, 'pages/about.js must not regress to legacy rounded inline CTA card');
});

test('FORENSIC LAW 5 — Zero banned gold hexes in poker-near-me/lobby.js and poker-series.js', () => {
  const BANNED_GOLD = /#(f59e0b|eab308|fbbf24|d97706|ffd700|facc15)\b/i;
  for (const rel of ['pages/hub/poker-near-me/lobby.js', 'pages/hub/poker-series.js']) {
    const src = read(rel);
    assert.doesNotMatch(src, BANNED_GOLD, `${rel} must not contain banned gold hexes`);
  }
});

test('FORENSIC LAW 6 — Zero dead href="#" anchors in pages/hub/venues/[id].js', () => {
  const src = read('pages/hub/venues/[id].js');
  assert.doesNotMatch(src, /href=["']#["']/, 'pages/hub/venues/[id].js must use semantic buttons instead of dead href="#" anchors');
});

test('FORENSIC LAW 7 — Every SmarterAccountUnlockGate variant has tailored post-signup activation copy in SmarterUnlockedWelcomeBanner', () => {
  const gateSrc = read('src/components/seo/SmarterAccountUnlockGate.jsx');
  const welcomeSrc = read('src/components/seo/SmarterUnlockedWelcomeBanner.jsx');
  const variants = [...gateSrc.matchAll(/^\s{2}'?([a-z0-9-]+)'?:\s*\{/gm)].map((m) => m[1]);
  assert.ok(variants.length >= 7, `Expected at least 7 unlock gate variants, got ${variants.length}`);
  for (const variant of variants) {
    assert.ok(
      welcomeSrc.includes(`'${variant}':`),
      `SmarterUnlockedWelcomeBanner UNLOCK_COPY_MAP is missing tailored activation copy for variant "${variant}"`,
    );
  }
});

test('FORENSIC LAW 8 — Every SmarterAccountUnlockGate variant="..." and SmarterSeoMasthead vertical="..." repo-wide is a valid defined key', () => {
  const gateSrc = read('src/components/seo/SmarterAccountUnlockGate.jsx');
  const mastheadSrc = read('src/components/seo/SmarterSeoMasthead.jsx');
  const validVariants = new Set([...gateSrc.matchAll(/^\s{2}'?([a-z0-9-]+)'?:\s*\{/gm)].map((m) => m[1]));
  const validVerticals = new Set([...mastheadSrc.matchAll(/^\s{2}'?([a-z0-9-]+)'?:\s*\{/gm)].map((m) => m[1]));

  const offenders = [];
  for (const file of [...walkCode(path.join(ROOT, 'pages')), ...walkCode(path.join(ROOT, 'src/components'))]) {
    const rel = path.relative(ROOT, file);
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(/<SmarterAccountUnlockGate[\s\S]*?variant="([^"]+)"/g)) {
      if (!validVariants.has(m[1])) offenders.push(`${rel}: invalid SmarterAccountUnlockGate variant="${m[1]}"`);
    }
    for (const m of src.matchAll(/<SmarterSeoMasthead[\s\S]*?vertical="([^"]+)"/g)) {
      if (!validVerticals.has(m[1])) offenders.push(`${rel}: invalid SmarterSeoMasthead vertical="${m[1]}"`);
    }
  }
  assert.deepEqual(offenders, [], `Invalid SEO component prop values detected:\n  ${offenders.join('\n  ')}`);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');

function read(relPath) {
  return fs.readFileSync(path.join(REPO, relPath), 'utf8');
}

test('all 6 dead clicked video URLs from GSC rows 51-105 permanently redirect in next.config.js', () => {
  const cfg = read('next.config.js');
  const ids = [
    'IGYA_OwBpYY',
    'JVVD7d59zuE',
    'Qz2tz1JkvfI',
    '7X5iF4ERDcE',
    'bWtzp1aDAUk',
    'xjqzhy4XgkU',
  ];
  for (const id of ids) {
    assert.ok(
      cfg.includes(`/hub/video-library/watch/${id}`),
      `next.config.js must permanently redirect dead clicked video ID ${id}`,
    );
  }
});

test('GuestConversionBar avoids UniversalHeader overlap and compacts mobile layout', () => {
  const src = read('src/components/seo/GuestConversionBar.jsx');
  assert.ok(src.includes('STATIC_HEADER_PREFIXES'), 'GuestConversionBar must declare STATIC_HEADER_PREFIXES');
  assert.ok(src.includes('.approved-global-header'), 'GuestConversionBar must dynamically detect .approved-global-header');
  assert.ok(src.includes('env(safe-area-inset-top, 0px)'), 'GuestConversionBar must preserve safe-area-inset-top');
  assert.ok(src.includes('.sd-guest-bar--below-header'), 'GuestConversionBar must offset below UniversalHeader');
  assert.ok(src.includes('.sd-guest-bar__brand'), 'GuestConversionBar must style compact brand label');
  assert.ok(src.includes('@media (max-width: 640px)'), 'GuestConversionBar must define compact mobile media query');
});

test('AiPromptLauncher and CalculatorShareAndPresets contain zero banned #f2b84b gold', () => {
  for (const rel of [
    'src/components/seo/AiPromptLauncher.js',
    'src/components/tools/CalculatorShareAndPresets.js',
  ]) {
    const src = read(rel);
    assert.ok(!/#f2b84b/i.test(src), `${rel} must not contain banned gold #f2b84b`);
    assert.ok(!/rgba\(\s*242\s*,\s*184\s*,\s*75/i.test(src), `${rel} must not contain banned gold rgba(242,184,75)`);
  }
});

test('starting hand pages wrap tables in overflowX auto to eliminate 90px mobile overflow', () => {
  const src = read('pages/learn/hands/[hand].js');
  const matches = src.match(/overflowX:\s*['"]auto['"]/g) || [];
  assert.ok(matches.length >= 2, 'pages/learn/hands/[hand].js must wrap both data tables in overflowX auto');
});

test('preflop-ranges index uses 6-column responsive grid so SB tab never clips on 390px mobile', () => {
  const src = read('src/components/seo/PreflopRangeMatrixHub.jsx');
  assert.ok(
    src.includes("repeat(6, minmax(0, 1fr))"),
    'src/components/seo/PreflopRangeMatrixHub.jsx must use repeat(6, minmax(0, 1fr)) for position tabs',
  );
});

test('qre-explorer and quiz-builder render semantic h1, wrap cleanly, and guard guest fetches', () => {
  const qre = read('pages/hub/training/qre-explorer.js');
  assert.ok(/<h1[\s>]/.test(qre), 'qre-explorer.js must render an <h1>');
  assert.ok(qre.includes("flexWrap: 'wrap'"), 'qre-explorer.js Decision Spot tabs must wrap');
  assert.ok(!qre.includes('--sp-accent-purple'), 'qre-explorer.js must not use banned purple accent');

  const quiz = read('pages/hub/training/quiz-builder.js');
  assert.ok(/<h1[\s>]/.test(quiz), 'quiz-builder.js must render an <h1>');
  assert.ok(
    quiz.includes('!getAuthUser()?.id'),
    'quiz-builder.js must guard /api/training/tool-records against unauthenticated 401 fetches',
  );
});

test('video watch pages, HubPageSummary, TrainingGameEntry, and about page include signup funnels', () => {
  const watch = read('pages/hub/video-library/watch/[videoId]/[[...slug]].js');
  assert.ok(watch.includes('SmarterConversionCta'), 'video watch page must render SmarterConversionCta');

  const summary = read('src/components/seo/HubPageSummary.js');
  assert.ok(summary.includes('SmarterConversionCta'), 'HubPageSummary must render SmarterConversionCta');

  const entry = read('src/components/training/TrainingGameEntry.jsx');
  assert.ok(entry.includes('SmarterConversionCta'), 'TrainingGameEntry must render SmarterConversionCta');

  const about = read('pages/about.js');
  assert.ok(about.includes('/auth/signup?redirect=/hub&src=about'), 'pages/about.js must include signup funnel CTA');
});

test('venues and series detail pages contain zero banned purple, pink, or gold accents', () => {
  const venues = read('pages/hub/venues/[id].js');
  assert.ok(!/#8b5cf6/i.test(venues), 'venues/[id].js must not contain banned purple #8b5cf6');
  assert.ok(!/#ec4899/i.test(venues), 'venues/[id].js must not contain banned pink #ec4899');
  assert.ok(!/#d4a853/i.test(venues), 'venues/[id].js must not contain banned gold #d4a853');

  const series = read('pages/hub/series/[id].js');
  assert.ok(!series.includes('stat-value gold'), 'series/[id].js must not render stat-value gold');
  assert.ok(!/#d4a853/i.test(series), 'series/[id].js must not contain banned gold #d4a853');
});

test('desktop homepage hero hydrates immediately when img is already complete (no blank opacity:0 box)', () => {
  const idx = read('pages/index.js');
  assert.ok(idx.includes('heroImgRef.current?.complete'), 'pages/index.js must check heroImgRef.current?.complete on mount');
  assert.ok(idx.includes('overlayImgRef.current?.complete'), 'pages/index.js must check overlayImgRef.current?.complete');
  assert.ok(idx.includes('onError={() => setHeroLoaded(true)}'), 'pages/index.js must fail open on hero image error');
});

test('swarm live QA hardening: /compare/[slug] no blank top strip, PeakHoursHeatmap zero gold, valid venue trophy SVG, zero qre purple tint, VIP plan CTA', () => {
  const bar = read('src/components/seo/GuestConversionBar.jsx');
  assert.ok(bar.includes('STATIC_HEADER_EXACT'), 'GuestConversionBar must isolate exact /compare routes from /compare/[slug]');
  const prefixBlock = bar.slice(bar.indexOf('const STATIC_HEADER_PREFIXES'), bar.indexOf('const STATIC_HEADER_EXACT'));
  assert.ok(!prefixBlock.includes("'/compare'"), 'STATIC_HEADER_PREFIXES must not include /compare prefix');

  const heatmap = read('src/components/poker/PeakHoursHeatmap.js');
  assert.ok(!/#ffd700/i.test(heatmap), 'PeakHoursHeatmap must not contain banned gold #FFD700');
  assert.ok(!/rgba\(\s*255\s*,\s*215\s*,\s*0/i.test(heatmap), 'PeakHoursHeatmap must not contain banned gold rgba(255,215,0)');

  const venues = read('pages/hub/venues/[id].js');
  assert.ok(!venues.includes('0-5C7 4 7 7 7"'), 'venues/[id].js must not contain truncated 5-arg SVG cubic path');

  const qre = read('pages/hub/training/qre-explorer.js');
  assert.ok(!/167\s*,\s*139\s*,\s*250/.test(qre), 'qre-explorer.js must not contain banned purple rgba(167,139,250)');

  const vipPlan = read('pages/hub/vip-membership/[plan].js');
  assert.ok(vipPlan.includes('SmarterConversionCta'), 'vip-membership/[plan].js must render SmarterConversionCta');
});

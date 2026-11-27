import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const REPO = process.cwd();
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');

function walk(dir, out = []) {
  const full = path.join(REPO, dir);
  if (!fs.existsSync(full)) return out;
  for (const entry of fs.readdirSync(full, { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(rel, out);
    else if (/\.(js|jsx)$/.test(entry.name)) out.push(rel);
  }
  return out;
}

const MASTHEAD_FLAGSHIP_PAGES = [
  'pages/tools/index.js',
  'pages/learn/index.js',
  'pages/poker-rooms/index.js',
  'pages/research/index.js',
  'pages/compare/index.js',
  'pages/games/index.js',
  'pages/rules/index.js',
  'pages/glossary/index.js',
  'pages/authors/index.js',
  'pages/features/index.js',
  'pages/poker-series/guides/index.js',
  'pages/facts.js',
  'pages/freerolls.js',
  'pages/press.js',
  'pages/sitemap.js',
  'pages/verification-methodology.js',
];

const PHASE2_UNLOCK_GATE_PAGES = [
  'pages/search.js',
  'pages/sitemap.js',
  'pages/verification-methodology.js',
  'pages/features/index.js',
  'pages/hub/article.js',
  'pages/hub/daily-tournaments.js',
  'pages/hub/events-calendar.js',
  'pages/hub/news.js',
  'pages/hub/poker-series.js',
  'pages/hub/poker-tours.js',
  'pages/hub/memory-games.js',
  'pages/hub/vip-membership/compare.js',
  'pages/hub/training/range-builder.js',
  'pages/hub/training/preflop-charts.js',
  'pages/hub/training/qre-explorer.js',
  'pages/hub/training/quiz-builder.js',
  'pages/hub/training/skill-tree.js',
];

const ZERO_GOLD_PHASE2_FILES = [
  'src/components/poker/VenueReviews.js',
  'pages/hub/daily-tournaments.js',
  'pages/hub/news.js',
  'pages/hub/poker-series.js',
  'pages/hub/poker-tours.js',
];

const BANNED_GOLD_RE = /#(d4a853|d4af37|f59e0b|fbbf24|c9a227|b8860b)/gi;

test('PHASE2 LAW 1: SmarterSeoMasthead is wired into all 16 flagship SEO pillar pages and every 3D art asset exists on disk', () => {
  for (const rel of MASTHEAD_FLAGSHIP_PAGES) {
    const src = read(rel);
    assert.match(src, /import\s+SmarterSeoMasthead\s+from/, `${rel} must import SmarterSeoMasthead`);
    assert.match(src, /<SmarterSeoMasthead\b/, `${rel} must render <SmarterSeoMasthead />`);
  }

  const mastheadSrc = read('src/components/seo/SmarterSeoMasthead.jsx');
  const kitCss = read('src/components/seo/SmarterSeoKit.module.css');
  const assetPaths = [
    ...new Set([...`${mastheadSrc}\n${kitCss}`.matchAll(/\/images\/[a-zA-Z0-9_./-]+\.(?:webp|png)/g)].map((m) => m[0])),
  ];
  assert.ok(assetPaths.length >= 20, 'SmarterSeoMasthead and SmarterSeoKit must reference approved 3D artwork assets');
  for (const webPath of assetPaths) {
    const diskPath = path.join(REPO, 'public', webPath);
    assert.ok(fs.existsSync(diskPath), `Referenced #SMARTERDESIGN asset missing on disk: public${webPath}`);
  }
});

test('PHASE2 LAW 2: Shared SEO/landing components and upgraded index pages have zero rounded SaaS card radii', () => {
  for (const rel of [
    'src/components/seo/PreflopReference.js',
    'src/components/seo/PublicFeedListing.js',
    'src/components/landing/LandingProductSummary.js',
    'pages/features/index.js',
    'pages/sitemap.js',
  ]) {
    const src = read(rel);
    assert.doesNotMatch(
      src,
      /borderRadius:\s*(?:10|12|14|16|20)\b/,
      `${rel} must use sharp #SMARTERDESIGN 0px silhouettes instead of rounded SaaS cards`,
    );
  }
});

test('PHASE2 LAW 3: Mobile horizontal overflow root causes are permanently eliminated across SEO pages and SmarterSeoKit', () => {
  // 1. No bare minmax(330px..999px, 1fr) without min(..., 100%) in SEO directories
  const seoFiles = [
    ...walk('pages/learn'),
    ...walk('pages/poker-rooms'),
    ...walk('pages/games'),
    ...walk('pages/rules'),
    ...walk('pages/compare'),
    ...walk('pages/authors'),
    ...walk('pages/research'),
    ...walk('pages/features'),
    'pages/press.js',
    'pages/sitemap.js',
  ];
  const bareWideGridRe = /minmax\(\s*(?:3[3-9]\d|[4-9]\d\d)px\s*,\s*1fr\s*\)/;
  for (const rel of seoFiles) {
    const src = read(rel);
    assert.doesNotMatch(
      src,
      bareWideGridRe,
      `${rel} uses a bare minmax(>=330px, 1fr) track that overflows 360px-390px mobile viewports; wrap with min(NNNpx, 100%)`,
    );
  }

  // 2. /press grid cards & code blocks must clamp minWidth: 0 so <pre> never stretches grid tracks
  const pressSrc = read('pages/press.js');
  assert.match(pressSrc, /snippetCard:\s*\{[\s\S]*?minWidth:\s*0/, 'pages/press.js snippetCard must set minWidth: 0');
  assert.match(pressSrc, /codeBlock:\s*\{[\s\S]*?maxWidth:\s*['"]100%['"]/, 'pages/press.js codeBlock must clamp maxWidth: 100%');
  assert.match(pressSrc, /tdBenchmark:\s*\{[\s\S]*?overflowWrap:\s*['"]anywhere['"]/, 'pages/press.js tdBenchmark must wrap long DOIs/SWHIDs');

  // 3. /research and /verification-methodology SWHID <code> tags must break cleanly on mobile
  for (const rel of ['pages/research/index.js', 'pages/verification-methodology.js']) {
    const src = read(rel);
    assert.match(src, /overflowWrap:\s*['"]anywhere['"]/, `${rel} must apply overflowWrap: anywhere on SWHID <code> tags`);
    assert.doesNotMatch(src, /<code>\{'swh:1:snp:/, `${rel} must not render unstyled overflowing SWHID <code> tags`);
  }

  // 4. SmarterSeoKit.module.css unlock preview table must collapse columns 4+ on mobile <= 560px
  const kitCss = read('src/components/seo/SmarterSeoKit.module.css');
  assert.match(kitCss, /table-layout:\s*fixed/, 'SmarterSeoKit .unlockPreviewTable must use table-layout: fixed');
  assert.match(
    kitCss,
    /@media\s*\(max-width:\s*560px\)[\s\S]*?\.unlockPreviewTable\s+th:nth-child\(n\+4\)/,
    'SmarterSeoKit.module.css must hide columns 4+ on <= 560px mobile to prevent clipping and horizontal overflow',
  );
  assert.match(kitCss, /scroll-margin-bottom:\s*180px/, '.unlockBay must reserve scroll-margin-bottom clearance above the floating wire bar');
});

test('PHASE2 LAW 4: VenueReviews and public hub discovery pages contain zero banned gold hex leaks', () => {
  for (const rel of ZERO_GOLD_PHASE2_FILES) {
    const src = read(rel);
    const matches = src.match(BANNED_GOLD_RE);
    assert.equal(
      matches,
      null,
      `${rel} still contains banned gold hex(es): ${matches ? [...new Set(matches)].join(', ') : ''}`,
    );
  }
});

test('PHASE2 LAW 5: All remaining public hub discovery, search, sitemap, methodology, and training SEO pages render SmarterAccountUnlockGate', () => {
  for (const rel of PHASE2_UNLOCK_GATE_PAGES) {
    const src = read(rel);
    assert.match(src, /import\s+SmarterAccountUnlockGate\s+from/, `${rel} must import SmarterAccountUnlockGate`);
    assert.match(src, /<SmarterAccountUnlockGate\b/, `${rel} must mount <SmarterAccountUnlockGate />`);
  }
});

test('PHASE2 LAW 6: Quick-Signup Sheet coordinates with Weekly Wire bar, forwards OAuth unlock params, and signup.js renders contextual unlock banners on both desktop and mobile', () => {
  const sheetSrc = read('src/components/seo/SmarterQuickSignupSheet.jsx');
  assert.match(sheetSrc, /QUICK_SIGNUP_STATE_EVENT\s*=\s*['"]sp:quick-signup-state['"]/);
  assert.match(sheetSrc, /cbParams\.set\(['"]unlock['"]/);
  assert.match(sheetSrc, /cbParams\.set\(['"]src['"]/);

  const wireSrc = read('src/components/news/NewsletterCaptureBar.js');
  assert.match(wireSrc, /sp:quick-signup-state/, 'NewsletterCaptureBar must listen to sp:quick-signup-state');
  assert.match(wireSrc, /quickSignupOpen/, 'NewsletterCaptureBar must yield while SmarterQuickSignupSheet is open');

  const signupSrc = read('pages/auth/signup.js');
  assert.match(signupSrc, /function\s+formatUnlockPromise\s*\(/, 'pages/auth/signup.js must decode ?unlock= keys into human-readable unlock promises');
  assert.match(signupSrc, /data-testid="signup-unlock-context-desktop"/, 'pages/auth/signup.js must display unlock banner on desktop');
  assert.match(signupSrc, /data-testid="signup-unlock-context"/, 'pages/auth/signup.js must display unlock banner on mobile');
});

test('PHASE2 LAW 7: IndexNow verification key file exists in public/ and matches its exact key', () => {
  const key = 'ebee30927d6f8e9d19a8deb450a4359e';
  const keyPath = path.join(REPO, 'public', `${key}.txt`);
  assert.ok(fs.existsSync(keyPath), `IndexNow key file public/${key}.txt must exist`);
  assert.equal(fs.readFileSync(keyPath, 'utf8').trim(), key, 'IndexNow key file content must exactly match its filename key');
});

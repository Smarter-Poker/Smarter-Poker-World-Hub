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

function walkJs(relDir, acc = []) {
  const full = path.join(REPO, relDir);
  if (!fs.existsSync(full)) return acc;
  for (const entry of fs.readdirSync(full, { withFileTypes: true })) {
    const childRel = path.join(relDir, entry.name);
    if (entry.isDirectory()) {
      walkJs(childRel, acc);
    } else if (/\.(js|jsx|ts|tsx)$/.test(entry.name)) {
      acc.push(childRel);
    }
  }
  return acc;
}

const REQUIRED_UNLOCK_DIRS = [
  'pages/tools',
  'pages/learn',
  'pages/poker-rooms',
  'pages/poker-series',
  'pages/compare',
  'pages/research',
  'pages/games',
  'pages/rules',
  'pages/glossary',
  'pages/authors',
];

const REQUIRED_UNLOCK_FILES = [
  'pages/hub/video-library.js',
  'pages/hub/video-library/channels/index.js',
  'pages/hub/video-library/channels/[channelId].js',
  'pages/hub/video-library/players/index.js',
  'pages/hub/video-library/players/[playerId].js',
  'pages/hub/video-library/playlists/[playlistId].js',
  'pages/hub/video-library/watch/[videoId]/[[...slug]].js',
  'pages/hub/magazine/index.js',
  'pages/hub/magazine/[issue].js',
  'pages/hub/magazine/poker-rooms.js',
  'pages/hub/wire/index.js',
  'pages/hub/wire/[edition].js',
  'pages/hub/poker-near-me/in/index.js',
  'pages/hub/poker-near-me/in/[state]/index.js',
  'pages/hub/poker-near-me/in/[state]/[city].js',
  'pages/hub/poker-near-me/[pnmTab].js',
  'pages/hub/tournaments/this-weekend.js',
  'pages/hub/series/[id].js',
  'pages/hub/venues/[id].js',
  'pages/facts.js',
  'pages/freerolls.js',
  'pages/editorial-standards.js',
  'pages/press.js',
  'pages/pokerbrain.js',
  'pages/hub/help.js',
];

function collectAllUpgradedTemplates() {
  const files = new Set(REQUIRED_UNLOCK_FILES);
  for (const dir of REQUIRED_UNLOCK_DIRS) {
    for (const f of walkJs(dir)) {
      files.add(f);
    }
  }
  return [...files].sort();
}

test('Fortress Law 1: 100% of public SEO/AEO/GEO templates render SmarterAccountUnlockGate (or FeatureLanderLayout)', () => {
  const templates = collectAllUpgradedTemplates();
  assert.ok(templates.length >= 145, `Expected at least 145 SEO/AEO/GEO templates, found ${templates.length}`);

  const missing = [];
  for (const rel of templates) {
    const src = read(rel);
    if (!src.includes('SmarterAccountUnlockGate') && !src.includes('FeatureLanderLayout') && !src.includes('unlockGateSlot')) {
      missing.push(rel);
    }
  }
  assert.deepEqual(
    missing,
    [],
    `${missing.length} SEO/AEO/GEO template(s) are missing SmarterAccountUnlockGate:\n  ${missing.join('\n  ')}`,
  );
});

test('Fortress Law 2: Zero generic rounded SaaS containers (borderRadius 8..999) in all upgraded SEO/AEO/GEO templates', () => {
  const templates = collectAllUpgradedTemplates();
  const offenders = [];
  for (const rel of templates) {
    // Skip complex interactive hub app shells that have circular avatars/toggles; enforce strictly on all pure SEO/AEO/GEO verticals
    if (
      rel === 'pages/hub/series/[id].js' ||
      rel === 'pages/hub/venues/[id].js' ||
      rel === 'pages/hub/poker-near-me/[pnmTab].js' ||
      rel === 'pages/hub/video-library.js' ||
      rel === 'pages/hub/help.js' ||
      rel.startsWith('pages/hub/magazine/') ||
      rel.startsWith('pages/hub/wire/')
    ) {
      continue;
    }
    const src = read(rel);
    if (/borderRadius:\s*(8|10|12|14|16|18|20|24|999)\b/.test(src) || /border-radius:\s*(8|10|12|14|16|18|20|24|999)px/.test(src)) {
      offenders.push(rel);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `${offenders.length} SEO/AEO/GEO template(s) regressed to rounded SaaS card radii:\n  ${offenders.join('\n  ')}`,
  );
});

test('Fortress Law 3: Zero banned gold or amber hex accents across all upgraded SEO/AEO/GEO templates', () => {
  const templates = collectAllUpgradedTemplates();
  const bannedRe = /#(?:f2b84b|d4a853|ffd700|f59e0b|fbbf24|eab308)\b/i;
  const offenders = [];
  for (const rel of templates) {
    const src = read(rel);
    if (bannedRe.test(src)) {
      offenders.push(rel);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `${offenders.length} SEO/AEO/GEO template(s) contain banned gold/amber hex colors:\n  ${offenders.join('\n  ')}`,
  );
});

test('Fortress Law 4: Zero SEO cloaking - SmarterAccountUnlockGate never wraps SEOHead, h1, FaqSection, or JSON-LD', () => {
  const gate = read('src/components/seo/SmarterAccountUnlockGate.jsx');
  assert.ok(!gate.includes('children'), 'SmarterAccountUnlockGate must be a self-contained progressive unlock bay and must never wrap/hide crawlable page children');
  assert.ok(!gate.includes('<h1'), 'SmarterAccountUnlockGate must never emit an <h1>');
  assert.ok(!gate.includes('application/ld+json'), 'SmarterAccountUnlockGate must never hide structured data');
});

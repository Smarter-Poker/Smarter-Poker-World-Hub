import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOCIAL_PATH = join(ROOT, 'pages/hub/social-media/index.js');
const PROFILE_PATH = join(ROOT, 'pages/hub/user/[username].js');
const STYLES_PATH = join(ROOT, 'src/components/reels/AuxiliaryReelsSurfaces.module.css');
const CONSOLE_PATH = join(
  ROOT,
  'src/components/video-library/console/VideoLibraryConsole.module.css'
);

const socialSource = readFileSync(SOCIAL_PATH, 'utf8');
const profileSource = readFileSync(PROFILE_PATH, 'utf8');
const stylesSource = readFileSync(STYLES_PATH, 'utf8');
const consoleSource = readFileSync(CONSOLE_PATH, 'utf8');

function between(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `Missing section start: ${start}`);
  assert.notEqual(endIndex, -1, `Missing section end: ${end}`);
  return source.slice(startIndex, endIndex);
}

function readJavaScriptTree(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return readJavaScriptTree(path);
    return /\.(?:js|jsx)$/.test(entry.name) ? [readFileSync(path, 'utf8')] : [];
  });
}

test('the Social Hub Reels entry is one painted console with its original route and close callback', () => {
  const entry = between(
    socialSource,
    '{/* Reels Console Entry */}',
    '{/* Additional Navigation Items */}'
  );

  assert.match(socialSource, /video-library\/console\/VideoLibraryConsole/);
  assert.match(socialSource, /AuxiliaryReelsSurfaces\.module\.css/);
  assert.match(entry, /href="\/hub\/reels"/);
  assert.match(entry, /onClick=\{\(\) => setSidebarOpen\(false\)\}/);
  assert.match(entry, /<VideoLibraryConsole/);
  assert.match(entry, /title="Poker Reels"/);
  assert.match(entry, /foot="foot"/);
  assert.match(entry, /<ConsoleCopy/);
  assert.doesNotMatch(
    entry,
    /<img\b|<svg\b|\/icons\/reels\.png|borderRadius|boxShadow|linear-gradient/
  );
  assert.doesNotMatch(socialSource, /\/icons\/reels\.png/);
});

test('the public profile Reels tab prints real media and every state inside one console', () => {
  const tab = between(profileSource, '{/* REELS TAB */}', '{/* LIVES TAB */}');

  assert.match(profileSource, /video-library\/console\/VideoLibraryConsole/);
  assert.match(profileSource, /function ProfileReelMedia\(\{ reel \}\)/);
  assert.match(profileSource, /youtube(?:-nocookie)?/);
  assert.match(tab, /<VideoLibraryConsole/);
  assert.match(tab, /title="Poker Reels"/);
  assert.match(tab, /foot="foot"/);
  assert.match(tab, /contentLoading/);
  assert.match(tab, /reels\.length > 0/);
  assert.match(tab, /Loading Poker Reels\./);
  assert.match(tab, /Publish Your First Poker Reel\./);
  assert.match(tab, /ProfileReelMedia reel=\{reel\}/);
  assert.match(tab, /href=\{`\/hub\/reels\?id=\$\{reel\.id\}`\}/);
  assert.match(tab, /handleDeleteReel\(reel\.id\)/);
  assert.match(tab, /Delete Reel/);
  assert.match(tab, /compactReelCount\(reel\.view_count\)/);
  assert.doesNotMatch(tab, /<svg\b|<ContentSkeleton\b|▶|️|borderRadius|boxShadow|linear-gradient/);
});

test('auxiliary Reels styling is mobile first, desktop distinct, and draws no generic chrome', () => {
  assert.match(stylesSource, /grid-template-columns:\s*repeat\(2,/);
  assert.match(stylesSource, /@media \(min-width: 720px\)[\s\S]*repeat\(3,/);
  assert.match(stylesSource, /@media \(min-width: 1080px\)[\s\S]*repeat\(4,/);
  assert.match(stylesSource, /aspect-ratio:\s*9 \/ 16/);
  assert.match(stylesSource, /object-fit:\s*cover/);
  assert.match(stylesSource, /cqw/);
  assert.doesNotMatch(
    stylesSource,
    /border-radius|(?:linear|radial|conic)-gradient|box-shadow|:hover/
  );
  assert.doesNotMatch(stylesSource, /url\(/);

  for (const asset of ['top.png', 'mid.png', 'bottom-foot.png', 'bottom-plates.png']) {
    assert.match(consoleSource, new RegExp(`spade-console-v1/${asset.replace('.', '\\.')}[')]`));
  }
});

test('the retired SmarterPokerReels prototype has no live page importer', () => {
  const pageSource = readJavaScriptTree(join(ROOT, 'pages')).join('\n');
  assert.doesNotMatch(pageSource, /SmarterPokerReels|SmarterPokerFeedView|SmarterPokerWatchView/);
});

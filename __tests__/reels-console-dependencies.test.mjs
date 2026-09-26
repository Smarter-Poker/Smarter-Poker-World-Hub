import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = relativePath => readFileSync(new URL(relativePath, import.meta.url), 'utf8');

const GIPHY_PICKER = read('../src/components/shared/GiphyPicker.jsx');
const GIPHY_STYLES = read('../src/components/shared/GiphyPicker.module.css');
const YOUTUBE_MANAGER = read('../src/hooks/useYouTubeErrorManager.js');
const YOUTUBE_STYLES = read('../src/hooks/YouTubeErrorOverlay.module.css');
const REEL_SURFACES = [
  read('../pages/hub/reels.js'),
  read('../src/components/social/Reels.jsx'),
  read('../src/components/social/ReelsFeedCarousel.jsx'),
];

function assertNoGenericChrome(source, name) {
  assert.doesNotMatch(source, /(?:linear|radial|conic)-gradient/i, `${name} must not draw gradients`);
  assert.doesNotMatch(source, /:hover\b/i, `${name} must not ship hover-only behavior`);
  assert.doesNotMatch(source, /onMouseEnter|onMouseLeave/, `${name} must not draw hover transforms inline`);
  assert.doesNotMatch(source, /<svg\b/i, `${name} must not use a generic SVG icon`);
  assert.doesNotMatch(source, /transition\s*:/i, `${name} must not use generic lift transitions`);
}

test('Reel GIF archive is an unframed black-glass command surface with real media', () => {
  assert.match(GIPHY_PICKER, /import styles from ['"]\.\/GiphyPicker\.module\.css['"]/);
  assert.match(GIPHY_PICKER, /aria-label="GIF And Sticker Archive"/);
  assert.match(GIPHY_PICKER, /role="tablist"/);
  assert.match(GIPHY_PICKER, /role="tab"/);
  assert.match(GIPHY_PICKER, /role="tabpanel"/);
  assert.match(GIPHY_PICKER, /aria-selected=/);
  assert.match(GIPHY_PICKER, /aria-controls=/);
  assert.match(GIPHY_PICKER, /className=\{styles\.media\}[\s\S]*src=\{gif\.preview \|\| gif\.url\}/);
  assert.match(GIPHY_PICKER, /onClick=\{\(\) => onSelect\?\.\(gif\.url\)\}/);
  assert.match(GIPHY_PICKER, /Loading \$\{tabLabel\}/);
  assert.match(GIPHY_PICKER, /GIF Service Is Unavailable/);
  assert.match(GIPHY_PICKER, /No \$\{tabLabel\} Found/);
  assert.match(GIPHY_PICKER, /actionLabel="Retry"/);
  assert.match(GIPHY_PICKER, /onPaste=\{handlePaste\}/);
  assert.match(GIPHY_PICKER, /onPaste\(imageFile\)/);
  assert.match(GIPHY_STYLES, /background-color:\s*rgb\(0 4 8 \/ 94%\)/);
  assert.match(GIPHY_STYLES, /font-family:\s*'Roboto Condensed'/);
  assert.match(GIPHY_STYLES, /\.media\s*\{[\s\S]*object-fit:\s*cover/);
  assert.match(GIPHY_STYLES, /\.mediaAction:focus-visible/);
  assertNoGenericChrome(`${GIPHY_PICKER}\n${GIPHY_STYLES}`, 'GiphyPicker');

  const radii = [...GIPHY_STYLES.matchAll(/border-radius:\s*([^;]+)/gi)]
    .map(match => match[1].replace(/!important/g, '').trim());
  assert.ok(radii.length > 0);
  assert.ok(radii.every(radius => radius === '0'));
});

test('GIF requests cannot repaint a newer search, tab, or unmounted picker', () => {
  assert.match(GIPHY_PICKER, /const requestSequenceRef = useRef\(0\)/);
  assert.match(GIPHY_PICKER, /requestSequence !== requestSequenceRef\.current/);
  assert.match(GIPHY_PICKER, /mountedRef\.current = false/);
  assert.match(GIPHY_PICKER, /clearTimeout\(searchTimerRef\.current\)/);
  assert.match(GIPHY_PICKER, /clearTimeout\(focusTimerRef\.current\)/);
  assert.match(GIPHY_PICKER, /loadingMoreRef\.current/);
  assert.match(GIPHY_PICKER, /if \(searchTimerRef\.current\) \{[\s\S]*setTab\(nextTab\)/);
});

test('YouTube failures render as accessible text-only black glass over real media', () => {
  assert.match(YOUTUBE_MANAGER, /import styles from ['"]\.\/YouTubeErrorOverlay\.module\.css['"]/);
  assert.match(YOUTUBE_MANAGER, /100:\s*\{ title: 'Video Removed'/);
  assert.match(YOUTUBE_MANAGER, /101:\s*\{ title: 'Embedding Disabled'/);
  assert.match(YOUTUBE_MANAGER, /150:\s*\{ title: 'Age-Restricted Video'/);
  assert.match(YOUTUBE_MANAGER, /title: 'Video Unavailable'/);
  assert.match(YOUTUBE_MANAGER, /className=\{styles\.thumbnail\}[\s\S]*src=\{thumbnailUrl\}/);
  assert.match(YOUTUBE_MANAGER, /className=\{styles\.scrim\}/);
  assert.match(YOUTUBE_MANAGER, /role="alert"/);
  assert.match(YOUTUBE_MANAGER, /aria-live="polite"/);
  assert.match(YOUTUBE_MANAGER, /aria-atomic="true"/);
  assert.match(YOUTUBE_MANAGER, /className=\{styles\.action\}/);
  assert.match(YOUTUBE_MANAGER, /aria-label=\{`Watch \$\{title\} On YouTube`\}/);
  assert.match(YOUTUBE_MANAGER, />\s*Watch On YouTube\s*</);
  assert.match(YOUTUBE_MANAGER, /className=\{styles\.countdown\}/);
  assert.match(YOUTUBE_MANAGER, /formatOverlayActionLabel\(actionLabel\)/);
  assert.match(YOUTUBE_STYLES, /background-color:\s*rgb\(0 4 8 \/ 94%\) !important/);
  assert.match(YOUTUBE_STYLES, /border-radius:\s*0 !important/);
  assert.match(YOUTUBE_STYLES, /background-image:\s*none !important/);
  assert.match(YOUTUBE_STYLES, /\.action:focus-visible/);
  assertNoGenericChrome(`${YOUTUBE_MANAGER}\n${YOUTUBE_STYLES}`, 'YouTubeErrorOverlay');
});

test('the compliant dependencies remain wired into every Reel viewer', () => {
  for (const surface of REEL_SURFACES) {
    assert.match(surface, /useYouTubeErrorManager/);
    assert.match(surface, /<YouTubeErrorOverlay/);
  }

  assert.match(REEL_SURFACES[0], /import GiphyPicker from ['"]\.\.\/\.\.\/src\/components\/shared\/GiphyPicker['"]/);
  assert.match(REEL_SURFACES[0], /<GiphyPicker/);
  for (const surface of REEL_SURFACES.slice(1)) {
    assert.match(surface, /import GiphyPicker from ['"]\.\.\/shared\/GiphyPicker['"]/);
    assert.match(surface, /<GiphyPicker/);
  }
});

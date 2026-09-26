import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL('../src/components/social/ReelsFeedCarousel.jsx', import.meta.url),
  'utf8'
);
const viewer = source.slice(
  source.indexOf('function ReelViewer('),
  source.indexOf('// Main Reels Feed Carousel component')
);

test('carousel and every viewer state use the master without generic decorative chrome', () => {
  assert.doesNotMatch(
    source,
    /<svg\b|(?:linear|radial|conic)-gradient|:hover\b|onMouseEnter|onMouseLeave/
  );
  assert.doesNotMatch(
    source,
    /borderRadius\s*:|(?:default-avatar|placeholder\.(?:png|jpg|svg))|\\u\{1F/
  );
  assert.doesNotMatch(source, /[\u{1F300}-\u{1FAFF}]/u);
  for (const match of source.matchAll(/border-radius:\s*([^;]+)/g)) {
    assert.equal(match[1].replace(/!important/g, '').trim(), '0');
  }
  assert.equal(
    (viewer.match(/<VideoLibraryConsole\b/g) || []).length,
    1,
    'Secondary states share one visible master, without nesting frames'
  );
  assert.match(viewer, /hidden=\{Boolean\(panelTitle\)\}/);
  for (const label of [
    'Report This Reel',
    'Share This Reel',
    'Reel Actions',
    'Keyboard Shortcuts',
    'Choose A Reaction',
    'Playback Options',
    'Reel Comments',
  ]) {
    assert.ok(viewer.includes(label), `Missing console state: ${label}`);
  }
  assert.match(source, /aria-label="Poker Reels Loading"/);
  assert.match(source, /aria-label="Poker Reels Connection Recovery"/);
  assert.match(source, /@media \(min-width: 900px\)/);
  assert.match(source, /grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\)/);
});

test('master controls retain real actions, accessible focus and persistent playback', () => {
  for (const action of [
    'goPrev',
    'goNext',
    'handleToggleComments',
    'handleSave',
    'handleReport',
    'handleShareToFeed',
    'handleShareAction',
    'handleSpeedToggle',
    'handleFollow',
    'handleCommentLike',
    'handleSaveEdit',
    'handleDeleteComment',
    'handleReelImageUpload',
    'handleSubmitComment',
    'loadMoreComments',
  ]) {
    assert.match(
      viewer,
      new RegExp(`(?:onClick|onChange|onKeyDown|onPaste)=[\\s\\S]*?${action}`),
      `Missing live action: ${action}`
    );
  }
  assert.match(viewer, /role="dialog"\s+aria-modal="true"\s+aria-labelledby="carousel-viewer-title"/);
  assert.match(viewer, /returnFocus\?\.isConnected/);
  assert.match(viewer, /element\.getClientRects\(\)\.length > 0/);
  assert.match(viewer, /ref=\{ytIframeRef\}/);
  assert.match(viewer, /ref=\{videoRef\}/);
  assert.match(viewer, /<YouTubeErrorOverlay/);
  assert.match(viewer, /<GiphyPicker/);
  assert.match(viewer, /Math\.round\(playbackSpeed \* 100\)/);
  assert.match(viewer, /comment\.author_id === authUser\?\.id/);
  assert.doesNotMatch(
    viewer,
    /profiles\?\.username === 'You'/,
    'Display names must never grant edit permissions'
  );
});

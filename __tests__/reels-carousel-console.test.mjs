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

test('social previews and viewer use the owner-requested immersive short-video contract', () => {
  assert.match(source, /ImmersiveReels\.module\.css/);
  assert.match(viewer, /data-reels-experience="immersive"/);
  assert.match(viewer, /data-reels-stage/);
  assert.match(viewer, /data-reels-copy/);
  assert.match(viewer, /data-reels-actions/);
  assert.match(viewer, /ReelIcon/);
  assert.match(viewer, /verticalReelSwipe/);
  assert.match(viewer, /createReelWheelGesture/);
  assert.match(viewer, /if \(!liked\[currentReel.id\]\) handleLike/);
  assert.doesNotMatch(viewer, /<VideoLibraryConsole/);
  for (const label of ['Report This Reel', 'Share This Reel', 'Reel Actions', 'Keyboard Shortcuts', 'Choose A Reaction', 'Playback Options', 'Reel Comments']) assert.ok(viewer.includes(label), label);
  assert.match(source, /aria-label=\{`\$\{categoryDefinition.title\} Loading`\}/);
  assert.match(source, /aria-label=\{`\$\{categoryDefinition.title\} Connection Recovery`\}/);
  assert.match(source, /border-radius: 12px !important/);
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
  assert.match(viewer, /iframeRef=\{ytIframeRef\}/);
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

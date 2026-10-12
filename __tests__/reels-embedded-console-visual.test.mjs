import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = relativePath => readFileSync(new URL(relativePath, import.meta.url), 'utf8');
const VIEWER = read('../src/components/social/Reels.jsx');
const STYLES = read('../src/components/social/ReelsConsole.module.css');
const IMMERSIVE = read('../src/components/reels/ImmersiveReels.module.css');
const COMBINED = `${VIEWER}\n${STYLES}`;

test('embedded Reels shares full-height playback and honest lifecycle states', () => {
  assert.match(VIEWER, /ImmersiveReels\.module\.css/);
  assert.match(VIEWER, /data-reels-experience="immersive"/);
  assert.match(VIEWER, /data-reels-scroll-stage/);
  assert.match(VIEWER, /<ReelsStatusScreen/);
  for (const title of ['Tuning Reel Signal','Signal Interrupted','No Reels Yet']) assert.ok(VIEWER.includes(title));
  assert.match(VIEWER, /<ReelYouTubePlayer/);
  assert.match(VIEWER, /<YouTubeErrorOverlay/);
  assert.match(IMMERSIVE, /height: 100dvh !important/);
});

test('embedded Reels has no generic icon or constructed control language', () => {
  assert.doesNotMatch(VIEWER, /<svg\b|from ['"]lucide-react['"]/i);
  assert.doesNotMatch(COMBINED, /(?:linear|radial|conic)-gradient/i);
  assert.doesNotMatch(COMBINED, /borderRadius|boxShadow|:hover\b|onMouseEnter|onMouseLeave/);
  assert.doesNotMatch(STYLES, /border-radius\s*:|box-shadow\s*:/i);
  assert.doesNotMatch(VIEWER, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  assert.doesNotMatch(VIEWER, /[\u2013\u2014\u2190-\u21ff\u2026]/u);
  assert.doesNotMatch(VIEWER, /\.toFixed\s*\(/);
  assert.doesNotMatch(VIEWER, /default-reel-thumb/i);
  assert.doesNotMatch(VIEWER, /default-avatar/i);
});

test('embedded icon controls retain accessible names and secondary actions', () => {
  for (const label of [
    'Close Viewer',
    'Previous Reel',
    'Next Reel',
    'togglePlayback',
    'Mute Reel',
    'Like',
    'Comments',
    'Share Reel',
    'Save Reel',
    'handleFollow',
    'Reactions',
    'More Options',
    'Keyboard Help',
    'Add GIF',
    'Add Image',
    'Post Comment',
    'Not For Me',
    'Report Reel',
    'Share To My Feed',
    'Copy Link',
  ]) {
    assert.match(VIEWER, new RegExp(label), `${label} must remain reachable`);
  }
});

test('every embedded Reel popup renders through the shared master console', () => {
  const popupKeys = [
    'comments',
    'reactions',
    'options',
    'context',
    'share',
    'share-description',
    'report',
    'shortcuts',
  ];
  const popupTitles = [
    'Reel Comments',
    'Reel Reactions',
    'Playback Options',
    'Reel Commands',
    'Share This Reel',
    'Share To My Feed',
    'Report This Reel',
    'Keyboard Commands',
  ];

  for (const key of popupKeys) {
    assert.match(
      VIEWER,
      new RegExp(`activeDialogKey === '${key}'`),
      `${key} must supply content to the shared popup console`
    );
  }
  for (const title of popupTitles) {
    assert.match(VIEWER, new RegExp(title), `${title} must be printed by the master chassis`);
  }

  assert.match(VIEWER, /className=\{immersiveStyles.sheetBackdrop\}/);
  assert.match(VIEWER, /className=\{immersiveStyles.sheet\}/);
  assert.match(VIEWER, /<h2 id="embedded-reel-dialog-title">\{dialogTitles\[activeDialogKey\]\}/);
  assert.match(VIEWER, /\{dialogContent\}/);
  assert.match(IMMERSIVE, /background: #fff !important/);
  assert.doesNotMatch(VIEWER, /styles\.panel/);
  assert.doesNotMatch(STYLES, /^\.panel\s*\{/m);
  assert.doesNotMatch(STYLES, /^\.overlay(?:Centered)?\s*\{/m);
});

test('embedded Reel panels trap and return focus and retain mobile safeguards', () => {
  assert.match(VIEWER, /aria-modal="true"/);
  assert.match(VIEWER, /event\.key === 'Escape'/);
  assert.match(VIEWER, /event\.key !== 'Tab'/);
  assert.match(VIEWER, /dialogReturnFocusRef\.current\.focus\(\)/);
  assert.match(VIEWER, /safe-area-inset-top/);
  assert.match(STYLES, /min-height:\s*44px/);
  assert.match(STYLES, /@media \(min-width:\s*760px\)/);
  assert.match(STYLES, /grid-template-columns:\s*minmax\(0, 1\.45fr\) minmax\(240px, 0\.75fr\)/);
  assert.match(STYLES, /height:\s*min\(124cqw, 66dvh\)/);
});

test('stage signals stay legible without flat popup backplates', () => {
  const stageSignalRule = STYLES.match(/\.stageSignal\s*\{([^}]*)\}/)?.[1] || '';
  const statusRules = [...STYLES.matchAll(/(?:^|\n)\.status\s*\{([^}]*)\}/g)];
  const statusRule = statusRules.at(-1)?.[1] || '';

  assert.doesNotMatch(stageSignalRule, /background|padding/);
  assert.doesNotMatch(statusRule, /background|padding/);
  assert.match(STYLES, /\.stageSignal,[\s\S]*?text-shadow:/);
  assert.match(statusRule, /text-shadow:/);
});

test('comment edit and delete authorization relies only on the account author ID', () => {
  assert.match(VIEWER, /const ownComment = comment\.author_id === currentUserId;/);
  assert.doesNotMatch(VIEWER, /profiles\?\.username === ['"]You['"]/);
  assert.doesNotMatch(VIEWER, /username === ['"]You['"]/);
});

test('real Reel media and account-scoped interaction wiring are preserved', () => {
  assert.match(VIEWER, /fetchPokerReels/);
  assert.match(VIEWER, /createReelAccountScope/);
  assert.match(VIEWER, /savedReelsService/);
  assert.match(VIEWER, /handleLike/);
  assert.match(VIEWER, /handleDislike/);
  assert.match(VIEWER, /handleSave/);
  assert.match(VIEWER, /handleFollow/);
  assert.match(VIEWER, /handleSubmitComment/);
  assert.match(VIEWER, /handleShareAction/);
  assert.match(VIEWER, /handleShareToFeed/);
  assert.match(VIEWER, /handleReport/);
  assert.match(VIEWER, /loadMoreReels/);
  assert.match(VIEWER, /loadCanonicalReelsWindow/);
});

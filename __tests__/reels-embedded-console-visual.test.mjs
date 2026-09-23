import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = relativePath => readFileSync(new URL(relativePath, import.meta.url), 'utf8');
const VIEWER = read('../src/components/social/Reels.jsx');
const STYLES = read('../src/components/social/ReelsConsole.module.css');
const COMBINED = `${VIEWER}\n${STYLES}`;

test('embedded Reels renders every lifecycle through the exact shared console', () => {
  assert.match(VIEWER, /import VideoLibraryConsole/);
  assert.match(VIEWER, /import styles from ['"]\.\/ReelsConsole\.module\.css['"]/);
  assert.match(VIEWER, /titleAs="h1"/);
  assert.match(VIEWER, /title="Tuning Reel Signal"/);
  assert.match(VIEWER, /title="Signal Interrupted"/);
  assert.match(VIEWER, /title="No Reels Yet"/);
  assert.match(VIEWER, /<main className=\{styles\.shell\} aria-label="Embedded Poker Reels Viewer">/);
  assert.match(VIEWER, /foot="foot"/);
  assert.match(VIEWER, /className=\{styles\.viewport\}/);
  assert.match(VIEWER, /className=\{styles\.media\}/);
  assert.match(VIEWER, /className=\{styles\.poster\}/);
  assert.match(VIEWER, /<YouTubeErrorOverlay/);
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

test('all embedded Reel actions remain reachable as words', () => {
  for (const label of [
    'Close Viewer',
    'Previous Reel',
    'Next Reel',
    'Play Reel',
    'Mute Reel',
    'Like',
    'Comments',
    'Share Reel',
    'Save Reel',
    'Follow Creator',
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

  assert.match(
    VIEWER,
    /\{activeDialogKey \? \([\s\S]*?<VideoLibraryConsole[\s\S]*?title=\{dialogTitles\[activeDialogKey\]\}[\s\S]*?\{dialogContent\}/
  );
  assert.match(VIEWER, /className=\{styles\.dialogConsole\}/);
  assert.match(VIEWER, /titleId="embedded-reel-dialog-title"/);
  assert.match(VIEWER, /activeDialogKey \? styles\.liveConsoleHidden : ''/);
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
  assert.match(VIEWER, /scanReelsContinuations/);
});

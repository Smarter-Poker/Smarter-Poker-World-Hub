/**
 * FULL-SCREEN POPUPS LEAVE ROOM TO X OFF (mobile phase 0b, 2026-09-03).
 *
 * Dan, verbatim: "change any and all full screen pop ups, they don't leave
 * any padding at the top to X off."
 *
 * The app runs with viewport-fit=cover and a translucent status bar, so a
 * position:fixed; inset:0 layer starts at y=0 UNDER the clock / notch, which
 * is about 47px tall on a modern iPhone. A close control placed at
 * top: 8..24px is painted under the status bar and cannot be tapped. The
 * player is then trapped in the popup.
 *
 * Every file below carries a full-screen (or phone-full-screen) overlay that
 * was fixed to:
 *   1. push its top chrome below `env(safe-area-inset-top)`, and
 *   2. give its close control a 44x44 tap target (the iOS minimum).
 *
 * This test pins both so they cannot quietly regress. The heuristics are
 * deliberately simple and are documented next to each assertion.
 *
 * The shared utilities live in src/styles/global-tokens.css
 * (`.sp-fullscreen-overlay`, `.sp-overlay-close`).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Every file whose full-screen overlay was fixed in phase 0b. Add to this
// list when you fix another one; never remove an entry to make the test pass.
const FIXED_FILES = [
  'src/components/ui/FullScreenPageOverlay.js',
  'src/components/social/PostImageLightbox.jsx',
  'src/components/social/ChatWindow.jsx',
  'src/components/social/ClubPageDashboard.jsx',
  'src/components/social/ClubPagesView.jsx',
  'src/components/social/PublicGameBoard.jsx',
  'src/components/social/Reels.jsx',
  'src/components/social/ReelsFeedCarousel.jsx',
  'src/components/social/Stories.jsx',
  'src/components/social/SmarterPokerPhotos.jsx',
  'src/components/social/ArticleReaderModal.jsx',
  'src/components/social/SharedVideoComponents.jsx',
  'src/components/social/compose/sheets/SheetShell.jsx',
  'src/components/ui/ExternalLinkModal.jsx',
  'src/components/ui/BottomSheet.jsx',
  'src/components/ui/LocationEnableModal.jsx',
  'src/components/poker-near-me/GlobalSearchOverlay.jsx',
  'src/components/poker-near-me/VenueReviews.jsx',
  'src/components/poker-near-me/VenueCard.js',
  'src/components/store/DiamondWalletModal.jsx',
  'src/components/store/ShoppingCart.jsx',
  'src/components/bankroll/TokeTracker.jsx',
  'src/components/tours/StopScheduleModal.js',
  'src/world/components/CardCustomizerPanel.tsx',
  'pages/hub/video-library.js',
  'pages/hub/news.js',
  'pages/hub/messenger.js',
  'pages/hub/poker-tools.js',
  'pages/hub/lives.js',
  'pages/hub/home-games.js',
];

// Files whose close control was enlarged but whose layer is a centered card
// (not full-screen), so the safe-area assertion does not apply to them. They
// still may not carry an undersized close control.
const CLOSE_ONLY_FILES = [
  'src/components/ui/InviteFriendsModal.jsx',
  'src/components/bankroll/TaxSummaryModal.jsx',
  'src/components/social/GoLiveModal.jsx',
  'pages/hub/reels.js',
  'pages/hub/events-calendar.js',
  'pages/hub/home-games/[slug].js',
];

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('the shared overlay utilities exist in the globally imported tokens sheet', () => {
  const css = read('src/styles/global-tokens.css');
  assert.match(css, /\.sp-fullscreen-overlay\s*\{[^}]*safe-area-inset-top/);
  assert.match(css, /\.sp-overlay-close\s*\{[^}]*safe-area-inset-top/);
  assert.match(css, /\.sp-overlay-close\s*\{[^}]*min-width:\s*44px/);
  assert.match(css, /\.sp-overlay-close\s*\{[^}]*min-height:\s*44px/);
  assert.match(css, /\.sp-overlay-close--left\s*\{/);
});

test('every fixed full-screen overlay pushes its top chrome below the status bar', () => {
  const missing = FIXED_FILES.filter((f) => !read(f).includes('safe-area-inset-top'));
  assert.deepEqual(
    missing,
    [],
    'These files carry a full-screen overlay and no longer reference\n' +
      'env(safe-area-inset-top). Their close control is back under the clock:\n  ' +
      missing.join('\n  ')
  );
});

/**
 * Heuristic: a line that declares a width/height of 28..40px, sitting inside
 * a block (the surrounding 12 lines) that mentions a close control
 * (aria-label="Close", a *close* class / style key, or a ✕ / × glyph) and
 * is not an <img> (avatars are 32-36px circles and are not buttons) is an
 * undersized close button. Sizes of 44 and above pass; sizes under 28 are
 * decorative glyphs and are ignored. An explicit minWidth/minHeight of 44+
 * anywhere in the same block rescues a block that also carries a smaller
 * legacy `width`. Input "clear" buttons (aria-label="Clear") are not close
 * controls and are skipped.
 */
const SMALL = /\b(?:width|height|min-width|minWidth|min-height|minHeight)\s*:\s*(?:'|")?(2[89]|3\d|40)(?:px)?(?:'|")?\s*[,;}]/;
const CLOSE_WORDS = /aria-label=["']Close["']|close-btn|closeBtn|close-button|close-modal|\.[\w-]*close\b|✕|×/;
const RESCUE = /(?:min-width|minWidth|min-height|minHeight)\s*:\s*(?:'|")?(4[4-9]|[5-9]\d)(?:px)?/;
const NOT_A_CLOSE_LINE = /<img\b/;
// A text-input "clear" control (aria-label="Clear") is a different widget:
// it empties the field, it does not dismiss the overlay.
const NOT_A_CLOSE_BLOCK = /aria-label=["']Clear["']/;

function undersizedCloseControls(src) {
  const lines = src.split('\n');
  const offences = [];
  for (let i = 0; i < lines.length; i++) {
    if (!SMALL.test(lines[i])) continue;
    if (NOT_A_CLOSE_LINE.test(lines[i])) continue;
    const lo = Math.max(0, i - 12);
    const hi = Math.min(lines.length, i + 12);
    const block = lines.slice(lo, hi).join('\n');
    if (!CLOSE_WORDS.test(block)) continue;
    if (RESCUE.test(block)) continue;
    // The clear-input exemption is checked on the line's own 3-line window
    // so a real close button 10 lines away is not hidden by it.
    if (NOT_A_CLOSE_BLOCK.test(lines.slice(Math.max(0, i - 2), i + 3).join('\n'))) continue;
    offences.push(`${i + 1}: ${lines[i].trim()}`);
  }
  return offences;
}

test('no fixed file carries a close control smaller than 44px', () => {
  const offences = [];
  for (const f of [...FIXED_FILES, ...CLOSE_ONLY_FILES]) {
    for (const o of undersizedCloseControls(read(f))) offences.push(`${f}:${o}`);
  }
  assert.deepEqual(
    offences,
    [],
    'A close control near these lines is smaller than the 44px tap target.\n' +
      'Set width/height (or minWidth/minHeight) to 44:\n  ' +
      offences.join('\n  ')
  );
});

/**
 * THE GUEST SAVE PROMPT (Preflop Charts, 2026-11-28).
 *
 * A signed-out player who finishes a strong run is offered a free account
 * once per session through the site's quick-signup sheet. Pins: who sees it,
 * how often, what it says, and that every result screen carries it.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const SRC = read('src/components/memory-games/PreflopGuestSavePrompt.jsx');

// The decision is pure; evaluate it without a JSX toolchain.
const body = SRC.slice(SRC.indexOf('export function guestSaveDecision'), SRC.indexOf('function readNumber'));
// eslint-disable-next-line no-new-func
const guestSaveDecision = new Function('GUEST_SAVE_STRONG_ACCURACY', 'GUEST_SAVE_BEST_FLOOR', `${body.replace('export ', '')}; return guestSaveDecision;`)(80, 50);

test('who qualifies: 80% or better, or a new device best of at least 50%', () => {
  assert.deepEqual(guestSaveDecision({ accuracy: 80, previousBest: null }), { show: true, newBest: false });
  assert.deepEqual(guestSaveDecision({ accuracy: 79, previousBest: null }), { show: false, newBest: false }, 'a first run is never a "best"');
  assert.deepEqual(guestSaveDecision({ accuracy: 64, previousBest: 60 }), { show: true, newBest: true });
  assert.deepEqual(guestSaveDecision({ accuracy: 40, previousBest: 10 }), { show: false, newBest: false }, 'no celebrating a weak run');
  assert.deepEqual(guestSaveDecision({ accuracy: 60, previousBest: 60 }), { show: false, newBest: false });
  assert.deepEqual(guestSaveDecision({ accuracy: Number.NaN, previousBest: 10 }), { show: false, newBest: false });
});

test('never for a signed-in player, at most once per session, honest copy', () => {
  assert.match(SRC, /const \{ user, initializing \} = useAvatar\(\);/);
  assert.match(SRC, /if \(decided\.current \|\| initializing\) return;/, 'waits for sign-in to resolve');
  assert.match(SRC, /if \(user\?\.id \|\| typeof window === 'undefined'\) return;/);
  assert.match(SRC, /if \(!prompt \|\| user\?\.id\) return null;/);
  assert.match(SRC, /GUEST_SAVE_SESSION_KEY = 'preflop-guest-save-prompted'/);
  assert.match(SRC, /sessionStorage\.setItem\(GUEST_SAVE_SESSION_KEY, '1'\)/);
  assert.match(SRC, /This Run Is Saved On This Device Only\./);
  const rendered = SRC.slice(SRC.lastIndexOf('  return ('));
  assert.doesNotMatch(rendered, /Prize|Reward|Diamond|Win \$|Free Money/i, 'no prizes or rewards claimed');
  assert.match(SRC, /openQuickSignup\(detail\)/);
  assert.match(SRC, /buildSignupUrl\(/, 'falls back to the signup page');
  for (const event of ['shown', 'clicked', 'dismissed']) assert.match(SRC, new RegExp(`preflop_guest_save_prompt_${event}`));
});

test('every result screen carries the prompt; the page loads it on demand', () => {
  for (const [file, mode] of [
    ['src/games/SpeedDrillGame.js', 'speed-drill'],
    ['src/games/PressureCookerGame.js', 'pressure-cooker'],
    ['src/games/PatternRecognitionGame.js', 'pattern-recognition'],
    ['src/games/TournamentModeGame.jsx', 'local-vs'],
  ]) {
    assert.match(read(file), new RegExp(`<PreflopGuestSavePrompt mode="${mode}" accuracy=\\{accuracy\\} />`), file);
  }
  assert.equal((read('src/games/PressureCookerGame.js').match(/<PreflopGuestSavePrompt /g) || []).length, 2, 'both Pressure Cooker endings');
  const page = read('pages/hub/memory-games.js');
  assert.match(page, /const PreflopGuestSavePrompt = dynamic\(\s*\(\) => import\('\.\.\/\.\.\/src\/components\/memory-games\/PreflopGuestSavePrompt'\),\s*\{ ssr: false \}/);
  assert.match(page, /\{gradeResult && !userId && \(\s*<PreflopGuestSavePrompt mode="range-lab" accuracy=\{gradeResult\.score\} \/>/);
  const css = read('src/styles/worlds/preflop-smarterdesign.css');
  assert.match(css, /\.preflop-guest-save \{[\s\S]*chrome-readout\.webp/);
  assert.match(css, /\.preflop-guest-save-actions button \{[\s\S]*min-height: 44px/);
});

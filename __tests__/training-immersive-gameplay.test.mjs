import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Training arena gameplay owns an immersive footerless viewport', async () => {
  const footer = await readFile('src/config/worldFooterNavigation.js', 'utf8');
  const arena = await readFile('src/components/training/GodModeArena.jsx', 'utf8');

  assert.match(footer, /path\.startsWith\('\/hub\/training\/arena\/'\)/);
  assert.match(
    footer,
    /isClubArenaOwnedRoute\(path\) \|\| isImmersiveTrainingRoute\(path\)/,
  );
  assert.match(arena, /if \(gamePhase !== 'playing' \|\| typeof window === 'undefined'\) return;/);
  assert.match(arena, /window\.scrollTo\(0, 0\)/);
  assert.doesNotMatch(arena, /window\.scrollTo\([^)]*behavior:\s*'smooth'/);
});

test('Club Arena parity surfaces expose stable state and geometry anchors', async () => {
  const table = await readFile('src/components/training/games/UniversalDynamicTable.jsx', 'utf8');

  for (const contract of [
    'data-training-visual-state',
    'data-training-selected-action',
    'data-training-street',
    'data-training-player-count',
    'data-training-board-count',
    'data-training-table',
    'data-training-seat',
    'data-training-seat-index',
    'data-training-seat-position',
    'data-training-dealer-button',
    'data-training-chip-seat-index',
    'data-training-chip-amount',
    'data-training-pot',
    'data-training-feedback',
  ]) {
    assert.match(table, new RegExp(contract), `${contract} must remain measurable`);
  }
  assert.match(table, /className="sp-club-gto-hero-card"/);
  assert.match(table, /question\?\.boardCards \|\| scenario\.boardCards \|\| scenario\.board/);
  assert.match(table, /COMPLETE CLUB ARENA RING/);
  assert.doesNotMatch(table, /if \(!isHero && !isActiveVillain\) return null/);
  assert.match(table, /sp-club-gto-mode-bar:not\(\.is-feedback\)/);
  assert.match(table, /showFeedback \? ' is-feedback' : ''/);
});

test('God Mode Arena exposes a stable nonvisual completion-state anchor', async () => {
  const arena = await readFile('src/components/training/GodModeArena.jsx', 'utf8');
  const parityAudit = await readFile('scripts/training-phase6-parity-audit.mjs', 'utf8');

  assert.match(arena, /data-training-ui="club-arena-completion"/);
  assert.match(arena, /data-training-visual-state="completion"/);
  assert.match(parityAudit, /gameId: 'mtt-021'.*expectsFlopTurn: true/);
  assert.match(parityAudit, /flop did not advance to turn/);
  assert.match(parityAudit, /data-action="allin"/);
  assert.match(parityAudit, /expectsCompletion: true/);
});

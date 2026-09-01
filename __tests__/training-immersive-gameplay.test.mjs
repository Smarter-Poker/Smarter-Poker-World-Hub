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

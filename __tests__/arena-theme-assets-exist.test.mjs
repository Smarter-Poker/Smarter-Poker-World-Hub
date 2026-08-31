/**
 * ARENA THEME BRIDGE — ASSET EXISTENCE GUARD
 * ─────────────────────────────────────────────────────────────────────────
 * WHY IT EXISTS
 *
 * `src/lib/clubArenaTheme.js` is a DERIVED COPY of Club Arena's asset
 * catalogs. Arena owns the ids; this repo owns the files those ids point at,
 * under `public/hub/table-theme/`. Two repos, one contract, and nothing
 * enforcing it.
 *
 * The failure mode is silent by construction. Every resolver in the bridge
 * falls back rather than throwing — an unknown id paints classic green, and a
 * missing FILE paints the fallback gradient behind a 404 nobody reads. So if
 * Arena adds a skin and someone adds the id here but forgets to copy the
 * artwork (or copies it under a different name), the training tables and the
 * sandbox quietly paint the wrong felt for everyone. It looks like a design
 * choice rather than a bug, which is how the felt and card-back catalog
 * defects inside Arena itself survived three separate rounds of fixing.
 *
 * WHAT IT CHECKS
 *   1. Every skin/background file name the bridge maps to exists on disk.
 *   2. Every card-back id the bridge offers has artwork in the Arena bundle.
 *   3. The fallbacks the bridge names by hand are themselves present — a
 *      missing fallback means there is no floor under any miss.
 *
 * It reads the bridge as TEXT rather than importing it, so the guard has no
 * opinion about module format and cannot be broken by the bridge growing a
 * browser-only import.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const BRIDGE = join(REPO, 'src/lib/clubArenaTheme.js');

function bridgeSource() {
  assert.ok(
    existsSync(BRIDGE),
    'src/lib/clubArenaTheme.js is missing — the theme bridge itself was deleted, so every ' +
      'World Hub table silently reverted to its hardcoded felt.'
  );
  return readFileSync(BRIDGE, 'utf8');
}

/** Every artwork file name the bridge can hand to a URL. */
function mappedFiles(src, pattern) {
  return [...new Set([...src.matchAll(pattern)].map((m) => m[1]))];
}

test('every table skin the bridge maps has artwork on disk', () => {
  const src = bridgeSource();
  const files = mappedFiles(src, /'(skin_[a-z0-9_]+\.png)'/g);
  assert.ok(files.length > 0, 'the bridge maps no skin files at all — the SKIN_FILES map is empty');

  const missing = files.filter((f) => !existsSync(join(REPO, 'public/hub/table-theme/tables', f)));
  assert.deepEqual(
    missing,
    [],
    'Skin artwork referenced by the bridge but absent from public/hub/table-theme/tables:\n' +
      missing.map((f) => `  - ${f}`).join('\n') +
      '\n\nCopy it from club-arena/src/assets/tables/. Until you do, every player whose ' +
      'saved theme uses it sees the fallback gradient on the training and sandbox tables.'
  );
});

test('every background the bridge maps has artwork on disk', () => {
  const src = bridgeSource();
  const files = mappedFiles(src, /'(bg_[a-z0-9_]+\.jpg)'/g);
  assert.ok(files.length > 0, 'the bridge maps no background files at all');

  const missing = files.filter((f) =>
    !existsSync(join(REPO, 'public/hub/table-theme/backgrounds', f))
  );
  assert.deepEqual(
    missing,
    [],
    'Background artwork referenced by the bridge but absent from ' +
      'public/hub/table-theme/backgrounds:\n' +
      missing.map((f) => `  - ${f}`).join('\n') +
      '\n\nCopy it from club-arena/src/assets/backgrounds/.'
  );
});

test('the fallbacks the bridge names by hand are present', () => {
  // These two are quoted directly in the resolvers as the last line of
  // defence. If either is missing there is no floor under a miss at all.
  const floors = [
    'public/hub/table-theme/tables/skin_classic_green.png',
    'public/hub/table-theme/backgrounds/bg_midnight.jpg',
  ];
  const missing = floors.filter((f) => !existsSync(join(REPO, f)));
  assert.deepEqual(
    missing,
    [],
    `The bridge's own fallback artwork is missing: ${missing.join(', ')}. ` +
      'Every unknown or unset theme id resolves to these.'
  );
});

test('every card back the bridge offers exists in the Club Arena bundle', () => {
  const src = bridgeSource();
  const block = src.match(/const CARD_BACK_IDS = \[([\s\S]*?)\]/);
  assert.ok(block, 'CARD_BACK_IDS is no longer a literal array — this guard cannot read it');

  const ids = [...block[1].matchAll(/'([a-z0-9_-]+)'/g)].map((m) => m[1]);
  assert.ok(ids.length > 0, 'CARD_BACK_IDS is empty');

  // The bridge points at the Arena bundle's own card artwork rather than a
  // second copy, so this also catches an Arena sync that dropped the folder.
  const dir = 'public/hub/club-arena/cards/backs/table';
  const missing = ids.filter((id) => !existsSync(join(REPO, dir, `${id}.webp`)));
  assert.deepEqual(
    missing,
    [],
    `Card backs offered by the bridge with no artwork in ${dir}:\n` +
      missing.map((id) => `  - ${id}.webp`).join('\n') +
      '\n\nEither the id is wrong, or a Club Arena sync dropped the artwork.'
  );
});

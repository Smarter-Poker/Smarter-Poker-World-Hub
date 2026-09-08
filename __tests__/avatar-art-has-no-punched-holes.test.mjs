/**
 * LAW: no avatar has a hole punched through the subject.
 * ═══════════════════════════════════════════════════════════════════════════
 * Dan, 2026-09-08: "CHECK ALL THE AVATARS, BUT THEM AGAINST A BLACK BACKGROUND
 * SO YOU CAN SEE ANY THAT NEED TO BE FIXED."
 *
 * On black they were unmistakable. `vip_geisha_master` had two black wedges torn
 * out of her white face makeup. `free_penguin` had holes through its belly,
 * `free_knight` through its armour, `vip_liberty` through its robe,
 * `vip_silent_actor` through his face AND his shirt front. A background remover
 * had taken the subject wherever the subject was close to the backdrop in
 * colour, so it went for the light-coloured avatars almost without exception:
 * 86 of the 100 busts and 66 of the 100 gallery tiles.
 *
 * WHY NOTHING CAUGHT IT. `scripts/check-avatar-integrity.mjs` opens by saying a
 * background remover "punched transparent holes THROUGH 26 of the 100 subjects"
 * and that "this is what stops them coming back". It checked file presence,
 * duplicate hashes and that the retired generator kept its guard — it never
 * opened an image. And nothing ran it: it was in no workflow. A guard that does
 * not measure the fault it is named after, and is not executed, is a comment.
 *
 * This is the measurement, and CHECK 8 in build-safety-gate.yml runs it.
 *
 * WHAT IT ASSERTS. An enclosed transparent region behind a wall of subject 5px
 * or thicker (scaled with the image) is a hole. Behind a thinner wall it is the
 * gap between a panther's whiskers or a badger's fur spikes, which must stay —
 * `scripts/lib/avatarMatte.mjs` carries the measurements the threshold came
 * from. The handful of large regions that ARE meant to show the felt (the ring
 * inside the angel's halo, the space between Liberty's arm and her head) are
 * named in KEEP_SEE_THROUGH in `scripts/lib/avatarMatte.mjs`; the repair reads the
 * same list from the same module, so the guard and the repair cannot drift apart.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const AVATARS = join(ROOT, 'public/avatars');

const matte = await import('../scripts/lib/avatarMatte.mjs');
const sharp = await matte.getSharp();

function subjects() {
  const out = [];
  for (const [dir, match] of [
    ['table', (f) => f.endsWith('@2x.webp')],
    ['free', (f) => f.endsWith('.webp')],
    ['vip', (f) => f.endsWith('.webp')],
  ]) {
    const full = join(AVATARS, dir);
    if (!existsSync(full)) continue;
    for (const f of readdirSync(full).filter(match)) out.push(`${dir}/${f}`);
  }
  return out.sort();
}

/**
 * A SKIP IS NOT A PASS. Locally, someone without sharp should not have a red
 * build over a missing image codec. In CI it is the opposite: this job does not
 * `npm ci`, so a silent skip is precisely how the guard this replaces became
 * decorative — it claimed to stop holes coming back and never opened an image.
 * The workflow installs sharp before running this; if that failed, say so.
 */
test('the image codec this guard needs is present in CI', { skip: !process.env.CI }, () => {
  assert.ok(
    sharp,
    'sharp is unavailable, so the hole check below SKIPPED rather than ran. ' +
      'See the "Restore the image codec CHECK 8 needs" step in build-safety-gate.yml.'
  );
});

test('the avatar library is present', () => {
  const files = subjects();
  // 100 busts + 24 free + 76 vip. A rename or a move would otherwise turn every
  // assertion below into a vacuous pass.
  assert.ok(files.length >= 200, `only ${files.length} avatars found under public/avatars`);
});

test('no avatar has a hole punched through the subject', { skip: !sharp }, async () => {
  const keeps = matte.KEEP_SEE_THROUGH;
  const broken = [];

  for (const rel of subjects()) {
    const { data, info } = await sharp(join(AVATARS, rel))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const { width, height } = info;
    const n = width * height;
    const alpha = new Uint8Array(n);
    for (let i = 0; i < n; i += 1) alpha[i] = data[i * 4 + 3];

    const { deep } = matte.classifyMatte(alpha, width, height, matte.minWallFor(height));
    const mine = keeps.filter(([f]) => f === rel).map(([, x, y]) => [x, y]);
    if (mine.length) matte.dropKeepers(deep, width, height, mine);

    const largest = matte.largestBlob(deep, width, height);
    if (largest >= matte.minHoleFor(height)) broken.push(`${rel} (${largest}px)`);
  }

  assert.deepEqual(
    broken,
    [],
    `holes punched through the subject:\n  ${broken.join('\n  ')}\n` +
      `Run: node scripts/repair-avatar-mattes.mjs --write`
  );
});

/**
 * LAW - A HORSE AVATAR IS UPLOADED WHERE A HUMAN ONE IS
 *
 * Dan, 2026-09-02: "NOBODY SHOULD EVER EVER EVER BE ABLE TO LOOK AT OUR CODE
 * OR USE A DEVELOPER TOOL AND FIND THIS OUT."
 *
 * Measured 2026-09-07 in Club Arena: 541 of 1,000 horse profiles carried an
 * avatar_url under `social-media/horse-avatars-v2/` or
 * `social-media/avatars/horse_avatar_<name>_<ts>.png`, and no human profile
 * did. The URL is the <img src> on every seat, post, friend card and
 * messenger thread - the flag spelled out in the Elements panel and the
 * Network tab. The live rows were repointed to copies at the human
 * convention (bucket `avatars`, key `<profile uuid>/avatar.<ext>`); this law
 * keeps the two generators in this repo from writing a horse-named file
 * ever again.
 *
 * IF THIS FILE GOES RED, YOUR CHANGE IS THE BUG. Upload to bucket `avatars`
 * at `<profile_id>/avatar.png`. Never put "horse" in a storage key.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GENERATORS = [
  'src/content-engine/pipeline/HorseAvatarGenerator.js',
  'src/content-engine/pipeline/uploadGeneratedAvatars.js',
];

const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

for (const rel of GENERATORS) {
  const code = stripComments(readFileSync(join(ROOT, rel), 'utf8'));

  test(`${rel} uploads to the avatars bucket at <profile_id>/avatar.png`, () => {
    assert.match(code, /const storagePath = `\$\{horse\.profile_id\}\/avatar\.png`;/);
    assert.match(code, /\.from\('avatars'\)\s*\.upload\(storagePath/);
    assert.match(code, /\.from\('avatars'\)\s*\.getPublicUrl\(storagePath\)/);
  });

  test(`${rel} never writes a storage key that says horse`, () => {
    assert.doesNotMatch(code, /horse_avatar_\$\{/, 'a horse_avatar_* file name is the tell');
    assert.doesNotMatch(code, /horse-avatars/, 'a horse-avatars* folder is the tell');
    assert.doesNotMatch(code, /\.from\('social-media'\)\s*\.upload\(/, 'avatars do not go to social-media');
  });

  test(`${rel} refuses to upload for a horse with no profile`, () => {
    assert.match(code, /if \(!horse\.profile_id\) \{[\s\S]*?return null;/);
  });
}

/**
 * LAW: Club Arena reaches players through ONE rewrite, never through a copy.
 *
 * Until 2026-09-03 the Vite bundle was committed into this repo's
 * public/hub/club-arena/ - 1,383 files - and every Club Arena merge produced a
 * `chore(club-arena): sync build` commit here plus a 4-5 minute rebuild of the
 * entire World Hub, about twenty times a day, before a player saw the change.
 *
 * Now the Club Arena repo publishes to its own static origin and this repo
 * proxies it. Two things must stay true, and neither is obvious to someone
 * reading a single file:
 *
 *   1. The rewrite exists and points at the origin. Delete it and every Club
 *      Arena route 404s instantly.
 *   2. The copy does not come back. A well-meaning "let's vendor it again"
 *      would silently take precedence over the rewrite for any path that
 *      matched a file - Next.js serves public/ before afterFiles rewrites -
 *      so production would serve a stale bundle with no error anywhere.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const ORIGIN = 'https://ca-static.smarter.poker';
const config = readFileSync('next.config.js', 'utf8');

test('the rewrite proxies /hub/club-arena to the Club Arena origin', () => {
  assert.match(
    config,
    /source: '\/hub\/club-arena',\s*destination: 'https:\/\/ca-static\.smarter\.poker\/index\.html'/,
    'the bare /hub/club-arena rewrite is missing — the lobby would 404'
  );
  assert.match(
    config,
    /source: '\/hub\/club-arena\/:path\*',\s*destination: 'https:\/\/ca-static\.smarter\.poker\/:path\*'/,
    'the /hub/club-arena/:path* rewrite is missing — every asset and SPA route would 404'
  );
});

test('the rewrite is in afterFiles, so a real file would still win (and there must be none)', () => {
  const after = config.slice(config.indexOf('afterFiles:'), config.indexOf('fallback:'));
  assert.ok(after.includes(ORIGIN), 'the Club Arena rewrite is not in afterFiles');
});

test('the vendored copy has not come back', () => {
  assert.equal(
    existsSync('public/hub/club-arena'),
    false,
    'public/hub/club-arena/ exists again. Next.js serves public/ BEFORE afterFiles rewrites, ' +
      'so this directory silently overrides the origin and production would serve whatever is ' +
      'in it. Club Arena publishes to its own origin; delete this and let the rewrite work.'
  );
  const tracked = execSync('git ls-files public/hub/club-arena | head -5', { encoding: 'utf8' }).trim();
  assert.equal(tracked, '', `public/hub/club-arena is tracked again:\n${tracked}`);
});

test('nothing in this repo still expects to build or sync the bundle', () => {
  for (const gone of [
    'scripts/sync-club-arena.sh',
    'scripts/build-club-arena.sh',
    'scripts/ci/check-ca-build-provenance.mjs',
    'scripts/ci/check-ca-protected-features.mjs',
    'scripts/ci/check-ca-throwables-freshness.mjs',
    'scripts/hooks/pre-push-club-arena.sh',
    '.github/workflows/club-arena-scheduled-deploy.yml',
  ]) {
    assert.equal(existsSync(gone), false, `${gone} is back — it only made sense while the bundle lived here`);
  }
});

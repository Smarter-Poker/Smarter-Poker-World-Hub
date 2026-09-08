/**
 * ═══ VERCEL.JSON IS VALIDATED BY VERCEL, NOT BY US — SO VALIDATE IT HERE ═══
 *
 * 2026-09-08. Deployment 2d79fd9 for #1632 went to ERROR on `main`. The change
 * was a one-line cache TTL; what broke it was the explanation beside it. I added
 *
 *     "_comment": "2026-09-08: 30 days -> 1 day. ..."
 *
 * inside the `/avatars/(.*)` headers entry, and Vercel validates that file
 * against a schema which allows only `source`, `headers`, `has` and `missing`
 * there. Unknown key, invalid configuration, build refused.
 *
 * WHY NOTHING UPSTREAM CAUGHT IT. A config error fails BEFORE anything
 * compiles. `npm run build` locally does not read vercel.json; no test read it
 * either; the pre-push hooks read source, not config. Every gate was green and
 * the deployment was red, and the only place it showed was a dashboard row —
 * which is how it was found: Dan looked.
 *
 * Two assertions, both cheap:
 *
 *   1. every routing entry carries only keys the schema allows, so a comment or
 *      a typo cannot reach a deployment again;
 *   2. the /avatars cache TTL stays short, which is the thing that comment was
 *      trying to say. Avatar URLs are unhashed and their values are persisted in
 *      `profiles.arena_avatar_url`, so a repaired avatar cannot be invalidated by
 *      renaming the file — the header is the only lever. At 30 days a fix that
 *      reaches the origin does not reach a returning player for a month, which is
 *      exactly what happened to the hole repair: shipped, live, and invisible to
 *      everyone who already had the torn art cached.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8'));

/** https://vercel.com/docs/project-configuration — per-section allowed keys. */
const ALLOWED = {
  headers: new Set(['source', 'headers', 'has', 'missing']),
  redirects: new Set(['source', 'destination', 'permanent', 'statusCode', 'has', 'missing']),
  rewrites: new Set(['source', 'destination', 'has', 'missing']),
  crons: new Set(['path', 'schedule']),
};

for (const [section, allowed] of Object.entries(ALLOWED)) {
  test(`vercel.json ${section} entries carry only keys Vercel accepts`, () => {
    const entries = config[section];
    if (!Array.isArray(entries)) return;
    const offenders = entries
      .map((entry, i) => [i, Object.keys(entry).filter((k) => !allowed.has(k))])
      .filter(([, extra]) => extra.length)
      .map(([i, extra]) => `${section}[${i}] (${config[section][i].source ?? config[section][i].path}): ${extra.join(', ')}`);

    assert.deepEqual(
      offenders,
      [],
      `vercel.json has keys Vercel's schema does not allow. The build fails on this ` +
        `BEFORE anything compiles, so nothing else here will catch it:\n  ${offenders.join('\n  ')}\n` +
        `vercel.json is strict JSON - it takes no comments. Put the reasoning in a ` +
        `test like this one or in .agent/audits/.`
    );
  });
}

test('the avatar cache stays short enough for a repair to reach a player', () => {
  const rule = (config.headers ?? []).find((h) => h.source === '/avatars/(.*)');
  assert.ok(rule, 'the /avatars/(.*) cache rule is gone; avatars would take the catch-all TTL');

  const value = rule.headers.find((h) => h.key.toLowerCase() === 'cache-control')?.value ?? '';
  const maxAge = Number(/max-age=(\d+)/.exec(value)?.[1] ?? NaN);

  assert.ok(
    Number.isFinite(maxAge) && maxAge <= 86400,
    `/avatars/(.*) is cached for ${maxAge}s. These URLs are unhashed and are persisted in ` +
      `profiles.arena_avatar_url, so a corrected avatar cannot be invalidated by renaming the ` +
      `file - this header is the only lever, and a long TTL means a fix reaches the origin and ` +
      `not the player. Keep stale-while-revalidate high instead: the cached copy is still served ` +
      `instantly and the fresh one is fetched behind it.`
  );
});

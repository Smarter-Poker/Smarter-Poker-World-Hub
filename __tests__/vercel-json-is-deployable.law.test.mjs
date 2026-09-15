// ----------------------------------------------------------------------------
// vercel.json IS DEPLOYABLE (law, 2026-09-08)
//
// A schema-invalid vercel.json does not fail a check, fail a build, or produce
// a build log. It fails the DEPLOYMENT, instantly, with no output at all -
// which means main stops publishing and every green tick keeps saying it is
// fine. Measured today:
//
//   dpl_AAgsN6wMKSxsdks1kmjki7kkAABc  state ERROR  buildingAt == ready
//   "The `vercel.json` schema validation failed with the following message:
//    `headers[31]` should NOT have additional property `_comment`"
//   get_deployment_build_logs -> "No build log events found."
//
// One `_comment` key, added in #1632 to explain a cache decision, stopped the
// World Hub publishing. Nothing in CI could see it: the file is valid JSON,
// so every JSON.parse in the repo was happy, and Vercel is the only thing that
// applies the schema - after merge, at deploy time.
//
// vercel.json has no comment syntax. That is the whole reason this file exists
// instead: the knowledge that was in the comment is asserted here, where it
// cannot be ignored and cannot break a deploy.
//
// IT HAPPENED AGAIN on 2026-09-09, with a different schema rule, and this file
// did not catch it because it only knew about the first one:
//
//   dpl_AxmHg6vwG5Cr5Vg2sBt88R6Vqd9j  state ERROR
//   dpl_EHr4CF2B4TuwHmBqangQNQ5pPFgr  state ERROR
//   "The `vercel.json` schema validation failed with the following message:
//    `buildCommand` should NOT be longer than 256 characters"
//
// Chaining a second asset-copy script into buildCommand took it to 280. TWO
// production deploys errored before anybody looked, and main went on showing
// green ticks the whole time. So the limits are asserted below by NUMBER, not
// by the one example that has bitten us, because the next one will be a
// different field.
// ----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
// This law already runs in the maintained prebuild check. Keep the local
// production-input regression reachable without changing the build command.
import './local-production-build-env.test.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const vercel = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8'));

test('production installation consumes the committed lock without rewriting it', () => {
  // 2026-09-15: the default npm install removed 65 libc metadata arrays from
  // the release lock. A release must reject a stale lock, not rewrite it.
  assert.equal(vercel.installCommand, 'npm ci --no-audit --no-fund');
});

// Vercel's route-object schema. Anything else is rejected at deploy time.
const ALLOWED_HEADER_KEYS = new Set(['source', 'headers', 'has', 'missing']);
const ALLOWED_REWRITE_KEYS = new Set(['source', 'destination', 'has', 'missing']);
const ALLOWED_CRON_KEYS = new Set(['path', 'schedule']);

test('no header entry carries a property Vercel will refuse', () => {
  const offenders = [];
  (vercel.headers ?? []).forEach((entry, i) => {
    for (const key of Object.keys(entry)) {
      if (!ALLOWED_HEADER_KEYS.has(key)) offenders.push(`headers[${i}].${key} (source: ${entry.source})`);
    }
  });
  assert.deepEqual(
    offenders,
    [],
    'These keys will fail deployment schema validation before a build starts, ' +
      'with no build log to read:\n  ' + offenders.join('\n  ') +
      '\n\nvercel.json has no comment syntax. Put the reasoning in a test like ' +
      'this one, or in the commit message - not in the config.'
  );
});

test('no rewrite or cron entry carries a property Vercel will refuse', () => {
  const offenders = [];
  (vercel.rewrites ?? []).forEach((e, i) => {
    for (const k of Object.keys(e)) if (!ALLOWED_REWRITE_KEYS.has(k)) offenders.push(`rewrites[${i}].${k}`);
  });
  (vercel.crons ?? []).forEach((e, i) => {
    for (const k of Object.keys(e)) if (!ALLOWED_CRON_KEYS.has(k)) offenders.push(`crons[${i}].${k}`);
  });
  assert.deepEqual(offenders, [], `unknown keys: ${offenders.join(', ')}`);
});

test('every header entry is actually shaped like a header entry', () => {
  (vercel.headers ?? []).forEach((entry, i) => {
    assert.equal(typeof entry.source, 'string', `headers[${i}].source must be a string`);
    assert.ok(Array.isArray(entry.headers), `headers[${i}].headers must be an array`);
    entry.headers.forEach((h, j) => {
      assert.equal(typeof h.key, 'string', `headers[${i}].headers[${j}].key`);
      assert.equal(typeof h.value, 'string', `headers[${i}].headers[${j}].value`);
    });
  });
});

// -- The knowledge the deleted _comment carried, kept as an assertion --------

test('AVATARS ARE NOT CACHED FOR A MONTH', () => {
  // Verbatim reasoning from the comment removed in the hotfix, because it is
  // right and it should survive:
  //
  //   "A background remover had punched holes through 86 of the 100 avatars;
  //    the repair shipped, production served it, and every returning player
  //    kept the torn art for up to a month because this said so.
  //    stale-while-revalidate does the work: the cached copy is still served
  //    instantly, the fresh one is fetched behind it, so the cost is one
  //    conditional GET per avatar per day and no added latency.
  //    Do not put this back to 30 days on a bandwidth pass without a way to
  //    invalidate these URLs - they are unhashed and their values are
  //    persisted in profiles.arena_avatar_url, so a filename bump is not
  //    cheap."
  const entry = (vercel.headers ?? []).find((e) => e.source === '/avatars/(.*)');
  assert.ok(entry, 'the /avatars/(.*) header entry is gone');

  const cacheControl = entry.headers.find((h) => h.key === 'Cache-Control')?.value;
  assert.ok(cacheControl, '/avatars/(.*) must set Cache-Control');

  const maxAge = Number(cacheControl.match(/max-age=(\d+)/)?.[1]);
  assert.ok(Number.isFinite(maxAge), `could not read max-age from "${cacheControl}"`);
  assert.ok(
    maxAge <= 86400,
    `/avatars/ max-age is ${maxAge}s. Avatar URLs are unhashed and persisted in ` +
      `profiles.arena_avatar_url, so a repaired image cannot be invalidated by ` +
      `renaming it - a long max-age means returning players keep the broken art ` +
      `for that long while every check reports the fix is live.`
  );
  assert.match(
    cacheControl,
    /stale-while-revalidate=\d+/,
    'stale-while-revalidate is what makes the short max-age free: the cached ' +
      'copy is still served instantly and the fresh one is fetched behind it'
  );
});

// ----------------------------------------------------------------------------
// LENGTH LIMITS. Vercel enforces these at deploy time and nowhere earlier.
// ----------------------------------------------------------------------------

/** Vercel's documented schema maxima for the string fields this repo sets. */
const MAX_LENGTH = {
    buildCommand: 256,
    installCommand: 256,
    devCommand: 256,
    ignoreCommand: 256,
    outputDirectory: 256,
};

test('no command in vercel.json is longer than the schema allows', () => {
    const config = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8'));
    for (const [field, max] of Object.entries(MAX_LENGTH)) {
        const value = config[field];
        if (typeof value !== 'string') continue;
        assert.ok(
            value.length <= max,
            `${field} is ${value.length} characters, and Vercel refuses the whole deployment above ${max}. `
            + 'Move the steps into one script rather than chaining another into the command.',
        );
    }
});

test('the build command is kept short by a script, not by luck', () => {
    // 239 of 256 is not much room. The next person to add a build step should
    // add it to scripts/copy-reader-assets.mjs, or to whatever script the
    // command already calls, rather than to the command.
    const config = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8'));
    assert.match(config.buildCommand, /copy-reader-assets\.mjs/,
        'the asset copies belong behind one script, which is what keeps this under the limit');
    assert.doesNotMatch(config.buildCommand, /copy-tesseract-assets\.mjs/, 'chained directly, this overflowed');
    assert.doesNotMatch(config.buildCommand, /copy-pdfjs-assets\.mjs/);
});

test('the one script still runs both copies, before next build', () => {
    const script = readFileSync(join(ROOT, 'scripts/copy-reader-assets.mjs'), 'utf8');
    assert.match(script, /copy-tesseract-assets\.mjs/);
    assert.match(script, /copy-pdfjs-assets\.mjs/);
    // A missing engine is a reader that never works, so a failed copy must
    // fail the build rather than be skipped.
    assert.match(script, /process\.exit\(run\.status \|\| 1\)/);

    const config = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8'));
    const copyAt = config.buildCommand.indexOf('copy-reader-assets.mjs');
    const buildAt = config.buildCommand.indexOf('next build');
    assert.ok(copyAt >= 0 && buildAt >= 0 && copyAt < buildAt);

    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    assert.match(pkg.scripts.prebuild, /copy-reader-assets\.mjs/, 'a local build must generate them too');
});

/**
 * SOURCE CONTRACT: one shared availability-freshness bound, everywhere.
 *
 * A persisted YouTube verification is accepted for at most 7 days with at most
 * 5 minutes of future clock skew. The authority is the INSTALLED production
 * SQL in supabase/migrations/20260906235959_video_reels_integrity_foundation.sql
 * (never edited here). Every JavaScript reader, the Python renewal target and
 * the verifier's daily capacity are pinned to it so they cannot drift apart
 * again: a 24-hour JavaScript bound over a 7-day SQL view made the catalog
 * API's total/hasMore disagree with the rows it returned, and one daily
 * 500-row run cannot renew ~1,417 rows inside 24 hours.
 *
 * This pins an expiry bound. It does not admit unknown, NULL, unverified or
 * non-embeddable records; those remain covered by
 * video-library-access-phase-9.test.mjs and the SQL predicates asserted below.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

const AVAILABILITY = read('../src/lib/videoLibraryAvailability.js');
const REELS_CLIENT = read('../src/lib/reelsFeedClient.js');
const REELS_SERVER = read('../src/lib/server/reelsFeed.js');
const SOCIAL_FEED_API = read('../pages/api/social/feed.js');
const CATALOG_API = read('../pages/api/video-library/catalog.js');
const MIGRATION = read('../supabase/migrations/20260906235959_video_reels_integrity_foundation.sql');
const PUBLISHER = read('../scripts/video_library_to_reels.py');
const DISPATCHER = read('../scripts/openclaw-cron-dispatcher.py');

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const CONTRACT_MAX_AGE_DAYS = 7;
const CONTRACT_MAX_AGE_MS = CONTRACT_MAX_AGE_DAYS * DAY_MS;
const CONTRACT_FUTURE_SKEW_MINUTES = 5;
const CONTRACT_FUTURE_SKEW_MS = CONTRACT_FUTURE_SKEW_MINUTES * MINUTE_MS;

// Poker (cash + tournament) rows in video_library_videos on 20 Sep 2026. The
// capacity invariant below demands twice this, so the catalog can double before
// one daily run stops covering every row inside the 7-day bound. If the catalog
// outgrows the headroom, raise the dispatcher limit or the run frequency; do
// not lower this number.
const POKER_ROW_COUNT_20_SEP_2026 = 1_417;
const CAPACITY_HEADROOM_FACTOR = 2;

const availabilityModule = await import(
  `data:text/javascript;base64,${Buffer.from(AVAILABILITY).toString('base64')}`
);

// Evaluates a literal product such as `7 * 24 * 60 * 60 * 1_000`. Anything
// that is not digits, underscores, spaces and `*` is rejected, not evaluated.
function evaluateLiteralProduct(expression, label) {
  assert.match(expression, /^[\d_\s*]+$/, `${label} must be a literal numeric product, got: ${expression}`);
  return expression
    .split('*')
    .map(factor => {
      const digits = factor.trim().replace(/_/g, '');
      assert.match(digits, /^\d+$/, `${label} has a malformed factor: ${factor}`);
      return Number(digits);
    })
    .reduce((product, factor) => product * factor, 1);
}

function constantInitializer(source, name, label) {
  const matches = [...source.matchAll(new RegExp(`^const ${name} = ([^;\\n]+);`, 'gm'))];
  assert.equal(matches.length, 1, `${label} must declare ${name} exactly once`);
  return matches[0][1].trim();
}

function sqlFunctionBody(name) {
  const header = `CREATE OR REPLACE FUNCTION public.${name}(`;
  const start = MIGRATION.indexOf(header);
  assert.notEqual(start, -1, `${name} must be defined by the installed migration`);
  assert.equal(
    MIGRATION.indexOf(header, start + header.length),
    -1,
    `${name} must be defined exactly once so the asserted body is the installed one`,
  );
  const end = MIGRATION.indexOf('$function$;', start);
  assert.notEqual(end, -1, `${name} must have a terminated body`);
  return MIGRATION.slice(start, end);
}

// Every interval literal compared against the given column inside a body.
function intervalsComparedWith(body, column) {
  const pattern = new RegExp(
    `${column.replace(/\./g, '\\.')}\\s*(<=|>=|<|>)\\s*now\\(\\)\\s*([+-])\\s*interval\\s+'([^']+)'`,
    'g',
  );
  return [...body.matchAll(pattern)].map(match => ({
    operator: match[1],
    sign: match[2],
    interval: match[3],
  }));
}

test('the shared JavaScript contract is exactly 7 days with 5 minutes of future skew', () => {
  assert.equal(availabilityModule.VIDEO_LIBRARY_VERIFICATION_MAX_AGE_MS, 7 * 24 * 60 * 60 * 1000);
  assert.equal(availabilityModule.VIDEO_LIBRARY_MAX_FUTURE_SKEW_MS, 5 * 60 * 1000);
  assert.equal(availabilityModule.VIDEO_LIBRARY_VERIFICATION_MAX_AGE_MS, CONTRACT_MAX_AGE_MS);
  assert.equal(availabilityModule.VIDEO_LIBRARY_MAX_FUTURE_SKEW_MS, CONTRACT_FUTURE_SKEW_MS);

  // The module is loaded through data: URLs by tests, so it stays import-free,
  // and its own gate must use the exported values, not a private duplicate.
  assert.doesNotMatch(AVAILABILITY, /^import\s/m);
  assert.match(
    AVAILABILITY,
    /age > VIDEO_LIBRARY_VERIFICATION_MAX_AGE_MS \|\| age < -VIDEO_LIBRARY_MAX_FUTURE_SKEW_MS/,
  );
  // Exactly one day-scale literal remains in the module: the exported 7-day
  // bound. A private 24-hour (or any other) verification age may not return.
  const dayScaleLiterals = [...AVAILABILITY.matchAll(
    /^(?:export )?const (\w+) = ((?:\d[\d_]* \* )*24 \* 60 \* 60 \* 1_?000);/gm,
  )];
  assert.deepEqual(
    dayScaleLiterals.map(match => match[1]),
    ['VIDEO_LIBRARY_VERIFICATION_MAX_AGE_MS'],
  );
  assert.equal(
    evaluateLiteralProduct(dayScaleLiterals[0][2], 'VIDEO_LIBRARY_VERIFICATION_MAX_AGE_MS'),
    CONTRACT_MAX_AGE_MS,
  );
  for (const name of [
    'fn_is_video_library_asset_eligible',
    'fn_has_fresh_public_youtube_verification',
    'publish_video_library_reel',
    'fn_guard_youtube_native_transcode_job',
  ]) {
    assert.match(AVAILABILITY, new RegExp(name), `the contract comment must cite ${name}`);
  }
});

test('the availability gate behaves at the contract boundary', () => {
  const { isVideoLibraryVideoAllowed } = availabilityModule;
  const HOUR_MS = 60 * MINUTE_MS;
  const video = checkedAtMs => ({
    videoId: 'M7lc1UVf-VE',
    type: 'cash',
    availabilityStatus: 'verified',
    embeddable: true,
    availabilityCheckedAt: new Date(checkedAtMs).toISOString(),
  });
  const now = Date.now();
  assert.equal(isVideoLibraryVideoAllowed(video(now - (CONTRACT_MAX_AGE_MS - HOUR_MS))), true);
  assert.equal(isVideoLibraryVideoAllowed(video(now - (CONTRACT_MAX_AGE_MS + HOUR_MS))), false);
  assert.equal(isVideoLibraryVideoAllowed(video(now + (CONTRACT_FUTURE_SKEW_MS - MINUTE_MS))), true);
  assert.equal(isVideoLibraryVideoAllowed(video(now + (CONTRACT_FUTURE_SKEW_MS + HOUR_MS))), false);
});

test('the import-free Reels client literal equals the shared contract', () => {
  assert.doesNotMatch(REELS_CLIENT, /^import\s/m,
    'reelsFeedClient.js is loaded through a data: URL and must stay import-free');
  assert.equal(
    evaluateLiteralProduct(
      constantInitializer(REELS_CLIENT, 'VERIFICATION_MAX_AGE_MS', 'reelsFeedClient.js'),
      'reelsFeedClient VERIFICATION_MAX_AGE_MS',
    ),
    availabilityModule.VIDEO_LIBRARY_VERIFICATION_MAX_AGE_MS,
  );
  assert.equal(
    evaluateLiteralProduct(
      constantInitializer(REELS_CLIENT, 'MAX_FUTURE_SKEW_MS', 'reelsFeedClient.js'),
      'reelsFeedClient MAX_FUTURE_SKEW_MS',
    ),
    availabilityModule.VIDEO_LIBRARY_MAX_FUTURE_SKEW_MS,
  );
  assert.match(REELS_CLIENT, /VIDEO_LIBRARY_VERIFICATION_MAX_AGE_MS/,
    'the literal must point maintainers at the shared contract');
  assert.match(REELS_CLIENT, /assetAge <= VERIFICATION_MAX_AGE_MS[\s\S]{0,80}assetAge >= -MAX_FUTURE_SKEW_MS/);
});

test('the server Reel reader and the social feed import the shared constants', () => {
  for (const [label, source, importPath, ageName] of [
    ['src/lib/server/reelsFeed.js', REELS_SERVER, '../videoLibraryAvailability', 'LIBRARY_VERIFICATION_MAX_AGE_MS'],
    ['pages/api/social/feed.js', SOCIAL_FEED_API, '../../../src/lib/videoLibraryAvailability', 'VERIFY_MAX_AGE_MS'],
  ]) {
    const importBlock = source.match(
      new RegExp(`import \\{([^}]*)\\} from '${importPath.replace(/\./g, '\\.')}';`),
    );
    assert.ok(importBlock, `${label} must import from the shared availability module`);
    assert.match(importBlock[1], /\bVIDEO_LIBRARY_VERIFICATION_MAX_AGE_MS\b/, label);
    assert.match(importBlock[1], /\bVIDEO_LIBRARY_MAX_FUTURE_SKEW_MS\b/, label);

    // The local names are aliases of the shared exports, never literals.
    assert.equal(
      constantInitializer(source, ageName, label),
      'VIDEO_LIBRARY_VERIFICATION_MAX_AGE_MS',
      `${label} must not restate the verification age`,
    );
    assert.equal(
      constantInitializer(source, 'MAX_FUTURE_SKEW_MS', label),
      'VIDEO_LIBRARY_MAX_FUTURE_SKEW_MS',
      `${label} must not restate the future skew`,
    );

    // The only remaining day-scale literal is the separate legacy-transition
    // window. No other 7-day or 24-hour literal may describe verification age.
    const dayScaleLiterals = [...source.matchAll(/^const (\w+) = ((?:\d[\d_]* \* )*24 \* 60 \* 60 \* 1_?000);/gm)]
      .map(match => match[1]);
    assert.deepEqual(dayScaleLiterals, ['LEGACY_TRANSITION_MAX_REMAINING_MS'], label);
    assert.doesNotMatch(source, /\b5 \* 60 \* 1_?000\b/, `${label} must not restate the 5 minute skew`);

    // And the aliases are what the asset-verification comparison really uses.
    assert.match(
      source,
      new RegExp(`nowMs - checkedAt <= ${ageName}\\s*&& checkedAt <= nowMs \\+ MAX_FUTURE_SKEW_MS`),
      `${label} must compare asset verification age against the shared contract`,
    );
  }
});

test('the catalog API filters with the same gate the SQL view already applied', () => {
  assert.match(CATALOG_API, /from\('video_library_public_catalog'\)/);
  assert.match(CATALOG_API, /isVideoLibraryVideoAllowed/);
  assert.doesNotMatch(CATALOG_API, /\b24 \* 60 \* 60 \* 1_?000\b/,
    'the catalog API must not carry its own verification age');
  assert.match(
    MIGRATION,
    /CREATE OR REPLACE VIEW public\.video_library_public_catalog[\s\S]{0,1200}fn_is_video_library_asset_eligible\(v\.id\)/,
    'the paginated view must inherit the 7-day SQL predicate',
  );
});

test('every installed SQL availability predicate uses 7 days and 5 minutes', () => {
  const lowerBound = `${CONTRACT_MAX_AGE_DAYS} days`;
  const upperBound = `${CONTRACT_FUTURE_SKEW_MINUTES} minutes`;

  // Accepting predicates: checked_at >= now() - 7 days AND <= now() + 5 minutes.
  for (const [name, column] of [
    ['fn_is_video_library_asset_eligible', 'v.availability_checked_at'],
    ['fn_has_fresh_public_youtube_verification', 'verified_asset.availability_checked_at'],
    ['fn_guard_youtube_native_transcode_job', 'verified_asset.availability_checked_at'],
  ]) {
    const body = sqlFunctionBody(name);
    assert.deepEqual(
      intervalsComparedWith(body, column),
      [
        { operator: '>=', sign: '-', interval: lowerBound },
        { operator: '<=', sign: '+', interval: upperBound },
      ],
      `${name} must accept exactly the shared freshness window`,
    );
    assert.match(body, /availability_status = 'verified'/, `${name} must still require a verified status`);
    assert.match(body, /embeddable IS TRUE/i, `${name} must still require embeddable`);
  }

  // Rejecting predicate: the publisher raises outside the same window.
  const publish = sqlFunctionBody('publish_video_library_reel');
  assert.deepEqual(
    intervalsComparedWith(publish, 'v_asset.availability_checked_at'),
    [
      { operator: '<', sign: '-', interval: lowerBound },
      { operator: '>', sign: '+', interval: upperBound },
    ],
    'publish_video_library_reel must reject exactly outside the shared freshness window',
  );
  assert.match(publish, /v_asset\.availability_checked_at IS NULL/,
    'publish_video_library_reel must still reject a NULL verification time');

  // No function anywhere in the installed migration may compare
  // availability_checked_at against any other interval.
  const everyComparison = [...MIGRATION.matchAll(
    /availability_checked_at\s*(?:<=|>=|<|>)\s*now\(\)\s*[+-]\s*interval\s+'([^']+)'/g,
  )].map(match => match[1]);
  assert.ok(everyComparison.length >= 8, 'the installed availability predicates must be present');
  assert.deepEqual(
    [...new Set(everyComparison)].sort(),
    [upperBound, lowerBound].sort(),
    'availability_checked_at may only be compared with 7 days and 5 minutes',
  );
});

test('renewal is always scheduled strictly inside the 7-day expiry', () => {
  // SQL: a verified source is re-queued once it is 6 days old.
  const queue = sqlFunctionBody('fn_queue_youtube_verification');
  const requeue = intervalsComparedWith(queue, 'existing.last_verified_at');
  assert.deepEqual(requeue.map(entry => `${entry.operator}${entry.sign}`), ['>=-', '<=+']);
  const requeueDays = requeue[0].interval.match(/^(\d+) days$/);
  assert.ok(requeueDays, `re-queue interval must be whole days, got: ${requeue[0].interval}`);
  assert.equal(Number(requeueDays[1]), 6);
  assert.ok(Number(requeueDays[1]) < CONTRACT_MAX_AGE_DAYS,
    'the SQL re-queue interval must be strictly shorter than the expiry');
  assert.equal(requeue[1].interval, `${CONTRACT_FUTURE_SKEW_MINUTES} minutes`);

  // Python: the verifier treats a row as due for renewal after 12 hours.
  const refresh = PUBLISHER.match(/^VERIFICATION_REFRESH_AGE = timedelta\((hours|days)=(\d+)\)$/m);
  assert.ok(refresh, 'VERIFICATION_REFRESH_AGE must remain a literal timedelta');
  const refreshMs = Number(refresh[2]) * (refresh[1] === 'days' ? DAY_MS : 60 * MINUTE_MS);
  assert.equal(refreshMs, 12 * 60 * MINUTE_MS);
  assert.ok(refreshMs < CONTRACT_MAX_AGE_MS,
    'the Python renewal target must be shorter than the public expiry');

  // The publisher must describe the real database bound, not the retired one.
  assert.doesNotMatch(PUBLISHER, /24-hour public-playback cutoff/);
  assert.doesNotMatch(PUBLISHER, /accepts at most 24 hours/);
  assert.doesNotMatch(PUBLISHER, /Four-hour\s+batches/i);
  assert.match(PUBLISHER, /7-day public-playback cutoff/);
});

test('one daily verifier run can renew the whole poker catalog inside the expiry', () => {
  const jobs = DISPATCHER.match(/SCRIPT_JOBS = \{([\s\S]*?)\n\}/);
  assert.ok(jobs, 'SCRIPT_JOBS must remain a literal registry');
  const args = jobs[1].match(/'\/api\/cron\/video-library-reels':\s*\[([^\]]*)\]/);
  assert.ok(args, 'the Reel bridge must remain a SCRIPT_JOBS entry');
  const limit = args[1].match(/'--limit',\s*'(\d+)'/);
  assert.ok(limit, 'the Reel bridge must run with an explicit numeric --limit');
  const dailyLimit = Number(limit[1]);

  // Exactly one schedule entry, and it is a once-a-day clock time.
  const schedules = [...DISPATCHER.matchAll(
    /\('\/api\/cron\/video-library-reels',\s*dict\(([^)]*)\)\)/g,
  )].map(match => match[1]);
  assert.equal(schedules.length, 1, 'the Reel bridge must have exactly one schedule entry');
  assert.match(schedules[0], /^hour=\d{1,2},\s*minute=\d{1,2}$/,
    'the capacity invariant assumes one run per day at a fixed hour and minute');

  const rowsVerifiableInsideExpiry = dailyLimit * CONTRACT_MAX_AGE_DAYS;
  const required = CAPACITY_HEADROOM_FACTOR * POKER_ROW_COUNT_20_SEP_2026;
  assert.ok(
    rowsVerifiableInsideExpiry >= required,
    `daily --limit ${dailyLimit} x ${CONTRACT_MAX_AGE_DAYS} days = ${rowsVerifiableInsideExpiry} rows, `
      + `below the required ${required} (2 x ${POKER_ROW_COUNT_20_SEP_2026} poker rows on 20 Sep 2026). `
      + 'Cutting the limit this far lets verified rows expire before they are renewed.',
  );
});

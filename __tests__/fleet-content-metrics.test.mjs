/**
 * Fleet Content Programme Phase 10: one engine, measured (2026-10-06).
 *
 * Five numbers on the horses admin page and in the Monday digest mail come
 * from ONE database function, public.fn_fleet_content_metrics(p_days). This
 * file reads the migration that installs it, the route that serves it and the
 * panel that shows it, and pins the contract both consumers build to
 * (agent-evidence p10/rpc-contract.md):
 *
 *   - the nine top-level keys and the eight fleet job names, always present;
 *   - the feed denominator keeps horses in it (CLAUDE.md 10.5: horses are
 *     players; is_horse may identify, never exclude);
 *   - the function is read-only, service_role only, SECURITY DEFINER with a
 *     pinned search_path, and never touches the owner's two holds
 *     (horse_post_modes, content_settings.engine_enabled);
 *   - the route reaches it only through the wrapper's injected client, and
 *     the stale JavaScript mirror is gone from both the route and the panel;
 *   - the panel reads Unknown until the function has answered.
 *
 * No database here: the migration is read as text (the lead installs it in
 * production before the PR merges, CHECK 17), the route is imported and
 * exercised in __tests__/horses-routes-group-a.test.mjs.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const stripSqlComments = (sql) => sql.replace(/--[^\n]*/g, '');
const sourceFiles = (relative) => fs.readdirSync(path.join(ROOT, relative), { withFileTypes: true })
  .flatMap((entry) => {
    const child = path.join(relative, entry.name);
    return entry.isDirectory() ? sourceFiles(child) : [child];
  });

const MIGRATION_DIR = 'supabase/migrations';
const migrationFiles = fs
  .readdirSync(path.join(ROOT, MIGRATION_DIR))
  .filter((name) => /^\d{14}_fleet_content_metrics\.sql$/.test(name));
assert.equal(migrationFiles.length, 1, 'exactly one fleet_content_metrics migration, with a 14-digit UTC stamp');
const MIGRATION = `${MIGRATION_DIR}/${migrationFiles[0]}`;
const migration = read(MIGRATION);
const sql = stripSqlComments(migration);
const readinessMigrationFiles = fs
  .readdirSync(path.join(ROOT, MIGRATION_DIR))
  .filter((name) => /^\d{14}_fleet_readiness_excludes_closed_horses\.sql$/.test(name));
assert.equal(readinessMigrationFiles.length, 1, 'exactly one timestamped readiness tombstone migration');
const readinessMigration = read(`${MIGRATION_DIR}/${readinessMigrationFiles[0]}`);
const readinessSql = stripSqlComments(readinessMigration);
const seededContentRetirementFiles = fs
  .readdirSync(path.join(ROOT, MIGRATION_DIR))
  .filter((name) => /^\d{14}_retire_seeded_content_orphan\.sql$/.test(name));
assert.equal(seededContentRetirementFiles.length, 1, 'exactly one timestamped seeded_content retirement migration');
const seededContentRetirement = read(`${MIGRATION_DIR}/${seededContentRetirementFiles[0]}`);
const seededContentRetirementSql = stripSqlComments(seededContentRetirement);

const ROUTE = 'pages/api/horses/analytics.js';
const PANEL = 'src/components/horses/StatsPanel.jsx';
const route = read(ROUTE);
const panel = read(PANEL);

const TOP_LEVEL_KEYS = ['window', 'feed', 'reactions', 'captions', 'coverage', 'readiness', 'posts', 'runs', 'ledger'];
const JOB_NAMES = [
  '/cron/horse-posts',
  '/cron/horse-video-reels',
  '/cron/horses-social-all',
  '/cron/horses-social-friends',
  '/cron/horses-stories',
  '/cron/phase6-content',
  '/cron/phase7-content',
  '/cron/phase9-content',
];
const TILE_LABELS = [
  'Horse Share Of The Feed',
  'Human Reactions Per Horse Post',
  'Distinct Caption Rate',
  'Fleet Coverage',
  'Horses Not Social Ready',
];

const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
const DASH_RE = /[‒-―]/;

// ---------------------------------------------------------------- migration

test('the migration declares exactly the function the contract names', () => {
  assert.match(
    sql,
    /CREATE OR REPLACE FUNCTION public\.fn_fleet_content_metrics\(p_days integer DEFAULT 7\)\s+RETURNS jsonb\s+LANGUAGE plpgsql\s+STABLE\s+SECURITY DEFINER\s+SET search_path TO 'public', 'extensions'/,
    'name, signature, return type, volatility, SECURITY DEFINER and a pinned search_path'
  );
  assert.equal(
    (sql.match(/CREATE OR REPLACE FUNCTION/g) || []).length,
    1,
    'this file creates one function and amends nothing else'
  );
  assert.doesNotMatch(sql, /fn_horses_not_social_ready\s*\(\s*\)\s+RETURNS/i, 'the drift detector is not redefined here');
  assert.match(sql, /COMMENT ON FUNCTION public\.fn_fleet_content_metrics\(integer\)/);
});

test('the function is service_role only, owned by postgres', () => {
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.fn_fleet_content_metrics\(integer\)\s+FROM PUBLIC, anon, authenticated;/);
  assert.match(sql, /ALTER FUNCTION public\.fn_fleet_content_metrics\(integer\)\s+OWNER TO postgres;/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.fn_fleet_content_metrics\(integer\)\s+TO service_role;/);
  assert.doesNotMatch(sql, /GRANT EXECUTE ON FUNCTION public\.fn_fleet_content_metrics\(integer\)\s+TO (?:authenticated|anon|PUBLIC)/i);
  // The post-apply block proves the grants on the live database, not just here.
  assert.match(sql, /has_function_privilege\('service_role', 'public\.fn_fleet_content_metrics\(integer\)', 'EXECUTE'\)/);
  assert.match(sql, /has_function_privilege\('anon', 'public\.fn_fleet_content_metrics\(integer\)', 'EXECUTE'\)/);
});

test('the window is clamped to 1..365 and never an error', () => {
  assert.match(sql, /LEAST\(GREATEST\(coalesce\(p_days, 7\), 1\), 365\)/);
  assert.match(sql, /make_interval\(days => v_days\)/);
  assert.match(sql, /fn_fleet_content_metrics\(0\) -> 'window' ->> 'days'\)::integer IS DISTINCT FROM 1/);
  assert.match(sql, /fn_fleet_content_metrics\(400\) -> 'window' ->> 'days'\)::integer IS DISTINCT FROM 365/);
  assert.doesNotMatch(sql, /RAISE EXCEPTION '[^']*p_days[^']*out of range/i);
});

test('every top-level key and every fleet job name is always present, in the contract order', () => {
  const returned = sql.slice(sql.indexOf('RETURN jsonb_build_object('), sql.indexOf('$function$;'));
  assert.ok(returned.length > 0, 'the function returns one jsonb_build_object');
  let last = -1;
  for (const key of TOP_LEVEL_KEYS) {
    const at = returned.indexOf(`'${key}',`);
    assert.ok(at > last, `key ${key} is returned, after the one before it`);
    last = at;
  }
  // The eight jobs come from a VALUES list with an ordinal, left-joined to the
  // log, so a job with no row in the window is still an element with zeros.
  const runs = sql.slice(sql.indexOf('INTO v_not_ready'), sql.indexOf('INTO v_phrases'));
  last = -1;
  JOB_NAMES.forEach((job, i) => {
    const at = runs.indexOf(`(${i + 1}, '${job}')`);
    assert.ok(at > last, `job ${job} is ordinal ${i + 1}`);
    last = at;
  });
  assert.match(runs, /LEFT JOIN \(/);
  assert.match(runs, /ORDER BY j\.ord/);
  for (const key of ['runs', 'succeeded', 'errored', 'killed', 'skipped_runs', 'engine_off_runs', 'due', 'posted', 'failed', 'collided', 'enqueued']) {
    assert.match(runs, new RegExp(`'${key}',\\s+coalesce\\(r\\.${key}, 0\\)`), `runs.${key} is zero when the window has no row`);
  }
  // Only a JSON number is summed; a skipped run is a string in result.skipped.
  assert.match(runs, /jsonb_typeof\(l\.result -> 'skipped'\) = 'string'/);
  assert.match(runs, /l\.result ->> 'skipped' = 'engine_disabled'/);
  assert.match(runs, /FILTER \(WHERE jsonb_typeof\(l\.result -> 'due'\) = 'number'\)/);

  const phrases = sql.slice(sql.indexOf('INTO v_runs'), sql.indexOf('INTO v_assets'));
  assert.match(phrases, /\(1, 'caption'\), \(2, 'meaning'\), \(3, 'frame'\)/);
  assert.match(phrases, /ORDER BY k\.ord/);
  assert.match(phrases, /count\(\*\) FILTER \(WHERE l\.n > 1\)\s+AS rows_that_repeat/);

  // The post-apply block asserts the same shape on the live database.
  for (const key of TOP_LEVEL_KEYS) assert.ok(migration.includes(`'${key}'`), `post-apply names ${key}`);
  assert.match(sql, /jsonb_array_length\(v -> 'runs'\) IS DISTINCT FROM 8/);
  assert.match(sql, /jsonb_array_length\(v -> 'ledger' -> 'phrases'\) IS DISTINCT FROM 3/);
  assert.match(sql, /v := public\.fn_fleet_content_metrics\(7\);/);
});

test('horses are players: the feed denominator keeps them in', () => {
  const feed = sql.slice(sql.indexOf('v_since := v_until'), sql.indexOf('INTO v_horse_posts'));
  assert.ok(feed.length > 0, 'the feed block is found');
  assert.match(feed, /'feed_posts',\s+count\(\*\),/, 'the denominator is every post the feed shows');
  assert.match(feed, /'horse_posts',\s+count\(\*\) FILTER \(WHERE p\.is_horse IS TRUE\)/, 'is_horse identifies the numerator');
  assert.match(feed, /LEFT JOIN public\.profiles p ON p\.id = sp\.author_id/, 'a post without a profile row still counts in the feed');
  assert.match(feed, /sp\.is_deleted IS NOT TRUE/);
  assert.match(feed, /\(sp\.visibility = 'public' OR sp\.visibility IS NULL\)/, 'the public feed filter, pages/api/social/feed.js');
  assert.doesNotMatch(feed, /is_horse\s*(?:=\s*false|IS\s+NOT\s+TRUE|IS\s+FALSE)/i, 'no horse is removed from the feed count');
  assert.doesNotMatch(feed, /NOT\s+p\.is_horse/i);
  // Nowhere in the file does an is_horse predicate remove a horse from a
  // count a human is in: the only IS NOT TRUE on is_horse identifies the
  // human reactor, which is the stat's own definition.
  const exclusions = [...sql.matchAll(/(\w+)\.is_horse IS NOT TRUE/g)].map((m) => m[1]);
  assert.deepEqual(exclusions, ['u', 'u'], 'is_horse IS NOT TRUE names only the reacting account, once for likes and once for comments');
  assert.doesNotMatch(sql, /is_horse\s*=\s*false/i);
});

test('the function never writes and the owner holds stay untouched', () => {
  assert.doesNotMatch(sql, /\b(?:UPDATE|DELETE\s+FROM|TRUNCATE|INSERT\s+INTO)\b/i, 'a metrics function reads');
  assert.doesNotMatch(sql, /horse_post_modes/i, 'the mode approvals are not read or written');
  assert.doesNotMatch(sql, /engine_enabled\s*=/i, 'the engine switch is never set');
  // content_settings is counted once by the post-apply block and nothing else.
  assert.match(sql, /SELECT count\(\*\) INTO n FROM public\.content_settings;/);
  assert.match(sql, /content_settings must hold exactly one row/);
  assert.equal((sql.match(/content_settings/g) || []).length, 3, 'pre-flight column check, the count and its message');
  assert.match(sql, /FROM public\.fn_horses_not_social_ready\(\);/, 'readiness is the raw count of the drift detector');
});

test('the readiness count excludes retired tombstones and preserves live drift', () => {
  const body = readinessSql.slice(
    readinessSql.indexOf('CREATE OR REPLACE FUNCTION public.fn_horses_not_social_ready()'),
    readinessSql.indexOf('COMMENT ON FUNCTION public.fn_horses_not_social_ready()')
  );
  assert.match(body, /p\.status IS DISTINCT FROM 'deleted'/);
  assert.match(body, /p\.horse_status IS DISTINCT FROM 'disabled'/);
  assert.match(body, /ca\.profile_id IS NULL OR NOT ca\.is_active/);
  assert.doesNotMatch(body, /ca\.is_active IS TRUE/);
  assert.match(readinessSql, /SECURITY INVOKER/);
  assert.match(readinessSql, /ALTER FUNCTION public\.fn_horses_not_social_ready\(\) OWNER TO postgres;/);
  assert.match(readinessSql, /GRANT EXECUTE ON FUNCTION public\.fn_horses_not_social_ready\(\)\s+TO service_role;/);
  assert.match(readinessSql, /has_function_privilege\('authenticated', 'public\.fn_horses_not_social_ready\(\)', 'EXECUTE'\)/);
});

test('Phase 10 retires only the audited seeded_content orphan and preserves its rows', () => {
  assert.match(seededContentRetirement, /^-- TIER:\s+3\b/m);
  assert.match(seededContentRetirement, /^-- IRREVERSIBLE:\s+no\b/m);
  assert.match(seededContentRetirementSql, /v_rows IS DISTINCT FROM 18/);
  assert.match(seededContentRetirementSql, /2026-01-13 00:00:00\+00/);
  assert.match(seededContentRetirementSql, /2026-01-15 00:00:00\+00/);
  assert.match(seededContentRetirementSql, /fk\.confrelid = 'public\.seeded_content'::regclass/);
  assert.match(seededContentRetirementSql, /view_rel\.relkind IN \('v', 'm'\)/);
  assert.match(seededContentRetirementSql, /pg_get_functiondef\(p\.oid\) ILIKE '%seeded_content%'/);
  assert.match(seededContentRetirementSql, /ALTER TABLE public\.seeded_content\s+RENAME TO seeded_content_retired_20261009;/);
  assert.match(seededContentRetirementSql, /SELECT count\(\*\) INTO v_rows\s+FROM public\.seeded_content_retired_20261009;/);
  assert.doesNotMatch(seededContentRetirementSql, /DROP TABLE/i);
  assert.doesNotMatch(seededContentRetirementSql, /ALTER TABLE public\.(?:content_authors|content_schedule)/i);
  assert.equal(
    fs.existsSync(path.join(ROOT, 'supabase/migrations/archive/008_seeded_content.sql')),
    true,
    'the historical migration remains intact'
  );
  const runtimeReferences = ['pages', 'src', 'scripts']
    .flatMap(sourceFiles)
    .filter((file) => /\.(?:js|jsx|mjs|cjs|ts|tsx|py)$/.test(file))
    .filter((file) => read(file).includes('seeded_content'));
  assert.deepEqual(runtimeReferences, [], 'active runtime source does not revive the retired table');
});

test('the migration follows the safety template', () => {
  for (const field of ['TIER:', 'AUTHOR:', 'AFFECTS:', 'IRREVERSIBLE:', 'WHY:', 'HOW:', 'EVIDENCE']) {
    assert.ok(migration.includes(field), `header must carry ${field}`);
  }
  assert.match(migration, /^-- TIER:\s+3\b/m, 'a new SECURITY DEFINER function is Tier 3');
  assert.match(migration, /\nBEGIN;\n/);
  assert.match(migration, /\nCOMMIT;\n/);
  assert.match(migration, /1\. PRE-FLIGHT/);
  assert.match(migration, /POST-APPLY ASSERTIONS/);
  assert.match(migration, /information_schema\.columns/, 'the pre-flight proves every column it reads');
  const rollback = migration.slice(migration.indexOf('-- ROLLBACK'));
  assert.ok(rollback.length > 0, 'a Tier 3 migration carries a rollback block');
  assert.match(rollback, /DROP FUNCTION IF EXISTS public\.fn_fleet_content_metrics\(integer\);/);
  for (const line of rollback.split('\n').filter((l) => l.trim().length > 0)) {
    assert.ok(line.startsWith('--'), `rollback line is commented out: ${line}`);
  }
  assert.doesNotMatch(migration, DASH_RE, 'no en dash, em dash, figure dash or horizontal bar');
  assert.doesNotMatch(migration, EMOJI_RE, 'no emoji');
  assert.doesNotMatch(migration, /\bbots?\b/i, 'horses are horses');
});

// ---------------------------------------------------------------- route

test('the analytics route serves summary from fn_fleet_content_metrics through the injected client', () => {
  assert.match(route, /const TYPES = \['summary'\];/, 'the mirror types errors, top-horses and clips are gone');
  assert.match(route, /db\.rpc\('fn_fleet_content_metrics', \{ p_days: days \}\)/);
  assert.match(route, /export async function handle\(\{ db, query \}\)/, 'the wrapper injects the service-role client');
  assert.match(route, /int\(rawDays, \{ min: 1, max: 365, fallback: null \}\)/);
  assert.match(route, /new ApiError\(503, 'Analytics Is Unavailable', 'analytics_unavailable'\)/);
  assert.match(route, /return \{ data: metrics, window_days: days \};/);
  for (const gone of ['HorseAlertingService', 'ClipUsageTracker', 'content-engine', 'sourceDistribution', 'getAnalyticsSummary', 'createClient', 'SUPABASE_SERVICE_ROLE_KEY', 'kuklfnapbkmacvwxktbh']) {
    assert.ok(!route.includes(gone), `${gone} is gone from the route`);
  }
  assert.doesNotMatch(route, /await import\(/, 'nothing is imported dynamically any more');
  assert.doesNotMatch(route, /\.single\(/);
  assert.doesNotMatch(route, /result\.error\.message[^;]*(?:ApiError|badRequest|return)/, 'database text never reaches a response');
});

// ---------------------------------------------------------------- panel

test('the Stats tab shows the five metrics with their denominators, from the pinned analytics URL', () => {
  assert.match(panel, /import KpiTile from '\.\/KpiTile';/);
  assert.match(panel, /authFetch\('\/api\/horses\/analytics\?type=summary'\)/);
  for (const label of TILE_LABELS) {
    assert.ok(panel.includes(`label: '${label}',`), `tile ${label}`);
    for (const word of label.split(' ')) assert.match(word, /^[A-Z]/, `${label}: ${word} is Title Case`);
  }
  assert.equal((panel.match(/label: '/g) || []).length, 5, 'five tiles, no more');
  assert.match(panel, />Content Engine, Last 7 Days</, 'the window label');
  // Each value reads from the key the contract names.
  for (const key of ['feed?.horse_share_pct', 'reactions?.per_horse_post', 'captions?.distinct_caption_pct', 'coverage?.coverage_pct', 'readiness?.horses_not_social_ready']) {
    assert.ok(panel.includes(key), `the panel reads ${key}`);
  }
  // Each hint names the denominator, and the readiness hint names its function.
  assert.match(panel, /Horse Posts Of \$\{count\(feed\?\.feed_posts\)\} Feed Posts/);
  assert.match(panel, /Likes Plus \$\{count\(reactions\?\.human_comments\)\} Comments By Humans/);
  assert.match(panel, /Distinct First Lines Of \$\{count\(captions\?\.horse_posts\)\} Horse Posts/);
  assert.match(panel, /Horses Posted Of \$\{count\(coverage\?\.fleet_size\)\}/);
  assert.match(panel, /coverage_pct_of_1000/);
  assert.match(panel, /Rows Returned By fn_horses_not_social_ready/);
});

test('the Stats tab is honest: Unknown until the function answers, the unavailable state on a 503', () => {
  assert.match(panel, /const UNKNOWN = 'Unknown';/);
  assert.match(panel, /return isNumber\(value\) \? `\$\{Number\(value\)\.toFixed\(1\)\}%` : UNKNOWN;/);
  assert.match(panel, /return num\(value, UNKNOWN\);/);
  assert.match(panel, /Analytics Unavailable: \{analyticsError\}/);
  assert.match(panel, /setAnalytics\(null\); setAnalyticsError\(/, 'a failed read clears the previous numbers');
  assert.match(panel, /Promise\.allSettled/);
  for (const gone of ['sourceDistribution', 'HorseAlertingService', 'statCardLarge', 'contentBreakdown', 'pipeline_runs', '/api/horses/roster', 'activeHorses', 'totalPosts']) {
    assert.ok(!panel.includes(gone), `${gone} is gone from the panel`);
  }
  assert.doesNotMatch(panel, DASH_RE);
  assert.doesNotMatch(panel, EMOJI_RE);
  assert.doesNotMatch(panel, /#[0-9a-fA-F]{3,8}\b/, 'no raw hex colour');
  assert.doesNotMatch(panel, /setInterval/);
});

// Wrong PokerAtlas slugs and duplicate rooms are fixed in the data, with proof.
//
// 20261128080000_pokeratlas_slugs_from_the_rooms_own_page.sql
//   Six listed rooms carried a made-up "<name>-<city>" pokeratlas_slug that
//   names no PokerAtlas page. Each gets the slug its own pokeratlas_url names,
//   and only when the PokerAtlas catalog saved under that slug carries the
//   room's name. 3435, an already-hidden FireKeepers duplicate holding 3383's
//   slug, is retired into 3383 so the slug index lets 3383 have it.
// 20261128080100_duplicate_rooms_retired_into_their_canonical_row.sql
//   Daytona (2037 -> 3402), Silks (1948 -> 3454) and Bally's Lincoln
//   (1892, 3427 -> 3467) are retired, never deleted, the same way as the nine
//   earlier retirements. Aggieland (3353 / 3088) is two rooms and is untouched.
//
// The source checks always run. The behaviour checks run both migrations,
// unchanged, on a scratch PostgreSQL cluster when PostgreSQL 16/17 binaries
// are installed and the test is not running as root; otherwise they skip.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const repoRoot = resolve(import.meta.dirname, '..');
const slugPath = join(repoRoot, 'supabase/migrations/20261128080000_pokeratlas_slugs_from_the_rooms_own_page.sql');
const dupePath = join(repoRoot, 'supabase/migrations/20261128080100_duplicate_rooms_retired_into_their_canonical_row.sql');
const identityPath = join(repoRoot, 'supabase/migrations/20260907032000_pokeratlas_derived_venue_identity_contract.sql');
const slugSql = readFileSync(slugPath, 'utf8');
const dupeSql = readFileSync(dupePath, 'utf8');
const activeSlugSql = slugSql.split('-- ROLLBACK')[0];
const activeDupeSql = dupeSql.split('-- ROLLBACK')[0];

test('slugs come from the room\'s own page and its saved catalog, never from a guess', () => {
  for (const [id, oldSlug, newSlug] of [
    [3352, 'jamul-casino-jamul', 'jamul-casino'],
    [3383, 'firekeepers-casino-battle-creek', 'firekeepers-battle-creek'],
    [3397, 'seminole-hard-rock-hollywood-hollywood', 'hard-rock-hollywood-ft-lauderdale'],
    [3398, 'texas-card-house-houston-katy', 'texas-card-house-houston'],
    [3413, 'hollywood-park-casino-inglewood', 'hollywood-park-inglewood'],
    [3402, 'daytona-racing-and-card-club-daytona-beach', 'daytona-beach'],
  ]) {
    assert.match(activeSlugSql, new RegExp(`\\(${id}, '[^']+',\\s+'${oldSlug}',\\s+'${newSlug}'`));
  }
  assert.match(activeSlugSql, /public\.pnm_pokeratlas_room_slug\(v\.pokeratlas_url\) = f\.new_slug/);
  assert.match(activeSlugSql, /t\.observation_kind = 'catalog'\s+AND t\.venue_name = f\.catalog_name/);
  assert.match(activeSlugSql, /UPDATE public\.poker_venues v\s+SET pokeratlas_slug = f\.new_slug/);
  // Exact counts, asserted both ways.
  assert.match(activeSlugSql, /RAISE EXCEPTION 'corrected % slugs, expected 6'/);
  assert.match(activeSlugSql, /enrichment log rows, expected 7/);
  // Only the slug changes on the six rooms.
  assert.doesNotMatch(activeSlugSql, /SET (?:name|address|games_offered|last_verified_at)\b/);
  assert.doesNotMatch(activeSlugSql + activeDupeSql, /DELETE FROM/i);
});

test('duplicates are retired into the row that matches the source, history left in place', () => {
  for (const [retired, canonical] of [[2037, 3402], [1948, 3454], [1892, 3467], [3427, 3467]]) {
    assert.match(activeDupeSql, new RegExp(`\\(${retired}, ${canonical}, `));
  }
  assert.doesNotMatch(activeDupeSql, /\((?:3353|3088), /, 'Aggieland is two rooms');
  assert.match(activeDupeSql, /SET canonical_venue_id = d\.canonical_id,\s+is_active = false,\s+is_suppressed = true/);
  assert.match(activeDupeSql, /INSERT INTO public\.venue_duplicate_retirement_log/);
  assert.match(activeDupeSql, /INSERT INTO public\.venue_directory_enrichment_log/);
  // Nothing is repointed or merged; schedule history is asserted unmoved.
  assert.doesNotMatch(activeDupeSql, /UPDATE public\.venue_daily_tournaments/);
  assert.doesNotMatch(activeDupeSql, /SET[^;]*games_offered\s*=/);
  assert.match(activeDupeSql, /expected 442/);
  assert.match(activeDupeSql, /install 20261128080000 first/);
});

function pgTool(name) {
  return [
    process.env.PG17_BINDIR && join(process.env.PG17_BINDIR, name),
    join('/opt/homebrew/opt/postgresql@17/bin', name),
    join('/usr/local/opt/postgresql@17/bin', name),
    join('/usr/lib/postgresql/17/bin', name),
    join('/usr/lib/postgresql/16/bin', name),
  ].filter(Boolean).find(existsSync);
}

async function reservePort() {
  const server = net.createServer();
  await new Promise((ok, fail) => { server.once('error', fail); server.listen(0, '127.0.0.1', ok); });
  const { port } = server.address();
  await new Promise((ok, fail) => server.close((e) => (e ? fail(e) : ok())));
  return port;
}

// The real helper, taken from the migration that installed it.
const identitySql = readFileSync(identityPath, 'utf8');
const roomSlugFn = identitySql.slice(
  identitySql.indexOf('create or replace function public.pnm_pokeratlas_room_slug'),
  identitySql.indexOf('$fn$;', identitySql.indexOf('create or replace function public.pnm_pokeratlas_room_slug')) + 5,
);

const PA = 'https://www.pokeratlas.com/poker-room/';
// Live values read on 2026-11-28 for every row the migrations touch or check.
const FIXTURE = String.raw`
  CREATE TABLE public.profiles (id uuid PRIMARY KEY);
  CREATE TABLE public.poker_venues (
    id integer PRIMARY KEY,
    name text, city text, state text, address text, website text,
    latitude numeric, longitude numeric,
    pokeratlas_slug text, pokeratlas_url text,
    games_offered text[],
    is_active boolean DEFAULT true,
    is_suppressed boolean DEFAULT false,
    canonical_venue_id integer REFERENCES public.poker_venues(id) ON DELETE SET NULL,
    retired_at timestamptz, retired_by uuid REFERENCES public.profiles(id), retired_reason text,
    location_integrity_revision timestamptz,
    CHECK (canonical_venue_id IS NULL OR canonical_venue_id <> id)
  );
  CREATE UNIQUE INDEX uq_poker_venues_pokeratlas_slug_normalized_canonical
    ON public.poker_venues (lower(btrim(pokeratlas_slug)))
    WHERE NULLIF(btrim(pokeratlas_slug), '') IS NOT NULL AND canonical_venue_id IS NULL;
  CREATE TABLE public.venue_live_tables (
    id bigserial PRIMARY KEY, bravo_slug text, venue_name text, game_name text,
    source text, observation_kind text);
  CREATE TABLE public.venue_directory_enrichment_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    venue_id integer NOT NULL REFERENCES public.poker_venues(id) ON DELETE CASCADE,
    actor_id uuid REFERENCES public.profiles(id),
    reason text NOT NULL CHECK (char_length(reason) BETWEEN 12 AND 500),
    source_url text NOT NULL,
    confidence numeric NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    before_record jsonb NOT NULL, after_record jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE public.venue_duplicate_retirement_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    retired_venue_id integer NOT NULL REFERENCES public.poker_venues(id) ON DELETE RESTRICT,
    canonical_venue_id integer NOT NULL REFERENCES public.poker_venues(id) ON DELETE RESTRICT,
    actor_id uuid REFERENCES public.profiles(id),
    reason text NOT NULL CHECK (char_length(reason) BETWEEN 12 AND 500),
    before_record jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (retired_venue_id <> canonical_venue_id));
  CREATE TABLE public.venue_daily_tournaments (
    id bigserial PRIMARY KEY, venue_id integer REFERENCES public.poker_venues(id),
    is_active boolean, is_suppressed boolean);
  CREATE TABLE public.venue_checkins (id bigserial PRIMARY KEY, venue_id integer REFERENCES public.poker_venues(id));
  CREATE TABLE public.poker_near_me_favorites (id bigserial PRIMARY KEY, venue_id text);

  INSERT INTO public.poker_venues (id, name, city, state, address, website, latitude, longitude,
                                   pokeratlas_slug, pokeratlas_url, games_offered, is_suppressed) VALUES
    (3352, 'Jamul Casino', 'Jamul', 'CA', '14145 Campo Road', NULL, 32.70441, -116.86883,
     'jamul-casino-jamul', '${PA}jamul-casino', NULL, false),
    (3383, 'FireKeepers Casino', 'Battle Creek', 'MI', '11177 E. Michigan Ave.', NULL, 42.29572, -85.07441,
     'firekeepers-casino-battle-creek', '${PA}firekeepers-battle-creek/tournaments', NULL, false),
    (3435, 'FireKeepers', 'Battle Creek', 'MI', NULL, NULL, NULL, NULL,
     'firekeepers-battle-creek', '${PA}firekeepers-battle-creek/tournaments', NULL, true),
    (3397, 'Seminole Hard Rock Hollywood', 'Hollywood', 'FL', '1 Seminole Way', NULL, 26.0512, -80.2106,
     'seminole-hard-rock-hollywood-hollywood', '${PA}hard-rock-hollywood-ft-lauderdale', NULL, false),
    (3398, 'Texas Card House Houston', 'Houston', 'TX', '6100 Westheimer Road, Suite 142', NULL, 29.7389301, -95.4909107,
     'texas-card-house-houston-katy', '${PA}texas-card-house-houston', NULL, false),
    (3413, 'Hollywood Park Casino', 'Inglewood', 'CA', '3883 W Century Blvd.', NULL, 33.9452, -118.341,
     'hollywood-park-casino-inglewood', '${PA}hollywood-park-inglewood', NULL, false),
    (3402, 'Daytona Racing & Card Club', 'Daytona Beach', 'FL', '960 S. Williamson Boulevard',
     'https://www.daytonabeachpoker.com/poker', 29.1662, -81.07947,
     'daytona-racing-and-card-club-daytona-beach', '${PA}daytona-beach', NULL, false),
    (2037, 'Daytona Beach Racing and Card Club', 'Daytona Beach', 'FL', '4600 East Washington Street',
     'https://www.daytonabeachpoker.com', 29.1666512, -81.0798981,
     'daytona-beach-racing-and-card-club-daytona-beach', NULL, ARRAY['PLO'], false),
    (3454, 'Silks Poker Room', 'Tampa', 'FL', '11225 Race Track Road', 'http://www.tampabaydowns.com/', 28.04956, -82.64799,
     'the-silks-poker-room-tampa', '${PA}the-silks-poker-room-tampa', NULL, false),
    (1948, 'Silks Poker Tampa Bay Downs', 'Tampa', 'FL', '3000 Paradise Road', 'https://www.tampabaydowns.com', 36.13528, -115.15076,
     'silks-poker-tampa-bay-downs-tampa', '${PA}westgate-las-vegas', ARRAY['Mixed','PLO','NLH'], false),
    (3467, 'Bally''s Lincoln', 'Lincoln', 'RI', '100 Twin River Road', NULL, 41.88813, -71.44877,
     'lincoln', '${PA}lincoln', NULL, false),
    (1892, 'Bally''s Twin River Lincoln', 'Lincoln', 'RI', '100 Twin River Road', 'http://www.twinriver.com/', 41.88813, -71.44877,
     'ballys-twin-river-lincoln-lincoln', '${PA}ballys-twin-river-lincoln/tournaments', ARRAY['NLH','PLO'], false),
    (3427, 'Bally Twin River', 'Lincoln', 'RI', NULL, NULL, NULL, NULL,
     'bally-twin-river-lincoln', '${PA}ballys-twin-river-lincoln/tournaments', NULL, true),
    (3353, 'Aggieland Poker Club', 'College Station', 'TX', '12815 Wellborn Road', NULL, 30.5702865, -96.3090126,
     'aggieland-poker-club-college-station', '${PA}aggieland-poker-club-college-station', NULL, false),
    (3088, 'Jokers of Aggieland Poker Club', 'College Station', 'TX', '2553 Texas Avenue South, Suite D', NULL, 30.6183939, -96.3455991,
     'jokers-of-aggieland-poker-club-college-station', NULL, ARRAY['NLH'], false);

  INSERT INTO public.venue_live_tables (bravo_slug, venue_name, game_name, source, observation_kind) VALUES
    ('pa-jamul-casino', 'Jamul Casino', '1/2 No Limit Holdem', 'pokeratlas', 'catalog'),
    ('pa-firekeepers-battle-creek', 'FireKeepers Casino', '1/2 No Limit Holdem', 'pokeratlas', 'catalog'),
    ('pa-hard-rock-hollywood-ft-lauderdale', 'Seminole Hard Rock Hollywood', '1/2 No Limit Holdem', 'pokeratlas', 'catalog'),
    ('pa-texas-card-house-houston', 'Texas Card House Houston', '1/2 No Limit Holdem', 'pokeratlas', 'catalog'),
    ('pa-hollywood-park-inglewood', 'Hollywood Park Casino', '1/2 No Limit Holdem', 'pokeratlas', 'catalog'),
    ('pa-daytona-beach', 'Daytona Beach Racing and Card Club', '1/2 No Limit Holdem', 'pokeratlas', 'catalog'),
    ('pa-the-silks-poker-room-tampa', 'Silks @ Tampa Bay Downs', '1/2 No Limit Holdem', 'pokeratlas', 'catalog'),
    ('pa-westgate-las-vegas', 'Westgate Las Vegas Resort & Casino', '1/2 No Limit Holdem', 'pokeratlas', 'catalog'),
    ('pa-lincoln', 'Bally''s Lincoln', '1/2 No Limit Holdem', 'pokeratlas', 'catalog');

  -- Inactive schedule history on the rows being retired (2037:406, 1948:11, 1892:25),
  -- live schedules on the kept rows.
  INSERT INTO public.venue_daily_tournaments (venue_id, is_active, is_suppressed)
    SELECT 2037, false, false FROM generate_series(1, 406)
    UNION ALL SELECT 1948, false, true FROM generate_series(1, 11)
    UNION ALL SELECT 1892, false, false FROM generate_series(1, 25)
    UNION ALL SELECT 3402, true, false FROM generate_series(1, 24)
    UNION ALL SELECT 3467, true, false FROM generate_series(1, 8);
  INSERT INTO public.venue_checkins (venue_id) VALUES (3383);
`;

test('both migrations, unchanged, on PostgreSQL', async (t) => {
  const initdb = pgTool('initdb');
  const pgCtl = pgTool('pg_ctl');
  const psql = pgTool('psql');
  if (!initdb || !pgCtl || !psql) {
    t.skip('PostgreSQL 16/17 server binaries are not installed');
    return;
  }
  if (typeof process.getuid === 'function' && process.getuid() === 0) {
    t.skip('initdb refuses to run as root; run this test as an unprivileged user');
    return;
  }
  assert.ok(roomSlugFn.includes('regexp_match'), 'pnm_pokeratlas_room_slug source not found');

  const scratch = mkdtempSync(join(tmpdir(), 'venue-slug-dupes-'));
  const data = join(scratch, 'data');
  const port = await reservePort();
  let started = false;
  const args = (db) => ['-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', db, '-v', 'ON_ERROR_STOP=1'];
  const run = (sql, db = 'postgres') => execFileSync(psql, [...args(db), '-Atq', '-c', sql],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const runFile = (path, db = 'postgres') => execFileSync(psql, [...args(db), '-q', '-f', path],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const fresh = (db) => { run(`CREATE DATABASE ${db}`); run(roomSlugFn, db); run(FIXTURE, db); };

  try {
    execFileSync(initdb, ['-D', data, '-U', 'postgres', '--no-locale', '--encoding=UTF8'], { stdio: 'ignore' });
    execFileSync(pgCtl, [
      '-D', data, '-l', join(scratch, 'postgres.log'),
      '-o', `-F -p ${port} -c listen_addresses=127.0.0.1 -c unix_socket_directories=''`,
      '-w', 'start',
    ], { stdio: 'ignore' });
    started = true;

    // Why 3435 has to be retired: the slug index refuses 3383 its own slug.
    fresh('why');
    assert.throws(
      () => run("UPDATE poker_venues SET pokeratlas_slug = 'firekeepers-battle-creek' WHERE id = 3383", 'why'),
      /uq_poker_venues_pokeratlas_slug_normalized_canonical/,
    );
    // Order is enforced: the duplicate migration refuses to run first.
    assert.throws(() => runFile(dupePath, 'why'), /install 20261128080000 first/);
    assert.equal(run('SELECT count(*) FROM venue_duplicate_retirement_log', 'why'), '0');

    fresh('main');
    runFile(slugPath, 'main');
    assert.equal(
      run("SELECT string_agg(id || '=' || pokeratlas_slug, ' ' ORDER BY id) FROM poker_venues WHERE id IN (3352,3383,3397,3398,3402,3413)", 'main'),
      '3352=jamul-casino 3383=firekeepers-battle-creek 3397=hard-rock-hollywood-ft-lauderdale '
        + '3398=texas-card-house-houston 3402=daytona-beach 3413=hollywood-park-inglewood',
    );
    assert.equal(run("SELECT canonical_venue_id || ':' || is_active || ':' || is_suppressed FROM poker_venues WHERE id = 3435", 'main'), '3383:false:true');
    assert.equal(run("SELECT count(*) FROM venue_directory_enrichment_log WHERE reason LIKE '%20261128080000%'", 'main'), '7');
    // Only the slug moved on the six rooms.
    assert.equal(run("SELECT count(*) FROM poker_venues WHERE id IN (3352,3383,3397,3398,3402,3413) AND is_active AND NOT is_suppressed AND canonical_venue_id IS NULL AND games_offered IS NULL", 'main'), '6');
    // Re-running is refused by its own pre-flight.
    assert.throws(() => runFile(slugPath, 'main'), /pre-flight failed/);

    runFile(dupePath, 'main');
    assert.equal(
      run("SELECT string_agg(id || '>' || canonical_venue_id, ' ' ORDER BY id) FROM poker_venues WHERE canonical_venue_id IS NOT NULL", 'main'),
      '1892>3467 1948>3454 2037>3402 3427>3467 3435>3383',
    );
    assert.equal(run('SELECT count(*) FROM poker_venues WHERE canonical_venue_id IS NOT NULL AND (is_active OR NOT is_suppressed OR retired_at IS NULL)', 'main'), '0');
    // Kept rows are untouched and still listed; Aggieland is two listed rooms.
    assert.equal(run('SELECT count(*) FROM poker_venues WHERE id IN (3402,3454,3467,3353,3088) AND is_active AND NOT is_suppressed AND canonical_venue_id IS NULL', 'main'), '5');
    assert.equal(run('SELECT coalesce(cardinality(games_offered), 0) FROM poker_venues WHERE id = 3467', 'main'), '0', 'no games merged');
    // Nothing deleted, history unmoved, live schedules still on the kept rows.
    assert.equal(run('SELECT count(*) FROM poker_venues', 'main'), '15');
    assert.equal(run('SELECT count(*) FROM venue_daily_tournaments WHERE venue_id IN (2037,1948,1892,3427)', 'main'), '442');
    assert.equal(run('SELECT count(*) FROM venue_daily_tournaments WHERE venue_id IN (3402,3467) AND is_active', 'main'), '32');
    assert.equal(run('SELECT count(*) FROM venue_duplicate_retirement_log', 'main'), '5');
    assert.equal(run("SELECT count(*) FROM venue_directory_enrichment_log WHERE reason LIKE '%20261128080100%'", 'main'), '4');
    assert.throws(() => runFile(dupePath, 'main'), /pre-flight failed/);

    // A reference the probe did not see stops the retirement.
    fresh('refd');
    runFile(slugPath, 'refd');
    run("INSERT INTO poker_near_me_favorites (venue_id) VALUES ('2037')", 'refd');
    assert.throws(() => runFile(dupePath, 'refd'), /poker_near_me_favorites\.venue_id references a row being retired/);
    assert.equal(run('SELECT count(*) FROM poker_venues WHERE id = 2037 AND canonical_venue_id IS NULL AND is_active', 'refd'), '1');

    // A slug whose catalog does not carry the room's name is not written.
    fresh('drift');
    run("UPDATE venue_live_tables SET venue_name = 'Some Other Room' WHERE bravo_slug = 'pa-jamul-casino'", 'drift');
    assert.throws(() => runFile(slugPath, 'drift'), /expected a PokerAtlas catalog under all 6 right slugs, found 5/);
    assert.equal(run("SELECT pokeratlas_slug FROM poker_venues WHERE id = 3352", 'drift'), 'jamul-casino-jamul');
    assert.equal(run("SELECT canonical_venue_id IS NULL FROM poker_venues WHERE id = 3435", 'drift'), 't');
  } finally {
    if (started) {
      try { execFileSync(pgCtl, ['-D', data, '-m', 'immediate', 'stop'], { stdio: 'ignore' }); } catch { /* already down */ }
    }
    rmSync(scratch, { recursive: true, force: true });
  }
});

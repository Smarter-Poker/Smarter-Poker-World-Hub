// The venue directory's data is repaired at the root, not papered over.
//
// 20261128050500_venue_games_from_pokeratlas_catalog.sql
//   poker_venues.games_offered is filled ONLY from the room's own saved
//   PokerAtlas catalog (venue_live_tables, observation_kind='catalog'), ONLY
//   where it is empty, with a provenance row, and never stamps
//   last_verified_at. The collector's catalog write can never be refused.
// 20261128050600_touring_series_rows_are_not_rooms.sql
//   A row whose state is the touring marker MULTI/Tour is a tour or series,
//   never a room, and the database refuses the old shape.
//
// The source checks always run. The behaviour checks run the migrations'
// own SQL on a scratch PostgreSQL cluster when PostgreSQL 16/17 binaries are
// installed, and skip otherwise.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const repoRoot = resolve(import.meta.dirname, '..');
const gamesPath = join(repoRoot, 'supabase/migrations/20261128050500_venue_games_from_pokeratlas_catalog.sql');
const touringPath = join(repoRoot, 'supabase/migrations/20261128050600_touring_series_rows_are_not_rooms.sql');
const gamesSql = readFileSync(gamesPath, 'utf8');
const touringSql = readFileSync(touringPath, 'utf8');

function section(sql, startMarker, endMarker) {
  const start = sql.indexOf(startMarker);
  const end = sql.indexOf(endMarker, start + 1);
  assert.ok(start >= 0 && end > start, `missing section ${startMarker}`);
  return sql.slice(start, end);
}

const activeGamesSql = gamesSql.split('-- ROLLBACK')[0];
const changesSql = section(gamesSql, '-- 2. THE CHANGES', '-- 3. BACKFILL');
const backfillSql = section(gamesSql, '-- 3. BACKFILL', '-- 4. POST-APPLY');
const mappingAssertionsSql = section(gamesSql, '-- 4. POST-APPLY', '\nCOMMIT;');

test('games come only from the PokerAtlas catalog and only fill an empty list', () => {
  assert.match(changesSql, /t\.source = 'pokeratlas'/);
  assert.match(changesSql, /t\.observation_kind = 'catalog'/);
  assert.match(changesSql, /n\.observation_kind = 'catalog'/);
  // Never overwrite a list a room already has.
  const emptyGuards = changesSql.match(/coalesce\(cardinality\(v\.games_offered\), 0\) = 0/g) || [];
  assert.ok(emptyGuards.length >= 2, 'trigger must guard on an empty list when selecting and when updating');
  assert.match(backfillSql, /coalesce\(cardinality\(v\.games_offered\), 0\) = 0/);
  // Provenance for every fill.
  assert.match(changesSql, /INSERT INTO public\.venue_directory_enrichment_log/);
  assert.match(backfillSql, /INSERT INTO public\.venue_directory_enrichment_log/);
  assert.match(changesSql, /'https:\/\/www\.pokeratlas\.com\/poker-room\/' \|\| f\.pokeratlas_slug/);
  // A catalog read is not a verification.
  assert.doesNotMatch(activeGamesSql, /last_verified_at\s*=/);
  // Enrichment never refuses the collector's write.
  assert.match(changesSql, /EXCEPTION WHEN OTHERS THEN\s+--[^\n]*\n\s+RAISE WARNING/);
  assert.match(changesSql, /FOR EACH STATEMENT/);
  // The backfill asserts the counts its rolled-back probe proved.
  assert.match(backfillSql, /v_expected_all constant integer := 58/);
  assert.match(backfillSql, /v_expected_listed constant integer := 43/);
  assert.match(backfillSql, /RAISE EXCEPTION 'backfill pre-check failed/);
});

test('touring rows are reclassified, kept listed, and the shape is refused', () => {
  assert.match(touringSql, /SET venue_type = 'series'\s+WHERE id IN \(2834, 2835\)/);
  assert.doesNotMatch(touringSql.split('-- ROLLBACK')[0], /is_suppressed\s*=|is_active\s*=|DELETE FROM/i);
  assert.match(touringSql, /ADD CONSTRAINT poker_venues_touring_marker_is_not_a_room/);
  assert.match(touringSql, /RAISE EXCEPTION 'reclassified % rows, expected 2'/);
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

const FIXTURE_SCHEMA = String.raw`
  CREATE SCHEMA IF NOT EXISTS extensions;
  CREATE TABLE public.profiles (id uuid PRIMARY KEY);
  CREATE TABLE public.poker_venues (
    id integer PRIMARY KEY,
    name text,
    venue_type text,
    state text,
    address text,
    is_active boolean DEFAULT true,
    is_suppressed boolean DEFAULT false,
    pokeratlas_slug text,
    games_offered text[],
    last_verified_at timestamptz
  );
  CREATE TABLE public.venue_live_tables (
    id bigserial PRIMARY KEY,
    bravo_slug text,
    venue_name text,
    game_name text,
    source text,
    observation_kind text
  );
  CREATE TABLE public.venue_directory_enrichment_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    venue_id integer NOT NULL REFERENCES public.poker_venues(id) ON DELETE CASCADE,
    actor_id uuid REFERENCES public.profiles(id),
    reason text NOT NULL CHECK (char_length(reason) BETWEEN 12 AND 500),
    source_url text NOT NULL,
    confidence numeric NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    before_record jsonb NOT NULL,
    after_record jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  INSERT INTO public.poker_venues (id, name, venue_type, state, pokeratlas_slug, games_offered) VALUES
    (1, 'Empty Room',   'casino',     'NV', 'empty-room',   NULL),
    (2, 'Blank Room',   'poker_club', 'TX', 'blank-room',   '{}'),
    (3, 'Seeded Room',  'casino',     'CA', 'seeded-room',  ARRAY['PLO']),
    (4, 'Exotic Room',  'casino',     'OR', 'exotic-room',  NULL),
    (5, 'No Slug Room', 'casino',     'OR', NULL,           NULL);
  INSERT INTO public.poker_venues (id, name, venue_type, state) VALUES
    (2834, 'Charity Series of Poker (CSOP)', 'charity', 'MULTI'),
    (2835, 'Poker For Good', 'charity', 'MULTI'),
    (3115, 'NAPT Poker Tour', 'tour', 'Tour'),
    (3116, 'Rough Riders Poker Tour', 'tour', 'Tour');
`;

test('catalog trigger and touring rule behave on PostgreSQL', async (t) => {
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
  const scratch = mkdtempSync(join(tmpdir(), 'venue-data-root-'));
  const data = join(scratch, 'data');
  const port = await reservePort();
  let started = false;
  const run = (sql) => execFileSync(psql, [
    '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres',
    '-v', 'ON_ERROR_STOP=1', '-Atq', '-c', sql,
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const runFile = (path) => execFileSync(psql, [
    '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres',
    '-v', 'ON_ERROR_STOP=1', '-q', '-f', path,
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

  try {
    execFileSync(initdb, ['-D', data, '-U', 'postgres', '--no-locale', '--encoding=UTF8'], { stdio: 'ignore' });
    execFileSync(pgCtl, [
      '-D', data, '-l', join(scratch, 'postgres.log'),
      '-o', `-F -p ${port} -c listen_addresses=127.0.0.1 -c unix_socket_directories=''`,
      '-w', 'start',
    ], { stdio: 'ignore' });
    started = true;

    run(FIXTURE_SCHEMA);
    // The migration's own function + trigger SQL, then its own mapping self-test.
    run(changesSql);
    run(mappingAssertionsSql);

    // One collector batch, several rooms, one statement.
    run(String.raw`
      INSERT INTO public.venue_live_tables (bravo_slug, venue_name, game_name, source, observation_kind) VALUES
        ('pa-empty-room',  'Empty Room',  '1/2 No Limit Holdem',      'pokeratlas', 'catalog'),
        ('pa-empty-room',  'Empty Room',  '5/5 Pot Limit Omaha Hi',   'pokeratlas', 'catalog'),
        ('pa-empty-room',  'Empty Room',  '4/8 Limit Holdem',         'pokeratlas', 'catalog'),
        ('pa-empty-room',  'Empty Room',  '1/2 No Limit Holdem',      'pokeratlas', 'catalog'),
        ('pa-blank-room',  'Blank Room',  '20/40 Limit Mixed',        'pokeratlas', 'catalog'),
        ('pa-seeded-room', 'Seeded Room', '1/2 No Limit Holdem',      'pokeratlas', 'catalog'),
        ('pa-exotic-room', 'Exotic Room', '1/2 No Limit Short Deck (6+)', 'pokeratlas', 'catalog');
    `);
    assert.equal(run('SELECT array_to_string(games_offered, \',\') FROM poker_venues WHERE id = 1'), 'NLH,PLO,Limit HE');
    assert.equal(run('SELECT array_to_string(games_offered, \',\') FROM poker_venues WHERE id = 2'), 'Mixed');
    // An existing list is never overwritten.
    assert.equal(run('SELECT array_to_string(games_offered, \',\') FROM poker_venues WHERE id = 3'), 'PLO');
    // A catalog with nothing the directory has a word for leaves the room empty.
    assert.equal(run('SELECT coalesce(cardinality(games_offered), 0) FROM poker_venues WHERE id = 4'), '0');
    // Provenance: one row per fill, pointing at the room's PokerAtlas page.
    assert.equal(run('SELECT string_agg(venue_id || \'=\' || source_url, \' \' ORDER BY venue_id) FROM venue_directory_enrichment_log'),
      '1=https://www.pokeratlas.com/poker-room/empty-room 2=https://www.pokeratlas.com/poker-room/blank-room');
    // A catalog read is not a verification.
    assert.equal(run('SELECT count(*) FROM poker_venues WHERE last_verified_at IS NOT NULL'), '0');

    // Non-catalog rows (e.g. a modelled or Bravo row) never fill games.
    run('UPDATE poker_venues SET games_offered = NULL WHERE id = 1');
    run(`INSERT INTO venue_live_tables (bravo_slug, venue_name, game_name, source, observation_kind)
         VALUES ('pa-empty-room', 'Empty Room', '1/2 No Limit Holdem', 'bravo', 'observed')`);
    assert.equal(run('SELECT coalesce(cardinality(games_offered), 0) FROM poker_venues WHERE id = 1'), '0');

    // Enrichment failing never refuses the collector's write.
    run('ALTER TABLE venue_directory_enrichment_log ADD CONSTRAINT refuse_all CHECK (false) NOT VALID');
    run(`INSERT INTO venue_live_tables (bravo_slug, venue_name, game_name, source, observation_kind)
         VALUES ('pa-empty-room', 'Empty Room', '1/3 No Limit Holdem', 'pokeratlas', 'catalog')`);
    assert.equal(run('SELECT count(*) FROM venue_live_tables WHERE game_name = \'1/3 No Limit Holdem\''), '1');
    assert.equal(run('SELECT coalesce(cardinality(games_offered), 0) FROM poker_venues WHERE id = 1'), '0',
      'a fill whose provenance cannot be written is rolled back with it');
    run('ALTER TABLE venue_directory_enrichment_log DROP CONSTRAINT refuse_all');

    // Touring rows: the whole migration, unchanged, on the fixture.
    runFile(touringPath);
    assert.equal(run("SELECT string_agg(id || ':' || venue_type, ',' ORDER BY id) FROM poker_venues WHERE id >= 2834"),
      '2834:series,2835:series,3115:tour,3116:tour');
    assert.equal(run("SELECT count(*) FROM poker_venues WHERE id >= 2834 AND is_active AND NOT is_suppressed"), '4');
    assert.throws(
      () => run("INSERT INTO poker_venues (id, name, venue_type, state) VALUES (9000, 'New Tour As Room', 'casino', 'MULTI')"),
      /poker_venues_touring_marker_is_not_a_room/,
    );
    assert.throws(
      () => run("UPDATE poker_venues SET venue_type = 'charity' WHERE id = 2834"),
      /poker_venues_touring_marker_is_not_a_room/,
    );
    // A real room in a real state is unaffected.
    run("INSERT INTO poker_venues (id, name, venue_type, state) VALUES (9001, 'Real Room', 'casino', 'NV')");
    // Re-running is refused by its own pre-flight instead of doing anything twice.
    assert.throws(() => runFile(touringPath), /expected 2 MULTI charity rows/);
  } finally {
    if (started) {
      try { execFileSync(pgCtl, ['-D', data, '-m', 'immediate', 'stop'], { stdio: 'ignore' }); } catch { /* already down */ }
    }
    rmSync(scratch, { recursive: true, force: true });
  }
});

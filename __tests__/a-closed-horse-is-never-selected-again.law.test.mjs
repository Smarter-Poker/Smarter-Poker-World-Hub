/**
 * A CLOSED OR BENCHED HORSE IS NEVER SELECTED AGAIN (2026-10-06).
 *
 * 62 horses carried hand-made ids (00000000-.../face0000-...) that told any
 * player who looked at a payload what they were. They are retired: benched
 * (profiles.horse_status = 'disabled'), their content_authors row muted
 * (is_active = false), their posts soft-deleted and their profile closed
 * (profiles.status = 'deleted'). Every World Hub path that picks a horse, or
 * picks someone for a horse to engage with, must leave such an identity alone
 * - otherwise a cron puts it back on a seat, a friend list or a feed.
 *
 * This reads the source of each selector, because these queries run against
 * the production database from serverless routes and crons, and pins the
 * filter that excludes the retired identity.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');

/** The query chain that starts at `.from(table)` at the given occurrence. */
function chain(src, table, needle) {
  const re = new RegExp(`\\.from\\(['"]${table}['"]\\)[\\s\\S]*?;`, 'g');
  const all = [...src.matchAll(re)].map((m) => m[0]);
  const hit = all.filter((c) => c.includes(needle));
  assert.ok(hit.length > 0, `no ${table} query containing ${needle}`);
  return hit;
}

test('the legacy table engine never seats a benched horse or a closed account', () => {
  const src = read('src/lib/poker-engine/GameController.js');
  const reads = chain(src, 'profiles', "select('id, alias, avatar_url')");
  assert.equal(reads.length, 3, 'fillTableWithHorses, autoRegisterHorses and the global fallback');
  for (const q of reads) {
    assert.match(q, /\.neq\('horse_status', 'disabled'\)/);
    assert.match(q, /\.neq\('status', 'deleted'\)/);
  }
});

test('every horse persona this repo still acts as is an active author', () => {
  // The JS content mirror that used to carry six of these selectors was
  // deleted in Phase 10; the live engine's selectors are pinned in the
  // workers repo. This is the roster read left in this repo.
  const files = [
    'src/services/ClipDeduplicationService.js',
  ];
  for (const f of files) {
    const src = read(f);
    const rosters = [...src.matchAll(/\.from\(['"]content_authors['"]\)\s*\.select\([^)]*\)[\s\S]*?;/g)]
      .map((m) => m[0])
      .filter((q) => !/\.eq\(['"](id|profile_id)['"]/.test(q)); // single-row reads by key
    for (const q of rosters) assert.match(q, /\.eq\('is_active', true\)/, `${f}: ${q.slice(0, 120)}`);
  }
});

test('a muted author is not given a new face, and a closed profile never gets one back', () => {
  const src = read('pages/api/horses/generate-avatars.js');
  const batch = chain(src, 'content_authors', "select('id, name, gender, location, specialty, profile_id')");
  for (const q of batch) assert.match(q, /\.eq\('is_active', true\)/);
  const [remaining] = chain(src, 'content_authors', "count: 'exact'");
  assert.match(remaining, /\.eq\('is_active', true\)/);
  const [mirror] = chain(src, 'profiles', 'avatar_url: permanentUrl');
  assert.match(mirror, /\.neq\('status', 'deleted'\)/);
});

test('fleet readiness excludes closed horses without hiding live author drift', () => {
  const migrations = resolve(ROOT, 'supabase/migrations');
  const names = readdirSync(migrations)
    .filter((name) => /^\d{14}_fleet_readiness_excludes_closed_horses\.sql$/.test(name));
  assert.equal(names.length, 1, 'one timestamped readiness tombstone migration');
  const sql = read(`supabase/migrations/${names[0]}`);
  const body = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION'), sql.indexOf('COMMENT ON FUNCTION'));

  assert.match(body, /p\.status IS DISTINCT FROM 'deleted'/);
  assert.match(body, /p\.horse_status IS DISTINCT FROM 'disabled'/);
  assert.match(body, /LEFT JOIN public\.content_authors ca ON ca\.profile_id = p\.id/);
  assert.match(body, /ca\.profile_id IS NULL OR NOT ca\.is_active/);
  assert.doesNotMatch(body, /ca\.is_active IS TRUE/,
    'an inactive author is drift for a live horse, not a reason to hide it');
});

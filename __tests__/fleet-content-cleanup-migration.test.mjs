import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const REPO = path.resolve(import.meta.dirname, '..');
const MIGRATION_PATH = path.join(
  REPO,
  'supabase',
  'migrations',
  '20261123191000_fleet_content_cleanup_and_topics_sync.sql',
);
const sql = fs.readFileSync(MIGRATION_PATH, 'utf8');

test('fleet content cleanup migration follows safety template with pre-flight, post-apply, and rollback', () => {
  assert.match(sql, /^--\s+TIER:\s+2/m);
  assert.match(sql, /^--\s+AFFECTS:/m);
  assert.match(sql, /^--\s+IRREVERSIBLE:/m);
  assert.match(sql, /^--\s+WHY:/m);
  assert.match(sql, /^--\s+HOW:/m);
  assert.match(sql, /BEGIN;/);
  assert.match(sql, /COMMIT;/);
  assert.match(sql, /pre-flight failed/i);
  assert.match(sql, /post-apply:/i);
  assert.match(sql, /ROLLBACK/i);
});

test('fn_social_post_topics stays IMMUTABLE, preserves grants, and matches Phase 7 story modes', () => {
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.fn_social_post_topics\(/);
  assert.match(sql, /IMMUTABLE PARALLEL SAFE/);
  assert.match(sql, /SET search_path TO 'public'/);
  assert.match(sql, /'live_tournament_story',\s*'throwback_hand',\s*'human_thread',\s*'rail_human'/);
  assert.match(sql, /IF v_phase7_mode = 'live_tournament_story' THEN/);
  assert.match(
    sql,
    /GRANT EXECUTE ON FUNCTION public\.fn_social_post_topics\(text, text\[\], text, text, jsonb\)\s+TO anon, authenticated, service_role;/,
  );
  // Horses are players: fn_social_post_topics body itself never reads is_horse.
  const fnBody = sql.slice(
    sql.indexOf('CREATE OR REPLACE FUNCTION public.fn_social_post_topics('),
    sql.indexOf('END\n$function$;'),
  );
  assert.doesNotMatch(fnBody, /is_horse|origin_type|scheduler/);
});

test('migration deactivates slots sources/clips and dead Poker.org HTML RSS and guards horse username normalization', () => {
  assert.match(sql, /UPDATE public\.content_sources[\s\S]*?WHERE category = 'slots'/);
  assert.match(sql, /UPDATE public\.content_sources[\s\S]*?WHERE name = 'Poker\.org'[\s\S]*?feed_url = 'https:\/\/www\.poker\.org\/'/);
  assert.match(sql, /UPDATE public\.poker_clips[\s\S]*?WHERE category = 'slots'/);
  assert.match(sql, /UPDATE public\.profiles AS p[\s\S]*?WHERE p\.is_horse = true[\s\S]*?AND NOT EXISTS/);
  const executableSql = sql.replace(/--.*$/gm, '');
  assert.doesNotMatch(executableSql, /horse_post_modes|content_settings|caption_model_budget_settings/);
});

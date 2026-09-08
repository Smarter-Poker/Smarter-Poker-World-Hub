import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL(
  '../supabase/migrations/20260907010300_training_advisor_and_weekly_stats_authority.sql',
  import.meta.url,
), 'utf8');

test('advisor follow-up removes only redundant PUBLIC owner-read policies', () => {
  for (const [table, legacyPolicy, canonicalPolicy] of [
    ['memory_game_sessions', 'Users can view own sessions', 'memory_game_sessions_self_read'],
    ['training_answers', 'Users can view own training answers', 'training_answers_select_self'],
    ['training_level_history', 'Users can view own level history', 'training_level_history_select_self'],
    ['training_sessions', 'Users can read their own sessions', 'training_sessions_select_self_v2'],
    ['training_streaks', 'users_read_own_streaks', 'training_streaks_select_self_v2'],
  ]) {
    const escapedPolicy = legacyPolicy.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(
      migration,
      new RegExp(`DROP POLICY IF EXISTS (?:"${escapedPolicy}"|${escapedPolicy})\\s+ON public\\.${table}`),
    );
    assert.doesNotMatch(
      migration,
      new RegExp(`DROP POLICY IF EXISTS (?:"${canonicalPolicy}"|${canonicalPolicy})`),
    );
  }

  assert.doesNotMatch(migration, /CREATE POLICY|GRANT SELECT ON TABLE/);
  assert.match(migration, /applicable_policy_count <> 1/);
  assert.match(migration, /roles && ARRAY\['public', 'anon'\]::name\[\]/);
});

test('training answer snapshot foreign key receives a valid leading-column index', () => {
  assert.match(
    migration,
    /CREATE INDEX IF NOT EXISTS idx_training_answers_snapshot_key\s+ON public\.training_answers \(snapshot_key\)/,
  );
  assert.match(migration, /index_meta\.indisvalid/);
  assert.match(migration, /index_meta\.indisready/);
  assert.match(migration, /column_meta\.attnum = index_meta\.indkey\[0\]/);
  assert.match(migration, /column_meta\.attname = 'snapshot_key'/);
});

test('weekly Hub stats use only completed non-practice same-user attempts', () => {
  const start = migration.indexOf(
    'CREATE OR REPLACE FUNCTION public.rpc_training_weekly_stats(p_user_id uuid)',
  );
  const end = migration.indexOf('$function$;', start);
  assert.ok(start >= 0 && end > start, 'weekly stats replacement is missing');
  const body = migration.slice(start, end);

  assert.match(body, /FROM public\.training_sessions session\s+JOIN public\.training_attempts attempt/);
  assert.match(body, /attempt\.id = session\.attempt_id/);
  assert.match(body, /attempt\.user_id = session\.user_id/);
  assert.match(body, /attempt\.user_id = p_user_id/);
  assert.match(body, /attempt\.status = 'completed'/);
  assert.match(body, /attempt\.practice_only IS FALSE/);
  assert.match(body, /attempt\.completed_at IS NOT NULL/);
  assert.match(body, /sum\(attempt\.answered_hands\)/);
  assert.match(body, /sum\(attempt\.correct_hands\)/);
  assert.doesNotMatch(body, /FROM training_sessions(?:\s|$)/);
});

test('weekly streak and authorization use only server authority', () => {
  const start = migration.indexOf(
    'CREATE OR REPLACE FUNCTION public.rpc_training_weekly_stats(p_user_id uuid)',
  );
  const end = migration.indexOf('$function$;', start);
  const body = migration.slice(start, end);

  assert.match(body, /NOT public\.fn_caller_is_engine\(\)/);
  assert.match(body, /\(SELECT auth\.uid\(\)\) <> p_user_id/);
  assert.match(body, /FROM public\.training_streaks streak/);
  assert.match(body, /streak\.authority_current_streak/);
  assert.match(body, /streak\.authority_longest_streak/);
  assert.doesNotMatch(body, /SELECT DISTINCT \(created_at AT TIME ZONE|max\(current_streak\)|max\(longest_streak\)/);
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.rpc_training_weekly_stats\(uuid\) FROM PUBLIC, anon/,
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.rpc_training_weekly_stats\(uuid\)\s+TO authenticated, service_role/,
  );
});

test('migration carries executable postconditions for every repaired contract', () => {
  assert.match(migration, /POST-APPLY FAILED: a PUBLIC\/anon Training read policy remains/);
  assert.match(migration, /POST-APPLY FAILED: training_answers_snapshot_fk remains unindexed/);
  assert.match(migration, /POST-APPLY FAILED: weekly stats are not a sealed-attempt projection/);
  assert.match(migration, /POST-APPLY FAILED: weekly stats execution grants are unsafe/);
  assert.match(migration, /POST-APPLY FAILED: weekly stats SECURITY DEFINER path is not pinned/);
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import {
  declaredObjects,
  unappliedObjects,
} from '../scripts/ci/check-migrations-applied.mjs';

const REPO = path.resolve(new URL('.', import.meta.url).pathname, '..');

const emptyLiveSchema = () => ({
  tables: new Map(),
  fns: new Set(),
  rpcArgs: new Map(),
});

test('CHECK 17 excludes a migration-only table dropped before the final schema', () => {
  const declared = declaredObjects(`
    CREATE TABLE public.training_streak_interval_migration_v1 (
      user_id uuid PRIMARY KEY
    );
    ALTER TABLE public.training_streak_interval_migration_v1
      ADD COLUMN migrated_at timestamptz;
    DROP TABLE public.training_streak_interval_migration_v1;
  `);

  assert.deepEqual(declared.tables, []);
  assert.deepEqual(declared.columns, []);
  assert.deepEqual(unappliedObjects(declared, emptyLiveSchema()), []);
});

test('CHECK 17 still fails a true missing persistent object', () => {
  const declared = declaredObjects(`
    CREATE TABLE public.training_persistent_evidence (
      id uuid PRIMARY KEY
    );
  `);

  assert.deepEqual(declared.tables, ['training_persistent_evidence']);
  assert.deepEqual(
    unappliedObjects(declared, emptyLiveSchema()),
    [['table/view', 'training_persistent_evidence']]
  );
});

test('CHECK 17 still enforces persistent columns and RPC functions', () => {
  const declared = declaredObjects(`
    ALTER TABLE public.training_attempts
      ADD COLUMN IF NOT EXISTS durable_receipt text;
    CREATE FUNCTION public.training_missing_rpc(p_attempt_id uuid)
    RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
  `);
  const live = {
    tables: new Map([['training_attempts', new Set()]]),
    fns: new Set(),
    rpcArgs: new Map(),
  };

  assert.deepEqual(unappliedObjects(declared, live), [
    ['column', 'training_attempts.durable_receipt'],
    ['function', 'training_missing_rpc(p_attempt_id)'],
  ]);
});

test('CHECK 17 uses the last relation operation so DROP then CREATE stays required', () => {
  const declared = declaredObjects(`
    DROP TABLE IF EXISTS public.training_recreated_evidence;
    CREATE TABLE public.training_recreated_evidence (
      id uuid PRIMARY KEY
    );
  `);

  assert.deepEqual(declared.tables, ['training_recreated_evidence']);
  assert.deepEqual(
    unappliedObjects(declared, emptyLiveSchema()),
    [['table/view', 'training_recreated_evidence']]
  );
});

test('CHECK 17 uses the final CREATE in a create-drop-create lifecycle', () => {
  const declared = declaredObjects(`
    CREATE TABLE public.training_rebuilt_evidence (id uuid PRIMARY KEY);
    DROP TABLE public.training_rebuilt_evidence;
    CREATE TABLE public.training_rebuilt_evidence (id uuid PRIMARY KEY);
  `);

  assert.deepEqual(declared.tables, ['training_rebuilt_evidence']);
  assert.deepEqual(
    unappliedObjects(declared, emptyLiveSchema()),
    [['table/view', 'training_rebuilt_evidence']]
  );
});

test('CHECK 17 does not let an unrelated DROP remove a persistent declaration', () => {
  const declared = declaredObjects(`
    CREATE TABLE public.training_persistent_evidence (id uuid PRIMARY KEY);
    DROP TABLE IF EXISTS public.training_unrelated_staging;
  `);

  assert.deepEqual(declared.tables, ['training_persistent_evidence']);
});

test('CHECK 17 recognizes public schema qualifiers, IF clauses, and keyword/name case', () => {
  const declared = declaredObjects(`
    CrEaTe TaBlE iF nOt ExIsTs PuBlIc.Training_Mixed_Case (id uuid PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS PUBLIC.Training_Transient_Case (id uuid PRIMARY KEY);
    DrOp TaBlE iF ExIsTs pUbLiC.TRAINING_TRANSIENT_CASE;
  `);

  assert.deepEqual(declared.tables, ['training_mixed_case']);
  assert.deepEqual(
    unappliedObjects(declared, emptyLiveSchema()),
    [['table/view', 'training_mixed_case']]
  );
});

test('DROP text in comments, strings, and dollar bodies cannot change relation lifecycle', () => {
  const declared = declaredObjects(String.raw`
    CREATE TABLE public.training_drop_text_is_data (id uuid PRIMARY KEY);
    -- DROP TABLE public.training_drop_text_is_data;
    /* DROP TABLE IF EXISTS public.training_drop_text_is_data; */
    SELECT 'DROP TABLE public.training_drop_text_is_data;';
    DO $body$
    BEGIN
      RAISE NOTICE 'DROP TABLE public.training_drop_text_is_data;';
    END
    $body$;
  `);

  assert.deepEqual(declared.tables, ['training_drop_text_is_data']);
  assert.deepEqual(
    unappliedObjects(declared, emptyLiveSchema()),
    [['table/view', 'training_drop_text_is_data']]
  );
});

test('CHECK 17 fails closed when top-level SQL tokenization is not trustworthy', () => {
  assert.throws(
    () => declaredObjects("CREATE TABLE public.training_evidence (id uuid); SELECT 'unterminated"),
    (error) => error?.code === 'SQL_RUNNER_UNTERMINATED_SQL_TOKEN'
  );
});

test('the Phase 6 streak migration declares only its durable final relations', () => {
  const source = readFileSync(
    path.join(
      REPO,
      'supabase/migrations/20260907202000_training_streak_out_of_order_completion.sql'
    ),
    'utf8'
  );
  const declared = declaredObjects(source);

  assert.ok(declared.tables.includes('training_streak_activity_days'));
  assert.ok(!declared.tables.includes('training_streak_interval_migration_v1'));
});

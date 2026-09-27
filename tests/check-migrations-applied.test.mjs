import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import {
  compositeRpcProbeCandidates,
  declaredObjects,
  proveCompositeRpcSignatures,
  unappliedObjects,
} from '../scripts/ci/check-migrations-applied.mjs';

const REPO = path.resolve(new URL('.', import.meta.url).pathname, '..');

const emptyLiveSchema = () => ({
  tables: new Map(),
  fns: new Set(),
  rpcArgs: new Map(),
  readOnlyRpcs: new Set(),
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

test('CHECK 17 recognizes published composite row RPCs without weakening scalar signature checks', () => {
  const declared = declaredObjects(`
    CREATE FUNCTION public.legacy_transition_eligible(p_reel public.social_reels)
    RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
    CREATE FUNCTION public.training_scalar_rpc(p_value uuid)
    RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
    CREATE FUNCTION public.fn_video_library_publisher_is_eligible(p_profile_id uuid)
    RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
  `);
  const live = {
    tables: new Map([['social_reels', new Set(['id', 'video_url'])]]),
    fns: new Set(['legacy_transition_eligible', 'training_scalar_rpc']),
    rpcArgs: new Map([
      // PostgREST expands the relation row instead of publishing `p_reel`.
      ['legacy_transition_eligible', [new Set(['id', 'video_url'])]],
      ['training_scalar_rpc', [new Set(['wrong_argument'])]],
    ]),
  };

  assert.deepEqual(unappliedObjects(declared, live), [
    ['function signature', 'training_scalar_rpc(p_value)'],
    ['function', 'fn_video_library_publisher_is_eligible(p_profile_id)'],
  ]);
});

test('CHECK 17 positively proves only the hidden stable composite overload', async () => {
  const declared = declaredObjects(`
    CREATE FUNCTION public.legacy_transition_eligible(p_post public.social_posts)
    RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
    CREATE FUNCTION public.legacy_transition_eligible(p_reel public.social_reels)
    RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
  `);
  const live = {
    tables: new Map([
      ['social_posts', new Set(['id', 'content_type'])],
      ['social_reels', new Set(['id', 'video_url'])],
    ]),
    fns: new Set(['legacy_transition_eligible']),
    rpcArgs: new Map([
      ['legacy_transition_eligible', [new Set(['id', 'content_type'])]],
    ]),
    readOnlyRpcs: new Set(['legacy_transition_eligible']),
  };

  const candidates = compositeRpcProbeCandidates(declared.fns, live);
  assert.deepEqual(candidates, [{
    name: 'legacy_transition_eligible',
    argument: 'p_reel',
    qualifiedType: 'public.social_reels',
    proofKey: 'legacy_transition_eligible(p_reel:public.social_reels)',
  }]);

  const calls = [];
  const proofs = await proveCompositeRpcSignatures(
    candidates,
    { url: 'https://project.example', key: 'test-service-key' },
    async (...args) => {
      calls.push(args);
      return { ok: true, status: 200 };
    }
  );

  assert.deepEqual([...proofs], ['legacy_transition_eligible(p_reel:public.social_reels)']);
  assert.equal(calls.length, 1);
  const [label, target, init, options] = calls[0];
  assert.equal(label, 'check-migrations-applied:legacy_transition_eligible:p_reel');
  assert.equal(target, 'https://project.example/rest/v1/rpc/legacy_transition_eligible');
  assert.equal(init.method, 'POST');
  assert.equal(init.headers.apikey, 'test-service-key');
  assert.equal(init.headers.Authorization, 'Bearer test-service-key');
  assert.equal(init.headers['Content-Type'], 'application/json');
  assert.equal(init.headers.Prefer, 'tx=rollback');
  assert.equal(init.body, '{"p_reel":null}');
  assert.deepEqual(options.returnStatuses, [300, 400, 404, 405, 406, 409, 422]);

  assert.deepEqual(unappliedObjects(declared, { ...live, compositeRpcProofs: proofs }), []);
});

test('CHECK 17 hidden composite proof is exact and non-2xx never passes', async () => {
  const declared = declaredObjects(`
    CREATE FUNCTION public.publish_video(p_reel public.social_reels)
    RETURNS boolean LANGUAGE sql IMMUTABLE AS $$ SELECT false $$;
  `);
  const live = {
    tables: new Map([['social_reels', new Set(['id', 'video_url'])]]),
    fns: new Set(['publish_video']),
    rpcArgs: new Map([['publish_video', [new Set(['wrong_argument'])]]]),
    readOnlyRpcs: new Set(['publish_video']),
  };
  const candidates = compositeRpcProbeCandidates(declared.fns, live);

  for (const status of [300, 400, 401, 403, 404, 500]) {
    const proofs = await proveCompositeRpcSignatures(
      candidates,
      { url: 'https://project.example', key: 'test-service-key' },
      async () => ({ ok: false, status })
    );
    assert.equal(proofs.size, 0, `HTTP ${status} must not prove the overload`);
  }

  const success204 = await proveCompositeRpcSignatures(
    candidates,
    { url: 'https://project.example', key: 'test-service-key' },
    async () => ({ ok: true, status: 204 })
  );
  assert.equal(success204.size, 1);

  const wrongProof = new Set(['publish_video(p_reel:public.social_posts)']);
  assert.deepEqual(unappliedObjects(declared, { ...live, compositeRpcProofs: wrongProof }), [
    ['function signature', 'publish_video(p_reel)'],
  ]);
});

test('CHECK 17 never probes volatile, scalar, multi-argument, non-table, or non-GET RPCs', () => {
  const declared = declaredObjects(`
    CREATE FUNCTION public.volatile_composite(p_reel public.social_reels)
    RETURNS boolean LANGUAGE sql VOLATILE AS $$ SELECT false $$;
    CREATE FUNCTION public.scalar_rpc(p_reel uuid)
    RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
    CREATE FUNCTION public.multi_rpc(p_reel public.social_reels, p_flag boolean)
    RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
    CREATE FUNCTION public.non_table_rpc(p_reel public.missing_relation)
    RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
    CREATE FUNCTION public.no_get_rpc(p_reel public.social_reels)
    RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
  `);
  const names = declared.fns.map((fn) => fn.name);
  const live = {
    tables: new Map([['social_reels', new Set(['id'])]]),
    fns: new Set(names),
    rpcArgs: new Map(names.map((name) => [name, [new Set(['wrong_argument'])]])),
    readOnlyRpcs: new Set(['volatile_composite', 'scalar_rpc', 'multi_rpc', 'non_table_rpc']),
  };

  assert.deepEqual(compositeRpcProbeCandidates(declared.fns, live), []);
});

test('CHECK 17 rejects a wrong live overload for a declared composite row RPC', () => {
  const declared = declaredObjects(`
    CREATE FUNCTION public.publish_video(p_reel public.social_reels)
    RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
  `);
  const live = {
    tables: new Map([['social_reels', new Set(['id', 'video_url', 'topic'])]]),
    fns: new Set(['publish_video']),
    rpcArgs: new Map([
      // A scalar overload can legitimately share a name with one composite
      // field; it is still not the declared relation-row signature.
      ['publish_video', [new Set(['id'])]],
    ]),
  };

  assert.deepEqual(unappliedObjects(declared, live), [
    ['function signature', 'publish_video(p_reel)'],
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

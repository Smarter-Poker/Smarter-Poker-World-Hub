#!/usr/bin/env node

/**
 * One-time Phase 3 cache lineage backfill.
 *
 * The migration deliberately quarantines every row that cannot prove a
 * canonical grading policy. This script rebuilds only structurally valid rows,
 * assigns an explicit source class, reads audited chart policies from
 * memory_charts_gold, and leaves every rejected source row in quarantine.
 * It is dry-run by default; production mutation requires --apply.
 */

import { existsSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';

import { enforceTrainingQuestionContract, isTrainingQuestionValid }
  from '../src/lib/training/questionContract.mjs';
import { enforceSolverClaimHonesty, normalizeAuditedChartQuestion }
  from '../src/lib/training/solverDecisionEvidence.js';
import { buildTrainingCacheRow } from '../src/lib/training/cacheTruthPersistence.mjs';
import { SolverPolicyService } from '../src/services/SolverPolicyService.js';
import { reconcileAnswerKey } from '../src/utils/trainingApiUtils.js';

const PROJECT_REF = 'kuklfnapbkmacvwxktbh';
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;
const UUID_BOUNDARY_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const valueArg = (prefix) => process.argv.slice(2)
  .find((value) => value.startsWith(`${prefix}=`))?.slice(prefix.length + 1) || null;
const apply = args.has('--apply');
const directDb = args.has('--direct-db');
const pageSize = Math.min(100, Math.max(1, Number(valueArg('--page-size')) || 20));
const maxRows = Math.max(0, Number(valueArg('--max-rows')) || 0);
const reportPath = valueArg('--report');
const fromId = valueArg('--from-id');
const beforeId = valueArg('--before-id');
const writeAttempts = 6;

for (const candidate of [
  resolve(root, '.env.local'),
  '/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/.env.local',
]) {
  if (existsSync(candidate)) dotenv.config({ path: candidate, override: false, quiet: true });
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const databasePassword = process.env.SUPABASE_DB_PASSWORD;
if (!url || !serviceKey) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
if (new URL(url).hostname.split('.')[0] !== PROJECT_REF) {
  throw new Error(`Refusing non-production project: expected ${PROJECT_REF}`);
}
for (const [name, value] of [['from-id', fromId], ['before-id', beforeId]]) {
  if (value && !UUID_BOUNDARY_RE.test(value)) {
    throw new Error(`Invalid --${name} UUID boundary`);
  }
}
if (fromId && beforeId && fromId.toLowerCase() >= beforeId.toLowerCase()) {
  throw new Error('--from-id must sort before --before-id');
}
if (directDb && !databasePassword) {
  throw new Error('SUPABASE_DB_PASSWORD is required with --direct-db');
}

const db = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { headers: { 'x-smarter-poker-job': 'training-cache-truth-backfill-v1' } },
});
const { Client } = pg;
let sqlClient = null;
const policyService = new SolverPolicyService({ db });

const CACHE_COLUMN_TYPES = Object.freeze({
  id: 'uuid',
  question_id: 'text',
  game_id: 'text',
  engine_type: 'text',
  question_kind: 'text',
  game_type: 'text',
  level: 'integer',
  question_data: 'jsonb',
  canonical_policy: 'jsonb',
  source_classification: 'text',
  scenario_hash: 'text',
  exact_node: 'jsonb',
  public_action_history: 'jsonb',
  policy_version: 'text',
  solver_version: 'text',
  solver_binary_checksum: 'text',
  manifest_version: 'text',
  manifest_checksum: 'text',
  source_checksum: 'text',
  pipeline_commit: 'text',
  machine_id: 'text',
  source_created_at: 'timestamptz',
  source_audited_at: 'timestamptz',
  generator_version: 'text',
  generated_at: 'timestamptz',
  lineage: 'jsonb',
  quality_status: 'text',
});
const CACHE_COLUMNS = Object.freeze(Object.keys(CACHE_COLUMN_TYPES));

const counters = {
  scanned: 0,
  restorable: 0,
  restored: 0,
  released: 0,
  failed: 0,
  byClassification: {},
  rejectedByReason: {},
};

function count(bucket, key) {
  const normalized = String(key || 'unknown');
  bucket[normalized] = (bucket[normalized] || 0) + 1;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

const sleep = (milliseconds) => new Promise((resolvePromise) => {
  setTimeout(resolvePromise, milliseconds);
});

async function runIdempotentWrite(label, operation, receiptIsValid) {
  let lastError = null;
  for (let attempt = 1; attempt <= writeAttempts; attempt += 1) {
    try {
      const result = await operation();
      if (!result?.error && receiptIsValid(result)) return result;
      lastError = result?.error || new Error(`${label}_invalid_receipt`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < writeAttempts) {
      const waitMs = Math.min(4_000, 250 * (2 ** (attempt - 1)));
      console.warn(
        `[training-cache-truth-backfill] ${label} attempt ${attempt} failed; retrying in ${waitMs}ms`,
      );
      await sleep(waitMs);
    }
  }
  throw new Error(`${label}:${lastError?.message || String(lastError || 'unknown error')}`);
}

function chartIdOf(sourceRow, question) {
  const candidates = [
    question?.chartId,
    question?.chart_id,
    question?.id,
    sourceRow?.question_id,
  ];
  for (const candidate of candidates) {
    const match = String(candidate || '').match(UUID_RE);
    if (match) return match[0].toLowerCase();
  }
  return null;
}

function gameTypeOf(sourceRow) {
  const gameId = String(sourceRow.game_id || '').toLowerCase();
  if (gameId.startsWith('mtt-')) return 'tournament';
  if (gameId.startsWith('spins-') || gameId.startsWith('sng-')) return 'sng';
  const value = String(sourceRow.game_type || '').toLowerCase();
  return ['cash', 'tournament', 'sng'].includes(value) ? value : 'cash';
}

function questionKindOf(sourceRow) {
  const value = String(sourceRow.question_kind || sourceRow.engine_type || '').toUpperCase();
  return ['PIO', 'CHART', 'SCENARIO'].includes(value) ? value : 'SCENARIO';
}

function legacyFallback(question, originalSource) {
  const q = question;
  q.legacySource = originalSource || 'UNKNOWN';
  q.source = 'LEGACY_STRATEGY_ARCHIVE';
  q.dataQuality = 'LEGACY_UNVERIFIED';
  q.sourceClassification = 'LEGACY_UNVERIFIED';
  q.solverProvenance = {
    ...(q.solverProvenance && typeof q.solverProvenance === 'object'
      ? q.solverProvenance
      : {}),
    verified: false,
    source: `training_question_cache_legacy:${String(originalSource || 'unknown').toLowerCase()}`,
  };
  q.evidenceDisclosure = 'Legacy strategy archive; writer provenance is unavailable.';
  return enforceSolverClaimHonesty(q);
}

function prepareQuestion(quarantineRow, charts) {
  const sourceRow = quarantineRow?.original_row;
  if (!sourceRow || typeof sourceRow !== 'object') throw new Error('missing_original_row');
  let question = clone(sourceRow.question_data);
  if (!question || typeof question !== 'object' || Array.isArray(question)) {
    throw new Error('question_payload_not_object');
  }
  delete question.solverPolicy;
  delete question.policyChecksum;
  delete question.sourceClassification;
  const originalSource = String(question.source || '').trim().toUpperCase();

  reconcileAnswerKey(question);
  const chartId = originalSource === 'CHART' ? chartIdOf(sourceRow, question) : null;
  const chart = chartId ? charts.get(chartId) : null;
  if (chart) {
    question = normalizeAuditedChartQuestion(question);
    question = enforceTrainingQuestionContract(question);
    if (!isTrainingQuestionValid(question)) throw new Error('chart_question_contract_invalid');
    question.solverPolicy = policyService.consumerEnvelope(
      policyService.answerFromChart(chart, {}, { holdingClass: question.heroHand }),
      'admin-inspection',
    );
  } else {
    if (originalSource === 'POSTFLOP_ENGINE') {
      question.source = 'POSTFLOP_ENGINE';
      question.dataQuality = 'HEURISTIC';
      question.evidenceDisclosure = 'Deterministic heuristic policy; not solver output.';
    } else if (['CURATED_SCENARIO', 'CACHED_SCENARIO', 'PSYCHOLOGY', 'MODEL_DISTILLED', 'DISTILLED_MODEL'].includes(originalSource)) {
      question.source = originalSource;
    } else if (originalSource === 'LOCAL_SOLVER_RANGES') {
      // This legacy range bundle has no immutable chart artifact ID. Preserve
      // it as authored curriculum rather than laundering it as CHART_AUDITED.
      question.source = 'CURATED_RANGE_ARCHIVE';
      question.dataQuality = 'CURATED';
      question.evidenceDisclosure = 'Authored preflop range curriculum; no audited chart artifact is available.';
    } else {
      question = legacyFallback(question, originalSource || question.type || 'UNKNOWN');
    }
    question = enforceTrainingQuestionContract(question);
    if (!isTrainingQuestionValid(question)) throw new Error('question_contract_invalid');
    question.solverPolicy = policyService.consumerEnvelope(
      policyService.answerFromQuestion(question),
      'admin-inspection',
    );
  }

  return buildTrainingCacheRow({
    id: sourceRow.id || quarantineRow.original_id,
    question,
    questionId: sourceRow.question_id || question.id,
    gameId: sourceRow.game_id || quarantineRow.game_id,
    questionKind: questionKindOf(sourceRow),
    gameType: gameTypeOf(sourceRow),
    level: sourceRow.level,
    generatedAt: sourceRow.generated_at,
  });
}

async function loadCharts() {
  if (directDb) {
    const result = await sqlClient.query(
      `SELECT chart_id, game_type, stack_depth, hero_position, villain_action,
              hand_matrix, created_at
       FROM public.memory_charts_gold
       ORDER BY chart_id`,
    );
    return new Map(result.rows.map((row) => [String(row.chart_id).toLowerCase(), row]));
  }
  const charts = new Map();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('memory_charts_gold')
      .select('chart_id, game_type, stack_depth, hero_position, villain_action, hand_matrix, created_at')
      .order('chart_id', { ascending: true })
      .range(from, from + 999);
    if (error) throw new Error(`memory_charts_gold:${error.message}`);
    for (const row of data || []) charts.set(String(row.chart_id).toLowerCase(), row);
    if ((data || []).length < 1000) break;
  }
  return charts;
}

async function persist(rows) {
  if (!apply || rows.length === 0) return;
  if (directDb) {
    await sqlClient.query('BEGIN');
    try {
      const recordDefinition = CACHE_COLUMNS
        .map((column) => `${column} ${CACHE_COLUMN_TYPES[column]}`)
        .join(', ');
      const assignments = CACHE_COLUMNS
        .filter((column) => column !== 'question_id')
        .map((column) => `${column} = EXCLUDED.${column}`)
        .join(', ');
      const result = await sqlClient.query(
        `INSERT INTO public.training_question_cache (${CACHE_COLUMNS.join(', ')})
         SELECT ${CACHE_COLUMNS.join(', ')}
         FROM jsonb_to_recordset($1::jsonb) AS incoming(${recordDefinition})
         ON CONFLICT (question_id) DO UPDATE SET ${assignments}
         RETURNING id, question_id, source_classification, quality_status,
                   policy_version, policy_checksum`,
        [JSON.stringify(rows)],
      );
      if (result.rows.length !== rows.length) {
        throw new Error('cache_upsert_receipt_count_mismatch');
      }
      const expected = new Map(rows.map((row) => [row.question_id, row.source_classification]));
      for (const receipt of result.rows) {
        if (
          !['active', 'active_fallback'].includes(receipt.quality_status)
          || receipt.source_classification !== expected.get(receipt.question_id)
          || !/^[0-9a-f]{64}$/.test(String(receipt.policy_checksum || ''))
          || !receipt.policy_version
        ) throw new Error(`cache_upsert_invalid_receipt:${receipt.question_id}`);
      }
      const ids = rows.map((row) => row.id);
      const releaseResult = await sqlClient.query(
        'SELECT public.fn_training_cache_release_restored($1::uuid[]) AS released',
        [ids],
      );
      const released = Number(releaseResult.rows[0]?.released);
      if (released !== ids.length) {
        throw new Error(`quarantine_release_count:${released}/${ids.length}`);
      }
      await sqlClient.query('COMMIT');
      counters.restored += rows.length;
      counters.released += rows.length;
      return;
    } catch (error) {
      await sqlClient.query('ROLLBACK').catch(() => {});
      throw error;
    }
  }
  const { data } = await runIdempotentWrite(
    'cache_upsert',
    () => db.from('training_question_cache')
      .upsert(rows, { onConflict: 'question_id', defaultToNull: false })
      .select('id, question_id, source_classification, quality_status, policy_version, policy_checksum'),
    (result) => (result.data || []).length === rows.length,
  );
  const expected = new Map(rows.map((row) => [row.question_id, row.source_classification]));
  for (const receipt of data || []) {
    if (
      !['active', 'active_fallback'].includes(receipt.quality_status)
      || receipt.source_classification !== expected.get(receipt.question_id)
      || !/^[0-9a-f]{64}$/.test(String(receipt.policy_checksum || ''))
      || !receipt.policy_version
    ) throw new Error(`cache_upsert_invalid_receipt:${receipt.question_id}`);
  }
  const ids = rows.map((row) => row.id);
  let released = false;
  let lastReleaseError = null;
  for (let attempt = 1; attempt <= writeAttempts && !released; attempt += 1) {
    const releaseResult = await db.rpc(
      'fn_training_cache_release_restored',
      { p_original_ids: ids },
    );
    lastReleaseError = releaseResult.error;
    if (!releaseResult.error && Number(releaseResult.data) === ids.length) {
      released = true;
      break;
    }

    // The RPC may have committed even if its HTTP response was lost. Verify
    // the durable state before replaying the idempotent release.
    const pending = await runIdempotentWrite(
      'quarantine_release_verify',
      () => db.from('training_question_cache_quarantine')
        .select('original_id')
        .in('original_id', ids),
      (result) => Array.isArray(result.data),
    );
    if ((pending.data || []).length === 0) {
      released = true;
      break;
    }
    if (attempt < writeAttempts) {
      const waitMs = Math.min(4_000, 250 * (2 ** (attempt - 1)));
      console.warn(
        `[training-cache-truth-backfill] quarantine_release attempt ${attempt} left ` +
        `${pending.data.length}/${ids.length} rows; retrying in ${waitMs}ms`,
      );
      await sleep(waitMs);
    }
  }
  if (!released) {
    throw new Error(
      `quarantine_release:${lastReleaseError?.message || 'rows remained quarantined'}`,
    );
  }
  counters.restored += rows.length;
  counters.released += rows.length;
}

async function main() {
  if (directDb) {
    sqlClient = new Client({
      host: `db.${PROJECT_REF}.supabase.co`,
      port: 5432,
      database: 'postgres',
      user: 'postgres',
      password: databasePassword,
      ssl: { rejectUnauthorized: false },
      application_name: 'training-cache-truth-backfill-v1',
    });
    await sqlClient.connect();
    await sqlClient.query("SET statement_timeout = '120s'");
  }
  try {
    const charts = await loadCharts();
    let cursor = null;
    while (!maxRows || counters.scanned < maxRows) {
      const limit = maxRows ? Math.min(pageSize, maxRows - counters.scanned) : pageSize;
      let page;
      if (directDb) {
        const result = await sqlClient.query(
          `SELECT original_id, question_id, game_id, quarantine_reason, original_row
           FROM public.training_question_cache_quarantine
           WHERE ($1::uuid IS NULL OR original_id >= $1::uuid)
             AND ($2::uuid IS NULL OR original_id < $2::uuid)
             AND ($3::uuid IS NULL OR original_id > $3::uuid)
           ORDER BY original_id
           LIMIT $4`,
          [fromId, beforeId, cursor, limit],
        );
        page = result.rows;
      } else {
        let query = db.from('training_question_cache_quarantine')
          .select('original_id, question_id, game_id, quarantine_reason, original_row')
          .order('original_id', { ascending: true })
          .limit(limit);
        if (fromId) query = query.gte('original_id', fromId);
        if (beforeId) query = query.lt('original_id', beforeId);
        if (cursor) query = query.gt('original_id', cursor);
        const { data, error } = await query;
        if (error) throw new Error(`quarantine_read:${error.message}`);
        page = data || [];
      }
      if (page.length === 0) break;
      cursor = page[page.length - 1].original_id;
      counters.scanned += page.length;

      const prepared = [];
      for (const row of page) {
        try {
          const cacheRow = prepareQuestion(row, charts);
          prepared.push(cacheRow);
          counters.restorable += 1;
          count(counters.byClassification, cacheRow.source_classification);
        } catch (error2) {
          counters.failed += 1;
          count(counters.rejectedByReason, error2?.message || 'unknown');
        }
      }
      await persist(prepared);
      process.stdout.write(`${JSON.stringify({ mode: apply ? 'apply' : 'dry-run', cursor, ...counters })}\n`);
      if (page.length < limit) break;
    }

    const result = {
      projectRef: PROJECT_REF,
      mode: apply ? 'apply' : 'dry-run',
      transport: directDb ? 'postgres' : 'postgrest',
      range: { fromId, beforeId },
      chartArtifacts: charts.size,
      ...counters,
      completedAt: new Date().toISOString(),
    };
    if (reportPath) writeFileSync(resolve(reportPath), `${JSON.stringify(result, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (apply && counters.restored !== counters.released) process.exitCode = 1;
  } finally {
    if (sqlClient) await sqlClient.end();
  }
}

main().catch((error) => {
  console.error('[training-cache-truth-backfill]', error?.stack || error);
  process.exitCode = 1;
});

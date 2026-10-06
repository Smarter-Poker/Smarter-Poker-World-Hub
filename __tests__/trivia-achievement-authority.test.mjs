import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ACHIEVEMENT_CONTRACT,
  achievementErrorStatus,
  normalizeAchievementItem,
  normalizeAchievementSnapshot,
  sanitizeAchievementId,
} from '../src/lib/trivia/achievementAuthority.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

function migration(suffix) {
  const directory = path.join(ROOT, 'supabase/migrations');
  const matches = fs.readdirSync(directory).filter(file => file.endsWith(`_${suffix}.sql`));
  assert.equal(matches.length, 1, `exactly one migration named *_${suffix}.sql`);
  return fs.readFileSync(path.join(directory, matches[0]), 'utf8');
}

const EXPECTED_IDS = [
  'first_question', 'ten_correct', 'fifty_correct', 'hundred_correct',
  'five_hundred_correct', 'thousand_correct', 'perfect_game', 'five_perfects',
  'ten_perfects', 'history_master', 'rules_master', 'pro_master', 'streak_3',
  'streak_7', 'streak_14', 'streak_30', 'streak_100', 'streak_365',
  'quick_draw', 'lightning_fast', 'speed_demon', 'blitz_master', 'arcade_debut',
  'arcade_veteran', 'arcade_profit', 'arcade_whale', 'night_owl', 'early_bird',
  'comeback_kid', 'marathon',
];

const SQL = migration('trivia_p10_authoritative_achievements');
const API = read('pages/api/trivia/achievements.js');

test('v2 preserves provisional v1 and defines all 30 achievements as authoritative history', () => {
  assert.match(SQL, /ALTER TABLE public\.trivia_achievement_definitions/);
  assert.match(SQL, /version\s*=\s*1[\s\S]{0,180}preserv/i);
  assert.match(SQL, /version\s*=\s*2/);
  assert.match(SQL, /authoritative\s+boolean\s+NOT NULL\s+DEFAULT false/i);
  assert.match(SQL, /provisional\s+(?:=|IS)\s+false/i);
  assert.match(SQL, /reward_display\s+(?:=|IS)\s+false/i);
  for (const id of EXPECTED_IDS) {
    const occurrences = [...SQL.matchAll(new RegExp(`\\('${id.replaceAll('-', '\\-')}'\\s*,\\s*2\\s*,`, 'g'))];
    assert.equal(occurrences.length, 1, `${id} has exactly one v2 definition`);
  }
});

test('progress is derived only from verified server state and every metric is explicit', () => {
  assert.match(SQL, /CREATE OR REPLACE FUNCTION public\.trivia_achievement_progress_value_v2/);
  assert.match(SQL, /public\.trivia_session_results/);
  assert.match(SQL, /public\.trivia_session_answers/);
  assert.match(SQL, /public\.trivia_scores[\s\S]{0,300}server_verified\s+IS\s+TRUE/i);
  assert.match(SQL, /public\.trivia_streaks/);
  assert.match(SQL, /America\/Chicago/);
  assert.match(SQL, /unknown achievement metric/i);
  assert.doesNotMatch(SQL, /auth\.uid\(\)/i);
  assert.doesNotMatch(SQL, /p_(amount|unlocked|progress|reward)/i);
});

test('awards are append-only, unique per user and definition version, and retain immutable receipts', () => {
  assert.match(SQL, /CREATE TABLE public\.trivia_achievement_awards_v2/);
  assert.match(SQL, /UNIQUE\s*\(user_id,\s*achievement_id,\s*definition_version\)/i);
  assert.match(SQL, /journal_id\s+uuid\s+NOT NULL\s+UNIQUE\s+REFERENCES public\.trivia_ledger_journals/i);
  assert.match(SQL, /diamond_transaction_id\s+uuid\s+NOT NULL\s+UNIQUE[\s\S]{0,100}REFERENCES public\.diamond_transactions\(id\) ON DELETE RESTRICT/i);
  assert.match(SQL, /wallet_reference\s+text\s+NOT NULL\s+UNIQUE/i);
  assert.match(SQL, /trg_trivia_achievement_awards_v2_append_only[\s\S]*trivia_p3_forbid_mutation/i);
  assert.match(SQL, /trg_trivia_achievement_awards_v2_no_truncate[\s\S]{0,160}BEFORE TRUNCATE[\s\S]{0,160}trivia_p3_forbid_mutation/i);
});

test('claim recomputes eligibility and posts through the Phase 2 balanced journal exactly once', () => {
  assert.match(SQL, /CREATE OR REPLACE FUNCTION public\.trivia_achievement_claim_v2/);
  assert.match(SQL, /pg_advisory_xact_lock\s*\(/i);
  assert.match(SQL, /trivia_achievement:'\s*\|\|\s*p_user_id::text\s*\|\|\s*':'\s*\|\|\s*p_achievement_id\s*\|\|\s*':v2'/i);
  assert.match(SQL, /public\.trivia_ledger_begin\s*\(/i);
  assert.match(SQL, /public\.trivia_ledger_post\s*\(/i);
  assert.match(SQL, /'operation',\s*'payout'/i);
  assert.match(SQL, /'funding_source',\s*'platform_issuance'/i);
  assert.match(SQL, /'issuance:trivia_run'/i);
  assert.match(SQL, /'wallet:'\s*\|\|\s*p_user_id::text/i);
  assert.match(SQL, /'mechanism',\s*'add'/i);
  assert.match(SQL, /'wallet_reference',\s*v_key/i);
  assert.match(SQL, /'wallet_kind',\s*'trivia_run'/i);
  assert.match(SQL, /not_eligible/i);
  assert.doesNotMatch(SQL, /UPDATE\s+public\.profiles\s+SET\s+diamonds/i);
  assert.doesNotMatch(SQL, /INSERT\s+INTO\s+public\.diamond_transactions/i);
});

test('DTO exposes diamonds only when the balanced journal and wallet line agree', () => {
  assert.match(SQL, /CREATE OR REPLACE FUNCTION public\.trivia_achievement_item_v2/);
  assert.match(SQL, /reconciliation_state\s*=\s*'linked'/i);
  assert.match(SQL, /diamond_transaction_id\s*=\s*a\.diamond_transaction_id/i);
  assert.match(SQL, /wallet_reference\s*=\s*a\.wallet_reference/i);
  assert.match(SQL, /CASE\s+WHEN\s+settled\.journal_id\s+IS NOT NULL\s+THEN a\.settled_diamonds\s+ELSE NULL\s+END/i);
  assert.match(SQL, /'locked'/);
  assert.match(SQL, /'eligible'/);
  assert.match(SQL, /'awarded'/);
  assert.match(SQL, /'error'/);
});

test('browser roles cannot read or mutate awards or invoke authority RPCs', () => {
  assert.match(SQL, /ALTER TABLE public\.trivia_achievement_awards_v2 ENABLE ROW LEVEL SECURITY/i);
  assert.match(SQL, /REVOKE ALL ON TABLE public\.trivia_achievement_awards_v2 FROM PUBLIC, anon, authenticated, service_role/i);
  assert.match(SQL, /GRANT SELECT ON TABLE public\.trivia_achievement_awards_v2 TO service_role/i);
  for (const fn of ['trivia_achievements_snapshot_v2', 'trivia_achievement_claim_v2']) {
    assert.match(SQL, new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}`));
    assert.match(SQL, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}[\\s\\S]{0,180}TO service_role`));
  }
  assert.match(SQL, /SET search_path = pg_catalog, public, extensions, pg_temp/i);
});

test('API binds identity to the bearer token and accepts no financial authority from the browser', () => {
  assert.match(API, /getServerUserWithFallback\s*\(req,\s*client\)/);
  assert.match(API, /req\.method === 'GET'/);
  assert.match(API, /req\.method === 'POST'/);
  assert.match(API, /sanitizeAchievementId\s*\(req\.body\?\.achievementId\)/);
  assert.match(API, /rpc\('trivia_achievements_snapshot_v2',[\s\S]{0,100}p_user_id:\s*user\.id/i);
  assert.match(API, /rpc\('trivia_achievement_claim_v2',[\s\S]{0,160}p_user_id:\s*user\.id/i);
  assert.doesNotMatch(API, /req\.(body|query)\?*\.?user(Id|_id)/i);
  assert.doesNotMatch(API, /req\.body\?*\.(amount|diamonds|reward|unlocked|progress)/i);
  assert.doesNotMatch(API, /@supabase\/supabase-js/);
  assert.match(API, /if \(!url \|\| !serviceRoleKey\) throw new Error/);
  assert.match(API, /status\(503\)\.json\(\{ success: false, error: 'server_configuration_unavailable' \}\)/);
});

test('normalizer is fail-closed and never fabricates unsettled diamonds', () => {
  assert.equal(ACHIEVEMENT_CONTRACT, 'trivia-achievements/2');
  assert.equal(sanitizeAchievementId('  streak_30 '), 'streak_30');
  assert.equal(sanitizeAchievementId('bad/id'), null);

  const eligible = normalizeAchievementItem({
    id: 'streak_30', version: 2, title: 'Iron Mind', description: 'Reach a 30-day Streak',
    category: 'streaks', rarity: 'epic', criteria: { metric: 'best_streak', gte: 30 },
    state: 'eligible', progressCurrent: 30, progressTarget: 30,
    settledDiamonds: 200, receiptId: 'should-not-leak', journalId: 'should-not-leak',
  });
  assert.equal(eligible.settledDiamonds, null);
  assert.equal(eligible.receiptId, null);
  assert.equal(eligible.journalId, null);

  const awarded = normalizeAchievementItem({
    ...eligible,
    state: 'awarded',
    awardedAt: '2026-10-05T23:00:00.000Z',
    settledDiamonds: 200,
    receiptId: '4c242c76-cbe6-45c6-84cf-c55e29ed6e4d',
    journalId: 'fd8b7d91-ee2e-4909-af14-f2f8e3c78439',
    transactionId: 'f077812b-df9a-4aec-aa99-619b0da4d035',
  });
  assert.equal(awarded.settledDiamonds, 200);
  assert.ok(awarded.receiptId);

  assert.throws(() => normalizeAchievementItem({ ...eligible, state: 'credited' }), /invalid achievement state/i);
  assert.throws(() => normalizeAchievementSnapshot({ contract: 'legacy', items: [] }), /invalid achievement contract/i);
  assert.equal(normalizeAchievementSnapshot({ contract: ACHIEVEMENT_CONTRACT, version: 2, items: [eligible] }).items.length, 1);
  assert.equal(achievementErrorStatus('not_eligible'), 409);
  assert.equal(achievementErrorStatus('achievement_not_found'), 404);
  assert.equal(achievementErrorStatus('award_failed'), 503);
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const SQL = readFileSync(new URL(
    '../supabase/migrations/20261005182000_trivia_p8_solo_integrity.sql',
    import.meta.url,
), 'utf8');

function definition(name, nextName) {
    const start = SQL.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
    const end = nextName
        ? SQL.indexOf(`CREATE OR REPLACE FUNCTION public.${nextName}`, start + 1)
        : SQL.indexOf('\nALTER FUNCTION ', start + 1);
    assert.ok(start >= 0, `${name} definition is missing`);
    assert.ok(end > start, `${name} definition boundary is missing`);
    return SQL.slice(start, end);
}

test('Phase 8 persists immutable request identity and durable server void evidence', () => {
    const answerGuard = definition('trivia_session_answer_guard_v1', 'trivia_claim_gto_render_v1');
    const settlementGuard = definition('trivia_session_settlement_request_guard_v1', 'trivia_session_revision_map_guard_v1');
    assert.match(SQL, /ADD COLUMN settlement_request_id uuid/);
    assert.match(SQL, /ADD COLUMN question_revision_ids jsonb/);
    assert.match(SQL, /ADD COLUMN server_voided_at timestamptz/);
    assert.match(SQL, /ADD COLUMN server_void_reason text/);
    assert.match(SQL, /ADD COLUMN engine_metadata jsonb/);
    assert.match(SQL, /SET engine_metadata = '\{\}'::jsonb/);
    assert.doesNotMatch(SQL, /SET engine_metadata = coalesce\(q\.engine_metadata/);
    assert.match(SQL, /WITH metadata_baseline AS \([\s\S]*capture a new revision|WITH metadata_baseline AS \(/);
    assert.match(SQL, /UPDATE public\.trivia_question_curation c[\s\S]*SET current_revision_id = b\.id/);
    assert.match(SQL, /trivia_session_answers_server_void_check CHECK \([\s\S]*outcome = 'skip'[\s\S]*display_index = -1/);
    assert.match(SQL, /settlement request identity is immutable/);
    assert.match(SQL, /settlement result is immutable after request identity is sealed/);
    assert.match(SQL, /OLD\.status <> 'submitted' OR NEW\.status <> 'submitted'/);
    assert.match(SQL, /NEW\.settlement_result IS NULL/);
    assert.match(SQL, /trivia session revision provenance is immutable/);
    assert.match(SQL, /NEW\.permutations -> v_bound\.question_id::text/);
    assert.match(SQL, /count\(\*\) FROM jsonb_object_keys\(v_map\)/);
    assert.match(SQL, /session permutation does not match bound revision/);
    assert.match(SQL, /generate_series\(0, v_option_count - 1\)/);
    assert.match(answerGuard, /OLD\.server_voided_at IS NULL AND NEW\.server_voided_at IS NOT NULL/);
    assert.match(answerGuard, /v_reason IS NOT DISTINCT FROM NEW\.server_void_reason/);
    assert.match(answerGuard, /FROM public\.trivia_question_quarantine z/);
    assert.match(settlementGuard, /SECURITY DEFINER/);
});

test('invalid-question recording owns validation and first-answer mutation in one lock', () => {
    const fn = definition('trivia_record_invalid_question_v1', 'trivia_session_answer_v4');
    assert.match(fn, /WHERE id = p_session_id FOR UPDATE/);
    assert.match(fn, /WHERE session_id = p_session_id AND question_id = p_question_id FOR UPDATE/);
    assert.match(fn, /server_voided_at = v_now/);
    assert.match(fn, /server_void_reason = v_reason/);
    assert.match(fn, /jsonb_build_object\('d', -1,[\s\S]*'v', true, 'vr', v_reason\)/);
    assert.match(fn, /s\.question_revision_ids ->> v_key/);
    assert.match(fn, /'error', 'revision_provenance_unavailable'/);
    assert.match(fn, /'error', 'question_still_valid'/);
    assert.match(fn, /'error', 'answer_already_recorded'/);
    assert.match(fn, /'outcome', 'voided', 'voided', true/);
    assert.match(fn, /FROM public\.trivia_questions q[\s\S]*FOR UPDATE/);
    assert.match(fn, /FROM public\.trivia_question_quarantine z[\s\S]*FOR UPDATE/);
    assert.doesNotMatch(fn, /'correctDisplayIndex'|'explanation'|'solverMetadata'/i);
});

test('V4 answer replay keeps a durable void keyless and otherwise delegates to V3', () => {
    const fn = definition('trivia_session_answer_v4', 'trivia_session_question_review_v1');
    const voidCheck = fn.indexOf('IF a.server_voided_at IS NOT NULL THEN');
    const delegate = fn.indexOf('v_res := public.trivia_session_answer_v3(');
    const validate = fn.indexOf('v_res := public.trivia_record_invalid_question_v1(');
    assert.ok(voidCheck >= 0 && delegate > voidCheck);
    assert.ok(validate > voidCheck && delegate > validate);
    assert.match(fn, /'storedDisplayIndex', -1,[\s\S]*'outcome', 'voided', 'voided', true/);
    assert.doesNotMatch(fn.slice(voidCheck, delegate), /correctDisplayIndex|explanation|correct_index/i);
    assert.match(fn, /v_res \? 'wasCorrect'[\s\S]*'engineMetadata'/);
});

test('legacy first answer validates authority and persists one keyless server-owned outcome', () => {
    const fn = definition('trivia_legacy_session_answer_v1', 'trivia_record_invalid_question_v1');
    assert.match(fn, /WHERE id = p_session_id FOR UPDATE/);
    assert.match(fn, /FOR UPDATE OF q/);
    assert.match(fn, /trivia_question_quarantine[\s\S]*FOR UPDATE/);
    assert.match(fn, /s\.question_revision_ids ->> v_key/);
    assert.match(fn, /session_closed/);
    assert.match(fn, /answer_record_invalid/);
    assert.match(fn, /jsonb_typeof\(s\.answers\) IS DISTINCT FROM 'object'/);
    assert.match(fn, /jsonb_build_object\('d', p_display_index, 'n', v_ordinal, 'at', v_now\)/);
    assert.match(fn, /'outcome', 'voided', 'voided', true/);
    assert.doesNotMatch(fn, /correctDisplayIndex|wasCorrect|explanation|engineMetadata/i);
    assert.ok(fn.indexOf("v_stored IS NOT NULL") < fn.indexOf("IF v_reason IS NOT NULL"));
    assert.ok(fn.indexOf("'error', 'session_expired'") < fn.indexOf("IF v_reason IS NOT NULL"));
});

test('settlement authority locks every bound source and durably neutralizes dynamic invalidity', () => {
    const fn = definition('trivia_p8_lock_and_void_session_questions_v1', 'trivia_legacy_session_answer_v1');
    assert.match(fn, /ORDER BY q\.id FOR UPDATE/);
    assert.match(fn, /ORDER BY z\.question_id, z\.id FOR UPDATE/);
    assert.match(fn, /ORDER BY x\.position FOR UPDATE/);
    assert.match(fn, /server_voided_at = v_now, server_void_reason = v_reason/);
    assert.match(fn, /jsonb_build_object\('d', -1, 'n', v_bound\.position - 1, 'at', v_at,[\s\S]*'v', true, 'vr', v_reason\)/);
    assert.match(fn, /revision_provenance_unavailable/);
    assert.match(fn, /jsonb_typeof\(v_stored\) IS DISTINCT FROM 'object'/);
    assert.match(fn, /jsonb_each\(v_answers\)/);
    assert.equal(
        (SQL.match(/other\.value -> 'v' IS DISTINCT FROM 'true'::jsonb/g) ?? []).length,
        3,
        'normal-answer ordinals must be unique only among normal answers; durable void positions may collide',
    );
});

test('bound revisions own legacy recovery and answer-gated strategy metadata', () => {
    const review = definition('trivia_session_question_review_v1', 'trivia_p3_grade');
    const capture = definition('trivia_capture_engine_metadata_revision_v1', 'trivia_submit_question_report_v2');
    const projection = definition('trivia_project_engine_metadata_v1', 'trivia_session_context_projection_v1');
    const context = definition('trivia_session_context_projection_v1', 'trivia_session_answer_v4');
    assert.match(SQL, /newest revision that existed when[\s\S]*r\.captured_at <= s\.created_at/);
    assert.match(SQL, /UNIQUE \(question_id, content_hash, engine_metadata\)/);
    assert.match(capture, /AFTER UPDATE OF engine_metadata/);
    assert.match(review, /s\.question_revision_ids ->> p_question_id::text/);
    assert.match(review, /'error', 'answer_not_bound'/);
    assert.match(review, /'error', 'answer_not_revealed'/);
    assert.match(review, /public\.trivia_p3_revealed\(s, v_profile\.reveal_policy\)/);
    assert.match(review, /'error', 'answer_record_invalid'/);
    assert.match(review, /'mode', s\.mode/);
    assert.match(review, /'error', 'revision_provenance_unavailable'/);
    assert.match(review, /'engineMetadata', public\.trivia_project_engine_metadata_v1\(r\.engine_metadata\)/);
    assert.match(projection, /training_solver_artifact_catalog catalog/);
    assert.match(projection, /training_solver_provenance_authority authority/);
    assert.match(projection, /authority\.retired_at IS NULL/);
    assert.match(projection, /RETURN v_metadata - 'ev_data'/);
    assert.match(projection, /invalid_datetime_format/);
    assert.match(context, /public\.trivia_project_engine_metadata_v1\(r\.engine_metadata\)/);
    assert.match(context, /'questionId', question_id[\s\S]*'engineMetadata'/);
    assert.doesNotMatch(context, /'correctIndex'|r\.correct_index|'explanation'|'question', r\.question/i);
    const durableVoid = review.slice(review.indexOf('IF a.server_voided_at IS NOT NULL THEN'), review.indexOf("IF a.outcome IS NULL"));
    assert.doesNotMatch(durableVoid, /correctIndex|explanation|engineMetadata/);
});

test('settlement re-grades exact JSON and Daily award cannot mint on replay', () => {
    const grade = definition('trivia_p3_grade', 'trivia_p3_solo_review');
    const soloReview = definition('trivia_p3_solo_review', 'trivia_p3_finalize_session_v4');
    const finalize = definition('trivia_p3_finalize_session_v4', 'trivia_p8_legacy_grade_locked_v1');
    const legacyGrade = definition('trivia_p8_legacy_grade_locked_v1', 'award_trivia_run_v4');
    const award = definition('award_trivia_run_v4', 'trivia_session_settle_solo_v4');
    const settle = definition('trivia_session_settle_solo_v4');
    assert.match(grade, /a\.server_voided_at IS NOT NULL/);
    assert.match(grade, /'answered', count\(\*\) FILTER \(WHERE NOT void/);
    assert.match(grade, /answer_time_ms_total'[\s\S]*FILTER \(WHERE NOT void/);
    const voidReview = soloReview.slice(
        soloReview.indexOf('CASE WHEN a.server_voided_at IS NOT NULL'),
        soloReview.indexOf('ELSE'),
    );
    assert.match(voidReview, /'outcome', 'void'/);
    assert.doesNotMatch(voidReview, /correctDisplayIndex/);
    assert.match(finalize, /v_play_date := \(s\.created_at AT TIME ZONE 'America\/Chicago'\)::date/);
    assert.match(finalize, /VALUES \(s\.user_id, v_play_date, v_res\.correct > 0/);
    assert.match(finalize, /CASE WHEN pq ->> 'outcome' = 'void' THEN false ELSE a\.outcome = 'skip' END/);
    assert.match(finalize, /a\.outcome = 'skip'[\s\S]*pq ->> 'outcome' <> 'void'/);
    assert.match(finalize, /trivia_p8_lock_and_void_session_questions_v1/);
    assert.match(legacyGrade, /trivia_p8_lock_and_void_session_questions_v1/);
    assert.match(legacyGrade, /s\.answers -> v_bound\.question_id::text/);
    assert.match(legacyGrade, /s\.permutations -> v_bound\.question_id::text/);
    assert.match(legacyGrade, /'completion_answered', v_answered \+ v_voided/);
    assert.match(settle, /p_grade_basis IS DISTINCT FROM g/);
    assert.doesNotMatch(settle, /p_answered_basis/);
    assert.doesNotMatch(settle, /trivia_p3_finalize_session\(/);
    assert.match(settle, /trivia_p3_finalize_session_v4\(/);
    assert.match(award, /v_was_open := v_session\.status = 'open'/);
    assert.match(award, /v_play_date := \(v_session\.created_at AT TIME ZONE 'America\/Chicago'\)::date/);
    assert.doesNotMatch(award, /award_trivia_run_v2/);
    assert.match(award, /public\.award_trivia_run\(p_session_id, p_score, p_correct, p_total, v_clamped\)/);
    assert.match(award, /\(created_at AT TIME ZONE 'America\/Chicago'\)::date = v_play_date/);
    assert.match(award, /mode = 'daily' AND play_date = v_play_date/);
    assert.match(award, /v_play_date - v_streak\.last_play_date/);
    assert.match(award, /IF v_was_open[\s\S]*v_session\.mode = 'daily'/);
    assert.match(award, /p_settlement_snapshot jsonb DEFAULT NULL/);
    assert.match(award, /'api_response_v1', v_api_snapshot/);
    assert.match(award, /jsonb_array_elements\(p_settlement_snapshot -> 'perQuestion'\)/);
    assert.match(award, /trivia_p8_legacy_grade_locked_v1/);
    assert.match(award, /p_settlement_snapshot -> 'perQuestion' IS DISTINCT FROM v_grade -> 'per_question'/);
    assert.match(award, /'error', 'grade_changed'/);
    assert.match(award, /SET settlement_result = v_result, settlement_request_id = p_request_id[\s\S]*status = 'submitted'/);
    assert.doesNotMatch(SQL, /CREATE OR REPLACE FUNCTION public\.trivia_session_settle_solo_v3/);
});

test('report thresholds serialize per canonical question and every exposed function is service-only', () => {
    const report = definition('trivia_submit_question_report_v2', 'trivia_p8_lock_and_void_session_questions_v1');
    assert.match(report, /trivia_report_canonical:/);
    assert.match(report, /count\(DISTINCT r\.user_id\)/);
    assert.match(report, /c\.canonical_question_id = v_canon/);
    assert.match(report, /'error', 'session_required'/);
    assert.match(report, /array_position\(s\.question_ids, p_question_id\)/);
    assert.match(report, /a\.session_id = s\.id AND a\.question_id = p_question_id/);
    assert.match(report, /s\.question_revision_ids ->> p_question_id::text/);
    assert.doesNotMatch(report, /s\.question_ids && ARRAY/);
    assert.match(SQL, /JOIN public\.trivia_question_curation c ON c\.question_id = r\.question_id[\s\S]*GROUP BY c\.canonical_question_id/);
    assert.match(SQL, /LEFT JOIN rep ON rep\.canonical_question_id = c\.canonical_question_id/);
    for (const signature of [
        'trivia_claim_gto_render_v1\\(text,uuid,integer\\)',
        'trivia_release_gto_render_v1\\(text,uuid\\)',
        'trivia_submit_question_report_v2\\(uuid,uuid,text,text,uuid\\)',
        'trivia_legacy_session_answer_v1\\(uuid,uuid,uuid,integer,uuid\\)',
        'trivia_record_invalid_question_v1\\(uuid,uuid,uuid,uuid\\)',
        'trivia_session_context_projection_v1\\(uuid,uuid\\)',
        'trivia_session_answer_v4\\(uuid,uuid,uuid,integer,uuid\\)',
        'trivia_session_question_review_v1\\(uuid,uuid,uuid\\)',
        'award_trivia_run_v4\\(uuid,integer,integer,integer,integer,integer,integer,integer,uuid,jsonb\\)',
        'trivia_session_settle_solo_v4\\(uuid,uuid,integer,jsonb,uuid\\)',
    ]) {
        assert.match(SQL, new RegExp(`REVOKE ALL ON FUNCTION public\\.${signature}[\\s\\S]*?FROM PUBLIC, anon, authenticated`));
        assert.match(SQL, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${signature}[\\s\\S]*?TO service_role`));
    }
    assert.match(SQL, /CREATE TABLE public\.trivia_gto_render_claims/);
    assert.match(SQL, /FORCE ROW LEVEL SECURITY/);
    assert.match(SQL, /WHERE c\.lease_expires_at <= v_now/);
    assert.match(SQL, /WHERE cache_digest = p_cache_digest AND owner_token = p_owner_token/);
    assert.match(SQL, /SET search_path = pg_catalog, public, extensions, pg_temp/g);
    assert.match(SQL, /NOTIFY pgrst, 'reload schema'/);
    assert.match(SQL, /Phase 8 provenance is irreversible; destructive rollback refused\. Ship a forward fix\./);
});

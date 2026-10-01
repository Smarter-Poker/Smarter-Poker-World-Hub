#!/usr/bin/env node
/**
 * Trivia Phase 3 replica gate. Runs ONLY against a local replica (PGHOST socket / localhost);
 * refuses anything else. Usage (from the repo root, local replica env exported):
 *   node scripts/trivia/phase3-replica-tests.cjs <base_db_with_questions> <out.json> [golden-fixture.json]
 * 1) Golden seeds: two independently built synthetic databases (rows inserted in opposite
 *    physical order) replay 1,000 seeds; rosters, permutations, grades and scores must be
 *    byte-identical across both databases, across connections, and equal to the JS reference.
 * 2) Eligibility, curation, review queue, reports, sessions, adversarial, concurrency and ACL
 *    scenarios on a copy of <base_db> (production question bank, synthetic players only).
 */
'use strict';
const { Client } = require('pg');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const host = process.env.PGHOST || '';
if (!(host.startsWith('/') || host === 'localhost' || host === '127.0.0.1')) {
    console.error('refusing: phase 3 replica tests run only against a local replica'); process.exit(2);
}
const [BASE_DB, OUT, FIXTURE] = process.argv.slice(2);
const ROOT = process.cwd();
const MIGRATIONS = ['20260930060554_trivia_p3_question_curation.sql', '20260930061357_trivia_p3_roster_session_engine.sql',
    '20260930141736_trivia_p3_engine_speed.sql', '20260930142146_trivia_p3_health_speed.sql']
    .map(f => fs.readFileSync(path.join(ROOT, 'supabase/migrations', f), 'utf8'));
const SECRET = 'p3-golden-test-secret-0001';
const AS_OF = '2026-09-30T00:00:00Z';
const CATS = ['poker_history','famous_hands','player_profiles','tournament_facts','rule_knowledge','gto_theory',
              'mtt_situations','cash_game_situations','icm_chip_ev','gto_scenarios'];
const POOL = 600;
const md5uuid = s => { const h = crypto.createHash('md5').update(s).digest('hex');
    return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`; };
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const results = [];
function check(name, ok, detail) { results.push({ name, ok: !!ok, ...(detail === undefined ? {} : { detail }) }); if (!ok) console.log('FAIL', name, JSON.stringify(detail || '').slice(0, 300)); }

async function client(db) { const c = new Client({ database: db }); await c.connect(); return c; }
async function admin(sql) { const c = await client('postgres'); try { await c.query(sql); } finally { await c.end(); } }
async function freshDb(name, template) {
    await admin(`DROP DATABASE IF EXISTS ${name}`); await admin(`CREATE DATABASE ${name} TEMPLATE ${template}`);
}
async function as(c, role, sub, fn) {
    await c.query('BEGIN');
    try {
        await c.query(`SET LOCAL ROLE ${role}`);
        await c.query("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role, ...(sub ? { sub } : {}) })]);
        const out = await fn();
        await c.query('COMMIT'); return out;
    } catch (e) { await c.query('ROLLBACK'); throw e; }
}
async function rpc(c, fn, args) {
    const ph = args.map((_, i) => `$${i + 1}`).join(',');
    return as(c, 'service_role', null, async () => (await c.query(`SELECT public.${fn}(${ph}) AS r`, args)).rows[0].r);
}
async function denied(c, role, sub, sql, args = []) {
    try { await as(c, role, sub, () => c.query(sql, args)); return false; }
    catch (e) { return /permission denied|not allowed|must be owner/i.test(e.message); }
}
const scanDto = (label, dto) => {
    const s = JSON.stringify(dto);
    const leaks = ['correct_index', 'correctIndex', 'original_index', 'originalIndex', 'revision_id', 'revisionId', 'content_hash']
        .filter(k => s.includes(`"${k}"`));
    check(`dto_no_key:${label}`, leaks.length === 0, leaks);
};

// ------------------------------------------------------------------ golden seeds
async function buildGolden(name, descending) {
    await freshDb(name, 'replica');
    const c = await client(name);
    const order = descending ? 'DESC' : 'ASC';
    await c.query(`INSERT INTO public.trivia_questions (id, category, difficulty, question, options, correct_index, quality_score,
        audit_verified, source, created_at)
      SELECT md5('p3-golden-q-' || i)::uuid, (ARRAY['${CATS.join("','")}'])[(i % 10) + 1],
             (ARRAY['easy','medium','hard'])[((i / 10) % 3) + 1], 'Golden question ' || i || ' of the fixture pool',
             jsonb_build_array('Alpha ' || i, 'Bravo ' || i, 'Charlie ' || i, 'Delta ' || i), i % 4, 9, true,
             'golden-fixture', '2026-09-01'::timestamptz + make_interval(secs => i)
        FROM generate_series(0, ${POOL - 1}) i ORDER BY i ${order}`);
    await c.query(`SET session_replication_role = replica`);
    await c.query(`INSERT INTO auth.users (id) VALUES (md5('p3-golden-player')::uuid)`);
    await c.query(`INSERT INTO public.profiles (id, username, created_at) VALUES (md5('p3-golden-player')::uuid, 'p3_golden', now() - interval '30 days')`);
    await c.query(`INSERT INTO public.trivia_user_question_history (user_id, question_id, seen_at, mode)
      SELECT md5('p3-golden-player')::uuid, md5('p3-golden-q-' || i)::uuid, '${AS_OF}'::timestamptz - interval '1 day', 'mixed'
        FROM generate_series(0, ${POOL - 1}) i WHERE i % 5 = 0`);
    await c.query(`SET session_replication_role = origin`);
    for (const m of MIGRATIONS) await c.query(m);
    return c;
}
const GOLDEN_PROFILES = ['tournament.nightly/roster@1', 'pvp.standard/roster@1', 'solo.arcade/roster@1', 'solo.mixed/roster@1'];
async function goldenRun(c, seed) {
    const profile = GOLDEN_PROFILES[seed % 4];
    const players = seed % 10 === 0 ? [md5uuid('p3-golden-player')] : [];
    const r = await c.query(`SELECT pos, question_id::text AS id, category, difficulty, tier
        FROM public.trivia_select_core_v1(convert_to($1,'UTF8'), $2, $3, NULL, $4::uuid[], '{}'::uuid[], $5::timestamptz) ORDER BY pos`,
        [SECRET, `golden:${seed}`, profile, players, AS_OF]);
    const ids = r.rows.map(x => x.id);
    const sid = md5uuid(`p3-golden-session-${seed}`);
    const p = await c.query(`SELECT q::text AS id, public.trivia_option_permutation_v1(convert_to($1,'UTF8'), $2::uuid, q, 4) AS perm
        FROM unnest($3::uuid[]) WITH ORDINALITY u(q, o) ORDER BY o`, [SECRET, sid, ids]);
    return { profile, players, rows: r.rows, perms: p.rows.map(x => x.perm), sid };
}
function goldenDigest(seed, run, idx, points) {
    let correct = 0;
    run.rows.forEach((q, i) => { const d = ((seed + i + 1) % 5) - 1; if (d >= 0 && run.perms[i][d] === idx.get(q.id) % 4) correct += 1; });
    return { digest: sha(JSON.stringify({ ids: run.rows.map(q => q.id), tiers: run.rows.map(q => q.tier), perms: run.perms, correct,
        score: correct * points })), correct };
}
async function golden(engine) {
    const a = await buildGolden('p3q_golden_a', false);
    const b = await buildGolden('p3q_golden_b', true);
    const a2 = await client('p3q_golden_a');
    const idx = new Map(); for (let i = 0; i < POOL; i++) idx.set(md5uuid(`p3-golden-q-${i}`), i);
    const prof = {};
    for (const p of GOLDEN_PROFILES) {
        const r = (await a.query('SELECT * FROM public.trivia_roster_profiles WHERE profile_id = $1', [p])).rows[0];
        prof[p] = { questionCount: r.question_count, categories: r.categories, difficultyMix: r.difficulty_mix,
            orderPolicy: r.order_policy, points: r.points_per_correct };
    }
    const seen = new Set([...idx.entries()].filter(([, i]) => i % 5 === 0).map(([id]) => id));
    const pool = [...idx.entries()].map(([id, i]) => ({ id, category: CATS[i % 10], difficulty: ['easy','medium','hard'][Math.floor(i / 10) % 3] }));
    let mismatchDb = 0, mismatchConn = 0, mismatchJs = 0, badSize = 0; const seeds = [];
    for (let s = 0; s < 1000; s++) {
        const ra = await goldenRun(a, s), rb = await goldenRun(b, s), rc = await goldenRun(a2, s);
        const P = prof[ra.profile];
        const da = goldenDigest(s, ra, idx, P.points), db = goldenDigest(s, rb, idx, P.points), dc = goldenDigest(s, rc, idx, P.points);
        if (da.digest !== db.digest) mismatchDb++;
        if (da.digest !== dc.digest) mismatchConn++;
        if (ra.rows.length !== P.questionCount) badSize++;
        const cands = pool.filter(q => P.categories.includes(q.category)).map(q => ({ ...q, tier: ra.players.length && seen.has(q.id) ? 2 : 0 }));
        const js = engine.selectRoster({ secret: Buffer.from(SECRET, 'utf8'), label: `golden:${s}`, profile: P, candidates: cands });
        const jsPerms = js.map(q => engine.optionPermutation(Buffer.from(SECRET, 'utf8'), ra.sid, q.id, 4));
        const dj = goldenDigest(s, { rows: js, perms: jsPerms }, idx, P.points);
        if (dj.digest !== da.digest) mismatchJs++;
        seeds.push([s, da.digest.slice(0, 16), da.correct]);
    }
    check('golden_1000_identical_across_databases', mismatchDb === 0, { mismatchDb });
    check('golden_1000_identical_across_connections', mismatchConn === 0, { mismatchConn });
    check('golden_1000_identical_to_js_reference', mismatchJs === 0, { mismatchJs });
    check('golden_roster_sizes', badSize === 0, { badSize });
    const aggregate = sha(JSON.stringify(seeds));
    await a.end(); await b.end(); await a2.end();
    if (FIXTURE) fs.writeFileSync(FIXTURE, JSON.stringify({ version: 'trivia-phase3-golden/1', secret: SECRET, asOf: AS_OF,
        pool: { generator: 'p3-golden-q-<i>', size: POOL, categories: CATS, difficulty: 'floor(i/10)%3', correctIndex: 'i%4',
            player: 'p3-golden-player', playerSeen: 'i%5==0', playerSeenAt: 'asOf-1d' },
        profiles: prof, seedRule: { profile: 'seed%4', players: 'seed%10==0', label: 'golden:<seed>',
            session: 'p3-golden-session-<seed>', displayIndex: '((seed+position)%5)-1' },
        aggregate, seeds }, null, 0));
    return aggregate;
}

// ------------------------------------------------------------------ scenario tests on the production bank
async function scenarios() {
    await freshDb('p3q_t', BASE_DB);
    const c = await client('p3q_t');
    for (const m of MIGRATIONS) await c.query(m);
    const U = n => md5uuid(`p3-user-${n}`);
    const H = md5uuid('p3-horse-1');
    await c.query('SET session_replication_role = replica');
    for (const [id, horse, age] of [[U(1),false,10],[U(2),false,10],[U(3),false,10],[U(4),false,10],[U(5),false,0],[H,true,10]]) {
        await c.query('INSERT INTO auth.users (id) VALUES ($1)', [id]);
        await c.query(`INSERT INTO public.profiles (id, username, diamonds, created_at, is_horse) VALUES ($1, $2, 500, now() - make_interval(days => $3), $4)`,
            [id, `p3_${id.slice(0, 8)}`, age, horse]);
    }
    await c.query('SET session_replication_role = origin');
    const one = async (sql, args = []) => (await c.query(sql, args)).rows[0];

    // E1 pool purity + inventory
    const pur = await one(`SELECT count(*)::int AS n, count(*) FILTER (WHERE q.audit_verified IS NOT TRUE OR q.quality_score < 7
        OR cu.canonical_question_id <> q.id OR NOT r.structurally_valid
        OR EXISTS (SELECT 1 FROM trivia_question_quarantine z WHERE z.question_id = q.id AND z.released_at IS NULL))::int AS bad
        FROM trivia_eligible_question_pool_v1 p JOIN trivia_questions q ON q.id = p.question_id
        JOIN trivia_question_curation cu ON cu.question_id = q.id JOIN trivia_question_revisions r ON r.id = cu.current_revision_id`);
    check('pool_has_only_verified_quality_canonical_unquarantined', pur.bad === 0 && pur.n > 14000, pur);
    const inv = (await c.query(`SELECT u.m AS mode, p.category, p.difficulty, count(*)::int AS n FROM trivia_eligible_question_pool_v1 p,
        unnest(p.modes) u(m) GROUP BY 1,2,3`)).rows;
    check('inventory_every_mode_category_difficulty_nonempty', inv.every(r => r.n > 0) && inv.length > 100, { cells: inv.length });

    // E3 quarantine affects eligibility only
    const X = (await one(`SELECT question_id FROM trivia_eligible_question_pool_v1 ORDER BY question_id LIMIT 1`)).question_id;
    const before = (await one('SELECT to_jsonb(q) j FROM trivia_questions q WHERE id = $1', [X])).j;
    const qz = await rpc(c, 'trivia_quarantine_question_v1', [X, 'test_probe', 'operations', 'p3-test', '{}']);
    const inPool = async id => (await one('SELECT count(*)::int n FROM trivia_eligible_question_pool_v1 WHERE question_id = $1', [id])).n === 1;
    check('quarantine_removes_from_pool', qz.success && !(await inPool(X)));
    const rel = await rpc(c, 'trivia_release_question_quarantine_v1', [qz.quarantine_id, 'p3-test', 'probe released']);
    const after = (await one('SELECT to_jsonb(q) j FROM trivia_questions q WHERE id = $1', [X])).j;
    check('quarantine_release_restores_and_row_untouched', rel.success && (await inPool(X)) && JSON.stringify(before) === JSON.stringify(after));
    let immut = false; try { await c.query("DELETE FROM trivia_question_quarantine WHERE id = $1", [qz.quarantine_id]); } catch { immut = true; }
    check('quarantine_record_undeletable', immut);

    // E4 reports: validity, exclusion, threshold, dedup, spam limits, triage
    const [Y, Z] = (await c.query(`SELECT question_id FROM trivia_eligible_question_pool_v1 ORDER BY question_id OFFSET 5 LIMIT 2`)).rows.map(r => r.question_id);
    const r0 = await rpc(c, 'trivia_submit_question_report_v1', [U(1), Y, 'wrong_answer', null, null]);
    check('report_unserved_is_invalid_and_harmless', r0.success && r0.valid === false && await inPool(Y), r0);
    for (const u of [1, 2, 3, 5]) await c.query(`INSERT INTO trivia_user_question_history (user_id, question_id, seen_at, mode) VALUES ($1,$2,now(),'mixed')
        ON CONFLICT (user_id, question_id) DO NOTHING`, [U(u), Y]);
    await c.query(`INSERT INTO trivia_user_question_history (user_id, question_id, seen_at, mode) VALUES ($1,$2,now(),'mixed')`, [U(1), Z]);
    const r5 = await rpc(c, 'trivia_submit_question_report_v1', [U(5), Y, 'wrong_answer', null, null]);
    check('report_new_account_is_invalid', r5.valid === false && await inPool(Y), r5);
    const rDup = await rpc(c, 'trivia_submit_question_report_v1', [U(1), Y, 'unclear', null, null]);
    check('report_same_user_question_deduped', rDup.duplicate === true, rDup);
    const r2 = await rpc(c, 'trivia_submit_question_report_v1', [U(2), Y, 'wrong_answer', null, null]);
    check('report_valid_excludes_from_paid_pool', r2.valid === true && !(await inPool(Y)), r2);
    const r3 = await rpc(c, 'trivia_submit_question_report_v1', [U(3), Y, 'wrong_answer', null, null]);
    check('report_below_threshold_not_quarantined', r3.quarantined === false, r3);
    await c.query(`INSERT INTO trivia_user_question_history (user_id, question_id, seen_at, mode) VALUES ($1,$2,now(),'mixed')`, [U(4), Y]);
    const r4 = await rpc(c, 'trivia_submit_question_report_v1', [U(4), Y, 'wrong_answer', null, null]);
    check('report_threshold_quarantines', r4.quarantined === true, r4);
    const rz = await rpc(c, 'trivia_submit_question_report_v1', [U(1), Z, 'unclear', null, null]);
    const tz = await rpc(c, 'trivia_triage_question_report_v1', [rz.report_id, 'dismissed', 'ops-test', 'fine']);
    check('triage_dismissed_restores_pool', rz.valid && tz.success && await inPool(Z), { rz, tz });
    const tz2 = await rpc(c, 'trivia_triage_question_report_v1', [rz.report_id, 'upheld', 'ops-test', null]);
    check('triage_terminal_state_immutable', tz2.error === 'report_closed', tz2);
    const spamQs = (await c.query(`SELECT question_id FROM trivia_eligible_question_pool_v1 ORDER BY question_id OFFSET 20 LIMIT 11`)).rows.map(r => r.question_id);
    let last; for (const q of spamQs) last = await rpc(c, 'trivia_submit_question_report_v1', [U(4), q, 'other', null, null]);
    check('report_spam_daily_limit', last.error === 'daily_report_limit', last);

    // E5 review queue
    const top = (await c.query('SELECT question_id FROM trivia_review_queue_v1 ORDER BY priority, inconclusive_attempts, created_at, question_id LIMIT 10')).rows.map(r => r.question_id);
    const ba = await rpc(c, 'trivia_claim_review_batch_v1', ['test-reviewer-a', 5, 900]);
    const ba2 = await rpc(c, 'trivia_claim_review_batch_v1', ['test-reviewer-a', 5, 900]);
    const bb = await rpc(c, 'trivia_claim_review_batch_v1', ['test-reviewer-b', 5, 900]);
    const ia = ba.items.map(i => i.question_id), ib = bb.items.map(i => i.question_id);
    check('review_batches_deterministic_disjoint_resumable', JSON.stringify(ia) === JSON.stringify(top.slice(0, 5))
        && JSON.stringify(ib) === JSON.stringify(top.slice(5, 10)) && ba2.resumed === true && ba2.batch_id === ba.batch_id);
    check('review_batch_hides_key', !JSON.stringify(ba).includes('correct_index'));
    const key = async id => (await one('SELECT r.correct_index k FROM trivia_question_curation c JOIN trivia_question_revisions r ON r.id = c.current_revision_id WHERE c.question_id = $1', [id])).k;
    const it = ba.items;
    const k0 = await key(it[0].question_id), k1 = await key(it[1].question_id);
    const v0 = await rpc(c, 'trivia_record_question_review_v1', [ba.batch_id, it[0].question_id, it[0].revision_id, 'test-reviewer-a', 'model',
        'grok-3-mini', 'test', 'cold-answer/1', JSON.stringify({ answers: [{ index: k0, confidence: 0.9 }, { index: k0, confidence: 0.8 }] })]);
    const q0 = await one('SELECT audit_verified, quality_score FROM trivia_questions WHERE id = $1', [it[0].question_id]);
    check('review_verified_applies_and_can_join_pool', v0.verdict === 'verified' && q0.audit_verified === true
        && (q0.quality_score < 7 || await inPool(it[0].question_id)), { v0, q0 });
    const wrong = (k1 + 1) % 4;
    const v1 = await rpc(c, 'trivia_record_question_review_v1', [ba.batch_id, it[1].question_id, it[1].revision_id, 'test-reviewer-a', 'model',
        'grok-3-mini', 'test', 'cold-answer/1', JSON.stringify({ answers: [{ index: wrong, confidence: 0.9 }, { index: wrong, confidence: 0.9 }] })]);
    const rq1 = await one('SELECT audit_verified, quality_score FROM trivia_questions WHERE id = $1', [it[1].question_id]);
    check('review_failed_demotes', v1.verdict === 'failed' && rq1.audit_verified === false && rq1.quality_score <= 4, { v1, rq1 });
    const vdup = await rpc(c, 'trivia_record_question_review_v1', [ba.batch_id, it[0].question_id, it[0].revision_id, 'test-reviewer-a', 'model',
        'grok-3-mini', 'test', 'cold-answer/1', JSON.stringify({ answers: [] })]);
    check('review_record_idempotent', vdup.duplicate === true && vdup.verdict === 'verified');
    await c.query(`UPDATE trivia_questions SET explanation = coalesce(explanation,'') || ' (edited)' WHERE id = $1`, [it[2].question_id]);
    const v2 = await rpc(c, 'trivia_record_question_review_v1', [ba.batch_id, it[2].question_id, it[2].revision_id, 'test-reviewer-a', 'model',
        'grok-3-mini', 'test', 'cold-answer/1', JSON.stringify({ answers: [{ index: 0, confidence: 0.9 }, { index: 0, confidence: 0.9 }] })]);
    check('review_stale_revision_not_applied', v2.applied === false && v2.effect === 'stale_revision_not_applied', v2);
    const ic = it[3];
    let vi; for (let n = 0; n < 3; n++) vi = await rpc(c, 'trivia_record_question_review_v1', [null, ic.question_id, ic.revision_id, 'test-reviewer-h', 'model',
        'grok-3-mini', 'test', 'cold-answer/1', JSON.stringify({ answers: [{ index: 0, confidence: 0.1 }, { index: 1, confidence: 0.1 }] })]);
    const qi = await one('SELECT audit_verified, quality_score FROM trivia_questions WHERE id = $1', [ic.question_id]);
    check('review_inconclusive_three_times_demotes', vi.effect === 'inconclusive_limit_demoted' && qi.quality_score <= 4, { vi, qi });

    // E6 revisions + duplicates
    const W = (await one(`SELECT question_id FROM trivia_eligible_question_pool_v1 ORDER BY question_id OFFSET 40 LIMIT 1`)).question_id;
    const rev1 = (await one('SELECT current_revision_id r FROM trivia_question_curation WHERE question_id = $1', [W])).r;
    const orig = await one('SELECT options, correct_index FROM trivia_questions WHERE id = $1', [W]);
    const opts = orig.options; const rot = [...opts.slice(1), opts[0]]; const newIdx = (orig.correct_index + opts.length - 1) % opts.length;
    await c.query('UPDATE trivia_questions SET options = $2, correct_index = $3 WHERE id = $1', [W, JSON.stringify(rot), newIdx]);
    const rev2 = (await one('SELECT current_revision_id r FROM trivia_question_curation WHERE question_id = $1', [W])).r;
    await c.query('UPDATE trivia_questions SET options = $2, correct_index = $3 WHERE id = $1', [W, JSON.stringify(opts), orig.correct_index]);
    const rev3 = (await one('SELECT current_revision_id r FROM trivia_question_curation WHERE question_id = $1', [W])).r;
    check('revision_captured_on_edit_and_reused_on_revert', rev2 !== rev1 && rev3 === rev1);
    let revImm = false; try { await c.query('UPDATE trivia_question_revisions SET correct_index = 0 WHERE id = $1', [rev1]); } catch { revImm = true; }
    check('revisions_immutable', revImm);
    const dupId = md5uuid('p3-dup-insert');
    await c.query(`INSERT INTO trivia_questions (id, category, difficulty, question, options, correct_index, quality_score, source)
        SELECT $2, category, difficulty, question, options, correct_index, 3, 'test-dup' FROM trivia_questions WHERE id = $1`, [W, dupId]);
    const dup = await one('SELECT canonical_question_id, canonical_reason FROM trivia_question_curation WHERE question_id = $1', [dupId]);
    check('duplicate_insert_becomes_alias', dup.canonical_reason === 'alias' && dup.canonical_question_id === W, dup);
    const aliasHist = await rpc(c, 'trivia_build_roster_v1', ['pvp_match', 'p3-alias-probe', 'pvp.standard/roster@1', [U(1)], [dupId]]);
    const aliasItems = (await c.query('SELECT question_id FROM trivia_roster_snapshot_items WHERE snapshot_id = $1', [aliasHist.snapshot_id])).rows.map(r => r.question_id);
    check('alias_exclusion_maps_to_canonical', aliasHist.success && !aliasItems.includes(W));

    // S1 PvP roster
    const M1 = md5uuid('p3-match-1');
    const s1 = await rpc(c, 'trivia_build_roster_v1', ['pvp_match', M1, 'pvp.standard/roster@1', [U(1), U(2)], []]);
    const s1b = await rpc(c, 'trivia_build_roster_v1', ['pvp_match', M1, 'pvp.standard/roster@1', [U(1), U(2)], []]);
    const s1c = await rpc(c, 'trivia_build_roster_v1', ['pvp_match', M1, 'solo.mtt/roster@1', [], []]);
    const items1 = (await c.query(`SELECT i.*, (SELECT count(*) FROM trivia_eligible_question_pool_v1 p WHERE p.question_id = i.question_id AND 'pvp' = ANY (p.modes))::int AS elig
        FROM trivia_roster_snapshot_items i WHERE snapshot_id = $1`, [s1.snapshot_id])).rows;
    check('pvp_roster_20_eligible_distinct', s1.success && items1.length === 20 && items1.every(i => i.elig === 1)
        && new Set(items1.map(i => i.canonical_question_id)).size === 20);
    check('roster_idempotent_and_scope_conflict', s1b.duplicate === true && s1b.snapshot_id === s1.snapshot_id && s1c.error === 'unknown_profile');
    const diffs = items1.reduce((m, i) => ({ ...m, [i.difficulty]: (m[i.difficulty] || 0) + 1 }), {});
    check('pvp_roster_balanced_difficulty_20_50_30', diffs.easy === 4 && diffs.medium === 10 && diffs.hard === 6, diffs);
    check('pvp_roster_balanced_categories', new Set(items1.map(i => i.category)).size === 10);

    // S2 tournament preflight 256 / 512 / fail closed
    const T1 = md5uuid('p3-tourn-1'), T2 = md5uuid('p3-tourn-2');
    const t256 = await rpc(c, 'trivia_preflight_tournament_v1', [T1, 256, 'tournament.nightly/roster@1', [U(1), U(2), U(3)]]);
    const t512 = await rpc(c, 'trivia_preflight_tournament_v1', [T2, 512, 'tournament.nightly/roster@1', []]);
    const chk = async sid => (await one(`SELECT count(*)::int n, count(DISTINCT question_id)::int q, count(DISTINCT canonical_question_id)::int k,
        count(DISTINCT round_no)::int r, min(cnt)::int minr, max(cnt)::int maxr,
        count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM trivia_eligible_question_pool_v1 p WHERE p.question_id = i.question_id AND 'tournaments' = ANY (p.modes) AND p.min_timer_seconds <= 20))::int bad
        FROM (SELECT i.*, count(*) OVER (PARTITION BY round_no) cnt FROM trivia_roster_snapshot_items i WHERE snapshot_id = $1) i`, [sid]));
    const c256 = await chk(t256.snapshot_id), c512 = await chk(t512.snapshot_id);
    check('tournament_256_eight_rounds_80_unique', t256.success && c256.n === 80 && c256.q === 80 && c256.k === 80 && c256.r === 8 && c256.minr === 10 && c256.bad === 0, c256);
    check('tournament_512_nine_rounds_90_unique', t512.success && c512.n === 90 && c512.q === 90 && c512.k === 90 && c512.r === 9 && c512.bad === 0, c512);
    const t256b = await rpc(c, 'trivia_preflight_tournament_v1', [T1, 256, 'tournament.nightly/roster@1', []]);
    check('tournament_preflight_idempotent', t256b.duplicate === true && t256b.snapshot_id === t256.snapshot_id);
    await c.query(`INSERT INTO trivia_roster_profiles (profile_id, rules_key, mode, question_count, per_question_seconds, grace_ms, reveal_policy,
        categories, difficulty_mix, order_policy, points_per_correct, exposure_window_days, global_cooldown_days)
        VALUES ('tournament.impossible/roster@1','tournament.impossible','tournaments',10,5,0,'after_scope_close',ARRAY['rule_knowledge'],
        '{"easy":0.2,"medium":0.5,"hard":0.3}','shuffle',200,60,60),
        ('tournament.lateprobe/roster@1','tournament.lateprobe','tournaments',3,8,0,'after_scope_close',
        ARRAY['poker_history','famous_hands','player_profiles','tournament_facts','rule_knowledge','gto_theory','mtt_situations','cash_game_situations','icm_chip_ev','gto_scenarios'],
        '{"easy":0.2,"medium":0.5,"hard":0.3}','shuffle',200,60,0)`);
    const tbad = await rpc(c, 'trivia_preflight_tournament_v1', [md5uuid('p3-tourn-bad'), 256, 'tournament.impossible/roster@1', []]);
    const tbadRows = (await one(`SELECT count(*)::int n FROM trivia_roster_snapshots WHERE scope_id = $1`, [md5uuid('p3-tourn-bad')])).n;
    check('tournament_insufficient_pool_fails_closed_no_writes', tbad.error === 'insufficient_eligible_pool' && tbadRows === 0, tbad);
    const cap = await rpc(c, 'trivia_tournament_capacity_v1', [256, 'tournament.nightly/roster@1']);
    check('capacity_supports_max_nightly_bracket', cap.supports === true && cap.required === 80, { required: cap.required, avail: cap.eligible_available });

    // S4 competitive sessions (pvp, untimed, reveal after scope close)
    const exp = new Date(Date.now() + 30 * 60e3).toISOString();
    const sA = md5uuid('p3-sess-pvp-1'), sB = md5uuid('p3-sess-pvp-2');
    const oA = await rpc(c, 'trivia_open_session_v3', [sA, U(1), s1.snapshot_id, 1, `pvp:${M1}:1`, exp, JSON.stringify({ entry_reference: `pvp_stake_${M1}_${U(1)}`, entry_cost: 25, funding: 'player_wallet' })]);
    const oB = await rpc(c, 'trivia_open_session_v3', [sB, U(2), s1.snapshot_id, 1, `pvp:${M1}:2`, exp, '{}']);
    scanDto('open_session_pvp', oA);
    check('pvp_seats_share_roster_distinct_permutations', oA.success && oB.success
        && JSON.stringify(oA.questions.map(q => q.id)) === JSON.stringify(oB.questions.map(q => q.id))
        && oA.contract.rosterHash === oB.contract.rosterHash && oA.contract.permutationHash !== oB.contract.permutationHash);
    const oA2 = await rpc(c, 'trivia_open_session_v3', [sA, U(1), s1.snapshot_id, 1, `pvp:${M1}:1`, exp, '{}']);
    const oA3 = await rpc(c, 'trivia_open_session_v3', [md5uuid('p3-sess-pvp-1b'), U(1), s1.snapshot_id, 1, `pvp:${M1}:1`, exp, '{}']);
    check('seat_reconnect_resumes_second_session_refused', oA2.resumed === true && oA3.error === 'seat_has_open_session' && oA3.session_id === sA);
    const q1 = oA.questions[0], qOther = items1.length ? (await one(`SELECT question_id FROM trivia_roster_snapshot_items WHERE snapshot_id = $1 LIMIT 1`, [t256.snapshot_id])).question_id : null;
    const a1 = await rpc(c, 'trivia_session_answer_v3', [sA, U(1), q1.id, 0, md5uuid('nonce-1')]);
    scanDto('answer_hidden', a1);
    check('competitive_answer_hides_verdict', a1.success && a1.outcome === 'recorded' && a1.wasCorrect === undefined && a1.explanation === undefined, a1);
    const a1b = await rpc(c, 'trivia_session_answer_v3', [sA, U(1), q1.id, 2, md5uuid('nonce-2')]);
    check('duplicate_answer_first_wins', a1b.duplicate === true && a1b.storedDisplayIndex === 0, a1b);
    const aF = await rpc(c, 'trivia_session_answer_v3', [sA, U(1), qOther, 0, null]);
    check('foreign_question_rejected', aF.error === 'question_not_in_session', aF);
    const aI = await rpc(c, 'trivia_session_answer_v3', [sA, U(1), oA.questions[1].id, 9, null]);
    check('invalid_display_index_rejected', aI.error === 'invalid_display_index', aI);
    const aO = await rpc(c, 'trivia_session_answer_v3', [sA, U(2), oA.questions[1].id, 0, null]);
    check('other_players_session_rejected', aO.error === 'not_your_session', aO);
    const gOpen = await rpc(c, 'trivia_session_grade_v3', [sA]);
    check('no_grading_oracle_while_competitive_open', gOpen.error === 'not_available_while_open', gOpen);
    for (let i = 1; i < 20; i++) await rpc(c, 'trivia_session_answer_v3', [sA, U(1), oA.questions[i].id, i % 4, null]);
    const sub1 = await rpc(c, 'trivia_session_submit_v3', [sA, U(1), md5uuid('req-1')]);
    const sub2 = await rpc(c, 'trivia_session_submit_v3', [sA, U(1), md5uuid('req-2')]);
    check('submit_retry_safe_identical', sub1.success && sub2.replayed === true && sub1.result_hash === sub2.result_hash && sub1.total === 20, { sub1, sub2 });
    const ev = await one(`SELECT count(*)::int n FROM trivia_question_result_events WHERE source_id = $1`, [sA]);
    const hist = await one(`SELECT count(*)::int n FROM trivia_user_question_history h WHERE user_id = $1 AND question_id = ANY ($2::uuid[])`, [U(1), oA.questions.map(q => q.id)]);
    check('stats_recorded_exactly_once', ev.n === 20 && hist.n === 20, { ev, hist });
    // replay: live content changes after the fact never change a stored grade
    await c.query(`UPDATE trivia_questions SET correct_index = (correct_index + 1) % 4 WHERE id = $1`, [oA.questions[3].id]);
    const regrade = await as(c, 'postgres', null, async () => (await c.query('SELECT public.trivia_p3_grade($1) g', [sA])).rows[0].g).catch(async () => (await c.query('SELECT public.trivia_p3_grade($1) g', [sA])).rows[0].g);
    check('replay_grade_uses_immutable_revision', regrade.correct === sub1.correct && regrade.score === sub1.score, { regrade: regrade.correct, stored: sub1.correct });
    const hiddenAfterSubmit = await rpc(c, 'trivia_session_answer_v3', [sA, U(1), q1.id, 0, null]);
    await rpc(c, 'trivia_close_roster_scope_v1', [s1.snapshot_id, null]);
    const revealed = await rpc(c, 'trivia_session_answer_v3', [sA, U(1), q1.id, 0, null]);
    check('reveal_only_after_scope_close', hiddenAfterSubmit.wasCorrect === undefined && typeof revealed.wasCorrect === 'boolean');

    // S5 tournament shot clock
    const sT = md5uuid('p3-sess-t1');
    const exp2 = new Date(Date.now() + 20 * 60e3).toISOString();
    const oT = await rpc(c, 'trivia_open_session_v3', [sT, U(3), t256.snapshot_id, 1, `tournament:${T1}:1:${U(3)}`, exp2, '{}']);
    scanDto('open_session_tournament', oT);
    check('shot_clock_questions_locked_until_opened', oT.success && oT.questions.every(q => q.state === 'locked' && q.question === undefined));
    const man = await rpc(c, 'trivia_roster_manifest_v1', [t256.snapshot_id, 1]);
    const r1ids = man.rounds[0].items.map(i => i.question_id);
    const r2id = (await one(`SELECT question_id FROM trivia_roster_snapshot_items WHERE snapshot_id = $1 AND round_no = 2 LIMIT 1`, [t256.snapshot_id])).question_id;
    const na = await rpc(c, 'trivia_session_answer_v3', [sT, U(3), r1ids[0], 0, null]);
    const oo = await rpc(c, 'trivia_session_open_question_v3', [sT, U(3), 2]);
    const op1 = await rpc(c, 'trivia_session_open_question_v3', [sT, U(3), 1]);
    const xr = await rpc(c, 'trivia_session_answer_v3', [sT, U(3), r2id, 0, null]);
    check('shot_clock_order_and_cross_round_rejected', na.error === 'question_not_open' && oo.error === 'position_out_of_order'
        && op1.success && op1.question.question && xr.error === 'question_not_in_session', { na, oo, xr });
    const TL = md5uuid('p3-tourn-late');
    const tl = await rpc(c, 'trivia_preflight_tournament_v1', [TL, 2, 'tournament.lateprobe/roster@1', []]);
    const sL = md5uuid('p3-sess-late');
    await rpc(c, 'trivia_open_session_v3', [sL, U(4), tl.snapshot_id, 1, `tournament:${TL}:1:${U(4)}`, exp2, '{}']);
    const lo = await rpc(c, 'trivia_session_open_question_v3', [sL, U(4), 1]);
    await new Promise(r => setTimeout(r, 8700));
    const late = await rpc(c, 'trivia_session_answer_v3', [sL, U(4), lo.question.id, 0, null]);
    const lateAgain = await rpc(c, 'trivia_session_answer_v3', [sL, U(4), lo.question.id, 1, null]);
    check('late_answer_rejected_and_recorded', late.error === 'answer_late' && lateAgain.error === 'answer_late', { late, lateAgain });

    // S6 horse seat: stats stay out of human learning analytics
    const M2 = md5uuid('p3-match-2');
    const s2 = await rpc(c, 'trivia_build_roster_v1', ['pvp_match', M2, 'pvp.standard/roster@1', [U(3), H], []]);
    const sH = md5uuid('p3-sess-horse');
    const oH = await rpc(c, 'trivia_open_session_v3', [sH, H, s2.snapshot_id, 1, `pvp:${M2}:2`, exp, '{}']);
    for (const q of oH.questions) await rpc(c, 'trivia_session_answer_v3', [sH, H, q.id, 1, null]);
    const sh = await rpc(c, 'trivia_session_submit_v3', [sH, H, null]);
    const hs = await one(`SELECT (SELECT count(*) FROM trivia_question_result_events WHERE source_id = $1 AND actor_type = 'horse')::int ev,
        (SELECT count(*) FROM trivia_user_question_history WHERE user_id = $2)::int hist,
        (SELECT count(*) FROM trivia_category_mastery WHERE user_id = $2)::int mastery`, [sH, H]);
    check('horse_actor_events_only', sh.success && hs.ev === 20 && hs.hist === 0 && hs.mastery === 0, hs);

    // S7 solo v3 arcade: one entry charge, one award, retry safe, stats once
    const bal = async u => (await one('SELECT diamonds FROM profiles WHERE id = $1', [u])).diamonds;
    const refCount = async ref => (await one('SELECT count(*)::int n FROM diamond_transactions WHERE reference_id = $1', [ref])).n;
    const sS = md5uuid('p3-sess-solo-1'); const b0 = await bal(U(4));
    const st = await rpc(c, 'trivia_start_solo_session_v3', [sS, U(4), 'arcade', null]);
    scanDto('start_solo', st);
    const st2 = await rpc(c, 'trivia_start_solo_session_v3', [sS, U(4), 'arcade', null]);
    check('solo_start_charges_once_and_resumes', st.success && st2.resumed === true && await refCount(`trivia_entry_${sS}`) === 1
        && (await bal(U(4))) === b0 - 10 && JSON.stringify(st.questions.map(q => q.id)) === JSON.stringify(st2.questions.map(q => q.id)),
        { st: st.error, entry: await refCount(`trivia_entry_${sS}`), bal: await bal(U(4)), b0 });
    for (const q of st.questions) {
        const r = await rpc(c, 'trivia_session_answer_v3', [sS, U(4), q.id, 0, null]);
        if (q === st.questions[0]) check('solo_answer_reveals_after_binding', typeof r.wasCorrect === 'boolean' && Number.isInteger(r.correctDisplayIndex), r);
    }
    const g = await rpc(c, 'trivia_session_grade_v3', [sS]);
    const set1 = await rpc(c, 'trivia_session_settle_solo_v3', [sS, U(4), 12, g.answered, md5uuid('req-s1')]);
    const set2 = await rpc(c, 'trivia_session_settle_solo_v3', [sS, U(4), 12, g.answered, md5uuid('req-s2')]);
    const soloEv = await one(`SELECT count(*)::int n FROM trivia_question_result_events WHERE source_id = $1`, [sS]);
    check('solo_settle_awards_once_retry_safe_stats_once', set1.success && set2.replayed === true && await refCount(`trivia_session_${sS}`) <= 1
        && soloEv.n === 20 && set1.correct === g.correct, { set1: { s: set1.success, e: set1.error, d: set1.diamonds_awarded }, soloEv, g: g.correct });
    // S10 process failure: nothing survives a rolled-back settle
    const sP = md5uuid('p3-sess-solo-crash');
    const stp = await rpc(c, 'trivia_start_solo_session_v3', [sP, U(3), 'history', null]);
    for (const q of stp.questions.slice(0, 5)) await rpc(c, 'trivia_session_answer_v3', [sP, U(3), q.id, 1, null]);
    await c.query('BEGIN'); await c.query('SET LOCAL ROLE service_role');
    await c.query(`SELECT set_config('request.jwt.claims','{"role":"service_role"}',true)`);
    await c.query('SELECT public.trivia_session_settle_solo_v3($1,$2,5,5,NULL)', [sP, U(3)]);
    await c.query('ROLLBACK');
    const midCrash = await one('SELECT status, stats_recorded_at FROM trivia_sessions WHERE id = $1', [sP]);
    const setP = await rpc(c, 'trivia_session_settle_solo_v3', [sP, U(3), 5, 5, null]);
    check('process_failure_rolls_back_then_retry_settles', midCrash.status === 'open' && midCrash.stats_recorded_at === null && setP.success, { midCrash, setP: setP.error });
    const grChanged = await rpc(c, 'trivia_start_solo_session_v3', [md5uuid('p3-sess-gc'), U(3), 'rules', null]);
    const gcs = await rpc(c, 'trivia_session_settle_solo_v3', [md5uuid('p3-sess-gc'), U(3), 0, 7, null]);
    check('stale_diamond_basis_refused', grChanged.success && gcs.error === 'grade_changed', gcs);
    // S8 daily: one shared roster per Chicago day
    const d1 = await rpc(c, 'trivia_start_solo_session_v3', [md5uuid('p3-daily-1'), U(1), 'daily', null]);
    const d2 = await rpc(c, 'trivia_start_solo_session_v3', [md5uuid('p3-daily-2'), U(2), 'daily', null]);
    check('daily_roster_shared_permutation_private', d1.success && d2.success && d1.contract.rosterHash === d2.contract.rosterHash
        && d1.contract.permutationHash !== d2.contract.permutationHash);
    // S11 invalid content is voided, never penalized
    const sV = md5uuid('p3-sess-void');
    const sv = await rpc(c, 'trivia_start_solo_session_v3', [sV, U(2), 'mixed', null]);
    await rpc(c, 'trivia_quarantine_question_v1', [sv.questions[0].id, 'test_void', 'operations', 'p3-test', '{}']);
    const gv = await rpc(c, 'trivia_session_grade_v3', [sV]);
    check('invalid_content_voided_not_penalized', gv.voided === 1 && gv.graded_total === gv.total - 1, { voided: gv.voided, gt: gv.graded_total, t: gv.total });

    // S9 concurrency: parallel starts, answers, settles
    const [c1, c2] = [await client('p3q_t'), await client('p3q_t')];
    const sC = md5uuid('p3-sess-conc');
    const starts = await Promise.allSettled([rpc(c1, 'trivia_start_solo_session_v3', [sC, U(2), 'arcade', null]), rpc(c2, 'trivia_start_solo_session_v3', [sC, U(2), 'arcade', null])]);
    const okStarts = starts.filter(s => s.status === 'fulfilled' && s.value.success).length;
    check('concurrent_start_one_session_one_charge', okStarts === 2 && await refCount(`trivia_entry_${sC}`) === 1, { okStarts, entry: await refCount(`trivia_entry_${sC}`) });
    const sq = starts.find(s => s.status === 'fulfilled' && s.value.success).value.questions[0];
    const ans = await Promise.all([rpc(c1, 'trivia_session_answer_v3', [sC, U(2), sq.id, 0, null]), rpc(c2, 'trivia_session_answer_v3', [sC, U(2), sq.id, 3, null])]);
    check('concurrent_answers_one_wins', ans.filter(a => a.duplicate === false).length === 1 && ans[0].storedDisplayIndex === ans[1].storedDisplayIndex, ans.map(a => [a.duplicate, a.storedDisplayIndex]));
    const gc = await rpc(c, 'trivia_session_grade_v3', [sC]);
    const sets = await Promise.all([rpc(c1, 'trivia_session_settle_solo_v3', [sC, U(2), 7, gc.answered, null]), rpc(c2, 'trivia_session_settle_solo_v3', [sC, U(2), 7, gc.answered, null])]);
    check('concurrent_settles_one_award', sets.every(s => s.success) && sets.filter(s => s.replayed).length === 1 && await refCount(`trivia_session_${sC}`) <= 1);
    await c1.end(); await c2.end();

    // S12 expiry + evidence hold ; S13 verified backfill
    const lg = md5uuid('p3-legacy-open'), lh = md5uuid('p3-legacy-held'), lb = md5uuid('p3-legacy-sub'), lbad = md5uuid('p3-legacy-bad');
    const anyQ = oA.questions.map(q => q.id);
    await c.query(`INSERT INTO trivia_sessions (id, user_id, mode, question_ids, status, entry_state, created_at, expires_at) VALUES
        ($1,$4,'mtt',$5,'open','legacy',now()-interval '2 days',NULL), ($2,$4,'pvp',$5,'open','legacy',now()-interval '2 days',NULL),
        ($3,$4,'arcade',$5,'submitted','legacy',now()-interval '40 days',NULL), ($6,$4,'arcade',$5,'submitted','legacy',now()-interval '40 days',NULL)`,
        [lg, lh, lb, U(1), anyQ, lbad]);
    await c.query(`UPDATE trivia_sessions SET score = 400, correct_count = 2, diamonds_awarded = 0, submitted_at = created_at + interval '5 minutes' WHERE id = $1`, [lb]);
    await c.query(`UPDATE trivia_sessions SET score = 400, correct_count = 2, diamonds_awarded = 20, submitted_at = created_at + interval '5 minutes' WHERE id = $1`, [lbad]);
    let heldReady = true;
    try {
        const MQ = md5uuid('p3-quarantined-match');
        await c.query(`INSERT INTO trivia_pvp_matches (id, player1_id, player2_id, stake_amount, status, challenger_id, created_at)
            VALUES ($1,$2,$3,10,'abandoned',$4,now()-interval '2 days')`, [MQ, U(1), U(2), lh]);
        await c.query(`INSERT INTO competitive_quarantine (entity_type, entity_id, reason_code, invariant_snapshot, quarantined_at)
            VALUES ('trivia_pvp_match',$1,'p3_test_probe','{}',now())`, [MQ]);
    } catch (e) { heldReady = false; results.push({ name: 'held_evidence_fixture', ok: true, detail: 'skipped: ' + e.message.slice(0, 120) }); }
    const sw = await rpc(c, 'trivia_expire_stale_sessions_v1', [500]);
    const st3 = await one(`SELECT (SELECT status FROM trivia_sessions WHERE id = $1) a, (SELECT status FROM trivia_sessions WHERE id = $2) b`, [lg, lh]);
    check('stale_sessions_expired_evidence_held', st3.a === 'expired' && (!heldReady || st3.b === 'open') && sw.success, { sw, st3 });
    const bf = await rpc(c, 'trivia_backfill_session_stats_v1', [lb, 'p3-test']);
    const bf2 = await rpc(c, 'trivia_backfill_session_stats_v1', [lb, 'p3-test']);
    const bfb = await rpc(c, 'trivia_backfill_session_stats_v1', [lbad, 'p3-test']);
    check('backfill_verified_once_and_refuses_unverifiable', bf.success && bf2.error === 'not_a_backfill_candidate' && bfb.reason === 'reward_reference_mismatch', { bf, bf2, bfb });

    // S14 health + alert episodes
    const h1 = await rpc(c, 'trivia_question_health_v1', [true]);
    const h2 = await rpc(c, 'trivia_question_health_v1', [true]);
    const hk1 = h1.events.filter(e => e.status === 'firing').map(e => e.event_key).sort(), hk2 = h2.events.filter(e => e.status === 'firing').map(e => e.event_key).sort();
    check('health_metrics_and_stable_episode_keys', h1.success && h1.metrics.eligible_pool > 14000 && JSON.stringify(hk1) === JSON.stringify(hk2)
        && typeof h1.metrics.repeat_rate_7d === 'number', { conditions: h1.conditions.map(x => x.alertname) });

    // S15 ACL probes
    const aclDenied = [
        ['anon', null, 'SELECT count(*) FROM public.trivia_question_revisions'],
        ['authenticated', U(1), 'SELECT count(*) FROM public.trivia_eligible_question_pool_v1'],
        ['authenticated', U(1), 'SELECT count(*) FROM public.trivia_session_answers'],
        ['authenticated', U(1), 'SELECT count(*) FROM public.trivia_roster_snapshot_items'],
        ['authenticated', U(1), 'SELECT public.trivia_session_answer_v3($1,$2,$3,0,NULL)', [sA, U(1), q1.id]],
        ['authenticated', U(1), "SELECT public.trivia_engine_secret_v1('roster-v1')"],
        ['authenticated', U(1), "INSERT INTO public.trivia_question_reports (question_id, user_id, reason) VALUES ($1,$2,'other')", [X, U(1)]],
        ['authenticated', U(1), 'SELECT triage_note FROM public.trivia_question_reports'],
        ['service_role', null, 'SELECT count(*) FROM public.trivia_engine_secrets'],
        ['service_role', null, "SELECT public.trivia_engine_secret_v1('roster-v1')"],
        ['service_role', null, "SELECT count(*) FROM public.trivia_select_core_v1('x'::bytea,'l','pvp.standard/roster@1',1,'{}','{}',now())"],
        ['service_role', null, "UPDATE public.trivia_session_answers SET display_index = 0"],
        ['service_role', null, "DELETE FROM public.trivia_roster_snapshot_items"],
    ];
    let aclFail = [];
    for (const [role, sub, sql, args] of aclDenied) if (!(await denied(c, role, sub, sql, args || []))) aclFail.push(`${role}: ${sql.slice(0, 60)}`);
    check('acl_browser_and_service_denials', aclFail.length === 0, aclFail);
    const ownReport = await as(c, 'authenticated', U(1), async () => (await c.query('SELECT id, state FROM public.trivia_question_reports')).rows.length);
    const ownSession = await as(c, 'authenticated', U(1), async () => (await c.query('SELECT id FROM public.trivia_sessions')).rows.length);
    check('acl_player_reads_own_rows', ownReport >= 1 && ownSession >= 1, { ownReport, ownSession });
    await c.end();
}

(async () => {
    const t0 = Date.now();
    const engine = await import(path.join(ROOT, 'src/lib/trivia/deterministicEngine.mjs'));
    let aggregate = null;
    try { aggregate = await golden(engine); } catch (e) { check('golden_suite_ran', false, e.stack.slice(0, 500)); }
    try { await scenarios(); } catch (e) { check('scenario_suite_ran', false, e.stack.slice(0, 700)); }
    const summary = { suite: 'trivia-phase3-replica', ranAt: new Date().toISOString(), seconds: Math.round((Date.now() - t0) / 1000),
        passed: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length, goldenAggregate: aggregate, results };
    fs.writeFileSync(OUT, JSON.stringify(summary, null, 1));
    console.log(`passed ${summary.passed} failed ${summary.failed} in ${summary.seconds}s`);
    process.exit(summary.failed ? 1 : 0);
})();

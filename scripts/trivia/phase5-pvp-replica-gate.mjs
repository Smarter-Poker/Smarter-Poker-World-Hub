#!/usr/bin/env node
/**
 * Trivia Phase 5 - PvP engine replica gate (REPLICA ONLY).
 *
 * Proves the Phase 5 exit gate against a local replica database that holds the
 * installed Phase 2 + Phase 3 + Phase 5 migrations and synthetic fixtures:
 * stable 20-45 s horse deadline (fake clock, every value), human priority at
 * the boundary, 100+ concurrent join/cancel/two-tab clients, resume at every
 * state, win/tie/forfeit/refund/horse outcomes with exact conservation,
 * mid-settlement fault injection, ACL probes and horse fleet/plan audits.
 *
 * Safety: refuses to run unless PGHOST is a local socket directory or
 * localhost AND PGDATABASE starts with "p5_". It never talks to production.
 * Usage: PGHOST=<socket dir> PGPORT=55432 PGUSER=postgres PGDATABASE=p5_pvp_t \
 *        node scripts/trivia/phase5-pvp-replica-gate.mjs [--out report.json]
 */
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const host = process.env.PGHOST || '';
const db = process.env.PGDATABASE || '';
if (!(host.startsWith('/') || host === 'localhost' || host === '127.0.0.1') || !db.startsWith('p5_')) {
    console.error('refusing: replica gate needs a local PGHOST and a p5_* PGDATABASE');
    process.exit(2);
}
const outPath = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : null;
const pool = new pg.Pool({ max: 48 });
pool.on('connect', (c) => c.query(`select set_config('request.jwt.claims', '{"role":"service_role"}', false)`));

const report = { gate: 'trivia-phase5-pvp-replica', database: db, started_at: new Date().toISOString(), sections: {} };
let failures = 0;
function check(section, name, ok, detail) {
    const s = (report.sections[section] ||= { passed: 0, failed: 0, checks: [] });
    if (ok) s.passed += 1; else { s.failed += 1; failures += 1; }
    s.checks.push(detail === undefined ? { name, ok } : { name, ok, detail });
    if (!ok) console.error(`FAIL [${section}] ${name}`, detail === undefined ? '' : JSON.stringify(detail).slice(0, 400));
}
const q = async (sql, params = []) => (await pool.query(sql, params)).rows;
const one = async (sql, params = []) => (await q(sql, params))[0];
const val = async (sql, params = []) => { const r = await one(sql, params); return r ? Object.values(r)[0] : undefined; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const idOf = (kind, n) => val(`select extensions.uuid_generate_v5('a5a5a5a5-0000-4000-8000-000000000005'::uuid, $1)`, [`${kind}:${n}`]);
const join = (u, stake, nonce, horses = false, now = null, wait = null) =>
    val(`select public.trivia_pvp__join_core($1,$2,$3,$4,$5,$6)`, [u, stake, nonce, horses, now, wait]);
const status = (u, horses = false, now = null, ticket = null) =>
    val(`select public.trivia_pvp__status_core($1,$2,$3,$4)`, [u, ticket, horses, now]);
const cancel = (u, ticket = null) => val(`select public.trivia_pvp__cancel_core($1,$2,null)`, [u, ticket]);
const balance = (u) => val(`select diamonds::bigint from profiles where id = $1`, [u]).then(Number);
const account = (code) => val(`select coalesce((select balance from trivia_ledger_accounts where account_code = $1), 0)::bigint`, [code]).then(Number);
const iso = (d) => new Date(d).toISOString();
const shifted = new Set();

async function setupTestHelpers() {
    await q(`create schema if not exists p5test`);
    await q(`create table if not exists p5test.faults(step text primary key)`);
    await q(`create or replace function p5test.fault() returns trigger language plpgsql as $$
        begin
          if exists (select 1 from p5test.faults where step = tg_argv[0])
             and (tg_argv[0] <> 'complete' or to_jsonb(new) ->> 'status' = 'complete') then
            raise exception 'injected fault at %', tg_argv[0];
          end if;
          return coalesce(new, old);
        end $$`);
    for (const [step, tbl, ev] of [['decision', 'trivia_pvp_settlement_decisions', 'insert'],
        ['complete', 'trivia_pvp_matches', 'update'], ['stats', 'trivia_pvp_stats', 'insert or update'],
        ['reveal', 'trivia_roster_scope_closures', 'insert']]) {
        await q(`drop trigger if exists zz_p5test_fault_${step} on public.${tbl}`);
        await q(`create trigger zz_p5test_fault_${step} before ${ev} on public.${tbl} for each row execute function p5test.fault('${step}')`);
    }
    await q(`create or replace function p5test.answer_all(p_session uuid, p_user uuid, p_correct integer, p_limit integer default 1000)
        returns integer language plpgsql as $$
        declare r record; v_disp integer; v_n integer := 0; v_res jsonb; v_perm jsonb;
        begin
          select permutations into v_perm from public.trivia_sessions where id = p_session;
          for r in select a.position, a.question_id, q.correct_index from public.trivia_session_answers a
                     join public.trivia_question_revisions q on q.id = a.revision_id
                    where a.session_id = p_session and a.outcome is null order by a.position limit p_limit loop
            select (e.ord - 1)::int into v_disp from jsonb_array_elements_text(v_perm -> r.question_id::text) with ordinality e(v, ord)
             where (e.v::int = r.correct_index) = (r.position <= p_correct) limit 1;
            v_res := public.trivia_session_answer_v3(p_session, p_user, r.question_id, v_disp, null);
            if (v_res ->> 'recorded')::boolean then v_n := v_n + 1; end if;
          end loop;
          return v_n;
        end $$`);
    // Fake clock for deadline cases: move one match (and its seats/plan) back in time.
    await q(`create or replace function p5test.shift_match(p_match uuid, p_seconds integer) returns void language plpgsql as $$
        declare v interval := make_interval(secs => p_seconds);
        begin
          perform set_config('session_replication_role', 'replica', true);
          update public.trivia_pvp_matches set created_at = created_at - v, activated_at = activated_at - v, deadline_at = deadline_at - v where id = p_match;
          update public.trivia_sessions set created_at = created_at - v, expires_at = expires_at - v
           where id in (select session_id from public.trivia_pvp_session_links where match_id = p_match);
          update public.trivia_session_answers set opened_at = opened_at - v, deadline_at = deadline_at - v, answered_at = answered_at - v
           where session_id in (select session_id from public.trivia_pvp_session_links where match_id = p_match);
          update public.trivia_pvp_horse_plans set starts_at = starts_at - v, finishes_at = finishes_at - v where match_id = p_match;
          perform set_config('session_replication_role', 'origin', true);
        end $$`);
}

async function seatOf(match, side) {
    return one(`select l.session_id, l.user_id from trivia_pvp_session_links l where l.match_id = $1 and l.side = $2`, [match, side]);
}
async function matchOf(user) {
    return val(`select m.id from trivia_pvp_matches m where m.engine_version = 'pvp-v2' and $1 in (m.player1_id, m.player2_id) order by m.created_at desc limit 1`, [user]);
}
async function matchInvariants(section, match, expectKind) {
    const m = await one(`select m.*, s.state as settle_state, s.outcome as settle_outcome, s.gross_pool, s.rake_amount,
            (select balance from trivia_ledger_accounts a where a.account_code = s.escrow_account_code) as escrow,
            (select count(*) from trivia_pvp_settlement_decisions d where d.match_id = m.id) as decisions,
            (select count(*) from trivia_settlements s2 where s2.subject_id = m.id) as settlements,
            (select count(*) from trivia_roster_scope_closures c where c.snapshot_id = m.roster_snapshot_id) as reveals
          from trivia_pvp_matches m join trivia_settlements s on s.subject_type = 'pvp_match' and s.subject_id = m.id where m.id = $1`, [match]);
    check(section, `${expectKind}: match complete, one decision, one settlement, escrow 0, roster revealed`,
        m && m.status === 'complete' && Number(m.decisions) === 1 && Number(m.settlements) === 1
        && Number(m.escrow) === 0 && Number(m.reveals) >= 1 && ['settled', 'refunded'].includes(m.settle_state),
        m && { status: m.status, decisions: m.decisions, settle: m.settle_state, outcome: m.settle_outcome, escrow: m.escrow });
    return m;
}

// ---------------------------------------------------------------- 1. 20..45 fake-clock properties
async function propertyWait() {
    const S = 'fallback_20_45_fake_clock';
    const rows = [];
    // One stake bucket, so the tickets run one after another: concurrent live
    // tickets in the same bucket would (correctly) be paired as humans first.
    for (const W of Array.from({ length: 26 }, (_, k) => k + 20)) {
        const k = W - 20;
        const u = await idOf('human', 1 + k);
        const t0 = Date.now() - (W + 2) * 1000;
        const nonce = randomUUID();
        await join(u, 10, nonce, true, iso(t0), W);
        const t = await one(`select * from trivia_pvp_queue where user_id = $1 and client_nonce = $2`, [u, nonce]);
        const exact = new Date(t.horse_eligible_at).getTime() - new Date(t.joined_at).getTime() === W * 1000;
        // live client: heartbeats every 5 s of fake time; retry + second tab never reroll
        for (let s = 5; s < W; s += 5) await status(u, true, iso(t0 + s * 1000));
        await join(u, 10, nonce, true, iso(t0 + 3000));
        await join(u, 10, randomUUID(), true, iso(t0 + 4000));
        const before = await status(u, true, iso(t0 + W * 1000 - 1));
        const t2 = await one(`select horse_eligible_at, status, horse_wait_seconds, (select count(*) from trivia_pvp_queue where user_id = $1) as tickets from trivia_pvp_queue where id = $2`, [u, t.id]);
        const at = await status(u, true, iso(t0 + W * 1000));
        const t3 = await one(`select status, match_kind, matched_at, horse_eligible_at from trivia_pvp_queue where id = $1`, [t.id]);
        rows.push({ W, exact, before: before.state, stable: iso(t2.horse_eligible_at) === iso(t.horse_eligible_at) && Number(t2.tickets) === 1,
            at: at.state, kind: t3.match_kind, late_ms: new Date(t3.matched_at) - new Date(t3.horse_eligible_at) });
    }
    rows.sort((a, b) => a.W - b.W);
    for (const r of rows) {
        check(S, `W=${r.W}: deadline = joined + ${r.W}s, no horse at -1ms, stable across retry/second tab, horse at deadline`,
            r.exact && r.before === 'searching' && r.stable && r.kind === 'horse' && r.late_ms === 0 && ['dealing', 'playing'].includes(r.at), r);
    }
    report.sections[S].values = rows.map((r) => r.W);
}

// ---------------------------------------------------------------- 2. CSPRNG draw uniformity
async function drawDistribution() {
    const S = 'fallback_draw_distribution';
    const rows = await q(`select w, count(*)::int as n from (select public.trivia_pvp__draw_wait_seconds() as w from generate_series(1, 26000)) d group by w order by w`);
    const counts = Object.fromEntries(rows.map((r) => [r.w, r.n]));
    const values = rows.map((r) => r.w);
    const chi2 = rows.reduce((s, r) => s + ((r.n - 1000) ** 2) / 1000, 0);
    check(S, 'every draw is an integer in 20..45 and all 26 values occur', values.length === 26 && values[0] === 20 && values[25] === 45, { values: values.length });
    check(S, 'chi-square (25 dof) below 52.6 (p=0.001)', chi2 < 52.6, { chi2: Number(chi2.toFixed(2)), counts });
}

// ---------------------------------------------------------------- 3. boundary race: a committed human wins
async function boundaryRace() {
    const S = 'boundary_human_priority';
    let human = 0, horse = 0, violations = [];
    for (let i = 0; i < 100; i += 1) {
        const a = await idOf('human', 60 + (i % 20) * 2);
        const b = await idOf('human', 61 + (i % 20) * 2);
        const offset = Math.floor(Math.random() * 60) - 30;
        const t0 = Date.now() - 20000 + offset;
        await join(a, 50, randomUUID(), true, iso(t0), 20);
        await status(a, true, iso(Date.now() - 200));
        const [, bj] = await Promise.all([status(a, true), join(b, 50, randomUUID(), true)]);
        const ta = await one(`select * from trivia_pvp_queue where user_id = $1 order by joined_at desc limit 1`, [a]);
        const tb = await one(`select * from trivia_pvp_queue where user_id = $1 order by joined_at desc limit 1`, [b]);
        if (ta.match_kind === 'human') human += 1; else if (ta.match_kind === 'horse') horse += 1;
        if (ta.match_kind === 'horse' && new Date(tb.joined_at) < new Date(ta.matched_at)) violations.push({ i, a: ta.matched_at, b: tb.joined_at });
        if (ta.match_kind === 'horse' && new Date(ta.matched_at) < new Date(ta.horse_eligible_at)) violations.push({ i, early: true });
        if (tb.status === 'waiting') await cancel(b);
        // finish both matches quickly so seats free up for the next iteration
        for (const u of [a, b]) {
            const m = await matchOf(u);
            if (m && (await val(`select status from trivia_pvp_matches where id = $1`, [m])) === 'active') {
                await p5settleNow(m);
            }
        }
        void bj;
    }
    check(S, 'no horse was claimed while a compatible human had committed before the claim; never before the deadline',
        violations.length === 0, { iterations: 100, human_matches: human, horse_matches: horse, violations: violations.slice(0, 5) });
    check(S, 'both race orders were exercised', human > 0 && horse > 0, { human, horse });
}

// Finish a match: both seats answer, horse plan fully due, then settle via status.
async function p5settleNow(match, c1 = 12, c2 = 8) {
    for (const side of [1, 2]) {
        const s = await seatOf(match, side);
        const isHorse = await val(`select actor_type = 'horse' from trivia_sessions where id = $1`, [s.session_id]);
        if (!isHorse) await val(`select p5test.answer_all($1,$2,$3)`, [s.session_id, s.user_id, side === 1 ? c1 : c2]);
    }
    await val(`select public.trivia_pvp__drive_match($1, clock_timestamp() + interval '25 minutes')`, [match]);
    return val(`select public.trivia_pvp__advance_match($1, null)`, [match]);
}

// ---------------------------------------------------------------- 4. 100+ concurrent clients
async function concurrency() {
    const S = 'concurrency_join_cancel_two_tab';
    const users = await Promise.all(Array.from({ length: 140 }, (_, i) => idOf('human', 101 + i)));
    const before = Object.fromEntries(await Promise.all(users.map(async (u) => [u, await balance(u)])));
    const rakeBefore = await account('house:rake:pvp');
    const cancelRaces = [];
    await Promise.all(users.map(async (u, i) => {
        const stake = i % 2 ? 10 : 25;
        const n1 = randomUUID();
        const ops = [join(u, stake, n1, false)];
        if (i % 3 === 0) ops.push(join(u, stake, randomUUID(), false));        // second tab
        if (i % 7 === 0) ops.push(join(u, stake, n1, false));                  // retry
        if (i % 5 === 0) ops.push(sleep(Math.random() * 40).then(() => cancel(u)).then((d) => cancelRaces.push(d.cancel)));
        await Promise.all(ops);
        for (let k = 0; k < 3; k += 1) { await sleep(Math.random() * 30); await status(u, false); }
    }));
    const inv = await one(`
        with t as (select * from trivia_pvp_queue where user_id = any($1::uuid[]) and engine_version = 'pvp-v2'),
             m as (select * from trivia_pvp_matches where engine_version = 'pvp-v2' and (player1_id = any($1::uuid[]) or player2_id = any($1::uuid[])))
        select (select count(*) from (select user_id from t where status = 'waiting' group by user_id having count(*) > 1) x) as dup_waiting,
               (select count(*) from (select user_id, client_nonce from t group by 1, 2 having count(*) > 1) x) as dup_nonce,
               (select count(*) from (select u from (select player1_id u from m where status in ('active','settling') union all select player2_id from m where status in ('active','settling')) y group by u having count(*) > 1) x) as dup_active,
               (select count(*) from m) as matches,
               (select count(*) from m where player1_id = player2_id or stake_amount is null) as bad_matches,
               (select count(*) from t where status = 'matched') as matched_tickets,
               (select count(*) from t where status = 'matched' and match_id not in (select id from m)) as orphan_tickets,
               (select count(*) from m where (select count(*) from trivia_pvp_queue q where q.match_id = m.id) <> 2) as matches_without_two_tickets,
               (select count(*) from m where (select count(*) from trivia_pvp_session_links l where l.match_id = m.id) <> 2) as matches_without_two_sessions,
               (select count(*) from m where (select count(*) from trivia_settlement_participants p join trivia_settlements s on s.id = p.settlement_id where s.subject_id = m.id and p.state = 'held') <> 2) as matches_without_two_holds,
               (select count(*) from m m2 where (select count(*) from diamond_transactions d where d.reference_id like 'pvp_stake_' || m2.id || '_%') <> 2) as matches_without_two_debits,
               (select count(*) from t where status = 'cancelled' and match_id is not null) as cancelled_with_match,
               (select count(*) from t where status = 'matched' and lease_expires_at <= matched_at) as ghost_matches`, [users]);
    for (const [k, v] of Object.entries(inv)) {
        if (['matches', 'matched_tickets'].includes(k)) continue;
        check(S, `${k} = 0`, Number(v) === 0, { value: v });
    }
    check(S, 'clients paired into matches', Number(inv.matches) > 20 && Number(inv.matched_tickets) === 2 * Number(inv.matches), inv);
    // every wallet delta equals exactly one stake per match the user sits in
    const perUser = await q(`select u, coalesce(sum(m.stake_amount), 0)::bigint as staked from unnest($1::uuid[]) u
        left join trivia_pvp_matches m on m.engine_version = 'pvp-v2' and u in (m.player1_id, m.player2_id) group by u`, [users]);
    let chargeMismatch = 0;
    for (const r of perUser) if ((await balance(r.u)) !== before[r.u] - Number(r.staked)) chargeMismatch += 1;
    check(S, 'no duplicate or missing charge: wallet delta = one stake per match', chargeMismatch === 0, { chargeMismatch });
    report.sections[S].cancel_outcomes = cancelRaces.reduce((a, c) => ({ ...a, [c]: (a[c] || 0) + 1 }), {});
    // settle everything and prove conservation
    const matches = (await q(`select id from trivia_pvp_matches where engine_version = 'pvp-v2' and status = 'active' and (player1_id = any($1::uuid[]) or player2_id = any($1::uuid[]))`, [users])).map((r) => r.id);
    await Promise.all(matches.map((m, i) => p5settleNow(m, 5 + (i % 11), 5 + ((i * 7) % 11))));
    const after = await Promise.all(users.map(balance));
    const deltaUsers = after.reduce((s, b, i) => s + (b - before[users[i]]), 0);
    const deltaRake = (await account('house:rake:pvp')) - rakeBefore;
    const openEscrow = await val(`select coalesce(sum(abs(a.balance)), 0)::bigint from trivia_pvp_matches m join trivia_settlements s on s.subject_id = m.id
        join trivia_ledger_accounts a on a.account_code = s.escrow_account_code where m.id = any($1::uuid[])`, [matches]);
    const decided = await val(`select count(*) from trivia_pvp_settlement_decisions where match_id = any($1::uuid[])`, [matches]);
    check(S, 'all concurrent matches settled once with zero escrow', Number(decided) === matches.length && Number(openEscrow) === 0, { matches: matches.length, decided, openEscrow });
    check(S, 'exact conservation: players + rake = 0', deltaUsers + deltaRake === 0, { deltaUsers, deltaRake });
    // horses: 4 stake buckets in parallel, 10 fallbacks each -> concurrent fleet
    // selection across buckets; each seat a distinct horse, all treasury funded
    const hu = await Promise.all(Array.from({ length: 40 }, (_, i) => idOf('human', 241 + i)));
    await Promise.all([10, 25, 50, 100].map(async (stake, b) => {
        for (const u of hu.slice(b * 10, b * 10 + 10)) {
            await join(u, stake, randomUUID(), true, iso(Date.now() - 25000), 20);
            await status(u, true);
        }
    }));
    const hm = await one(`select count(*) as matches, count(distinct player2_id) as horses,
            count(*) filter (where (select count(*) from trivia_pvp_matches m2 where m2.player2_id = m.player2_id and m2.status = 'active') > 1) as double_seated,
            count(*) filter (where (select p.funding_source from trivia_settlement_participants p join trivia_settlements s on s.id = p.settlement_id where s.subject_id = m.id and p.user_id = m.player2_id) <> 'treasury') as not_treasury
          from trivia_pvp_matches m where m.match_kind = 'human_horse' and m.player1_id = any($1::uuid[]) and m.status = 'active'`, [hu]);
    check(S, '40 concurrent fallbacks: 40 distinct horses, none double-seated, all treasury funded',
        Number(hm.matches) === 40 && Number(hm.horses) === 40 && Number(hm.double_seated) === 0 && Number(hm.not_treasury) === 0, hm);
}

// ---------------------------------------------------------------- 5. refresh/resume at every state
async function resumeStates() {
    const S = 'refresh_resume_states';
    const [a, b] = await Promise.all([idOf('human', 301), idOf('human', 302)]);
    const [ba, bb] = [await balance(a), await balance(b)];
    const n = randomUUID();
    const seen = [];
    const probe = async (label, expectA, expectB, { bInPlay = true, newTab = true } = {}) => {
        const snapshots = [await status(a), await status(b)];
        await join(a, 100, n);                                   // retry, same nonce
        if (newTab) await join(a, 100, randomUUID());            // second tab
        await status(a, false, null, snapshots[0].ticket?.id ?? null); // resume by ticket
        if (bInPlay && newTab) await join(b, 100, randomUUID());
        const after = [await status(a), await status(b)];
        const counts = await one(`select (select count(*) from trivia_pvp_queue where user_id = $1) ta, (select count(*) from trivia_pvp_queue where user_id = $2) tb,
             (select count(*) from trivia_pvp_matches where $1 in (player1_id, player2_id)) ma,
             (select count(*) from diamond_transactions where user_id = $1 and reference_id like 'pvp_stake_%') ca`, [a, b]);
        seen.push({ label, a: after[0].state, b: after[1].state, counts });
        check(S, `${label}: state stable across retry, second tab and resume`, after[0].state === snapshots[0].state
            && (expectA ? after[0].state === expectA : true) && (expectB ? after[1].state === expectB : true)
            && Number(counts.ma) <= 1 && Number(counts.ca) <= 1, { label, before: snapshots.map((s) => s.state), after: after.map((s) => s.state), counts });
    };
    await join(a, 100, n);
    await probe('searching', 'searching', 'idle', { bInPlay: false });
    await join(b, 100, randomUUID());
    const m = await matchOf(a);
    await probe('dealing', 'dealing', 'dealing');
    const sa = await seatOf(m, 1); const sb = await seatOf(m, 2);
    await val(`select p5test.answer_all($1,$2,$3,$4)`, [sa.session_id, sa.user_id, 3, 3]);
    await probe('playing', 'playing', null);
    await val(`select p5test.answer_all($1,$2,$3)`, [sa.session_id, sa.user_id, 17]);
    await probe('waiting', 'waiting', null);
    await q(`insert into p5test.faults values ('decision') on conflict do nothing`);
    await val(`select p5test.answer_all($1,$2,$3)`, [sb.session_id, sb.user_id, 9]);
    await probe('settling', 'settling', 'settling');
    await q(`delete from p5test.faults`);
    await status(a);
    await probe('result', 'result', 'result', { newTab: false });
    const res = await status(a);
    check(S, 'result DTO: win 20 vs 9... exact payout and receipts', res.result?.outcome === 'win' && res.result?.payout === 180
        && res.result?.rake === 20 && (await balance(a)) - ba === 80 && (await balance(b)) - bb === -100, res.result);
    report.sections[S].walk = seen;
}

// ---------------------------------------------------------------- 6. outcome matrix with exact conservation
async function outcomes() {
    const S = 'settlement_outcomes_conservation';
    const stake = 50; const rake = 10; const payout = 90;
    const scenario = async (label, ua, ub, fn, expect) => {
        const [b0a, b0b, r0, t0] = [await balance(ua), ub ? await balance(ub) : 0, await account('house:rake:pvp'), await account('treasury:trivia')];
        await join(ua, stake, randomUUID(), !ub, ub ? null : iso(Date.now() - 22000), ub ? null : 20);
        if (ub) await join(ub, stake, randomUUID(), false); else await status(ua, true);
        const m = await matchOf(ua);
        await fn(m);
        const [da, db2, dr, dt] = [(await balance(ua)) - b0a, ub ? (await balance(ub)) - b0b : 0, (await account('house:rake:pvp')) - r0, (await account('treasury:trivia')) - t0];
        const mm = await matchInvariants(S, m, label);
        const horseWallet = ub ? null : await val(`select diamonds from profiles where id = $1`, [mm.player2_id]);
        check(S, `${label}: deltas human ${expect.a}/${expect.b ?? '-'} treasury ${expect.t ?? 0} rake ${expect.r}; sum 0`,
            da === expect.a && (ub ? db2 === expect.b : true) && dr === expect.r && dt === (expect.t ?? 0) && da + db2 + dr + dt === 0
            && (ub ? true : Number(horseWallet) === 5000),
            { da, db: db2, dr, dt, kind: mm.settlement_kind, horseWallet });
        return mm;
    };
    const H = async (n) => idOf('human', n);
    const answer = async (m, side, correct, limit) => { const s = await seatOf(m, side); return val(`select p5test.answer_all($1,$2,$3,$4)`, [s.session_id, s.user_id, correct, limit ?? 1000]); };
    await scenario('human-human win', await H(311), await H(312), async (m) => { await answer(m, 1, 18); await answer(m, 2, 10); await status(await H(311)); },
        { a: payout - stake, b: -stake, r: rake });
    await scenario('human-human tie', await H(313), await H(314), async (m) => { await answer(m, 1, 12); await answer(m, 2, 12); await status(await H(313)); },
        { a: 0, b: 0, r: 0 });
    await scenario('human-human forfeit (opponent abandons)', await H(315), await H(316), async (m) => {
        await answer(m, 1, 4); await answer(m, 2, 3, 5); shifted.add(m); await val(`select p5test.shift_match($1, 1900)`, [m]); await status(await H(315));
    }, { a: payout - stake, b: -stake, r: rake });
    await scenario('human-human refund (both abandon)', await H(317), await H(318), async (m) => {
        await answer(m, 1, 3, 4); shifted.add(m); await val(`select p5test.shift_match($1, 1900)`, [m]); await val(`select public.trivia_pvp__recover_core(100, null)`);
    }, { a: 0, b: 0, r: 0 });
    await scenario('human beats horse', await H(319), null, async (m) => {
        await answer(m, 1, 20); await val(`select public.trivia_pvp__drive_match($1, clock_timestamp() + interval '25 minutes')`, [m]); await status(await H(319), true);
    }, { a: payout - stake, r: rake, t: -stake });
    await scenario('horse beats human', await H(320), null, async (m) => {
        await answer(m, 1, 0); await val(`select public.trivia_pvp__drive_match($1, clock_timestamp() + interval '25 minutes')`, [m]); await status(await H(320), true);
    }, { a: -stake, r: rake, t: stake - rake });
    await scenario('human-horse tie', await H(321), null, async (m) => {
        const c = await val(`select count(*) filter (where (e ->> 'c')::boolean)::int from trivia_pvp_horse_plans p, jsonb_array_elements(p.plan) e where p.match_id = $1`, [m]);
        await answer(m, 1, c); await val(`select public.trivia_pvp__drive_match($1, clock_timestamp() + interval '25 minutes')`, [m]); await status(await H(321), true);
    }, { a: 0, r: 0, t: 0 });
    await scenario('human abandons vs horse (horse wins by forfeit)', await H(322), null, async (m) => {
        await answer(m, 1, 2, 3); await val(`select public.trivia_pvp__drive_match($1, clock_timestamp() + interval '25 minutes')`, [m]);
        shifted.add(m); await val(`select p5test.shift_match($1, 1900)`, [m]); await val(`select public.trivia_pvp__recover_core(100, null)`);
    }, { a: -stake, r: rake, t: stake - rake });
    await scenario('no driver before deadline (both seats expire: refund)', await H(323), null, async (m) => {
        shifted.add(m); await val(`select p5test.shift_match($1, 1900)`, [m]); await val(`select public.trivia_pvp__recover_core(100, null)`);
    }, { a: 0, r: 0, t: 0 });
    // Legacy v1 decide on an ACTIVE v2 match whose seats were closed outside the
    // engine reaches its decision insert: the v2 guard must refuse it, no money moves.
    const [la, lb] = [await H(324), await H(325)];
    await join(la, 10, randomUUID()); await join(lb, 10, randomUUID());
    const lm = await matchOf(la);
    for (const side of [1, 2]) {
        const s = await seatOf(lm, side);
        await val(`select p5test.answer_all($1,$2,$3)`, [s.session_id, s.user_id, 10]);
        await val(`select public.trivia_session_submit_v3($1,$2,null)`, [s.session_id, s.user_id]);
    }
    const legacy = await one(`select public.decide_trivia_pvp_settlement_v1($1, false) as r`, [lm]).catch((e) => ({ err: e.message }));
    const untouched = await one(`select (select count(*) from trivia_pvp_settlement_decisions where match_id = $1) dec,
        (select count(*) from diamond_transactions where reference_id like 'pvp_%_' || $1 || '%' and amount > 0) credits,
        (select balance from trivia_ledger_accounts where account_code = 'escrow:pvp:' || $1) escrow`, [lm]);
    check(S, 'legacy v1 decide is refused on a v2 match and moves nothing', /settle only through/.test(legacy.err || '')
        && untouched.dec === '0' && untouched.credits === '0' && Number(untouched.escrow) === 20, { legacy, untouched });
    await status(la);
    await matchInvariants(S, lm, 'v2 settlement after the refused legacy attempt');
}

// ---------------------------------------------------------------- 7. fault injection
async function faults() {
    const S = 'fault_injection_atomicity';
    let i = 0;
    for (const step of ['decision', 'complete', 'stats', 'reveal']) {
        const [a, b] = [await idOf('human', 331 + i * 2), await idOf('human', 332 + i * 2)]; i += 1;
        await join(a, 25, randomUUID()); await join(b, 25, randomUUID());
        const m = await matchOf(a);
        const snap = async () => one(`select (select diamonds from profiles where id = $2) ba, (select diamonds from profiles where id = $3) bb,
              (select balance from trivia_ledger_accounts where account_code = 'escrow:pvp:' || $1) escrow,
              (select state from trivia_settlements where subject_id = $1::uuid) st, (select status from trivia_pvp_matches where id = $1::uuid) ms,
              (select count(*) from trivia_pvp_settlement_decisions where match_id = $1::uuid) dec,
              (select count(*) from diamond_transactions where reference_id in ('pvp_match_win_' || $1, 'pvp_tie_refund_' || $1 || '_' || $2, 'pvp_tie_refund_' || $1 || '_' || $3)) credits,
              (select count(*) from trivia_pvp_stats where user_id in ($2::uuid, $3::uuid)) stats`, [m, a, b]);
        const s1 = await seatOf(m, 1); const s2 = await seatOf(m, 2);
        await val(`select p5test.answer_all($1,$2,$3)`, [s1.session_id, s1.user_id, 15]);
        await q(`insert into p5test.faults values ($1) on conflict do nothing`, [step]);
        const pre = await snap();
        await val(`select p5test.answer_all($1,$2,$3)`, [s2.session_id, s2.user_id, 11]);
        const dto = await status(a);
        const mid = await snap();
        check(S, `fault at ${step}: nothing committed (no decision/credit/stats, escrow intact, match active, DTO settling)`,
            dto.state === 'settling' && mid.dec === '0' && mid.credits === '0' && mid.ms === 'active' && Number(mid.escrow) === 50
            && mid.st === 'locked' && mid.ba === pre.ba && mid.bb === pre.bb && mid.stats === pre.stats, { dto: dto.state, pre, mid });
        await q(`delete from p5test.faults`);
        await status(a); await status(b); await val(`select public.trivia_pvp_settle_v2($1,$2)`, [b, m]);
        const post = await snap();
        check(S, `fault at ${step}: retry settles exactly once`, post.dec === '1' && post.credits === '1' && Number(post.escrow) === 0
            && post.ms === 'complete' && Number(post.ba) - Number(pre.ba) === 45, post);
    }
}

// ---------------------------------------------------------------- 8. ACL probes
async function acl() {
    const S = 'acl_no_browser_write_path';
    const client = await pool.connect();
    const probe = async (role, sql, params = []) => {
        await client.query('begin');
        try {
            await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: randomUUID(), role })]);
            await client.query(`set local role ${role}`);
            await client.query(sql, params);
            await client.query('rollback');
            return 'allowed';
        } catch (e) { await client.query('rollback'); return e.code || e.message; }
    };
    const u = await idOf('human', 1);
    const cases = [
        ['select trivia_pvp_engine_config', 'select * from trivia_pvp_engine_config'],
        ['select trivia_pvp_engine_secrets', 'select * from trivia_pvp_engine_secrets'],
        ['select trivia_pvp_horse_plans', 'select * from trivia_pvp_horse_plans'],
        ['select trivia_pvp_match_events', 'select * from trivia_pvp_match_events'],
        ['insert queue ticket', `insert into trivia_pvp_queue (user_id, stake_amount, expires_at) values ('${u}', 10, now() + interval '1 minute')`],
        ['update queue deadline', `update trivia_pvp_queue set horse_eligible_at = now()`],
        ['update match', `update trivia_pvp_matches set status = 'complete'`],
        ['insert session link', `insert into trivia_pvp_session_links (match_id, side, user_id, session_id) values (gen_random_uuid(), 1, '${u}', gen_random_uuid())`],
        ['execute join_v2', `select public.trivia_pvp_join_v2('${u}', 10, gen_random_uuid(), true)`],
        ['execute status_v2', `select public.trivia_pvp_status_v2('${u}', null, true)`],
        ['execute settle_v2', `select public.trivia_pvp_settle_v2('${u}', gen_random_uuid())`],
        ['execute recover_v2', `select public.trivia_pvp_recover_v2(1)`],
        ['execute join_core', `select public.trivia_pvp__join_core('${u}', 10, gen_random_uuid(), true, null, 20)`],
        ['execute settle_core', `select public.trivia_pvp__settle_core(gen_random_uuid(), true, null)`],
    ];
    for (const role of ['anon', 'authenticated']) {
        for (const [name, sql] of cases) {
            const r = await probe(role, sql);
            check(S, `${role} cannot ${name}`, r === '42501', { result: r });
        }
    }
    // service role: RPCs yes; direct forging no (guards)
    const svc = [
        ['forge v2 ticket without join authority', `insert into trivia_pvp_queue (user_id, stake_amount, status, expires_at, engine_version, client_nonce, rules_version_id, joined_at, heartbeat_at, lease_expires_at, horse_wait_seconds, horse_eligible_at, updated_at, created_at)
            values ('${u}', 10, 'waiting', now() + interval '5 minutes', 'pvp-v2', gen_random_uuid(), 'pvp.standard@1', now(), now(), now() + interval '15 seconds', 20, now() + interval '20 seconds', now(), now())`],
        ['reroll a stored horse deadline', `update trivia_pvp_queue set horse_eligible_at = horse_eligible_at + interval '1 second', horse_wait_seconds = horse_wait_seconds + 1 where engine_version = 'pvp-v2' and horse_wait_seconds < 45`],
        ['close a v2 match directly', `update trivia_pvp_matches set status = 'settling' where engine_version = 'pvp-v2' and status = 'active'`],
        ['rewrite a committed horse plan', `update trivia_pvp_horse_plans set plan = '[]'::jsonb`],
    ];
    for (const [name, sql] of svc) {
        const r = await probe('service_role', sql);
        check(S, `service_role cannot ${name}`, r !== 'allowed', { result: r });
    }
    const ok = await probe('service_role', `select public.trivia_pvp_status_v2('${u}', null, false)`);
    check(S, 'service_role can call the status RPC', ok === 'allowed', { result: ok });
    const own = await probe('authenticated', `select count(*) from trivia_pvp_queue`);
    check(S, 'authenticated keeps only its RLS-scoped own-row SELECT on the queue', own === 'allowed', { result: own });
    client.release();
}

// ---------------------------------------------------------------- 9. horse fleet, persona and plan audits
async function horses() {
    const S = 'horse_fleet_and_plan';
    const human = await idOf('human', 399);
    const picks = await q(`select (public.trivia_pvp__select_horse(gen_random_uuid(), $1, clock_timestamp())) as s from generate_series(1, 1500)`, [human]);
    const ids = picks.map((r) => r.s.horse_id).filter(Boolean);
    const rank = await q(`select id, row_number() over (order by id) as rn, skill_tier from profiles where is_horse`);
    const rankOf = Object.fromEntries(rank.map((r) => [r.id, Number(r.rn)]));
    const tiers = {}; for (const r of picks) tiers[r.s.tier] = (tiers[r.s.tier] || 0) + 1;
    const beyond50 = ids.filter((id) => rankOf[id] > 50).length;
    const maxRank = Math.max(...ids.map((id) => rankOf[id]));
    check(S, 'selection draws from the complete eligible fleet (not the first 50): >=90% beyond rank 50, tail of the fleet reached',
        ids.length === 1500 && beyond50 >= ids.length * 0.9 && maxRank >= 950 && new Set(ids).size >= 400,
        { picks: ids.length, distinct: new Set(ids).size, beyond_first_50: beyond50, max_rank: maxRank, fleet: rank.length, eligible: picks[0].s.eligible, tiers });
    const weights = { Newcomer: 0.35, Regular: 0.25, Intermediate: 0.15, Grinder: 0.15, Shark: 0.10 };
    const eligibleTiers = Object.keys(picks[0].s.eligible_by_tier || {});
    const wsum = eligibleTiers.reduce((s, t) => s + (weights[t] || 0), 0);
    const expected = Object.fromEntries(eligibleTiers.map((t) => [t, (weights[t] || 0) / wsum]));
    check(S, 'tier mix follows the configured weights renormalized over tiers with eligible horses (+-5pp)',
        eligibleTiers.length > 0 && eligibleTiers.every((t) => Math.abs((tiers[t] || 0) / 1500 - expected[t]) < 0.05),
        { tiers, expected, eligible_by_tier: picks[0].s.eligible_by_tier });
    const seated = await val(`select count(*) from trivia_pvp_active_seats s join profiles p on p.id = s.user_id where p.is_horse`);
    const cooling = await val(`select count(*) from trivia_pvp_horse_personas where last_pvp_matched_at > now() - interval '15 minutes'`);
    const bad = await val(`with s as (select (public.trivia_pvp__select_horse(gen_random_uuid(), $1, clock_timestamp()) ->> 'horse_id')::uuid h from generate_series(1, 300))
        select count(*) from s join trivia_pvp_horse_personas p on p.horse_id = s.h where p.last_pvp_matched_at > now() - interval '15 minutes'
            or exists (select 1 from trivia_pvp_active_seats a where a.user_id = s.h)`, [human]);
    check(S, 'seated and cooling-down horses are never selected', Number(bad) === 0, { seated, cooling, bad });
    await q(`update trivia_pvp_engine_config set horse_concurrency_ceiling = 1`);
    const cap = await val(`select public.trivia_pvp__select_horse(gen_random_uuid(), $1, clock_timestamp()) ->> 'error'`, [human]);
    await q(`update trivia_pvp_engine_config set horse_concurrency_ceiling = 250`);
    check(S, 'fleet concurrency ceiling is enforced', cap === 'horse_capacity', { cap });
    // plans: reproducible from the server secret, bounded, stake-free
    const plans = await q(`select p.*, (select stake_amount from trivia_pvp_matches where id = p.match_id) as stake from trivia_pvp_horse_plans p`);
    let reproduced = 0; let bounded = 0; let correct = 0; let total = 0;
    for (const p of plans.filter((x) => !shifted.has(x.match_id))) {
        const again = await val(`select public.trivia_pvp__build_horse_plan(p.match_id, p.horse_id, p.side, p.model ->> 'tier', h.category_strengths,
              (select jsonb_agg(jsonb_build_object('question_id', i.question_id, 'category', i.category, 'difficulty', i.difficulty,
                   'option_count', jsonb_array_length(r.options), 'correct_index', r.correct_index) order by i.position)
                 from trivia_pvp_matches m join trivia_roster_snapshot_items i on i.snapshot_id = m.roster_snapshot_id
                 join trivia_question_revisions r on r.id = i.revision_id where m.id = p.match_id),
              (p.model ->> 'per_question_ms')::int, p.starts_at, (select deadline_at from trivia_pvp_matches where id = p.match_id), p.secret_key_id) ->> 'plan_hash'
            from trivia_pvp_horse_plans p join trivia_pvp_horse_personas h on h.horse_id = p.horse_id where p.match_id = $1`, [p.match_id]);
        if (again === p.plan_hash) reproduced += 1;
        if (p.plan.every((e) => e.rt >= 1800 && e.rt <= 38500)) bounded += 1;
        correct += p.plan.filter((e) => e.c).length; total += p.plan.length;
    }
    const audited = plans.filter((x) => !shifted.has(x.match_id)).length;
    check(S, 'every committed plan re-derives to its stored hash (server-secret seeded, deterministic)', audited > 0 && reproduced === audited, { plans: audited, reproduced, time_shifted_fixtures_skipped: plans.length - audited });
    check(S, 'every planned response time is within [1.8 s, 38.5 s]', bounded === audited, { bounded });
    const sig = await val(`select pg_get_function_arguments('public.trivia_pvp__build_horse_plan(uuid,uuid,smallint,text,jsonb,jsonb,integer,timestamptz,timestamptz,text)'::regprocedure)`);
    check(S, 'the plan generator takes no stake input', !/stake/i.test(sig), { signature: sig, planned_accuracy: Number((correct / Math.max(total, 1)).toFixed(3)) });
    const iso2 = await one(`select
        (select count(*) from trivia_session_answers a join trivia_sessions s on s.id = a.session_id where s.actor_type = 'horse' and a.actor_type <> 'horse') as mislabeled,
        (select count(*) from trivia_session_answers a join trivia_sessions s on s.id = a.session_id where s.actor_type = 'horse' and a.outcome is not null) as horse_answers,
        (select count(*) from trivia_question_result_events e join profiles p on p.id = e.user_id where p.is_horse and e.actor_type <> 'horse') as horse_events_unlabeled,
        (select count(*) from trivia_category_mastery m join profiles p on p.id = m.user_id where p.is_horse) as horse_mastery,
        (select count(*) from trivia_achievement_events a join profiles p on p.id = a.user_id where p.is_horse) as horse_achievements`);
    check(S, 'horse answer events carry actor_type horse and stay out of human learning analytics',
        Number(iso2.horse_answers) > 0 && Number(iso2.mislabeled) === 0 && Number(iso2.horse_events_unlabeled) === 0
        && Number(iso2.horse_mastery) === 0 && Number(iso2.horse_achievements) === 0, iso2);
}

async function main() {
    await setupTestHelpers();
    const sections = [propertyWait, drawDistribution, boundaryRace, concurrency, resumeStates, outcomes, faults, acl, horses];
    for (const fn of sections) {
        const t = Date.now();
        const known = new Set(Object.keys(report.sections));
        try { await fn(); } catch (e) { check(fn.name, 'section completed without error', false, { error: e.message }); }
        for (const [name, s] of Object.entries(report.sections)) {
            if (known.has(name)) continue;
            s.ms = Date.now() - t;
            console.log(`${name}: passed=${s.passed} failed=${s.failed} (${s.ms} ms)`);
        }
    }
    await val(`select public.trivia_pvp__recover_core(1000, null)`);
    report.metrics = await val(`select public.trivia_pvp__metrics(now() - interval '1 day')`);
    const m = report.metrics;
    check('metrics', 'ghost prevention: no match with lapsed presence', Number(m.ghost_prevention.matched_with_lapsed_presence) === 0, m.ghost_prevention);
    check('metrics', 'no horse before the stored deadline', Number(m.fallback.horse_before_deadline) === 0, m.fallback);
    check('metrics', 'ledger variance zero on terminal matches', Number(m.ledger_variance.terminal_matches_with_open_settlement) === 0
        && Number(m.ledger_variance.terminal_escrow_abs_total) === 0, m.ledger_variance);
    report.finished_at = new Date().toISOString();
    report.failures = failures;
    if (outPath) writeFileSync(outPath, JSON.stringify(report, null, 2));
    console.log(`TOTAL failures=${failures}`);
    await pool.end();
    process.exit(failures ? 1 : 0);
}
main().catch(async (e) => { console.error(e); await pool.end(); process.exit(1); });

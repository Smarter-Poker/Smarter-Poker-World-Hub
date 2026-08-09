/**
 * LEADERBOARD RPC CHECK
 * ---------------------------------------------------------------------------
 * WHAT THIS IS: a correctness sweep over the leaderboard write path of
 * POST /api/training/save-progress. Following the lift-and-evaluate pattern
 * of avatar-library-check.js / cross-session-check.js, it lifts the REAL
 * upsertLeaderboard function out of pages/api/training/save-progress.js
 * verbatim and runs it against a recording Supabase stub with a frozen clock.
 *
 * WHAT IT ASSERTS (for the fixed instant 2026-08-09T15:00:00Z, TZ=UTC):
 *   - exactly four calls to sb.rpc('fn_training_leaderboard_record', ...)
 *   - period keys EXACT: daily '2026-08-09', weekly '2026-W03' (the file's
 *     own month-anchored week formula, NOT ISO-8601 weeks), monthly
 *     '2026-08', alltime 'alltime'
 *   - args mapped right: p_answered / p_correct coerced to numbers,
 *     p_is_perfect only when correct === answered > 0, p_best_streak an
 *     integer lifted from the request body's `streak`, p_gtow_score and
 *     p_ev_loss null because this endpoint's request body carries neither
 *   - failure accounting: { attempted, failed } reflects rejected periods,
 *     total failure reports failed === 4 (the handler uses this to keep the
 *     response from claiming leaderboard success)
 *   - the handler call sites really do map body fields to these args
 *     (source-text assertions, so a rename breaks the harness loudly)
 *
 * WHY IT EXISTS: the RPC replaced a racy SELECT -> compute -> UPDATE/INSERT
 * block. The period-key formats are load-bearing -- rows fork into duplicates
 * if they drift -- and nothing else exercised the assembly.
 */

process.env.TZ = 'UTC';

const fs = require('fs');
const path = require('path');

let pass = 0;
let fail = 0;
function check(name, cond, detail) {
    if (cond) {
        pass += 1;
        console.log(`  PASS  ${name}`);
    } else {
        fail += 1;
        console.log(`  FAIL  ${name}${detail !== undefined ? ' -- got: ' + JSON.stringify(detail) : ''}`);
    }
}

const apiPath = path.join(__dirname, '..', 'pages', 'api', 'training', 'save-progress.js');
const apiSrc = fs.readFileSync(apiPath, 'utf8');

// ---------------------------------------------------------------------------
// Lift upsertLeaderboard verbatim. The function closes with the first
// newline-anchored brace after its header (every inner close is indented).
// ---------------------------------------------------------------------------
const m = apiSrc.match(/async function upsertLeaderboard[\s\S]*?\n\}/);
if (!m) {
    console.log('  FAIL  could not lift upsertLeaderboard from save-progress.js');
    process.exit(1);
}

// Frozen clock: no-arg construction lands on the fixed instant, everything
// else behaves like the real Date so the file's own formulas run unmodified.
const FIXED_ISO = '2026-08-09T15:00:00.000Z';
class FrozenDate extends Date {
    constructor(...args) {
        if (args.length === 0) super(FIXED_ISO);
        else super(...args);
    }
}

const factory = new Function('Date', `return (${m[0]});`);
const upsertLeaderboard = factory(FrozenDate);

function makeSb(failTypes) {
    const calls = [];
    return {
        calls,
        rpc: async (name, args) => {
            calls.push({ name, args });
            if (failTypes && failTypes.has(args.p_period_type)) {
                return { error: { message: `injected ${args.p_period_type} failure` } };
            }
            return { error: null };
        },
    };
}

const USER = '9b1c2d3e-0000-4000-8000-000000000001';

(async () => {
    // -----------------------------------------------------------------------
    // 1. The four period payloads for a normal 20/17 session, streak 8
    // -----------------------------------------------------------------------
    let sb = makeSb();
    let res = await upsertLeaderboard(sb, USER, { answered: 20, correct: 17, bestStreak: 8 });

    check('makes exactly four RPC calls', sb.calls.length === 4, sb.calls.length);
    check('every call targets fn_training_leaderboard_record',
        sb.calls.every((c) => c.name === 'fn_training_leaderboard_record'),
        sb.calls.map((c) => c.name));

    const byType = Object.fromEntries(sb.calls.map((c) => [c.args.p_period_type, c.args]));
    check('period types are daily/weekly/monthly/alltime',
        ['daily', 'weekly', 'monthly', 'alltime'].every((t) => byType[t]),
        Object.keys(byType));

    check("daily period_key is the ISO date '2026-08-09'",
        byType.daily && byType.daily.p_period_key === '2026-08-09',
        byType.daily && byType.daily.p_period_key);
    // Aug 1 2026 is a Saturday (getDay 6): ceil((9 + 6) / 7) = 3 under the
    // file's month-anchored formula. ISO-8601 would say W33 -- the harness
    // pins the FILE's formula, which is the one update-leaderboard.js and
    // leaderboard.js must stay in lockstep with.
    check("weekly period_key is '2026-W03' (month-anchored formula, zero-padded)",
        byType.weekly && byType.weekly.p_period_key === '2026-W03',
        byType.weekly && byType.weekly.p_period_key);
    check("monthly period_key is '2026-08'",
        byType.monthly && byType.monthly.p_period_key === '2026-08',
        byType.monthly && byType.monthly.p_period_key);
    check("alltime period_key is the literal 'alltime'",
        byType.alltime && byType.alltime.p_period_key === 'alltime',
        byType.alltime && byType.alltime.p_period_key);

    for (const t of ['daily', 'weekly', 'monthly', 'alltime']) {
        const a = byType[t] || {};
        check(`${t}: p_user_id / p_answered / p_correct mapped`,
            a.p_user_id === USER && a.p_answered === 20 && a.p_correct === 17,
            { u: a.p_user_id, ans: a.p_answered, cor: a.p_correct });
        check(`${t}: 17/20 is not perfect`, a.p_is_perfect === false, a.p_is_perfect);
        check(`${t}: p_best_streak carries the body streak as an integer`,
            a.p_best_streak === 8, a.p_best_streak);
        check(`${t}: p_gtow_score is null (body carries no GTOW score)`,
            a.p_gtow_score === null, a.p_gtow_score);
        check(`${t}: p_ev_loss is null (body carries no EV loss)`,
            a.p_ev_loss === null, a.p_ev_loss);
    }
    check('all-success run reports { attempted: 4, failed: 0 }',
        res.attempted === 4 && res.failed === 0, res);

    // -----------------------------------------------------------------------
    // 2. Perfect round + string coercion + absent streak
    // -----------------------------------------------------------------------
    sb = makeSb();
    await upsertLeaderboard(sb, USER, { answered: '10', correct: '10', bestStreak: '5' });
    check('10/10 marks p_is_perfect true on every period',
        sb.calls.length === 4 && sb.calls.every((c) => c.args.p_is_perfect === true),
        sb.calls.map((c) => c.args.p_is_perfect));
    check('string counts coerce to numbers 10/10',
        sb.calls.every((c) => c.args.p_answered === 10 && c.args.p_correct === 10),
        sb.calls[0] && sb.calls[0].args);
    check("string streak '5' coerces to integer 5",
        sb.calls.every((c) => c.args.p_best_streak === 5),
        sb.calls[0] && sb.calls[0].args.p_best_streak);

    sb = makeSb();
    await upsertLeaderboard(sb, USER, { answered: 0, correct: 0 });
    check('0/0 is NOT perfect (a zero-question session earns no perfect round)',
        sb.calls.every((c) => c.args.p_is_perfect === false),
        sb.calls.map((c) => c.args.p_is_perfect));
    check('absent streak passes p_best_streak null (RPC keeps the old max)',
        sb.calls.every((c) => c.args.p_best_streak === null),
        sb.calls[0] && sb.calls[0].args.p_best_streak);

    sb = makeSb();
    await upsertLeaderboard(sb, USER, { answered: 5, correct: 3, bestStreak: 'not-a-number' });
    check('garbage streak degrades to null, not NaN',
        sb.calls.every((c) => c.args.p_best_streak === null),
        sb.calls[0] && sb.calls[0].args.p_best_streak);

    // -----------------------------------------------------------------------
    // 3. Failure accounting
    // -----------------------------------------------------------------------
    sb = makeSb(new Set(['weekly']));
    res = await upsertLeaderboard(sb, USER, { answered: 20, correct: 17, bestStreak: 8 });
    check('one rejected period reports { attempted: 4, failed: 1 }',
        res.attempted === 4 && res.failed === 1, res);

    sb = makeSb(new Set(['daily', 'weekly', 'monthly', 'alltime']));
    res = await upsertLeaderboard(sb, USER, { answered: 20, correct: 17, bestStreak: 8 });
    check('total failure reports failed === attempted === 4',
        res.attempted === 4 && res.failed === 4, res);

    // -----------------------------------------------------------------------
    // 4. Handler call sites: the body fields really feed these args, and the
    //    response carries the failure count instead of implying success
    // -----------------------------------------------------------------------
    const callSite = 'leaderboardResult = await upsertLeaderboard(getSupabase(), userId, {';
    check('both handler branches call the RPC-backed upsertLeaderboard',
        apiSrc.split(callSite).length - 1 === 2,
        apiSrc.split(callSite).length - 1);
    check('call sites map answered/correct/streak from the request body',
        apiSrc.includes('answered: questionsAnswered,')
        && apiSrc.includes('correct: questionsCorrect,')
        && apiSrc.includes('bestStreak: streak,'));
    check('call sites pass explicit nulls for gtowScore/evLoss',
        apiSrc.includes('gtowScore: null,') && apiSrc.includes('evLoss: null,'));
    check('response surfaces periodsFailed so total failure cannot read as success',
        apiSrc.includes('periodsFailed: leaderboardResult.failed')
        && apiSrc.includes('success: leaderboardResult.failed < leaderboardResult.attempted'));
    check('no read-modify-write remnants: handler no longer selects existing rows',
        !apiSrc.includes(".select('id, sessions_completed"));

    console.log('---------------------------------------------');
    console.log(`PASS ${pass}   FAIL ${fail}   TOTAL ${pass + fail}`);
    process.exit(fail > 0 ? 1 : 0);
})();

/**
 * LAW: an advertised reward is actually payable
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY THIS EXISTS
 *   On 2026-09-08 we found that 21 of the 26 standard rewards in
 *   src/config/diamondRewards.js had NEVER paid a diamond. Not "rarely" - zero
 *   rows in diamond_transactions across all time, for the whole life of the
 *   platform, while the diamond store advertised every one of them with a live
 *   progress tracker. In the 30 days before the fix there were 471 posts,
 *   3,832 likes, 2,418 comments and 432 follows, and they earned nothing.
 *
 *   Nothing was broken in the backend. diamond_reward_catalog held every
 *   action_key with active = true, and award_diamonds_v2 paid correctly when
 *   called directly. The failure was that nothing reachable ever called it:
 *   the reaction/comment/follow claims live in src/services/SocialService.js,
 *   which is imported by nine components and every one of them is unreachable
 *   from any page. pages/api/rewards/follow.js additionally read
 *   social_connections, a table with 0 rows and no writer anywhere.
 *
 *   That is a shape no unit test was watching for, because every individual
 *   piece was correct. This law watches the JOIN between them.
 *
 * WHAT IT PINS
 *   1. Every social reward has a database trigger that awards it, because
 *      there are four independent write paths and only one is a browser -
 *      horses act server-side through HorseSocialEngine and RULE 10.5 says
 *      they earn exactly what a human earns.
 *   2. The trigger reference-id format MATCHES the HTTP endpoint's, so a
 *      client call and a trigger for the same action cannot both pay.
 *   3. The anti-farming guards are still present: 24h account age, no
 *      self-dealing, and the content-length floors.
 *   4. No reward endpoint reads social_connections ever again.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

const MIGRATIONS = join(ROOT, 'supabase/migrations');
const migrationText = () =>
    readdirSync(MIGRATIONS)
        .filter((f) => /reward(s)?_(are|is)_(actually_)?award(ed)?/.test(f))
        .map((f) => readFileSync(join(MIGRATIONS, f), 'utf8'))
        .join('\n');

/**
 * The migration text with every SQL line-comment removed.
 *
 * This is not tidiness. Both files END with a commented-out ROLLBACK section
 * that contains real DROP TRIGGER and CREATE-shaped SQL, and the header
 * comments name every trigger in prose. Matching against the raw text meant a
 * trigger that had been COMMENTED OUT still satisfied "this trigger exists" -
 * which is exactly what happened when this law was first proved: commenting
 * out `CREATE TRIGGER trg_award_follow` left the name visible on the same line
 * and the law stayed green. Structural assertions run against this instead.
 */
const activeSql = () =>
    migrationText()
        .split('\n')
        .filter((l) => !l.trimStart().startsWith('--'))
        .join('\n');

// Every migration in the 2026-09-08/09 reward sweep. Named individually so a
// DELETION is caught - a glob would simply match fewer files and stay green.
const AWARD_MIGRATIONS = [
    'social_rewards_are_actually_awarded',
    'share_and_trivia_rewards_are_awarded',
    'first_training_session_reward_is_awarded',
];

test('the award migrations exist and are not empty', () => {
    const present = readdirSync(MIGRATIONS);
    const missing = AWARD_MIGRATIONS.filter((slug) => !present.some((f) => f.includes(slug)));
    assert.deepEqual(missing, [], `these award migrations are gone: ${missing.join(', ')}`);
    assert.ok(migrationText().length > 1000, 'award migrations are suspiciously small');
});

test('the comment stripper really removes commented-out SQL', () => {
    // Control for the helper above: without this, a bug that made activeSql()
    // return everything would silently re-open the hole it exists to close.
    const raw = migrationText();
    const active = activeSql();
    assert.ok(raw.includes('-- DROP TRIGGER IF EXISTS'), 'the rollback sections should be commented DROPs');
    assert.ok(!active.includes('-- DROP TRIGGER IF EXISTS'), 'activeSql() did not strip comments');
    assert.ok(active.length < raw.length, 'activeSql() returned everything - the stripper is not working');
});

test('every social action has a trigger that awards it', () => {
    const sql = activeSql();
    // table -> the trigger that must exist on it
    const REQUIRED = {
        social_posts: 'trg_award_social_post',
        social_comments: 'trg_award_strategy_comment',
        social_likes: 'trg_award_reaction_like',
        social_interactions: 'trg_award_reaction_interaction',
        social_follows: 'trg_award_follow',
        share_events: 'trg_award_share_content',
        daily_trivia_plays: 'trg_award_daily_trivia',
    };
    const missing = [];
    for (const [table, trigger] of Object.entries(REQUIRED)) {
        const re = new RegExp(`CREATE TRIGGER ${trigger}\\s+AFTER INSERT ON public\\.${table}`, 'i');
        if (!re.test(sql)) missing.push(`${trigger} on ${table}`);
    }
    // training_attempts is the exception: an attempt is INSERTed in progress and
    // UPDATEd on finish (all completed rows have completed_at > started_at), so
    // an AFTER INSERT trigger would never see a completed session.
    if (!/CREATE TRIGGER trg_award_first_training_session\s+AFTER UPDATE ON public\.training_attempts/i.test(sql)) {
        missing.push('trg_award_first_training_session on training_attempts (AFTER UPDATE)');
    }
    assert.deepEqual(missing, [], `these awards have no trigger:\n  ${missing.join('\n  ')}`);
});

test('a trigger key and its endpoint key are the same, so nothing pays twice', () => {
    const sql = activeSql();
    // endpoint file -> [its referenceId template, the trigger's key prefix]
    const PAIRS = [
        ['pages/api/rewards/reaction.js', 'reaction_'],
        ['pages/api/rewards/comment.js', 'strategy_comment_'],
        ['pages/api/rewards/follow.js', 'follow_'],
        ['pages/api/rewards/social-post.js', 'social_post_'],
    ];
    for (const [file, prefix] of PAIRS) {
        const src = read(file);
        // the endpoint builds `${ACTION_KEY}_${userId}_${something}`
        assert.match(
            src,
            /referenceId: `\$\{ACTION_KEY\}_\$\{userId\}_\$\{\w+\}`/,
            `${file} no longer builds a user-scoped reference id - a trigger and this endpoint could now both pay`
        );
        // Whitespace-tolerant on purpose: this pins the KEY, not the formatting.
        const keyRe = new RegExp(`'${prefix}'\\s*\\|\\|`);
        assert.match(
            sql,
            keyRe,
            `the migration has no trigger key starting '${prefix}' to match ${file}`
        );
    }
});

test('the anti-farming guards are still in the triggers', () => {
    const sql = activeSql();
    const REQUIRED = [
        [/interval '24 hours'/, '24h account age gate'],
        [/v_author = NEW\.user_id/, 'no earning from your own post'],
        [/NEW\.follower_id = NEW\.following_id/, 'no self-follow'],
        [/< 20/, 'post content length floor (20)'],
        [/< 10/, 'comment content length floor (10)'],
        [/interaction_type IS DISTINCT FROM 'like'/, 'only real likes pay, not comment_like'],
        // first_training_session: a welcome bonus that must pay once, ever, and
        // never for practice or for a failed attempt.
        [/COALESCE\(NEW\.practice_only, false\)/, 'practice attempts earn no welcome bonus'],
        [/NOT COALESCE\(NEW\.passed, false\)/, 'a failed attempt earns no welcome bonus'],
        [/OLD\.completed_at IS NOT NULL OR NEW\.completed_at IS NULL/, 'only the transition into completed fires'],
        [/'first_training_session_' \|\| NEW\.user_id::text/, 'the welcome bonus key is the user alone, so it pays once forever'],
    ];
    const missing = REQUIRED.filter(([re]) => !re.test(sql)).map(([, name]) => name);
    assert.deepEqual(missing, [], `anti-farming guards missing from the triggers:\n  ${missing.join('\n  ')}`);
});

test('the award helper fails closed and can never break the action', () => {
    const sql = activeSql();
    assert.match(sql, /EXCEPTION WHEN OTHERS THEN/, 'the triggers must swallow their own failures');
    // A profile we cannot find must NOT be paid.
    assert.match(
        sql,
        /IF v_created_at IS NULL OR \(now\(\) - v_created_at\) < interval '24 hours' THEN\s+RETURN;/,
        'the age gate must fail closed on a missing profile, not pay'
    );
});

test('the training welcome bonus has no age gate, and the social helper still does', () => {
    const sql = activeSql();
    // These two helpers differ on purpose. If they are ever collapsed into one,
    // either a brand-new player loses the welcome bonus that exists for them,
    // or the social rewards lose their 24h anti-farming gate. Both are bugs.
    assert.match(sql, /fn_social_reward_award/, 'the social helper must still exist');
    assert.match(sql, /fn_training_reward_award/, 'the training helper must still exist');
    const training = sql.slice(sql.indexOf('FUNCTION public.fn_training_reward_award'));
    const trainingBody = training.slice(0, training.indexOf('END $$;'));
    assert.ok(
        !/interval '24 hours'/.test(trainingBody),
        'fn_training_reward_award must NOT gate on account age - the welcome bonus is for new players'
    );
    assert.ok(
        /profiles WHERE id = p_user_id/.test(trainingBody),
        'it must still fail closed on a user that does not exist'
    );
});

test('no reward endpoint reads social_connections, which has no writer', () => {
    const dir = join(ROOT, 'pages/api/rewards');
    const offenders = readdirSync(dir)
        .filter((f) => f.endsWith('.js'))
        .filter((f) => readFileSync(join(dir, f), 'utf8').includes("'social_connections'"));
    assert.deepEqual(
        offenders,
        [],
        'social_connections holds 0 rows and nothing writes to it; follows live in ' +
            `social_follows. These endpoints would always return not_eligible: ${offenders.join(', ')}`
    );
});

test('the reaction endpoint accepts a like from either table', () => {
    const src = read('pages/api/rewards/reaction.js');
    assert.match(src, /from\('social_likes'\)/, 'must accept a like recorded in social_likes (31,885 rows)');
    assert.match(src, /from\('social_interactions'\)/, 'must still accept the feed page path');
    assert.match(
        src,
        /interaction\?\.\w+/,
        'interaction can be null when the like came from social_likes - it must not be dereferenced'
    );
});

test('the migrations carry a rollback, because they are Tier 3', () => {
    const files = readdirSync(MIGRATIONS).filter((x) =>
        AWARD_MIGRATIONS.some((slug) => x.includes(slug))
    );
    assert.equal(files.length, AWARD_MIGRATIONS.length, 'an award migration went missing');
    for (const f of files) {
        const src = readFileSync(join(MIGRATIONS, f), 'utf8');
        assert.match(src, /ROLLBACK/, `${f} is Tier 3 and must carry a pasted rollback section`);
        assert.match(src, /DROP TRIGGER IF EXISTS/, `${f} rollback must drop its triggers`);
    }
});

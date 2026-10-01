/**
 * Trivia rules registry (Phase 2) - the ONE versioned contract that UI copy,
 * Geeves/help, analytics, tests and the database all read.
 *
 * Every version is immutable. The database table public.trivia_rules_versions
 * is seeded from this file (scripts/trivia/rules-seed-sql.mjs); the test
 * __tests__/trivia-rules-registry.test.mjs proves the migration seed, this
 * module and the legacy constants still agree. To change a rule, add a NEW
 * version here and in a new migration - never edit a published one.
 *
 * Only integers are used (basis points instead of fractions) so the canonical
 * JSON text, and therefore its SHA-256, is identical in JavaScript and SQL.
 */

export const TRIVIA_RULES_CONTRACT = 'trivia-rules/1';

const CHICAGO = 'America/Chicago';
const VIP = 'is_vip and (vip_tier = lifetime or vip_expires_at > now)';

const TIERED = (base, perfectBonus) => ({
    formula: 'tiered',
    base,
    perfect_bonus: perfectBonus,
    // accuracy in basis points of the SERVED roster; first matching tier wins
    tiers: [
        { min_accuracy_bp: 10000, pays: 'base_plus_perfect_bonus' },
        { min_accuracy_bp: 7000, pays: 'base' },
        { min_accuracy_bp: 5000, pays: 'floor_half_base' },
        { min_accuracy_bp: 0, pays: 'zero' },
    ],
});

const PRIZE_WHEEL = {
    eligibility: {
        perfect_run: true,
        min_questions: 5,
        server_verified_score: true,
        window_seconds: 1800,
        spins_per_score: 1,
    },
    // roll = floor(random * 100); first segment whose roll_below is greater wins
    segments: [
        { roll_below: 30, prize_id: 'diamond_5', prize_type: 'diamonds', base: 5 },
        { roll_below: 55, prize_id: 'diamond_10', prize_type: 'diamonds', base: 10 },
        { roll_below: 70, prize_id: 'diamond_25', prize_type: 'diamonds', base: 25 },
        { roll_below: 80, prize_id: 'diamond_50', prize_type: 'diamonds', base: 50 },
        { roll_below: 85, prize_id: 'diamond_100', prize_type: 'diamonds', base: 100 },
        { roll_below: 93, prize_id: 'streak_shield', prize_type: 'streak_shield', base: 1 },
        { roll_below: 98, prize_id: 'free_entry', prize_type: 'arcade_ticket', base: 1 },
        { roll_below: 100, prize_id: 'mystery', prize_type: 'diamonds', base: 15 },
    ],
    // diamonds = floor(base * multiplier_bp / 100); items are never multiplied
    streak_multipliers: [
        { min_streak: 100, multiplier_bp: 500 },
        { min_streak: 30, multiplier_bp: 300 },
        { min_streak: 14, multiplier_bp: 250 },
        { min_streak: 7, multiplier_bp: 200 },
        { min_streak: 0, multiplier_bp: 100 },
    ],
    wallet_kind: 'trivia_prize_wheel',
    reference: 'trivia_wheel_<score>',
    item_reference: 'trivia_wheel_item_<score>',
    funding: 'platform_issuance',
};

const SOLO_SPECS = {
    daily: { count: 10, cost: 0, deadline: 21600, points: 100, cap: 10, reward: TIERED(5, 10) },
    history: { count: 20, cost: 0, deadline: 21600, points: 100, cap: 10, reward: TIERED(3, 5) },
    rules: { count: 20, cost: 0, deadline: 21600, points: 100, cap: 10, reward: TIERED(3, 5) },
    pro: { count: 20, cost: 0, deadline: 21600, points: 100, cap: 10, reward: TIERED(5, 10) },
    arcade: {
        count: 20, cost: 10, deadline: 180, points: 200, cap: 40,
        reward: {
            formula: 'arcade_stakes',
            stake_values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
            wrong_answer_resets_pot: true,
            skips_ignored: true,
            pays_when: 'run_complete_or_cash_out',
            cash_out_min_answered: 6,
            max_run_payout: 50,
            fallback_without_recorded_sequence: {
                formula: 'arcade_tiered_time_bonus',
                base: 25,
                perfect_bonus: 15,
                time_limit_seconds: 180,
                time_bonus_divisor_seconds: 6,
                max_time_bonus: 10,
                tiers: [
                    { min_accuracy_bp: 10000, pays: 'base_plus_perfect_bonus_plus_time_bonus' },
                    { min_accuracy_bp: 9000, pays: 'base_plus_time_bonus' },
                    { min_accuracy_bp: 7000, pays: 'floor_half_base_plus_time_bonus' },
                    { min_accuracy_bp: 5000, pays: 'floor_fifth_base_plus_time_bonus' },
                    { min_accuracy_bp: 0, pays: 'zero' },
                ],
            },
        },
    },
    mtt: { count: 20, cost: 10, deadline: 21600, points: 100, cap: 40, reward: TIERED(5, 10) },
    cash: { count: 20, cost: 10, deadline: 21600, points: 100, cap: 40, reward: TIERED(5, 10) },
    icm: { count: 20, cost: 10, deadline: 21600, points: 100, cap: 40, reward: TIERED(5, 10) },
    gto: { count: 20, cost: 10, deadline: 21600, points: 150, cap: 60, reward: TIERED(8, 15) },
    mixed: { count: 21, cost: 10, deadline: 21600, points: 100, cap: 40, reward: TIERED(5, 10) },
    endless: {
        count: 100, cost: 10, deadline: 21600, points: 200, cap: 40,
        reward: { formula: 'per_correct', per_correct: 1 },
    },
    survival: {
        count: 20, cost: 10, deadline: 21600, points: 200, cap: 80,
        reward: { formula: 'survival_escalating', step: 5, max_multiplier: 3, max_run_payout: 60 },
    },
    'time-attack': {
        count: 60, cost: 10, deadline: 30, points: 200, cap: 40,
        reward: { formula: 'per_correct', per_correct: 1 },
    },
};

function soloRules(mode) {
    const s = SOLO_SPECS[mode];
    const paid = s.cost > 0;
    return {
        contract: TRIVIA_RULES_CONTRACT,
        family: 'solo',
        mode,
        clock_zone: CHICAGO,
        questions: { count: s.count, source: 'server_roster', grading: 'server' },
        timer: { session_deadline_seconds: s.deadline },
        entry: {
            cost: s.cost,
            wallet_kind: paid ? 'trivia_entry' : null,
            reference: paid ? 'trivia_entry_<session>' : null,
            funding: paid ? 'player_wallet' : 'none',
            revenue_account: paid ? 'house:entry:solo' : null,
            vip_plays_free: paid,
            vip_definition: VIP,
            arcade_ticket_replaces_cost: mode === 'arcade',
            survival_continuation: mode === 'survival'
                ? { max_level: 10, cost: 0, parent_window_seconds: 21600, required_correct_by_level: [17, 18, 18, 19, 19, 19, 20, 20, 20, 20] }
                : null,
        },
        scoring: { points_per_correct: s.points, accuracy_denominator: 'served_roster' },
        reward: s.reward,
        daily_cap: { per_mode_per_day: s.cap, day: CHICAGO },
        payout: { wallet_kind: 'trivia_run', reference: 'trivia_session_<session>', funding: 'platform_issuance' },
        daily_bonus: mode === 'daily'
            ? { amount: 10, min_total_questions: 10, requires_all_answered: true, once_per: 'user_per_chicago_day', wallet_kind: 'trivia_daily_bonus', reference: 'trivia_daily_bonus_<user>_<date>', funding: 'platform_issuance' }
            : null,
        lifeline: (mode === 'endless' || mode === 'survival')
            ? { skip_cost: 5, wallet_kind: 'trivia_lifeline', reference: 'spend:<user>:trivia_lifeline:<session>:<question>:skip', revenue_account: 'house:spend:lifeline' }
            : null,
        streak_shield: { protects_missed_days: 1 },
        prize_wheel: PRIZE_WHEEL,
        refund: paid
            ? { invalid_content: 'exact_original_entry', wallet_kind: 'refund', reference: 'trivia_entry_refund_<session>' }
            : null,
    };
}

const PVP_V1 = {
    contract: TRIVIA_RULES_CONTRACT,
    family: 'pvp',
    mode: 'pvp',
    clock_zone: CHICAGO,
    questions: { count: 20, unique: true, source: 'server_roster', grading: 'server' },
    stakes: [10, 25, 50, 100],
    match_window_seconds: 1800,
    scoring: { metric: 'correct_count', tie: 'equal_correct_count' },
    rake: { basis: 'funded_pot', numerator: 10, denominator: 100, rounding: 'floor' },
    outcomes: {
        win: 'winner_receives_pot_minus_rake',
        tie: 'refund_each_charged_stake',
        forfeit: 'finisher_wins_under_winner_rule_when_opponent_was_charged',
        half_funded: 'refund_only_the_charged_finisher',
        incomplete: 'refund_each_charged_stake',
        void: 'zero_movement_when_nobody_was_charged',
    },
    horse: {
        human_first: true,
        fallback_wait_seconds: { min: 20, max: 45 },
        wait_persisted_once: true,
        max_horses_per_match: 1,
        seat_funding: 'treasury',
        winnings_to: 'treasury',
        disclosure: 'Smarter Horse',
    },
    references: {
        stake: 'pvp_stake_<match>_<user>',
        win: 'pvp_match_win_<match>',
        tie_refund: 'pvp_tie_refund_<match>_<user>',
        refund: 'pvp_refund_<match>_<user>',
        settlement: 'pvp_settlement_<match>',
    },
    wallet_kinds: { stake: 'pvp_stake', win: 'pvp_win', refund: 'pvp_refund' },
};

const TOURNAMENT_NIGHTLY_V1 = {
    contract: TRIVIA_RULES_CONTRACT,
    family: 'tournament',
    mode: 'tournaments',
    provisional_note: 'Economics chosen conservatively by Phase 2; owner may change them with a new version.',
    clock_zone: CHICAGO,
    schedule: { local_start: '20:00', instances_per_local_date: 1, registration_closes: 'at_start' },
    field: {
        format: 'single_elimination',
        bracket_size: 256,
        expandable_to: 512,
        horse_target: { min: 70, max: 140, sampled_once: true },
        human_capacity: 'bracket_size_minus_horse_target',
        min_horses_to_run: 70,
        entries_per_player: 1,
    },
    entry: {
        fee: 10,
        vip_required: false,
        vip_discount: false,
        human_funding: 'player_wallet',
        horse_funding: 'treasury',
        wallet_kind: 'tournament_entry',
        reference: 'trivia_tourn_entry_<tournament>_<user>',
    },
    rake: { per_settled_entry: { rate_bp: 1000, rounding: 'round', minimum: 1 }, taken: 'at_settlement', on_refunds: 0 },
    overlay: { treasury_guarantee: 0 },
    match: {
        questions: 10,
        shot_clock_seconds: 20,
        round_window_seconds: 300,
        transition_seconds: { min: 60, max: 90 },
        identical_question_revisions_per_match: true,
        per_user_option_permutations: true,
    },
    ties: ['more_correct', 'lower_total_answer_ms', 'earlier_completion', 'better_seed'],
    no_show: { scores: 'zero_correct_max_time', both_seats: 'better_seed_advances', refund_after_registration_close: false },
    disconnect: 'unanswered_questions_score_zero_with_max_time',
    byes: 'top_seeds_receive_byes',
    cancellation: {
        when: ['fewer_than_min_horses_at_final_reconciliation', 'failure_before_round_one'],
        refunds: 'every_stored_entry_exactly',
        human_wallet_kind: 'tournament_cancel_refund',
        human_reference: 'trivia_tourn_cancel_<tournament>_<user>',
        horse_entries_return_to: 'treasury',
    },
    prizes: {
        basis: 'final_prize_pool',
        tiers: [
            { finish_tier: 1, places: 1, bp: 3200 },
            { finish_tier: 2, places: 1, bp: 2000 },
            { finish_tier: 3, places: 2, bp: 2300 },
            { finish_tier: 5, places: 4, bp: 2500 },
        ],
        split: 'tier_amount_floor_divided_equally_remainder_to_champion',
        horse_prizes_to: 'treasury',
        wallet_kind: 'tournament_prize',
        reference: 'trivia_tourn_payout_<tournament>_<user>',
    },
    references: { settlement: 'trivia_tourn_settlement_<tournament>' },
};

const APPROVED_TODAY = 'Behavior as deployed on 2026-09-29 (Phase 2 registry seed of live behavior)';

function version(rulesKey, versionNo, family, mode, provisional, approvalSource, rules) {
    return Object.freeze({ id: `${rulesKey}@${versionNo}`, rulesKey, version: versionNo, family, mode, provisional, approvalSource, rules });
}

export const SOLO_MODES = Object.freeze(Object.keys(SOLO_SPECS));
export const PAID_SOLO_MODES = Object.freeze(SOLO_MODES.filter(m => SOLO_SPECS[m].cost > 0));

export const TRIVIA_RULE_VERSIONS = Object.freeze([
    ...SOLO_MODES.map(mode => version(`solo.${mode}`, 1, 'solo', mode, false, APPROVED_TODAY, soloRules(mode))),
    version('pvp.standard', 1, 'pvp', 'pvp', false,
        'docs/trivia/TRIVIA-COMPETITIVE-CONTRACT-V1.md (product owner, containment contract 2026-09-06)', PVP_V1),
    version('tournament.nightly', 1, 'tournament', 'tournaments', true,
        'PROVISIONAL - chosen by Phase 2 (conservative); pending product-owner approval', TOURNAMENT_NIGHTLY_V1),
]);

export const CURRENT_RULES = Object.freeze(Object.fromEntries(TRIVIA_RULE_VERSIONS.map(v => [v.rulesKey, v.id])));

/** Canonical JSON: object keys sorted, no whitespace. Integers, strings, booleans and null only. */
export function canonicalJson(value) {
    if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
    if (typeof value === 'number') {
        if (!Number.isSafeInteger(value)) throw new Error(`rules must use integers only: ${value}`);
        return String(value);
    }
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
    if (typeof value === 'object') {
        return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
    }
    throw new Error(`unsupported rules value: ${typeof value}`);
}

export function getRulesVersion(id) {
    return TRIVIA_RULE_VERSIONS.find(v => v.id === id) || null;
}

export function currentRules(rulesKey) {
    return getRulesVersion(CURRENT_RULES[rulesKey]);
}

export function rulesKeyForMode(mode) {
    if (mode === 'pvp') return 'pvp.standard';
    if (mode === 'tournaments') return 'tournament.nightly';
    return `solo.${mode}`;
}

/** PvP money for one funded two-player pot (mirrors trivia_rules_pvp_money). */
export function pvpMoney(rules, stake) {
    if (!rules?.stakes?.includes(stake)) return null;
    const pot = stake * 2;
    const rake = Math.floor((pot * rules.rake.numerator) / rules.rake.denominator);
    return { stake, pot, rake, winnerPayout: pot - rake };
}

/** Tournament rake for one settled entry (mirrors the SQL settlement rule). */
export function tournamentEntryRake(rules, fee) {
    const r = rules.rake.per_settled_entry;
    if (!(fee > 0)) return 0;
    return Math.max(r.minimum, Math.round((fee * r.rate_bp) / 10000));
}

/**
 * Split a prize pool by finish tier (mirrors trivia_rules_tournament_prizes).
 * finishers: [{ userId, finishTier }]. Returns [{ userId, finishTier, amount }]
 * whose amounts sum to exactly the pool; any remainder goes to the champion.
 */
export function tournamentPrizes(rules, pool, finishers) {
    const total = Math.max(0, Math.floor(Number(pool) || 0));
    const out = [];
    let paid = 0;
    for (const tier of rules.prizes.tiers) {
        const members = finishers.filter(f => f.finishTier === tier.finish_tier).slice(0, tier.places);
        if (members.length === 0) continue;
        const tierTotal = Math.floor((total * tier.bp) / 10000);
        const each = Math.floor(tierTotal / members.length);
        for (const m of members) {
            out.push({ userId: m.userId, finishTier: tier.finish_tier, amount: each });
            paid += each;
        }
    }
    const champion = out.find(o => o.finishTier === 1);
    if (champion) champion.amount += total - paid;
    return out.filter(o => o.amount > 0);
}

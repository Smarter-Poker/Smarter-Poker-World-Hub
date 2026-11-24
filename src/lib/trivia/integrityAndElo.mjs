/**
 * Shared pure logic for Trivia Anti-Cheat Integrity Telemetry, PvP Elo Ratings,
 * and Stake-Tiered Horse Skill Calibration.
 *
 * Mirrors supabase/migrations/20261124142400_trivia_integrity_elo_horse_tiers.sql
 * so API validation, UI display, and regression tests share one deterministic
 * source of truth.
 */

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const MODE_RE = /^[a-z0-9_-]{1,64}$/i;

export const DEFAULT_PVP_ELO = 1200;
export const DEFAULT_PVP_TIER = 'Bronze';

export const ELO_TIER_THRESHOLDS = Object.freeze([
    { tier: 'Master', minElo: 1900, maxElo: null, ink: 'gold' },
    { tier: 'Diamond', minElo: 1700, maxElo: 1899, ink: 'blue' },
    { tier: 'Platinum', minElo: 1500, maxElo: 1699, ink: 'blue' },
    { tier: 'Gold', minElo: 1300, maxElo: 1499, ink: 'gold' },
    { tier: 'Silver', minElo: 1150, maxElo: 1299, ink: 'silver' },
    { tier: 'Bronze', minElo: 0, maxElo: 1149, ink: 'silver' },
]);

export const HORSE_SKILL_TIERS = Object.freeze([
    {
        stakeMin: 0,
        stakeMax: 15,
        minAccuracy: 0.60,
        maxAccuracy: 0.72,
        minSpeedMs: 4500,
        maxSpeedMs: 9500,
        horseElo: 1180,
        tierLabel: 'Micro 10',
        targetPersonaTier: 'Regular',
    },
    {
        stakeMin: 16,
        stakeMax: 35,
        minAccuracy: 0.66,
        maxAccuracy: 0.78,
        minSpeedMs: 3800,
        maxSpeedMs: 8500,
        horseElo: 1300,
        tierLabel: 'Standard 25',
        targetPersonaTier: 'Intermediate',
    },
    {
        stakeMin: 36,
        stakeMax: 75,
        minAccuracy: 0.72,
        maxAccuracy: 0.84,
        minSpeedMs: 3200,
        maxSpeedMs: 7500,
        horseElo: 1450,
        tierLabel: 'Mid 50',
        targetPersonaTier: 'Grinder',
    },
    {
        stakeMin: 76,
        stakeMax: 100000,
        minAccuracy: 0.76,
        maxAccuracy: 0.88,
        minSpeedMs: 2600,
        maxSpeedMs: 6500,
        horseElo: 1600,
        tierLabel: 'High 100',
        targetPersonaTier: 'Shark',
    },
]);

export function eloTierForRating(elo) {
    const value = Number.isFinite(Number(elo)) ? Math.round(Number(elo)) : DEFAULT_PVP_ELO;
    if (value >= 1900) return 'Master';
    if (value >= 1700) return 'Diamond';
    if (value >= 1500) return 'Platinum';
    if (value >= 1300) return 'Gold';
    if (value >= 1150) return 'Silver';
    return 'Bronze';
}

export function eloTierInk(tier) {
    switch (tier) {
        case 'Master':
        case 'Gold':
            return 'gold';
        case 'Diamond':
        case 'Platinum':
            return 'blue';
        default:
            return 'silver';
    }
}

export function horseSkillBandForStake(stake) {
    const numeric = Math.max(0, Math.floor(Number(stake) || 10));
    const found = HORSE_SKILL_TIERS.find(
        (band) => numeric >= band.stakeMin && numeric <= band.stakeMax,
    );
    return found || HORSE_SKILL_TIERS[HORSE_SKILL_TIERS.length - 1];
}

/**
 * Computes standard Elo rating update matching public.trivia_pvp_update_rating_v1.
 * K=32 for human vs human, K=16 for human vs horse (horse rating fixed at stake band Elo).
 */
export function computeEloUpdate({
    r1 = DEFAULT_PVP_ELO,
    r2 = DEFAULT_PVP_ELO,
    outcome = 'tie',
    isHorseMatch = false,
    p1IsHorse = false,
    p2IsHorse = false,
} = {}) {
    const rating1 = Math.max(100, Math.round(Number(r1) || DEFAULT_PVP_ELO));
    const rating2 = Math.max(100, Math.round(Number(r2) || DEFAULT_PVP_ELO));
    const expected1 = 1 / (1 + Math.pow(10, (rating2 - rating1) / 400));
    const expected2 = 1 - expected1;

    let score1 = 0.5;
    let score2 = 0.5;
    if (outcome === 'p1_win') {
        score1 = 1;
        score2 = 0;
    } else if (outcome === 'p2_win') {
        score1 = 0;
        score2 = 1;
    }

    const kFactor = isHorseMatch || p1IsHorse || p2IsHorse ? 16 : 32;
    const p1Delta = p1IsHorse ? 0 : Math.round(kFactor * (score1 - expected1));
    const p2Delta = p2IsHorse ? 0 : Math.round(kFactor * (score2 - expected2));

    const p1EloAfter = Math.max(100, rating1 + p1Delta);
    const p2EloAfter = Math.max(100, rating2 + p2Delta);

    return {
        kFactor,
        p1Delta,
        p2Delta,
        p1EloAfter,
        p2EloAfter,
        p1Tier: eloTierForRating(p1EloAfter),
        p2Tier: eloTierForRating(p2EloAfter),
    };
}

function parseBoundedInt(value, { min = 0, max = 9999, nullable = false, fallback = 0 } = {}) {
    if (value === undefined || value === null || value === '') {
        return nullable ? null : fallback;
    }
    const num = Number(value);
    if (!Number.isFinite(num) || num < min || num > max) return undefined;
    return Math.round(num);
}

function parseBoundedFloat(value, { min = 0, max = 100, nullable = true } = {}) {
    if (value === undefined || value === null || value === '') {
        return nullable ? null : 0;
    }
    const num = Number(value);
    if (!Number.isFinite(num) || num < min || num > max) return undefined;
    return Math.round(num * 100) / 100;
}

export function parseIntegritySignalBody(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return { ok: false, error: 'invalid_payload' };
    }
    const sessionId = typeof body.sessionId === 'string'
        ? body.sessionId.trim()
        : typeof body.session_id === 'string'
            ? body.session_id.trim()
            : '';
    if (!UUID_RE.test(sessionId)) {
        return { ok: false, error: 'invalid_session_id' };
    }
    const mode = typeof body.mode === 'string' ? body.mode.trim().toLowerCase() : '';
    if (!MODE_RE.test(mode)) {
        return { ok: false, error: 'invalid_mode' };
    }

    const tabBlurCount = parseBoundedInt(body.tabBlurCount ?? body.tab_blur_count, { min: 0, max: 9999, fallback: 0 });
    const copyAttemptCount = parseBoundedInt(body.copyAttemptCount ?? body.copy_attempt_count, { min: 0, max: 9999, fallback: 0 });
    const pasteAttemptCount = parseBoundedInt(body.pasteAttemptCount ?? body.paste_attempt_count, { min: 0, max: 9999, fallback: 0 });
    const avgAnswerMs = parseBoundedInt(body.avgAnswerMs ?? body.avg_answer_ms, { min: 0, max: 600000, nullable: true });
    const minAnswerMs = parseBoundedInt(body.minAnswerMs ?? body.min_answer_ms, { min: 0, max: 600000, nullable: true });
    const fastCorrectCount = parseBoundedInt(body.fastCorrectCount ?? body.fast_correct_count, { min: 0, max: 500, fallback: 0 });
    const accuracyPct = parseBoundedFloat(body.accuracyPct ?? body.accuracy_pct, { min: 0, max: 100, nullable: true });

    if (
        tabBlurCount === undefined
        || copyAttemptCount === undefined
        || pasteAttemptCount === undefined
        || avgAnswerMs === undefined
        || minAnswerMs === undefined
        || fastCorrectCount === undefined
        || accuracyPct === undefined
    ) {
        return { ok: false, error: 'invalid_telemetry_bounds' };
    }

    return {
        ok: true,
        value: {
            sessionId,
            mode,
            tabBlurCount,
            copyAttemptCount,
            pasteAttemptCount,
            avgAnswerMs,
            minAnswerMs,
            fastCorrectCount,
            accuracyPct,
        },
    };
}

/**
 * Deterministic risk scoring matching public.trivia_record_integrity_signal_v1.
 */
export function computeIntegrityRisk({
    tabBlurCount = 0,
    copyAttemptCount = 0,
    pasteAttemptCount = 0,
    avgAnswerMs = null,
    minAnswerMs = null,
    fastCorrectCount = 0,
    accuracyPct = null,
} = {}) {
    const blur = Math.min(9999, Math.max(0, Math.round(Number(tabBlurCount) || 0)));
    const copy = Math.min(9999, Math.max(0, Math.round(Number(copyAttemptCount) || 0)));
    const paste = Math.min(9999, Math.max(0, Math.round(Number(pasteAttemptCount) || 0)));
    const avgMs = avgAnswerMs === null || avgAnswerMs === undefined ? null : Math.min(600000, Math.max(0, Math.round(Number(avgAnswerMs))));
    const minMs = minAnswerMs === null || minAnswerMs === undefined ? null : Math.min(600000, Math.max(0, Math.round(Number(minAnswerMs))));
    const fast = Math.min(500, Math.max(0, Math.round(Number(fastCorrectCount) || 0)));
    const acc = accuracyPct === null || accuracyPct === undefined ? null : Math.min(100, Math.max(0, Number(accuracyPct)));

    let riskScore = 0;
    const riskFlags = [];

    if (blur >= 3) {
        riskFlags.push('excessive_tab_blurs');
        riskScore += blur >= 6 ? 35 : 25;
    }
    if (copy + paste >= 1) {
        riskFlags.push('copy_paste_detected');
        riskScore += copy + paste >= 3 ? 40 : 30;
    }
    if (
        (minMs !== null && minMs > 0 && minMs < 600)
        || fast >= 3
        || (avgMs !== null && avgMs > 0 && avgMs < 1200)
    ) {
        riskFlags.push('inhuman_answer_speed');
        riskScore += 35;
    }
    if (blur >= 2 && (acc ?? 0) >= 85) {
        riskFlags.push('high_accuracy_with_blur');
        riskScore += 25;
    }

    return {
        riskScore: Math.min(100, Math.max(0, riskScore)),
        riskFlags,
    };
}

export function sanitizeDisplayName(profile) {
    const display = typeof profile?.display_name === 'string' ? profile.display_name.trim() : '';
    if (display) return display.slice(0, 48);
    const username = typeof profile?.username === 'string' ? profile.username.trim() : '';
    if (username) return username.slice(0, 48);
    return 'Player';
}

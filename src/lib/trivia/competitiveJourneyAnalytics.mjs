import { capture } from '../analytics.js';

export const COMPETITIVE_JOURNEY_EVENT = 'trivia_competitive_journey';

export const COMPETITIVE_JOURNEY_MODES = Object.freeze([
    'lobby',
    'pvp',
    'nightly_tournament',
]);

export const COMPETITIVE_JOURNEY_STAGES = Object.freeze([
    'impression',
    'intent',
    'commitment',
    'play',
    'verified_settlement_receipt',
]);

const ALLOWED_PROPERTY_VALUES = Object.freeze({
    source: Object.freeze(['lobby', 'pvp', 'nightly_tournament']),
    action: Object.freeze([
        'view_tournament',
        'open_run',
        'view_bracket',
        'view_results',
        'start_pvp',
        'resume_pvp',
        'verify_resume',
        'sign_in',
        'enter',
        'open_play',
        'resume_play',
    ]),
    availability: Object.freeze(['both', 'pvp_only', 'tournament_only', 'off']),
    state: Object.freeze([
        'feature_off',
        'auth_loading',
        'signed_out',
        'loading',
        'ready',
        'empty',
        'resume',
        'stale',
        'partial',
        'offline',
        'error',
        'searching',
        'matched',
        'dealing',
        'playing',
        'waiting',
        'settling',
        'result',
        'cancelled',
        'refunded',
        'paid',
        'verified',
    ]),
    opponent_kind: Object.freeze(['human', 'smarter_horse', 'unknown']),
    settlement_kind: Object.freeze(['payout', 'refund', 'void', 'zero_payout']),
});

const MODE_SET = new Set(COMPETITIVE_JOURNEY_MODES);
const STAGE_SET = new Set(COMPETITIVE_JOURNEY_STAGES);
const PROPERTY_VALUE_SETS = Object.freeze(Object.fromEntries(
    Object.entries(ALLOWED_PROPERTY_VALUES).map(([key, values]) => [key, new Set(values)]),
));

/**
 * Build the only payload shape competitive Trivia is allowed to send to the
 * browser analytics path. Unknown keys and values are dropped rather than
 * forwarded, so identifiers, answer data and arbitrary server strings never
 * reach the analytics provider.
 */
export function buildCompetitiveJourneyEvent(mode, stage, candidateProperties = {}) {
    if (!MODE_SET.has(mode) || !STAGE_SET.has(stage)) return null;

    const properties = { mode, stage };
    if (candidateProperties && typeof candidateProperties === 'object' && !Array.isArray(candidateProperties)) {
        for (const [key, allowedValues] of Object.entries(PROPERTY_VALUE_SETS)) {
            const value = candidateProperties[key];
            if (allowedValues.has(value)) properties[key] = value;
        }
    }

    return { event: COMPETITIVE_JOURNEY_EVENT, properties };
}

/**
 * A tracker instance belongs to one mounted journey surface. Each mode/stage
 * is emitted at most once for that mount, preventing Strict Mode effects,
 * reconnect reads and repeated settlement polling from flooding analytics.
 * Capture is deliberately fire-and-forget and fully isolated from gameplay.
 */
export function createCompetitiveJourneyTracker({ captureEvent = capture } = {}) {
    const emitted = new Set();

    return Object.freeze({
        track(mode, stage, candidateProperties = {}) {
            let payload = null;
            try {
                payload = buildCompetitiveJourneyEvent(mode, stage, candidateProperties);
            } catch (_error) {
                return false;
            }
            if (!payload || typeof captureEvent !== 'function') return false;

            const dedupeKey = `${mode}:${stage}`;
            if (emitted.has(dedupeKey)) return false;
            emitted.add(dedupeKey);

            try {
                const pending = captureEvent(payload.event, payload.properties);
                if (pending && typeof pending.catch === 'function') pending.catch(() => {});
                return true;
            } catch (_error) {
                return false;
            }
        },
    });
}

export default createCompetitiveJourneyTracker;

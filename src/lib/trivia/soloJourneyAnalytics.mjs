import { capture } from '../analytics.js';

export const SOLO_JOURNEY_EVENT = 'trivia_solo_journey';

export const SOLO_JOURNEY_MODES = Object.freeze(['daily', 'mtt', 'cash', 'icm', 'gto']);
export const SOLO_JOURNEY_METRICS = Object.freeze([
    'completion',
    'abandon',
    'report',
    'retry',
    'cap',
    'settlement',
]);

const ALLOWED_VALUES = Object.freeze({
    surface: Object.freeze(['daily', 'strategy']),
    retry_kind: Object.freeze(['start', 'answer', 'resume', 'settlement', 'invalid_question']),
    abandon_state: Object.freeze(['playing', 'settling']),
    report_outcome: Object.freeze(['recorded', 'deduped']),
    settlement_outcome: Object.freeze(['verified', 'replayed', 'failed']),
    cap_state: Object.freeze(['applied']),
});

const MODE_SET = new Set(SOLO_JOURNEY_MODES);
const METRIC_SET = new Set(SOLO_JOURNEY_METRICS);
const VALUE_SETS = Object.freeze(Object.fromEntries(
    Object.entries(ALLOWED_VALUES).map(([key, values]) => [key, new Set(values)]),
));

/**
 * Build the only analytics payload shape used by the Phase 8 solo routes.
 * Identifiers, question text, answers, balances and arbitrary server strings
 * are deliberately impossible to forward through this allowlist.
 */
export function buildSoloJourneyEvent(mode, metric, candidateProperties = {}) {
    if (!MODE_SET.has(mode) || !METRIC_SET.has(metric)) return null;

    const properties = { mode, metric };
    if (candidateProperties && typeof candidateProperties === 'object' && !Array.isArray(candidateProperties)) {
        for (const [key, allowedValues] of Object.entries(VALUE_SETS)) {
            const value = candidateProperties[key];
            if (allowedValues.has(value)) properties[key] = value;
        }
    }
    return { event: SOLO_JOURNEY_EVENT, properties };
}

/**
 * One tracker belongs to one mounted route. Reconnects and React effects can
 * revisit the same state, so identical metrics are emitted once per mount;
 * distinct retry kinds and settlement outcomes retain separate evidence.
 */
export function createSoloJourneyTracker({ captureEvent = capture } = {}) {
    const emitted = new Set();

    // A mounted route can host multiple paid runs. Scope de-duplication to the
    // durable server session so reconnect effects stay quiet without erasing
    // later runs from the funnel. This identity never enters the payload.
    let activeRun = 'route-mount';

    return Object.freeze({
        beginRun(runIdentity) {
            if (typeof runIdentity !== 'string' || !runIdentity.trim()) return false;
            const next = runIdentity.trim();
            if (next === activeRun) return false;
            activeRun = next;
            return true;
        },
        track(mode, metric, candidateProperties = {}) {
            let payload;
            try {
                payload = buildSoloJourneyEvent(mode, metric, candidateProperties);
            } catch (_error) {
                return false;
            }
            if (!payload || typeof captureEvent !== 'function') return false;

            const qualifier = candidateProperties.retry_kind
                || candidateProperties.settlement_outcome
                || candidateProperties.report_outcome
                || candidateProperties.abandon_state
                || candidateProperties.cap_state
                || 'once';
            const key = `${activeRun}:${mode}:${metric}:${qualifier}`;
            if (emitted.has(key)) return false;
            emitted.add(key);

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

export default createSoloJourneyTracker;

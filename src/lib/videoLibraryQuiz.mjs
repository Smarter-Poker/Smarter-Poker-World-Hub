// A decision quiz records the viewer's reasoning, never an invented hand or EV.
export const DECISION_ACTIONS = Object.freeze(['Fold', 'Check', 'Call', 'Bet', 'Raise']);
export const DECISION_FEEDBACK = Object.freeze({
    Fold: 'Consider The Price, Your Range And The Hands Your Opponent Can Represent.',
    Check: 'Consider Position, Showdown Value And How You Would Respond To A Bet.',
    Call: 'Compare The Price With Your Equity Estimate And The Opponent\'s Value And Bluff Ranges.',
    Bet: 'Identify Whether Your Bet Seeks Value Or Folds, And Which Hands Can Continue.',
    Raise: 'Consider Your Sizing, Effective Stacks And The Hands That Can Call Or Raise Again.',
});

export function crossedDecisionMarker(previous, current, duration, markers, seen) {
    if (![previous, current, duration].every(Number.isFinite) || duration <= 0 ||
        previous < 0 || current <= previous || current > duration || current - previous > 5) return null;
    return [...new Set((Array.isArray(markers) ? markers : []).filter(value =>
        Number.isFinite(value) && value >= 0 && value <= duration))]
        .sort((a, b) => a - b)
        .find(value => value > previous && value <= current && !seen.has(value)) ?? null;
}

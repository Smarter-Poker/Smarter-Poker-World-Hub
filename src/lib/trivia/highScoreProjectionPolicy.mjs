const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isPersistedEndlessHighScoreProjection(value) {
    return value?.status === 'persisted'
        && Number.isInteger(value.highScore)
        && value.highScore >= 0
        && Number.isInteger(value.verifiedCorrect)
        && value.verifiedCorrect >= 0
        && value.highScore >= value.verifiedCorrect
        && typeof value.improved === 'boolean'
        && typeof value.replayed === 'boolean'
        && typeof value.projectionId === 'string'
        && UUID_RE.test(value.projectionId);
}

export function isIneligibleEndlessHighScoreProjection(value) {
    return value?.status === 'ineligible'
        && value.reason === 'historical_run_boundary_overrun'
        && value.highScore === null
        && value.improved === false;
}

export function isTerminalEndlessHighScoreProjection(value) {
    return isPersistedEndlessHighScoreProjection(value)
        || isIneligibleEndlessHighScoreProjection(value);
}

const RETIRED_RECOVERY_ERRORS = new Set([
    'session_not_found',
    'not_your_session',
    'session_closed',
    'session_expired',
    'session_not_resumable',
    'session_mode_conflict',
]);

export function triviaRunErrorCode(error) {
    return error?.payload?.error || error?.code || error?.message || null;
}

export function isRetiredTriviaRunError(error) {
    const code = triviaRunErrorCode(error);
    return code === 'no_open_session' || RETIRED_RECOVERY_ERRORS.has(code);
}

export function isAuthoritativeRetirementCode(code) {
    return RETIRED_RECOVERY_ERRORS.has(code);
}

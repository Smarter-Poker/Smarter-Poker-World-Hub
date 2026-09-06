/**
 * Server-only release control for wagered Trivia PvP.
 *
 * This is deliberately opt-in. A missing, misspelled, client-exposed, or
 * loosely truthy value must never reopen a diamond-moving surface. Operations
 * may enable PvP only with the exact server environment value `true`, after
 * the server-owned matchmaking migration and endpoints are deployed.
 */
export const TRIVIA_PVP_RELEASE_ENV = 'TRIVIA_PVP_ENABLED';
export const TRIVIA_PVP_HORSES_RELEASE_ENV = 'TRIVIA_PVP_HORSES_ENABLED';
export const TRIVIA_PVP_DISABLED_ERROR = 'pvp_temporarily_unavailable';

export function isTriviaPvpReleased(env = {}) {
    return env?.[TRIVIA_PVP_RELEASE_ENV] === 'true';
}

/** Enabling PvP never implicitly enables horse-player matchmaking. */
export function areTriviaPvpHorsesReleased(env = {}) {
    return isTriviaPvpReleased(env)
        && env?.[TRIVIA_PVP_HORSES_RELEASE_ENV] === 'true';
}

export function rejectUnavailableTriviaPvp(res) {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('Retry-After', '300');
    return res.status(503).json({
        success: false,
        error: TRIVIA_PVP_DISABLED_ERROR,
    });
}

export function triviaPvpPageReleaseResult(env = {}) {
    if (isTriviaPvpReleased(env)) {
        return { props: { pvpHorsesEnabled: areTriviaPvpHorsesReleased(env) } };
    }
    return {
        redirect: {
            destination: '/hub/trivia',
            permanent: false,
        },
    };
}

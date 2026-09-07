/**
 * Server-only release controls for competitive Trivia tournaments.
 *
 * Tournament entry, question delivery, answer submission, and lifecycle
 * mutation all move or can eventually move diamonds. They remain fail-closed
 * until operations sets the exact server value `true` after the server-owned
 * nightly tournament engine is deployed and verified.
 *
 * Horse population is a second, independent opt-in. Enabling tournaments must
 * never implicitly enable horse players.
 */
export const TRIVIA_TOURNAMENT_RELEASE_ENV = 'TRIVIA_TOURNAMENTS_ENABLED';
export const TRIVIA_TOURNAMENT_HORSES_RELEASE_ENV = 'TRIVIA_TOURNAMENT_HORSES_ENABLED';
export const TRIVIA_TOURNAMENT_DISABLED_ERROR = 'tournaments_temporarily_unavailable';

export function areTriviaTournamentsReleased(env = {}) {
    return env?.[TRIVIA_TOURNAMENT_RELEASE_ENV] === 'true';
}

export function areTriviaTournamentHorsesReleased(env = {}) {
    return areTriviaTournamentsReleased(env)
        && env?.[TRIVIA_TOURNAMENT_HORSES_RELEASE_ENV] === 'true';
}

export function rejectUnavailableTriviaTournament(res) {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('Retry-After', '300');
    return res.status(503).json({
        success: false,
        error: TRIVIA_TOURNAMENT_DISABLED_ERROR,
    });
}

export function triviaTournamentPageReleaseResult(env = {}) {
    if (areTriviaTournamentsReleased(env)) return { props: {} };
    return {
        redirect: {
            destination: '/hub/trivia',
            permanent: false,
        },
    };
}

/**
 * /api/trivia/nightly/[action] - Phase 6 nightly 8 PM America/Chicago tournament
 * (schedule, summary, enter, field, bracket, match, my-run, play, results,
 * receipt, history). Private 503 while TRIVIA_TOURNAMENTS_ENABLED is off.
 * Contract: $T/interfaces/tournament-api.md and src/lib/trivia/nightlyTournamentPolicy.mjs.
 */
import { createNightlyTournamentApi } from '../../../../src/lib/trivia/nightlyTournamentApiHandler';
import { serviceClient } from '../tournament-lifecycle';

export default createNightlyTournamentApi({ serviceClient });

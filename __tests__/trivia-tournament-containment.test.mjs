import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import {
    areTriviaTournamentHorsesReleased,
    areTriviaTournamentsReleased,
    rejectUnavailableTriviaTournament,
    triviaTournamentPageReleaseResult,
} from '../src/lib/trivia/tournamentReleaseControl.mjs';

const ROOT = process.cwd();
const read = (file) => readFileSync(join(ROOT, file), 'utf8');

const entryRoute = read('pages/api/trivia/tournament-enter.js');
const questionsRoute = read('pages/api/trivia/tournament-round-questions.js');
const submitRoute = read('pages/api/trivia/tournament-submit-round.js');
const cronLifecycleRoute = read('pages/api/cron/trivia-tournament-tick.js');
const manualLifecycleRoute = read('pages/api/trivia/tournament-lifecycle.js');
const tournamentPage = read('pages/hub/trivia/tournaments.js');
const genericSessionStart = read('pages/api/trivia/session-start.js');
const genericSessionAnswer = read('pages/api/trivia/session-answer.js');
const genericSessionSubmit = read('pages/api/trivia/session-submit.js');
const openClawDispatcher = read('scripts/openclaw-cron-dispatcher.py');
const vercelCronPaths = new Set((JSON.parse(read('vercel.json')).crons || []).map(cron => cron.path));
const cronHealthRegistry = read('pages/api/admin/cron-health.js');
const envExample = read('.env.example');

test('tournament and horse release controls are server-only, exact, and default off', () => {
    assert.equal(areTriviaTournamentsReleased(), false);
    assert.equal(areTriviaTournamentsReleased({}), false);
    assert.equal(areTriviaTournamentsReleased({ TRIVIA_TOURNAMENTS_ENABLED: 'false' }), false);
    assert.equal(areTriviaTournamentsReleased({ TRIVIA_TOURNAMENTS_ENABLED: 'TRUE' }), false);
    assert.equal(areTriviaTournamentsReleased({ TRIVIA_TOURNAMENTS_ENABLED: '1' }), false);
    assert.equal(areTriviaTournamentsReleased({ TRIVIA_TOURNAMENTS_ENABLED: true }), false);
    assert.equal(areTriviaTournamentsReleased({ NEXT_PUBLIC_TRIVIA_TOURNAMENTS_ENABLED: 'true' }), false);
    assert.equal(areTriviaTournamentsReleased({ TRIVIA_TOURNAMENTS_ENABLED: 'true' }), true);

    assert.equal(areTriviaTournamentHorsesReleased({ TRIVIA_TOURNAMENT_HORSES_ENABLED: 'true' }), false);
    assert.equal(areTriviaTournamentHorsesReleased({
        TRIVIA_TOURNAMENTS_ENABLED: 'true',
        TRIVIA_TOURNAMENT_HORSES_ENABLED: 'TRUE',
    }), false);
    assert.equal(areTriviaTournamentHorsesReleased({
        TRIVIA_TOURNAMENTS_ENABLED: 'true',
        TRIVIA_TOURNAMENT_HORSES_ENABLED: 'true',
    }), true);
});

test('disabled tournament APIs are non-cacheable and direct navigation redirects', () => {
    const headers = new Map();
    let statusCode = null;
    let payload = null;
    const res = {
        setHeader(name, value) { headers.set(name, value); },
        status(value) { statusCode = value; return this; },
        json(value) { payload = value; return value; },
    };

    rejectUnavailableTriviaTournament(res);
    assert.equal(statusCode, 503);
    assert.equal(payload.error, 'tournaments_temporarily_unavailable');
    assert.match(headers.get('Cache-Control'), /no-store/);
    assert.equal(headers.get('Retry-After'), '300');
    assert.deepEqual(triviaTournamentPageReleaseResult({}), {
        redirect: { destination: '/hub/trivia', permanent: false },
    });
    assert.deepEqual(
        triviaTournamentPageReleaseResult({ TRIVIA_TOURNAMENTS_ENABLED: 'true' }),
        { props: {} },
    );
});

test('every tournament entry or play surface uses the fail-closed server gate', () => {
    for (const source of [entryRoute, questionsRoute, submitRoute]) {
        assert.match(
            source,
            /if \(!areTriviaTournamentsReleased\(process\.env\)\)[\s\S]{0,180}rejectUnavailableTriviaTournament\(res\)/,
        );
    }
    assert.match(
        tournamentPage,
        /export function getServerSideProps\(\)[\s\S]{0,180}triviaTournamentPageReleaseResult\(process\.env\)/,
    );
    for (const source of [genericSessionStart, genericSessionAnswer, genericSessionSubmit]) {
        assert.match(
            source,
            /mode === 'tournaments' && !areTriviaTournamentsReleased\(process\.env\)[\s\S]{0,140}rejectUnavailableTriviaTournament\(res\)/,
            'generic grading endpoints must not bypass tournament containment',
        );
    }
});

test('authenticated lifecycle cannot mutate while the release is disabled', () => {
    for (const [label, source] of [
        ['scheduled lifecycle', cronLifecycleRoute],
        ['manual lifecycle', manualLifecycleRoute],
    ]) {
        const authGate = source.lastIndexOf('requireAdminSecret(req, res');
        const releaseGate = source.lastIndexOf('!areTriviaTournamentsReleased(process.env)');
        const lifecycleMutation = source.lastIndexOf('await runTournamentLifecycle');

        assert.ok(authGate >= 0, `${label} auth gate must exist`);
        assert.ok(releaseGate > authGate, `${label} release gate must run after authentication`);
        assert.ok(lifecycleMutation > releaseGate, `${label} release gate must run before mutation`);
        assert.match(source, /rejectUnavailableTriviaTournament\(res\)/);
    }
});

test('legacy tournament schedulers and worker routing stay retired', () => {
    for (const path of [
        '/api/cron/trivia-tournaments',
        '/api/cron/trivia-tournament-rounds',
        '/api/cron/trivia-tournament-tick',
    ]) {
        assert.equal(vercelCronPaths.has(path), false, `${path} must not have a Vercel schedule`);
        const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        assert.doesNotMatch(
            openClawDispatcher,
            new RegExp(`^\\s*\\('${escaped}'\\s*,`, 'm'),
            `${path} must not have an active OpenClaw schedule`,
        );
        if (path !== '/api/cron/trivia-tournament-tick') {
            assert.doesNotMatch(
                openClawDispatcher,
                new RegExp(`^\\s*'${escaped}'\\s*:`, 'm'),
                `${path} must not route to a legacy worker`,
            );
        }
    }
    assert.doesNotMatch(cronHealthRegistry, /name: 'trivia-tournament-tick'/);
    assert.match(cronHealthRegistry, /name: 'trivia-economy-audit'/);
});

test('tracked env documentation keeps tournament and horse switches private and off', () => {
    assert.match(envExample, /^TRIVIA_TOURNAMENTS_ENABLED=false$/m);
    assert.match(envExample, /^TRIVIA_TOURNAMENT_HORSES_ENABLED=false$/m);
    assert.doesNotMatch(envExample, /^NEXT_PUBLIC_TRIVIA_TOURNAMENTS_ENABLED=/m);
    assert.doesNotMatch(envExample, /^NEXT_PUBLIC_TRIVIA_TOURNAMENT_HORSES_ENABLED=/m);
});

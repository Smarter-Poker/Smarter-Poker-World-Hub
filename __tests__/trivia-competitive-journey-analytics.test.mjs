import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
    COMPETITIVE_JOURNEY_EVENT,
    COMPETITIVE_JOURNEY_MODES,
    COMPETITIVE_JOURNEY_STAGES,
    buildCompetitiveJourneyEvent,
    createCompetitiveJourneyTracker,
} from '../src/lib/trivia/competitiveJourneyAnalytics.mjs';

const ROOT = process.cwd();
const read = path => readFileSync(join(ROOT, path), 'utf8');

test('competitive journey analytics uses one fixed event and finite mode and stage contracts', () => {
    assert.equal(COMPETITIVE_JOURNEY_EVENT, 'trivia_competitive_journey');
    assert.deepEqual(COMPETITIVE_JOURNEY_MODES, ['lobby', 'pvp', 'nightly_tournament']);
    assert.deepEqual(COMPETITIVE_JOURNEY_STAGES, [
        'impression',
        'intent',
        'commitment',
        'play',
        'verified_settlement_receipt',
    ]);
    assert.equal(buildCompetitiveJourneyEvent('invented', 'impression'), null);
    assert.equal(buildCompetitiveJourneyEvent('pvp', 'invented'), null);
});

test('payload projection drops identifiers, answers, amounts and arbitrary strings', () => {
    const payload = buildCompetitiveJourneyEvent('pvp', 'play', {
        source: 'pvp',
        action: 'open_play',
        state: 'playing',
        opponent_kind: 'smarter_horse',
        userId: 'user-secret',
        ticketId: 'ticket-secret',
        matchId: 'match-secret',
        tournamentId: 'tournament-secret',
        sessionId: 'session-secret',
        answer: 'private-answer',
        correctIndex: 2,
        stake: 100,
        stateFromServer: 'unbounded-server-string',
        settlement_kind: 'not-allowlisted',
    });

    assert.deepEqual(payload, {
        event: 'trivia_competitive_journey',
        properties: {
            mode: 'pvp',
            stage: 'play',
            source: 'pvp',
            action: 'open_play',
            state: 'playing',
            opponent_kind: 'smarter_horse',
        },
    });
    assert.doesNotMatch(JSON.stringify(payload), /secret|answer|correctIndex|stake|stateFromServer/i);
});

test('one tracker emits each journey stage once and isolates sync and async capture failures', async () => {
    const calls = [];
    const tracker = createCompetitiveJourneyTracker({
        captureEvent(event, properties) {
            calls.push({ event, properties });
        },
    });

    assert.equal(tracker.track('lobby', 'impression', { source: 'lobby', availability: 'both' }), true);
    assert.equal(tracker.track('lobby', 'impression', { source: 'lobby', availability: 'off' }), false);
    assert.equal(tracker.track('pvp', 'intent', { source: 'lobby', action: 'start_pvp' }), true);
    assert.equal(tracker.track('pvp', 'intent', { source: 'lobby', action: 'resume_pvp' }), false);
    assert.equal(calls.length, 2);

    const throws = createCompetitiveJourneyTracker({ captureEvent() { throw new Error('analytics offline'); } });
    assert.doesNotThrow(() => throws.track('pvp', 'play', { state: 'playing' }));
    assert.equal(throws.track('pvp', 'play', { state: 'playing' }), false);

    const rejects = createCompetitiveJourneyTracker({ captureEvent: () => Promise.reject(new Error('analytics rejected')) });
    assert.doesNotThrow(() => rejects.track('nightly_tournament', 'commitment', { state: 'ready' }));
    await new Promise(resolve => setImmediate(resolve));

    const unsafeProperties = Object.defineProperty({}, 'state', { get() { throw new Error('bad property'); } });
    assert.doesNotThrow(() => rejects.track('nightly_tournament', 'play', unsafeProperties));
    assert.equal(rejects.track('nightly_tournament', 'play', unsafeProperties), false);
});

test('the lobby records one safe impression and intent before navigation', () => {
    const briefing = read('src/components/trivia/competitive/CompetitiveLobbyBriefing.jsx');
    assert.match(briefing, /createCompetitiveJourneyTracker/);
    assert.match(briefing, /track\('lobby', 'impression'/);
    assert.match(briefing, /track\(mode, 'intent'/);
    assert.match(briefing, /journeyTracker\.track\(mode, 'intent'[\s\S]*?router\.push\(path\)/);
    assert.doesNotMatch(briefing, /journeyTracker\.track\([^\n]*(?:userId|ticketId|matchId|tournamentId|sessionId|answer|correctIndex)/);
});

test('PvP journey starts after client gates and settles only from server references', () => {
    const pvp = read('src/components/trivia/pvp/PvpCompetitiveExperience.jsx');
    assert.match(pvp, /track\('pvp', 'impression'/);
    assert.match(pvp, /track\('pvp', 'intent'[\s\S]*?requestPvp\('join'/);
    assert.match(pvp, /rulesVersion: quote\.rulesVersion/);
    assert.match(pvp, /track\('pvp', 'commitment'/);
    assert.match(pvp, /track\('pvp', 'play'/);
    assert.match(pvp, /result\?\.stakeReference[\s\S]*?result\?\.settlementReference[\s\S]*?result\?\.settledAt/);
    assert.match(pvp, /track\('pvp', 'verified_settlement_receipt'/);
    assert.doesNotMatch(pvp, /track\('pvp'[^\n]*(?:ticketId|matchId|sessionId|questionId|answer|reference|stake|amount)/);
});

test('nightly tournament journey is bound to authoritative entry, play and settlement receipts', () => {
    const tournaments = read('pages/hub/trivia/tournaments.js');
    assert.match(tournaments, /track\('nightly_tournament', 'impression'/);
    assert.match(tournaments, /track\('nightly_tournament', 'intent'[\s\S]*?nightlyRequest\('play'/);
    assert.match(tournaments, /track\('nightly_tournament', 'intent'[\s\S]*?nightlyRequest\('enter'/);
    assert.match(tournaments, /myRun\?\.entered[\s\S]*?receipt\?\.entry\?\.reference[\s\S]*?receipt\?\.entry\?\.journalId/);
    assert.match(tournaments, /track\('nightly_tournament', 'commitment'/);
    assert.match(tournaments, /firstOpenQuestion\(merged\)[\s\S]*?track\('nightly_tournament', 'play'/);
    assert.match(tournaments, /receipt\?\.settlement\?\.settlementId[\s\S]*?receipt\?\.settlement\?\.idempotencyKey/);
    assert.match(tournaments, /receipt\.refund\.reference/);
    assert.match(tournaments, /receipt\.payout\.reference/);
    assert.match(tournaments, /track\('nightly_tournament', 'verified_settlement_receipt'/);
    assert.doesNotMatch(tournaments, /track\('nightly_tournament'[^\n]*(?:tournamentId|sessionId|questionId|answer|reference|amount)/);
});

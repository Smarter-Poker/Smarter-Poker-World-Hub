import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
    COMPETITIVE_LOBBY_ENDPOINTS,
    deriveCompetitiveLobbyState,
    getCountdown,
    getRegistrationLabel,
    getTournamentClock,
    getTournamentHeadline,
    planCompetitiveLobbyRequests,
    sanitizeNightlySchedule,
    sanitizePvpResume,
    selectFeaturedTournament,
} from '../src/lib/trivia/competitiveLobbyModel.mjs';

const ROOT = process.cwd();
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const PAGE = read('pages/hub/trivia/index.js');
const LOBBY = read('src/components/trivia/TriviaLobby.jsx');
const BRIEFING = read('src/components/trivia/competitive/CompetitiveLobbyBriefing.jsx');
const BRIEFING_CSS = read('src/components/trivia/competitive/CompetitiveLobbyBriefing.module.css');
const MODEL = read('src/lib/trivia/competitiveLobbyModel.mjs');

const ready = (data) => ({ status: 'ready', data });
const resource = (status, data = null) => ({ status, data });

test('competitive request planning stays feature-gated and never authenticates from browser data', () => {
    assert.deepEqual(planCompetitiveLobbyRequests({
        tournamentsEnabled: false,
        pvpEnabled: false,
        authState: 'authenticated',
    }), { schedule: null, pvpResume: null });

    assert.deepEqual(planCompetitiveLobbyRequests({
        tournamentsEnabled: true,
        pvpEnabled: true,
        authState: 'signed-out',
    }), { schedule: COMPETITIVE_LOBBY_ENDPOINTS.schedule, pvpResume: null });

    assert.deepEqual(planCompetitiveLobbyRequests({
        tournamentsEnabled: true,
        pvpEnabled: true,
        authState: 'authenticated',
    }), {
        schedule: '/api/trivia/nightly/schedule?days=2',
        pvpResume: '/api/trivia/pvp/resume',
    });

    assert.doesNotMatch(`${BRIEFING}\n${MODEL}`, /\bsupabase\b|\.from\s*\(|\.rpc\s*\(/i);
    assert.doesNotMatch(BRIEFING, /localStorage|sessionStorage|userId|accessToken|Authorization/);
    assert.match(BRIEFING, /credentials: 'same-origin'/);
    assert.match(BRIEFING, /cache: 'no-store'/);
});

test('nightly schedule projection keeps only lobby-safe fields and selects the official event', () => {
    const raw = {
        success: true,
        serverTime: '2026-10-06T00:58:00.000Z',
        secret: 'never-render',
        instances: [{
            tournamentId: '11111111-1111-4111-8111-111111111111',
            name: 'Nightly Trivia Tournament',
            officialTimezone: 'America/Chicago',
            localDate: '2026-10-05',
            localStartTime: '20:00',
            startsAt: '2026-10-06T01:00:00.000Z',
            registrationOpensAt: '2026-10-05T01:00:00.000Z',
            registrationClosesAt: '2026-10-06T00:55:00.000Z',
            state: 'registration',
            entryFee: 25,
            rakePerEntry: 3,
            bracketCapacity: 256,
            horseTarget: 100,
            horsesEntered: 98,
            humansEntered: 71,
            humanSeatsRemaining: 85,
            estimatedPrizePool: 3380,
            correctIndex: 2,
            viewer: {
                entered: true,
                entrantId: '22222222-2222-4222-8222-222222222222',
                entryReference: 'private-reference',
                entryState: 'entered',
            },
        }],
    };

    const projected = sanitizeNightlySchedule(raw);
    const featured = selectFeaturedTournament(projected);
    assert.equal(projected.serverTime, raw.serverTime);
    assert.equal(projected.instances.length, 1);
    assert.equal(featured.officialTimezone, 'America/Chicago');
    assert.equal(featured.horsesEntered, 98);
    assert.equal(featured.humansEntered, 71);
    assert.equal(featured.entryFee, 25);
    assert.equal(featured.rakePerEntry, 3);
    assert.equal(featured.viewer.entered, true);
    assert.equal(getRegistrationLabel(featured, raw.serverTime), 'Registered');
    assert.equal(getRegistrationLabel({ ...featured, state: 'live' }, raw.serverTime), 'Registered / Live');

    const text = JSON.stringify(projected);
    assert.doesNotMatch(text, /tournamentId|correctIndex|secret|entrantId|entryReference|private-reference/);
    assert.equal(sanitizeNightlySchedule({ ...raw, instances: [{ ...raw.instances[0], state: 'invented' }] }).instances.length, 0);
    assert.equal(sanitizeNightlySchedule({ success: true, serverTime: 'not-a-date', instances: [] }), null);
});

test('PvP resume projection discloses Smarter Horses and drops match internals', () => {
    const projected = sanitizePvpResume({
        success: true,
        engine: 'pvp-v2',
        serverNow: '2026-10-06T00:58:00.000Z',
        state: 'playing',
        secret: 'never-render',
        ticket: {
            id: '11111111-1111-4111-8111-111111111111',
            status: 'matched',
            stake: 50,
            horseEligibleAt: '2026-10-06T00:57:30.000Z',
            secondsUntilHorseEligible: 0,
            horseFallbackEnabled: true,
            presence: 'live',
            matchKind: 'horse',
        },
        match: {
            id: '22222222-2222-4222-8222-222222222222',
            kind: 'horse',
            status: 'active',
            stake: 50,
            mySessionId: '33333333-3333-4333-8333-333333333333',
            opponent: {
                kind: 'horse',
                isHorse: true,
                displayName: 'Internal Horse Name',
                correctIndex: 1,
            },
        },
    });

    assert.equal(projected.state, 'playing');
    assert.equal(projected.resumeAvailable, true);
    assert.deepEqual(projected.match.opponent, {
        kind: 'horse',
        label: 'Smarter Horse',
        displayName: 'Smarter Horse',
    });
    assert.doesNotMatch(JSON.stringify(projected), /"id"|mySessionId|correctIndex|secret|Internal Horse Name/);
    assert.equal(sanitizePvpResume({ success: true, state: 'invented' }), null);
    assert.equal(sanitizePvpResume({ success: false, state: 'idle' }), null);
});

test('countdown and lobby state model cover every truthful Phase 7 briefing state', () => {
    assert.deepEqual(
        getCountdown('2026-10-06T01:00:00.000Z', '2026-10-06T00:59:00.000Z'),
        { display: '00:01:00', ariaLabel: '0 hours, 1 minute, 0 seconds', complete: false },
    );
    assert.deepEqual(
        getTournamentClock({ startsAt: '2026-10-06T01:00:00.000Z', state: 'settled' }, '2026-10-06T02:00:00.000Z'),
        { display: 'Complete', ariaLabel: 'Tournament complete', complete: true },
    );
    assert.deepEqual(
        getTournamentClock({ startsAt: '2026-10-06T01:00:00.000Z', state: 'cancelled' }, '2026-10-06T02:00:00.000Z'),
        { display: 'Cancelled', ariaLabel: 'Tournament cancelled', complete: true },
    );
    assert.deepEqual(
        getTournamentClock({ startsAt: '2026-10-06T01:00:00.000Z', state: 'registration' }, '2026-10-06T02:00:00.000Z'),
        { display: 'Awaiting Start', ariaLabel: 'Tournament awaiting authoritative start', complete: true },
    );
    assert.deepEqual(
        getTournamentClock({ startsAt: '2026-10-06T01:00:00.000Z', state: 'held' }, '2026-10-06T02:00:00.000Z'),
        { display: 'Start Pending', ariaLabel: 'Field locked, awaiting tournament start', complete: true },
    );
    assert.equal(
        getTournamentHeadline({ startsAt: '2026-10-06T01:00:00.000Z', state: 'settled' }, '2026-10-06T02:00:00.000Z'),
        'Nightly Complete',
    );
    assert.equal(
        getTournamentHeadline({ startsAt: '2026-10-06T01:00:00.000Z', state: 'registration' }, '2026-10-05T23:00:00.000Z'),
        'Tonight At 8 PM',
    );
    assert.equal(
        getTournamentHeadline({ startsAt: '2026-10-07T01:00:00.000Z', state: 'scheduled' }, '2026-10-05T23:00:00.000Z'),
        'Next Nightly At 8 PM',
    );

    const selectedLive = selectFeaturedTournament({
        serverTime: '2026-10-06T01:30:00.000Z',
        instances: [
            { startsAt: '2026-10-02T01:00:00.000Z', state: 'held', name: 'Old Held' },
            { startsAt: '2026-10-06T01:00:00.000Z', state: 'live', name: 'Current Live' },
            { startsAt: '2026-10-07T01:00:00.000Z', state: 'scheduled', name: 'Next Nightly' },
        ],
    });
    assert.equal(selectedLive.name, 'Current Live');
    const selectedUpcoming = selectFeaturedTournament({
        serverTime: '2026-10-06T01:30:00.000Z',
        instances: [
            { startsAt: '2026-10-02T01:00:00.000Z', state: 'held', name: 'Old Held' },
            { startsAt: '2026-10-07T01:00:00.000Z', state: 'scheduled', name: 'Next Nightly' },
        ],
    });
    assert.equal(selectedUpcoming.name, 'Next Nightly');

    const schedule = { serverTime: '2026-10-06T00:58:00.000Z', instances: [{ startsAt: '2026-10-06T01:00:00.000Z', state: 'registration' }] };
    const resume = { state: 'playing', resumeAvailable: true };
    const base = {
        authState: 'authenticated',
        tournamentsEnabled: true,
        pvpEnabled: true,
        connectionState: 'online',
        scheduleResource: ready(schedule),
        pvpResource: ready({ state: 'idle', resumeAvailable: false }),
    };

    assert.equal(deriveCompetitiveLobbyState({ ...base, tournamentsEnabled: false, pvpEnabled: false }).key, 'feature-off');
    assert.equal(deriveCompetitiveLobbyState({ ...base, authState: 'loading' }).key, 'auth-loading');
    assert.equal(deriveCompetitiveLobbyState({ ...base, authState: 'signed-out', pvpResource: resource('signed-out') }).key, 'signed-out');
    assert.equal(deriveCompetitiveLobbyState({ ...base, pvpResource: resource('signed-out') }).key, 'signed-out');
    assert.equal(deriveCompetitiveLobbyState({ ...base, scheduleResource: resource('loading'), pvpResource: resource('loading') }).key, 'loading');
    assert.equal(deriveCompetitiveLobbyState({ ...base, scheduleResource: ready({ serverTime: schedule.serverTime, instances: [] }) }).key, 'empty');
    assert.equal(deriveCompetitiveLobbyState({ ...base, pvpResource: resource('error') }).key, 'partial');
    assert.equal(deriveCompetitiveLobbyState({ ...base, connectionState: 'offline' }).key, 'stale');
    assert.equal(deriveCompetitiveLobbyState({ ...base, connectionState: 'refreshing' }).key, 'refreshing');
    assert.equal(deriveCompetitiveLobbyState({ ...base, pvpResource: ready(resume) }).key, 'resume');
});

test('the briefing is painted, sits between Daily and the catalogue, and keeps mobile stacked', () => {
    const daily = LOBBY.indexOf('className="daily-trivia-banner"');
    const briefing = LOBBY.indexOf('<CompetitiveLobbyBriefing');
    const catalogue = LOBBY.indexOf('className="modes-section"');
    const quickStakes = LOBBY.indexOf('className="quick-stakes-section"');
    assert.ok(daily >= 0 && daily < briefing && briefing < catalogue && catalogue < quickStakes);

    assert.match(BRIEFING, /import TriviaConsole from '\.\.\/console\/TriviaConsole'/);
    assert.match(BRIEFING, /title=\{getTournamentHeadline\(featuredTournament, scheduleNow\)\}/);
    assert.match(BRIEFING, /America\/Chicago \/ Official Nightly/);
    assert.match(BRIEFING, />Smarter Horses</);
    assert.match(BRIEFING, /TRIVIA_INTRO_ART_TOURNAMENTS/);
    assert.match(BRIEFING, /TRIVIA_INTRO_ART_PVP/);
    assert.match(BRIEFING, /<ResponsiveModeArt[\s\S]*?className=\{styles\.featureArt\}[\s\S]*?<div className=\{styles\.featureCopy\}/);
    assert.match(BRIEFING, />Entry</);
    assert.match(BRIEFING, />Rake</);
    assert.match(BRIEFING, /Start 1 V 1/);
    assert.match(BRIEFING, /View Tournament/);
    assert.match(BRIEFING, /formatViewerStart/);
    assert.match(BRIEFING, />Your Time</);
    assert.match(BRIEFING, /Last Known \/ Refresh Required/);
    assert.match(BRIEFING, /Verify And Resume/);
    assert.match(BRIEFING, /data-mobile-layout="stacked"/);
    assert.match(BRIEFING, /data-desktop-layout="seven-five-competitive"/);
    assert.match(BRIEFING_CSS, /grid-template-columns: minmax\(0, 7fr\) minmax\(0, 5fr\)/);
    assert.match(BRIEFING_CSS, /@media \(max-width: 700px\)[\s\S]*?grid-template-columns: 1fr/);
    assert.match(BRIEFING_CSS, /min-height: 44px/);
    assert.match(BRIEFING_CSS, /:focus-visible/);
    assert.match(BRIEFING_CSS, /@media \(prefers-reduced-motion: reduce\)/);
    assert.match(BRIEFING_CSS, /@media \(forced-colors: active\)/);
    assert.doesNotMatch(`${BRIEFING}\n${BRIEFING_CSS}`, /lucide|fontawesome|<svg|:hover|gradient|border-radius/i);
    assert.doesNotMatch(`${BRIEFING}\n${MODEL}`, /reconnecting/i);

    assert.match(PAGE, /authState=\{authLoading \? 'loading' : userId \? 'authenticated' : 'signed-out'\}/);
    assert.match(PAGE, /Promise\.allSettled\(\[/);
    assert.match(PAGE, /setPlayerDataStatus\(nextStatus\)/);
    assert.match(PAGE, /playerDataStatus=\{playerDataStatus\}/);
    assert.match(LOBBY, /dailyDataUnavailable/);
    assert.match(LOBBY, /Successful Reads Were Kept/);
    assert.match(PAGE, /pvp: isTriviaPvpReleased\(process\.env\)/);
    assert.match(PAGE, /tournaments: areTriviaTournamentsReleased\(process\.env\)/);
    assert.doesNotMatch(PAGE, /NEXT_PUBLIC_TRIVIA_(?:PVP|TOURNAMENT)/);
});

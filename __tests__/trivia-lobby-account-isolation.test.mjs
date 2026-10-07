import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
    createTriviaLobbyAccountRequestGuard,
    projectTriviaLobbyProfileRead,
} from '../src/lib/trivia/lobbyAccountIsolation.mjs';

const ROOT = process.cwd();
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const PAGE = read('pages/hub/trivia/index.js');
const LOBBY = read('src/components/trivia/TriviaLobby.jsx');
const BRIEFING = read('src/components/trivia/competitive/CompetitiveLobbyBriefing.jsx');

test('account request guard refuses A after B starts and accepts only latest B', () => {
    const guard = createTriviaLobbyAccountRequestGuard();
    const requestA = guard.begin('user-a');
    const requestB = guard.begin('user-b');

    assert.equal(guard.isCurrent(requestA, 'user-b'), false);
    assert.equal(guard.isCurrent(requestA, 'user-a'), false);
    assert.equal(guard.isCurrent(requestB, 'user-b'), true);

    guard.invalidate();
    assert.equal(guard.isCurrent(requestB, 'user-b'), false);
});

test('account request guard refuses a prior user before the next request begins', () => {
    const guard = createTriviaLobbyAccountRequestGuard();
    const requestA = guard.begin('user-a');

    assert.equal(guard.isCurrent(requestA, 'user-b'), false);
    assert.equal(guard.isCurrent(requestA, null), false);
});

test('a successful null profile authoritatively clears balance and VIP', () => {
    assert.deepEqual(projectTriviaLobbyProfileRead({
        status: 'fulfilled',
        value: { data: null, error: null },
    }), {
        status: 'ready',
        applyValue: true,
        userDiamonds: 0,
        isVip: false,
        profileExists: false,
    });

    assert.deepEqual(projectTriviaLobbyProfileRead({
        status: 'rejected',
        reason: new Error('offline'),
    }), {
        status: 'error',
        applyValue: false,
        userDiamonds: 0,
        isVip: false,
        profileExists: false,
    });
});

test('the page clears account state and gates every async completion by account and generation', () => {
    assert.match(PAGE, /createTriviaLobbyAccountRequestGuard/);
    assert.match(PAGE, /latestUserIdRef\.current = userId \|\| null/);
    assert.match(PAGE, /playerDataRequestGuardRef\.current\.invalidate\(\)/);
    assert.match(PAGE, /setUserDiamonds\(0\)[\s\S]*setIsVip\(false\)[\s\S]*setDailyCompleted\(false\)[\s\S]*setCurrentStreak\(0\)/);
    assert.match(PAGE, /isCurrent\(request, latestUserIdRef\.current\)/);
    assert.match(PAGE, /if \(!requestIsCurrent\(\)\) return/);
    assert.match(PAGE, /profileProjection\.applyValue/);
});

test('signed-in competitive reads use authedFetch while signed-out schedule remains public', () => {
    assert.match(BRIEFING, /import \{ authedFetch \} from '[^']*authUtils'/);
    assert.match(BRIEFING, /authState === 'authenticated' \? authedFetch : fetch/);
    assert.match(BRIEFING, /readJson\(requestPlan\.pvpResume, controller\.signal, authedFetch\)/);
    assert.match(BRIEFING, /\[accountKey, authState, refreshVersion, requestPlan\.schedule\]/);
    assert.match(BRIEFING, /const data = sanitizeNightlySchedule\(raw\)/);
});

test('competitive resources are keyed, cleared, aborted, and generation-bound across A to B', () => {
    const scheduleGuard = createTriviaLobbyAccountRequestGuard();
    const pvpGuard = createTriviaLobbyAccountRequestGuard();
    const scheduleA = scheduleGuard.begin('user-a');
    const pvpA = pvpGuard.begin('user-a');
    const scheduleB = scheduleGuard.begin('user-b');
    const pvpB = pvpGuard.begin('user-b');

    assert.equal(scheduleGuard.isCurrent(scheduleA, 'user-b'), false);
    assert.equal(pvpGuard.isCurrent(pvpA, 'user-b'), false);
    assert.equal(scheduleGuard.isCurrent(scheduleB, 'user-b'), true);
    assert.equal(pvpGuard.isCurrent(pvpB, 'user-b'), true);

    assert.match(PAGE, /accountKey=\{userId \|\| null\}/);
    assert.match(LOBBY, /accountKey = null/);
    assert.match(LOBBY, /key=\{`competitive-lobby:\$\{accountKey \|\| authState\}`\}/);
    assert.match(LOBBY, /accountKey=\{accountKey\}/);
    assert.match(BRIEFING, /latestAccountKeyRef\.current = accountKey \|\| null/);
    assert.match(BRIEFING, /setScheduleResource\(tournamentsEnabled \? waitingResource\(\) : disabledResource\(\)\)/);
    assert.match(BRIEFING, /setPvpResource\(waitingResource\(\)\)/);
    assert.match(BRIEFING, /scheduleRequestIsCurrent\(\)/);
    assert.match(BRIEFING, /pvpRequestIsCurrent\(\)/);
    assert.match(BRIEFING, /scheduleRequestGuardRef\.current\.invalidate\(\)[\s\S]*controller\.abort\(\)/);
    assert.match(BRIEFING, /pvpRequestGuardRef\.current\.invalidate\(\)[\s\S]*controller\.abort\(\)/);
});

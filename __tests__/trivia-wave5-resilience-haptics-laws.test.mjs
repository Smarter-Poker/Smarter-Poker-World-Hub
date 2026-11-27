/**
 * WAVE 5 TRACK 1 ANTI-REGRESSION LAWS (Resilience, Header Dedupe, Haptics)
 *
 * Enforces:
 * 1. UniversalHeader.js module-level short-TTL singleflight fetch dedupe
 *    for ensure-profile, vip/check-status, get-header-stats, get-conversations
 *    keyed by user identity without altering visual layout.
 * 2. triviaHaptics.js unit contract: SSR-safe, respects prefers-reduced-motion,
 *    respects triviaAudio mute and trivia_settings (soundEffects/haptics),
 *    invokes exact vibration patterns when allowed, and never throws.
 * 3. TriviaNetworkBanner.jsx #SMARTERDESIGN contract: compact status banner
 *    with role="status", aria-live="polite", data-trivia-network-banner="true",
 *    >= 44px .sd-button Retry Answer Now, zero forbidden colors, zero uppercase.
 * 4. TriviaGame, StrategyTrivia, TimeAttackGame mount TriviaNetworkBanner with
 *    automatic idempotent reconnect retry and wire haptics; PrizeWheel wires
 *    wheel haptics.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

test('triviaHaptics.js respects SSR, missing vibrate, reduced motion, mute, settings, and never throws', async () => {
    const haptics = await import('../src/lib/trivia/triviaHaptics.js');
    const audio = await import('../src/lib/trivia/triviaAudio.js');

    const origWindow = globalThis.window;
    const origNavigator = globalThis.navigator;
    const origLocalStorage = globalThis.localStorage;
    const origMuted = audio.isMuted();

    const setNavigator = (value) => {
        Object.defineProperty(globalThis, 'navigator', {
            value,
            configurable: true,
            writable: true,
        });
    };

    try {
        // 1. SSR: window undefined -> strict no-op
        delete globalThis.window;
        setNavigator({ vibrate: () => true });
        assert.equal(haptics.isHapticsAllowed(), false);
        assert.equal(haptics.triggerTriviaHaptic('tap'), false);

        // 2. Missing navigator.vibrate -> strict no-op, never throws
        globalThis.window = { matchMedia: () => ({ matches: false }) };
        globalThis.localStorage = { getItem: () => null, setItem: () => {} };
        setNavigator({});
        audio.setMuted(false);
        assert.equal(haptics.isHapticsAllowed(), false);
        assert.equal(haptics.triggerTriviaHaptic('correct'), false);

        // 3. Allowed -> invokes navigator.vibrate with exact patterns
        const calls = [];
        setNavigator({
            vibrate: (pattern) => {
                calls.push(pattern);
                return true;
            },
        });
        assert.equal(haptics.isHapticsAllowed(), true);
        assert.equal(haptics.triggerTriviaHaptic('tap'), true);
        assert.equal(haptics.triggerTriviaHaptic('correct'), true);
        assert.equal(haptics.triggerTriviaHaptic('wrong'), true);
        assert.equal(haptics.triggerTriviaHaptic('wheel'), true);
        assert.deepEqual(calls, [
            10,
            [12, 35, 18],
            [24, 40, 24],
            [10, 25, 15, 25, 30],
        ]);

        // 4. prefers-reduced-motion: reduce -> strict no-op
        calls.length = 0;
        globalThis.window = { matchMedia: () => ({ matches: true }) };
        assert.equal(haptics.isHapticsAllowed(), false);
        assert.equal(haptics.triggerTriviaHaptic('tap'), false);
        assert.equal(calls.length, 0);

        // 5. triviaAudio muted -> strict no-op
        globalThis.window = { matchMedia: () => ({ matches: false }) };
        audio.setMuted(true);
        assert.equal(haptics.isHapticsAllowed(), false);
        assert.equal(haptics.triggerTriviaHaptic('correct'), false);
        assert.equal(calls.length, 0);
        audio.setMuted(false);

        // 6. localStorage['trivia_settings'] soundEffects: false -> strict no-op
        globalThis.localStorage = {
            getItem: (k) => (k === 'trivia_settings' ? JSON.stringify({ soundEffects: false }) : null),
            setItem: () => {},
        };
        assert.equal(haptics.isHapticsAllowed(), false);
        assert.equal(haptics.triggerTriviaHaptic('wrong'), false);
        assert.equal(calls.length, 0);

        // 7. localStorage['trivia_settings'] haptics: false -> strict no-op
        globalThis.localStorage = {
            getItem: (k) => (k === 'trivia_settings' ? JSON.stringify({ soundEffects: true, haptics: false }) : null),
            setItem: () => {},
        };
        assert.equal(haptics.isHapticsAllowed(), false);
        assert.equal(haptics.triggerTriviaHaptic('wheel'), false);
        assert.equal(calls.length, 0);

        // 8. Throwing navigator.vibrate -> caught cleanly, never throws
        globalThis.localStorage = { getItem: () => null, setItem: () => {} };
        setNavigator({
            vibrate: () => {
                throw new Error('blocked');
            },
        });
        assert.equal(haptics.triggerTriviaHaptic('tap'), false);
    } finally {
        audio.setMuted(origMuted);
        if (origWindow === undefined) delete globalThis.window;
        else globalThis.window = origWindow;
        if (origLocalStorage === undefined) delete globalThis.localStorage;
        else globalThis.localStorage = origLocalStorage;
        setNavigator(origNavigator);
    }
});

test('UniversalHeader.js enforces module-level singleflight fetch deduplication for all four bootstrap endpoints', () => {
    const header = read('src/components/ui/UniversalHeader.js');
    assert.match(header, /HEADER_SINGLEFLIGHT_TTL_MS\s*=\s*10_000/);
    assert.match(header, /\/api\/auth\/ensure-profile/);
    assert.match(header, /\/api\/vip\/check-status/);
    assert.match(header, /\/api\/user\/get-header-stats/);
    assert.match(header, /\/api\/messenger\/get-conversations/);
    assert.match(header, /installHeaderFetchSingleflight\(\)/);
    assert.match(header, /headerSingleflightInflight/);
    assert.match(header, /headerSingleflightCache/);
    assert.match(header, /readSingleflightUserId/);
    assert.match(header, /\.clone\(\)/);
});

test('TriviaNetworkBanner.jsx obeys #SMARTERDESIGN (zero forbidden colors, zero uppercase, >=44px retry button, status semantics)', () => {
    const banner = read('src/components/trivia/TriviaNetworkBanner.jsx');
    assert.match(banner, /role="status"/);
    assert.match(banner, /aria-live="polite"/);
    assert.match(banner, /data-trivia-network-banner="true"/);
    assert.match(banner, /addEventListener\('offline'/);
    assert.match(banner, /addEventListener\('online'/);
    assert.match(banner, /Connection Lost - Waiting To Reconnect\. Your Answer Will Retry Automatically\./);
    assert.match(banner, /Connection Restored/);
    assert.match(banner, /className="sd-button"/);
    assert.match(banner, /minHeight:\s*'44px'/);
    assert.match(banner, /Retry Answer Now/);
    assert.doesNotMatch(banner, /text-transform\s*:\s*uppercase|textTransform\s*:\s*['"]uppercase['"]/i);
    // Zero forbidden colors: no yellow, gold, amber, purple, pink
    assert.doesNotMatch(banner, /#(ffd700|f59e0b|eab308|fbbf24|a855f7|9333ea|ec4899|f472b6|ff00ff|ffff00)/i);
    assert.doesNotMatch(banner, /\b(gold|amber|purple|pink|yellow)\b/i);
});

test('TriviaGame, StrategyTrivia, TimeAttackGame mount TriviaNetworkBanner with reconnect retry and haptics; PrizeWheel wires wheel haptics', () => {
    const triviaGame = read('src/components/trivia/TriviaGame.jsx');
    const strategyTrivia = read('src/components/trivia/StrategyTrivia.jsx');
    const timeAttack = read('src/components/trivia/TimeAttackGame.jsx');
    const prizeWheel = read('src/components/trivia/PrizeWheel.jsx');

    for (const [name, src] of [
        ['TriviaGame.jsx', triviaGame],
        ['StrategyTrivia.jsx', strategyTrivia],
        ['TimeAttackGame.jsx', timeAttack],
    ]) {
        assert.match(src, /import TriviaNetworkBanner from '\.\/TriviaNetworkBanner'/, `${name} must import TriviaNetworkBanner`);
        assert.match(src, /<TriviaNetworkBanner\b/, `${name} must render <TriviaNetworkBanner`);
        assert.match(src, /onReconnect=/, `${name} must wire onReconnect idempotent retry`);
        assert.match(src, /answerLockRef/, `${name} must preserve answerLockRef double-tap safety`);
        assert.match(src, /triggerTriviaHaptic\('tap'\)/, `${name} must wire tap haptic`);
        assert.match(src, /triggerTriviaHaptic\((?:'correct'|[^)]*'correct')/, `${name} must wire correct haptic`);
        assert.match(src, /triggerTriviaHaptic\((?:'wrong'|[^)]*'wrong')/, `${name} must wire wrong haptic`);
    }

    assert.match(prizeWheel, /import \{ triggerTriviaHaptic \} from '\.\.\/\.\.\/lib\/trivia\/triviaHaptics'/);
    assert.match(prizeWheel, /triggerTriviaHaptic\('wheel'\)/);
});

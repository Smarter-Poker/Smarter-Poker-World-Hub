/**
 * Wave 4 Track 1 Anti-Regression Laws (Lobby Speed, MTT-Density Tabbed Phone Lobby & Lock-Screen Web Push):
 *  1. ?autostart=1 is strictly restricted to FREE (diamondCost === 0) modes (daily, history, rules, pro)
 *     in both TriviaLobby.jsx and pages/hub/trivia/[mode].js — ZERO silent spending on paid/ticket modes.
 *  2. pages/hub/trivia/index.js prefetches free Trivia routes on mount/idle via router.prefetch.
 *  3. NightlyReminderButton.jsx NEVER invokes Notification.requestPermission() or enablePush() inside
 *     useEffect (explicit click handler only), reuses canonical push-client.js, and renders >= 44px
 *     "Enable Device Push Alerts" plus honest active/blocked statuses.
 *  4. TriviaLobby.jsx exposes accessible role="tablist" + role="tab" + aria-selected category tabs
 *     (Featured & Free, Strategy, Timed & Survival, Competitive, All), defaults phone (< 900px) to
 *     Featured & Free for single-screen density, and preserves zero forbidden colors / uppercase CSS.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

const EXPECTED_FREE_MODES = ['daily', 'history', 'rules', 'pro'];
const PAID_OR_TICKET_MODES = [
    'arcade',
    'mtt',
    'cash',
    'icm',
    'gto',
    'mixed',
    'endless',
    'survival',
    'time-attack',
    'pvp',
    'tournaments',
];

function extractFreeAutostartSet(source) {
    const match = source.match(/const\s+FREE_AUTOSTART_MODES\s*=\s*Object\.freeze\(new Set\(\[([^\]]+)\]\)\)/);
    assert.ok(match, 'FREE_AUTOSTART_MODES must be declared as an Object.freeze(new Set([...]))');
    return Array.from(match[1].matchAll(/['"]([a-z0-9-]+)['"]/g), (m) => m[1]);
}

test('Wave 4 Law 1: ?autostart=1 is strictly restricted to FREE (cost === 0) modes in both TriviaLobby and [mode].js', () => {
    const lobbySrc = read('src/components/trivia/TriviaLobby.jsx');
    const modeSrc = read('pages/hub/trivia/[mode].js');

    const lobbySet = extractFreeAutostartSet(lobbySrc);
    const modeSet = extractFreeAutostartSet(modeSrc);

    assert.deepEqual(lobbySet, EXPECTED_FREE_MODES, 'TriviaLobby FREE_AUTOSTART_MODES must only allow daily, history, rules, pro');
    assert.deepEqual(modeSet, EXPECTED_FREE_MODES, '[mode].js FREE_AUTOSTART_MODES must only allow daily, history, rules, pro');

    for (const paidMode of PAID_OR_TICKET_MODES) {
        assert.ok(!lobbySet.includes(paidMode), `Paid/ticket mode ${paidMode} must never be in TriviaLobby FREE_AUTOSTART_MODES`);
        assert.ok(!modeSet.includes(paidMode), `Paid/ticket mode ${paidMode} must never be in [mode].js FREE_AUTOSTART_MODES`);
    }

    // Lobby checks cost === 0 and activeSoloRecovery before appending ?autostart=1
    assert.match(lobbySrc, /FREE_AUTOSTART_MODES\.has\(modeId\)\s*&&\s*getEntryCost\(modeId\)\s*===\s*0/);
    assert.match(lobbySrc, /activeSoloRecovery\?\.mode\s*!==\s*modeId/);
    assert.match(lobbySrc, /\$\{getModeRoute\(modeId\)\}\?autostart=1/);

    // [mode].js enforces cost === 0, signed-in userId, no recoverable session, !dailyDiamondsClaimed, and ref latch
    assert.match(modeSrc, /rawAutostart\s*!==\s*'1'/);
    assert.match(modeSrc, /!FREE_AUTOSTART_MODES\.has\(mode\)\s*\|\|\s*\(modeConfig\.diamondCost\s*\|\|\s*0\)\s*!==\s*0/);
    assert.match(modeSrc, /if\s*\(\s*serverRun\.hasRecoverableSession\s*\)\s*return;/);
    assert.match(modeSrc, /dailyDiamondsClaimed/);
    assert.match(modeSrc, /autostartConsumedRef\.current\s*===\s*latchKey/);
    assert.match(modeSrc, /autostartConsumedRef\.current\s*=\s*latchKey/);
});

test('Wave 4 Law 2: pages/hub/trivia/index.js prefetches free Trivia routes on mount/idle via router.prefetch', () => {
    const indexSrc = read('pages/hub/trivia/index.js');
    for (const route of ['/hub/trivia/daily', '/hub/trivia/history', '/hub/trivia/rules', '/hub/trivia/pro']) {
        assert.ok(indexSrc.includes(route), `pages/hub/trivia/index.js must prefetch ${route}`);
    }
    assert.match(indexSrc, /router\.prefetch\(route\)/);
});

test('Wave 4 Law 3: NightlyReminderButton never prompts push in useEffect and exposes explicit >= 44px Enable Device Push Alerts CTA', () => {
    const src = read('src/components/trivia/NightlyReminderButton.jsx');

    // Canonical push client reuse
    assert.match(src, /from\s+['"]\.\.\/\.\.\/lib\/push-client['"]/);
    assert.match(src, /\benablePush\b/);
    assert.match(src, /\bisWebPushSupported\b/);
    assert.match(src, /\bnotificationPermission\b/);

    // NEVER call requestPermission() anywhere directly, and NEVER call enablePush() inside any useEffect
    assert.doesNotMatch(src, /Notification\.requestPermission\s*\(/, 'NightlyReminderButton must not call Notification.requestPermission() directly; use canonical enablePush() on click');
    const useEffectBlocks = Array.from(src.matchAll(/useEffect\s*\(\s*\(\)\s*=>\s*\{([\s\S]*?)\}\s*,\s*\[/g), (m) => m[1]);
    assert.ok(useEffectBlocks.length >= 2, 'Expected loadStatus and passive push-capability useEffect hooks');
    for (const body of useEffectBlocks) {
        assert.doesNotMatch(body, /\benablePush\s*\(/, 'enablePush() must NEVER be called inside useEffect');
        assert.doesNotMatch(body, /requestPermission\s*\(/, 'requestPermission() must NEVER be called inside useEffect');
    }

    // Explicit click handler + >= 44px button + honest status strings
    assert.match(src, /const\s+handleEnableDevicePush\s*=\s*async\s*\(\)\s*=>/);
    assert.match(src, /data-enable-device-push="true"/);
    assert.match(src, /Enable Device Push Alerts/);
    assert.match(src, /minHeight:\s*['"]44px['"]/);
    assert.match(src, /onClick=\{handleEnableDevicePush\}/);
    assert.match(src, /Device Push Alerts Active/);
    assert.match(src, /Browser Push Blocked - In-App Alert Active/);
});

test('Wave 4 Law 4: TriviaLobby exposes role="tablist" MTT-density category tabs and defaults phone (< 900px) to Featured & Free', () => {
    const lobbySrc = read('src/components/trivia/TriviaLobby.jsx');

    assert.match(lobbySrc, /role="tablist"/);
    assert.match(lobbySrc, /role="tab"/);
    assert.match(lobbySrc, /aria-selected=\{activeFilter === filter\.id\}/);
    assert.match(lobbySrc, /role="tabpanel"/);

    for (const label of ['Featured & Free', 'Strategy', 'Timed & Survival', 'Competitive', 'All']) {
        assert.ok(lobbySrc.includes(`label: '${label}'`), `TriviaLobby must define category tab "${label}"`);
    }

    // Default phone (< 900px) starts on 'featured' and gates heavy secondary panels by tab
    assert.match(lobbySrc, /useState\(['"]featured['"]\)/);
    assert.match(lobbySrc, /\(max-width:\s*899px\)/);
    assert.match(lobbySrc, /const showQuickStakes = activeFilter === 'all' \|\| activeFilter === 'timed'/);
    assert.match(lobbySrc, /const showCompetitiveBriefing = activeFilter === 'all' \|\| activeFilter === 'competitive'/);
});

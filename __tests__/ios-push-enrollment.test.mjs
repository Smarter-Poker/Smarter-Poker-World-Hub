/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  THE iPHONE MUST NOT BE TOLD NOTHING
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Dan, 2026-08-25: "[PepNationLab] send push notifications to the phone via
 * the webapp, I get actual real notifications in real time... this is not
 * working or functional for smarter.poker."
 *
 * Every piece of the push stack was already present and correct: VAPID keys,
 * /api/push/subscribe, push_outbox, the dispatch cron, and a service worker
 * with push / notificationclick / pushsubscriptionchange handlers, all
 * verified against production. The pipeline had delivered exactly ONE push
 * ever. push_subscriptions held ZERO active rows and 1,376 push_outbox rows
 * were marked skipped / no_subscription.
 *
 * Nothing was broken. Nobody could ENROL from a phone.
 *
 * On iOS, PushManager does not exist in Safari. Web push works only after the
 * site is added to the Home Screen and opened standalone. So
 * isWebPushSupported() returned false and FirstRunNotificationPrompt returned
 * silently -- the iPhone user saw nothing at all and concluded push was
 * broken. The Add-to-Home-Screen instructions existed in the file the whole
 * time, but only inside the 'blocked' branch, which iOS Safari can never
 * reach: permission there is 'default', not 'denied', and the effect had
 * already returned above it.
 *
 * These are static assertions, in the same style as menu-routes-exist and
 * pa-no-undef, because the failure mode is "a branch that cannot be reached",
 * which a render test would not catch either.
 *
 * Run: node --test __tests__/ios-push-enrollment.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PROMPT = join(ROOT, 'src/components/notifications/FirstRunNotificationPrompt.jsx');
const src = readFileSync(PROMPT, 'utf8');

test('the unsupported-push branch offers iOS install instead of returning silently', () => {
    const gate = src.indexOf('if (!isWebPushSupported())');
    assert.ok(gate > -1, 'the isWebPushSupported gate is gone; this test needs rewriting');

    // Whatever follows that gate must consider iOS-not-installed BEFORE giving up.
    const afterGate = src.slice(gate, gate + 1400);
    assert.match(
        afterGate,
        /isIos\(\)\s*&&\s*!isIosStandalonePwa\(\)/,
        'iOS Safari falls through the unsupported gate with no install path — the exact dead end that left push_subscriptions empty'
    );
    assert.match(afterGate, /setState\('install'\)/, 'the iOS branch must actually surface a state');
});

test('an install state is rendered, not just set', () => {
    assert.match(src, /state === 'install'/, "setState('install') with no matching render branch renders nothing");
    // The steps used to be inline here. They now live in the shared sheet, so
    // assert the DELEGATION -- otherwise this test passes on the header
    // comment alone, which is how a guard quietly stops guarding.
    assert.match(src, /<InstallAppSheet/, 'the install state must render the shared install sheet');
    assert.match(src, /from '\.\.\/pwa\/InstallAppSheet'/, 'InstallAppSheet must actually be imported');
});

test('the shared sheet carries the real iOS instructions', () => {
    const sheet = readFileSync(join(ROOT, 'src/components/pwa/InstallAppSheet.jsx'), 'utf8');
    assert.match(sheet, /Add To Home Screen/i, 'the sheet must name the actual iOS action');
    assert.match(sheet, /Share/, 'the sheet must tell the user where to start');
});

test('the sheet has a path for Android, not just iOS', () => {
    // Dan, mid-task: "THIS NEEDS TO WORK FOR ANDROID USERS AS WELL."
    const sheet = readFileSync(join(ROOT, 'src/components/pwa/InstallAppSheet.jsx'), 'utf8');
    assert.match(sheet, /canPromptInstall/, 'the sheet must detect a native install being available');
    assert.match(sheet, /triggerInstall/, 'the sheet must be able to fire the native Android/desktop install');
});

test('beforeinstallprompt is captured at module scope, not inside an effect', () => {
    // The original bug: the listener was attached inside the .then() of an
    // async fetch, so Chrome had already fired the one event it ever sends.
    // Module scope is the only place that cannot miss it.
    const raw = readFileSync(join(ROOT, 'src/lib/pwaInstall.js'), 'utf8');
    // Strip comments first. The original version of this test matched the
    // words '.then(' inside the comment that EXPLAINS the bug, so it failed
    // on a correct file -- a guard that reads prose instead of code.
    const lib = raw
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');

    const idx = lib.indexOf("addEventListener('beforeinstallprompt'");
    assert.ok(idx > -1, 'beforeinstallprompt is not captured anywhere');

    // The real property: the registration is not nested inside any function
    // body. Count unbalanced braces before it -- module scope means the only
    // open block is the `if (typeof window !== 'undefined')` guard, so depth
    // must be 1 or 0, never deeper.
    const before = lib.slice(0, idx);
    const depth = (before.match(/{/g) || []).length - (before.match(/}/g) || []).length;
    assert.ok(
        depth <= 1,
        `beforeinstallprompt is registered ${depth} blocks deep. It must be at module scope: inside an effect or a .then() it is attached after Chrome has already fired the one event it sends.`
    );
    assert.ok(
        !/useEffect/.test(lib),
        'pwaInstall.js must stay framework-free; a React effect cannot capture this event in time'
    );
});

test('deferring the install nudge does not burn the one-time permission prompt', () => {
    // markDone() sets the permanent "already asked" key. If the install nudge
    // used it, the real permission prompt would never run once the user did
    // install — the same one-way door that made a rotated subscription silent
    // forever.
    const dismiss = src.slice(src.indexOf('const handleDismiss'), src.indexOf('const handleDismiss') + 700);
    assert.match(dismiss, /state === 'install'/, 'handleDismiss must treat the install nudge differently');
    assert.match(dismiss, /IOS_KEY_PREFIX/, 'the install nudge needs its own cooldown key');

    // And that cooldown must be finite, not "never again".
    assert.match(src, /IOS_COOLDOWN_MS\s*=/, 'the install nudge must be re-showable');
});

test('the iOS helpers it depends on are imported', () => {
    const imports = src.slice(0, src.indexOf('const KEY_PREFIX'));
    for (const fn of ['isIos', 'isIosStandalonePwa', 'isWebPushSupported']) {
        assert.match(imports, new RegExp(`\\b${fn}\\b`), `${fn} is used but not imported`);
    }
});

test('push-client still exports the iOS helpers this depends on', () => {
    const client = readFileSync(join(ROOT, 'src/lib/push-client.js'), 'utf8');
    assert.match(client, /export function isIos\b/, 'isIos was removed from push-client');
    assert.match(client, /export function isIosStandalonePwa\b/, 'isIosStandalonePwa was removed from push-client');
});

// ═══════════════════════════════════════════════════════════════════════════
//  POST-SHIP AUDIT (2026-08-25) — three defects found by re-reading my own
//  merged diff rather than trusting it.
// ═══════════════════════════════════════════════════════════════════════════

test('the pre-rename installed flag is still honoured', () => {
    // I renamed the key from 'pwa_installed' to 'sp_pwa_installed'. Every user
    // who had ALREADY installed under the old build carried the old name, and
    // nothing read it any more -- so they were treated as never-installed and
    // re-offered an app they already had. A rename is a stale-localStorage bug
    // unless the old name is read on the way past.
    const lib = readFileSync(join(ROOT, 'src/lib/pwaInstall.js'), 'utf8');
    assert.match(lib, /pwa_installed'/, "the legacy key name must still be read");
    assert.match(lib, /LEGACY_INSTALLED_KEY/, 'the legacy key needs a named constant, not a magic string');

    const known = lib.slice(lib.indexOf('export function isKnownInstalled'), lib.indexOf('export function isIos'));
    assert.match(known, /LEGACY_INSTALLED_KEY/, 'isKnownInstalled must consult the legacy key');
    // The old build wrote the STRING 'true', not '1'. Comparing to '1' would
    // silently keep the bug, so the check must be truthy, not an equality.
    assert.ok(
        !/safeGet\(LEGACY_INSTALLED_KEY\)\s*===\s*'1'/.test(known),
        "legacy value was 'true', not '1' -- an === '1' comparison reintroduces the bug"
    );
});

test('the install reason is not iPhone-specific on Android', () => {
    // The reason line was hardcoded to "Required on iPhone for notifications"
    // and passed unconditionally, so Android users were told something untrue:
    // Android receives push from a plain browser tab.
    const src2 = readFileSync(join(ROOT, 'src/components/ui/PWAInstallPrompt.jsx'), 'utf8');
    const block = src2.slice(src2.indexOf('<InstallAppSheet'), src2.indexOf('<InstallAppSheet') + 700);
    assert.match(block, /reason=\{/, 'reason must be computed per-device, not a fixed string');
    assert.match(block, /isIos\(\)/, 'the reason must branch on the actual platform');
});

test('standalone_detected analytics survived the rewrite', () => {
    // The pre-rewrite component recorded this; my rewrite dropped it, which
    // would have silently killed the only signal for how many devices run
    // standalone. It must also be guarded, because evaluate() re-runs on
    // every install-state change.
    const src2 = readFileSync(join(ROOT, 'src/components/ui/PWAInstallPrompt.jsx'), 'utf8');
    assert.match(src2, /recordOnServer\('standalone_detected'\)/, 'standalone_detected must still be recorded');
    assert.match(src2, /alreadyCountedRef/, 'it must be guarded or it fires repeatedly per session');
});

test('confirmed receipts atomically retire only older unconfirmed duplicate signatures', () => {
    const migration = readFileSync(join(ROOT, 'supabase/migrations/20260831162000_confirmed_push_receipt_dedup.sql'), 'utf8');
    assert.match(migration, /confirm_push_subscription_receipt/);
    assert.match(migration, /older\.last_receipt_at IS NULL/);
    assert.match(migration, /older\.created_at < v_current\.created_at/);
    assert.match(migration, /older\.device_label IS NOT DISTINCT FROM v_current\.device_label/);
    assert.match(migration, /older\.user_agent IS NOT DISTINCT FROM v_current\.user_agent/);

    const receipt = readFileSync(join(ROOT, 'pages/api/push/receipt.js'), 'utf8');
    assert.match(receipt, /\.rpc\('confirm_push_subscription_receipt', \{ p_endpoint: endpoint \}\)/);
    assert.doesNotMatch(receipt, /\.update\(\{ last_receipt_at:/);
});

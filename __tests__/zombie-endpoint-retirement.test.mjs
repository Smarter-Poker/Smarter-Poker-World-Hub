/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  A DEAD PUSH ENDPOINT IS RETIRED ON EVIDENCE, NEVER ON A GUESS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Dan 2026-08-30. `push-health` has always DETECTED endpoints that were pushed
 * to and never confirmed a receipt, and has always only ALERTED. So a dead
 * endpoint stayed `is_active` forever and every send paid for it. Measured
 * 2026-08-29: one account held eleven active subscriptions, nine of them
 * redundant, and a single seat offer was delivered to the same iPhone twice.
 *
 * WHY IT ONLY ALERTED, AND WHY THAT WAS RIGHT. "No receipt" alone is not
 * evidence of death. A receipt can be missing because the device is gone,
 * because the beacon is blocked, or because the phone has not been unlocked.
 * Retiring on that would silence a working device, and its owner would have no
 * way to find out why — strictly worse than the duplicate banner it fixes.
 *
 * THE SECOND SIGNAL that makes it safe: if the SAME USER has another active
 * endpoint that IS confirming inside the same window, delivery to that person
 * demonstrably works, so a silent endpoint beside a talking one is dead rather
 * than merely quiet.
 *
 * These assertions pin the three conservative conditions. Losing any one of
 * them turns a safe cleanup back into a guess that can mute somebody's phone.
 *
 * Run: node --test __tests__/zombie-endpoint-retirement.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(join(ROOT, 'pages/api/cron/push-health.js'), 'utf8');

/** The retirement block, bounded by its own braces rather than a byte count. */
function retireBlock(src) {
    const at = src.indexOf('const retirable = zombies.filter(');
    assert.ok(at > -1, 'the retirement block is gone');
    const end = src.indexOf('// ---- CHECK', at);
    return src.slice(at, end > -1 ? end : src.length);
}

test('a user with no confirming endpoint is never touched', () => {
    // This is the assertion that guarantees nobody is left unreachable by this
    // code. Without it, a user whose ONLY device is quiet loses that device.
    const src = SRC;
    assert.match(src, /const confirmingByUser = new Set\(/);
    assert.match(src, /last_receipt_at\) >= zombieCutoffMs/);
    assert.match(retireBlock(src), /confirmingByUser\.has\(z\.user_id\)/);
});

test('the newest endpoint per user is never retired', () => {
    // A device enrolled moments ago has not had time to confirm anything, so
    // it looks exactly like a zombie and is not one.
    const src = SRC;
    assert.match(src, /const newestByUser = new Map\(\)/);
    assert.match(retireBlock(src), /newestByUser\.get\(z\.user_id\)\?\.id !== z\.id/);
});

test('the update is scoped to rows still active', () => {
    // So a row another process already retired is not counted a second time.
    assert.match(retireBlock(SRC), /\.eq\('is_active', true\)/);
    assert.match(retireBlock(SRC), /is_active: false/);
    assert.match(retireBlock(SRC), /no_receipt_while_sibling_confirmed/);
});

test('a cleanup failure can never take down the health check', () => {
    // The alert is the part that must survive. And the catch must not invent a
    // `report.errors` array this report does not have — that would turn a
    // cleanup failure into a TypeError inside the handler it is attached to.
    const block = retireBlock(SRC);
    assert.match(block, /catch \(e\)/);
    assert.match(block, /report\.zombieRetireError/);
    assert.ok(
        !/report\.errors\.push/.test(SRC),
        'push-health has no report.errors array; referencing one throws'
    );
});

test('the alert still fires — retirement did not replace it', () => {
    // Retiring a dead endpoint and TELLING the person their device went quiet
    // are different jobs. Losing the second one would make this a silent
    // downgrade of the very signal the check exists to raise.
    assert.match(SRC, /Notifications May Not Be Reaching This Device/);
    assert.match(SRC, /report\.zombies = zombies\.length/);
});

test('the retirement count is reported, so a runaway sweep is visible', () => {
    assert.match(SRC, /report\.zombiesRetired = 0/);
    assert.match(retireBlock(SRC), /report\.zombiesRetired = retirable\.length/);
});

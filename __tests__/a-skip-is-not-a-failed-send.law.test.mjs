/**
 * LAW: A SKIP IS NOT A FAILED SEND, AND AN AUDIENCE CAN VANISH QUIETLY
 *
 * 2026-09-12. Two halves of one blind spot.
 *
 * FIRST HALF. `push-dispatch` marks a row `skipped` / `no_subscription` when
 * the recipient has no active subscription. That is the only correct thing to
 * do with a notification addressed to somebody with no device, and the
 * dispatcher was never wrong. But every rate on the push dashboard was
 * computed over the RAW QUEUE, so an unreachable recipient counted exactly
 * like a failed delivery. Measured on production that day: the tournament
 * reminder enqueue had written 15,900 rows in seven days - 94.9% of ALL
 * push_outbox volume - to 935 recipients, none of whom had ever held a push
 * subscription. Send rate read 0%. Every send to a real device had succeeded.
 *
 * SECOND HALF, and the one nobody would have noticed. Underneath those 15,900
 * skips, the real audience was disappearing: 4 active subscriptions across 2
 * users, 54 of 58 rows ever written already retired, and daily sends decaying
 * 248 -> 4 in eleven days. No check in push-health could see it. Every check
 * there asks about an individual (a zombie endpoint, an admin with no device)
 * or about an absolute (has it reached zero yet) - and on the day it reaches
 * zero the alarm that fires is too late to be a warning.
 *
 * PINS
 *   1. `no_subscription` is classified as an unreachable recipient, never a
 *      fault.
 *   2. Both the dashboard and the cron compute their send rate over what was
 *      ADDRESSABLE - the queue minus the unreachable - and never over the raw
 *      queue.
 *   3. push-health carries an audience detector with both halves: devices
 *      trending to zero, and sends collapsing.
 *   4. ITS THRESHOLDS STILL CATCH THE INCIDENT THAT PRODUCED THEM. The test
 *      evaluates the shipped constants against the measured numbers, so
 *      loosening one until the alarm stops firing fails here.
 *   5. The dispatcher's skip is left alone. It was right; the defect was the
 *      enqueue upstream of it (Club Arena,
 *      tests/a-reminder-needs-a-device.law.test.ts).
 *
 * Registry: this repo has no docs/LAWS.md (see horses-phase4 law header).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

const CRON = 'pages/api/cron/push-health.js';
const DASHBOARD_API = 'pages/api/admin/push-health-data.js';
const DASHBOARD_PAGE = 'pages/admin/push-health.js';
const DISPATCH = 'pages/api/cron/push-dispatch.js';

/** What push-health measured on 2026-09-12. The alarms exist because of these. */
const MEASURED = {
    activeNow: 4,
    activeWeekAgo: 6,
    sentLast7d: 94,
    sentPrior7d: 458,
};

/** Read a bare numeric constant out of the shipped source. */
function constant(source, name) {
    const m = new RegExp(`const ${name} = ([^;]+);`).exec(source);
    assert.ok(m, `${name} is not declared in ${CRON}`);
    // Only arithmetic on literals is allowed here, which is what the file has.
    assert.match(m[1], /^[-+*/(). \d]+$/, `${name} must be a plain derived number, not an expression with inputs`);
    return Number(eval(m[1])); // eslint-disable-line no-eval
}

test('a no_subscription skip is an unreachable recipient, never a fault', () => {
    const api = read(DASHBOARD_API);
    const m = /case 'no_subscription':\s*\n\s*return '([a-z_]+)';/.exec(api);
    assert.ok(m, 'push-health-data no longer classifies no_subscription at all');
    assert.notEqual(m[1], 'fault', 'no_subscription is being reported as our fault');
    assert.equal(m[1], 'not_enrolled');
    assert.match(read(DASHBOARD_PAGE), /not_enrolled:/, 'the page no longer renders the not_enrolled class');
});

test('the dashboard send rate is computed over addressable rows, not the raw queue', () => {
    const api = read(DASHBOARD_API);
    assert.match(
        api,
        /deliveryRate: addressable24 \? Math\.round\(\(\(sent24 \|\| 0\) \/ addressable24\) \* 100\) : null/,
        'the funnel send rate is not computed over addressable rows'
    );
    assert.ok(
        !/deliveryRate: queued24 \?/.test(api),
        'the funnel send rate is back on the raw queue, so an unreachable recipient counts as a failed send'
    );
    assert.match(api, /unreachable: unreachable24/, 'the funnel does not report how many rows were unreachable');
    assert.match(api, /addressable: addressable24/, 'the funnel does not report how many rows were addressable');
    assert.match(read(DASHBOARD_PAGE), /Send rate \(of addressable\)/, 'the page does not say which denominator it used');
});

test('the cron reports the same distinction', () => {
    const cron = read(CRON);
    assert.match(cron, /report\.unreachableRecipients24h = /, 'push-health does not name the unreachable');
    assert.match(cron, /report\.addressable24h = Math\.max\(0, \(queued24h \|\| 0\) - \(skipped24h \|\| 0\)\)/);
    assert.match(
        cron,
        /report\.deliveryRate24h = report\.addressable24h\s*\n\s*\? Math\.round\(\(\(sent24h \|\| 0\) \/ report\.addressable24h\) \* 100\)\s*\n\s*: null/,
        'the cron delivery rate is not computed over addressable rows'
    );
});

test('push-health has an audience detector, with both halves', () => {
    const cron = read(CRON);
    assert.match(cron, /CHECK 5: is the audience disappearing\?/, 'the audience check is gone');
    assert.match(cron, /push audience is shrinking toward zero/, 'nothing alarms on devices trending to zero');
    assert.match(cron, /push delivery is collapsing/, 'nothing alarms on sends collapsing');
    assert.match(cron, /report\.audience = \{/, 'the audience numbers are not reported');
    // A watchdog that dies quietly is the failure this whole file is about.
    assert.match(cron, /problems\.push\(`audience check failed/, 'the audience check can fail silently');
});

test('the thresholds still catch the collapse that produced them', () => {
    const cron = read(CRON);
    const ratio = constant(cron, 'SEND_COLLAPSE_RATIO');
    const floor = constant(cron, 'SEND_COLLAPSE_FLOOR');
    const ceiling = constant(cron, 'AUDIENCE_SHRINK_CEILING');
    const shrink = constant(cron, 'AUDIENCE_SHRINK_RATIO');

    // Sends: 94 in the last week against 458 the week before.
    assert.ok(
        MEASURED.sentPrior7d >= floor && MEASURED.sentLast7d < MEASURED.sentPrior7d * ratio,
        `SEND_COLLAPSE_RATIO=${ratio} / FLOOR=${floor} would NOT have fired on the ` +
            `measured collapse (${MEASURED.sentLast7d} against ${MEASURED.sentPrior7d}). ` +
            `An alarm loosened until it stops firing is not an alarm.`
    );
    // Devices: 6 a week ago, 4 now.
    assert.ok(
        MEASURED.activeNow <= ceiling && MEASURED.activeNow <= MEASURED.activeWeekAgo * shrink,
        `AUDIENCE_SHRINK_CEILING=${ceiling} / RATIO=${shrink} would NOT have fired on the ` +
            `measured loss (${MEASURED.activeWeekAgo} -> ${MEASURED.activeNow}).`
    );
    // And not so wide that ordinary churn pages every day: one device lost out
    // of six is normal week-to-week movement here, not a collapse.
    assert.ok(
        !(5 <= MEASURED.activeWeekAgo * shrink),
        `AUDIENCE_SHRINK_RATIO=${shrink} fires on a 6 -> 5 wobble, which is ordinary churn.`
    );
});

test('the measurement is written beside the thresholds (CLAUDE.md 10.84)', () => {
    const cron = read(CRON);
    const head = cron.slice(0, cron.indexOf('const SEND_COLLAPSE_RATIO'));
    for (const n of ['458', '94', '248', '58', '54']) {
        assert.ok(head.includes(n), `the derivation above the constants no longer cites ${n}`);
    }
});

test('the dispatcher is left alone: a recipient with no device is still skipped', () => {
    // The dispatcher was never the defect. It is pinned here so the next reader
    // of a 100% skip rate fixes the enqueue rather than this.
    const dispatch = read(DISPATCH);
    assert.match(
        dispatch,
        /status: 'skipped', failure_reason: 'no_subscription'/,
        'push-dispatch no longer records why an undeliverable row was skipped'
    );
    const deliver = read('src/lib/push/push-deliver.js');
    assert.match(deliver, /error: 'no_subscription'/, 'the inline delivery path no longer reports no_subscription');
});

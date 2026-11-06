import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { persistReadWithRetry, isRetryableReadFailure, READ_RETRY_DELAYS_MS } from '../src/lib/messengerReadRetry.mjs';

const fail = status => Object.assign(new Error('x'), { status });
const instant = async () => {};

test('only transient failures are retryable', () => {
    for (const status of [undefined, 0, 408, 429, 500, 502, 503, 504]) assert.equal(isRetryableReadFailure(fail(status)), true, String(status));
    for (const status of [200, 400, 401, 403, 404, 409]) assert.equal(isRetryableReadFailure(fail(status)), false, String(status));
});

test('retries up to the budget with the published delays, then reports the last error', async () => {
    const waits = []; let calls = 0;
    const result = await persistReadWithRetry(async () => { calls++; throw fail(503); }, { wait: async ms => { waits.push(ms); } });
    assert.equal(result.ok, false); assert.equal(result.abandoned, false); assert.equal(result.error.status, 503);
    assert.equal(calls, READ_RETRY_DELAYS_MS.length + 1);
    assert.deepEqual(waits, [...READ_RETRY_DELAYS_MS]);
});

test('a refusal is not retried and a success returns its value', async () => {
    let calls = 0;
    const refused = await persistReadWithRetry(async () => { calls++; throw fail(403); }, { wait: instant });
    assert.equal(refused.ok, false); assert.equal(calls, 1);
    let n = 0;
    const ok = await persistReadWithRetry(async () => { if (n++ === 0) throw fail(502); return 'saved'; }, { wait: instant });
    assert.deepEqual([ok.ok, ok.value, ok.attempts], [true, 'saved', 2]);
});

test('a receipt nobody wants any more is abandoned instead of replayed', async () => {
    let calls = 0, wanted = true;
    const result = await persistReadWithRetry(async () => { calls++; wanted = false; throw fail(503); }, { wait: instant, stillWanted: () => wanted });
    assert.equal(result.abandoned, true); assert.equal(calls, 1);
});

test('the final message says connection only when there was no HTTP answer', async () => {
    const { readFailureMessage } = await import('../src/lib/messengerReadRetry.mjs');
    for (const status of [undefined, 0, 408]) assert.match(readFailureMessage(fail(status)), /Check Your Connection/, String(status));
    for (const status of [400, 401, 403, 404, 429, 500, 503, 200]) assert.doesNotMatch(readFailureMessage(fail(status)), /Connection/, String(status));
    assert.match(readFailureMessage(fail(503)), /Server Is Not Responding/);
    assert.match(readFailureMessage(fail(401)), /Session Has Expired/);
    assert.match(readFailureMessage(fail(403)), /No Longer Have Access/);
    assert.match(readFailureMessage(fail(404)), /No Longer Available/);
    for (const status of [undefined, 401, 403, 404, 429, 503, 400]) assert.doesNotMatch(readFailureMessage(fail(status)), /—|Reopen/);
});

test('the chat dock keeps its failed-save state and shows the classified message', () => {
    const source = readFileSync(new URL('../src/components/messenger/dock/MessengerChat.jsx', import.meta.url), 'utf8');
    const start = source.indexOf('const markVisible = useCallback');
    const body = source.slice(start, source.indexOf('}, [engaged, actorId, id, services]);', start));
    const failed = body.indexOf('if (!saved.ok)');
    assert.ok(failed > 0);
    assert.match(body.slice(failed, body.indexOf('const result = saved.value')), /if \(!saved\.abandoned && current\(\)\) setError\(readFailureMessage\(saved\.error\)\);\s*return;/);
    // Nothing that records a read happens before the success check.
    for (const write of ['readThrough.current = boundary.last', "broadcastSync('smarter_poker_unread_sync'", "event: 'read_receipt'", 'onRead()']) {
        assert.ok(body.indexOf(write) > failed, write);
    }
});

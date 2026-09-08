import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fetchJsonWithDeadline } from '../src/lib/server/fetchJsonWithDeadline.js';

const pageUrl = new URL('../pages/hub/events-calendar.js', import.meta.url);

const expectDeadline = async (fetchImpl) => {
  let capturedSignal;
  const startedAt = Date.now();

  await assert.rejects(
    fetchJsonWithDeadline('https://example.test/calendar', {
      fetchImpl: (url, options) => {
        capturedSignal = options.signal;
        return fetchImpl(url, options);
      },
      timeoutMs: 25,
    }),
    { name: 'TimeoutError' }
  );

  assert.equal(capturedSignal.aborted, true);

  // 250ms -> 2s (2026-09-08). The two callers of this helper pass a transport
  // that NEVER SETTLES - `new Promise(() => {})`. So what is being proved here
  // is bounded versus unbounded: without the deadline this hangs until the
  // test runner gives up. It is not a benchmark of the timer's accuracy.
  //
  // 250ms against a 25ms timeout is 225ms of scheduling headroom, and that is
  // not enough on a runner carrying twelve concurrent jobs - the event loop
  // stalls, the timer fires late, and the assertion fails for a reason that
  // has nothing to do with the code under test. Measured 2026-09-08: this was
  // the only failure in a 1,519-test Pre-Deploy Safety Checks run, on three
  // separate branches whose diffs touched nothing near it, blocking merges.
  //
  // Two seconds still proves the deadline fired - the alternative is infinity -
  // and it is 40x below the 5s timeout the page itself uses in production, so
  // a genuinely broken deadline still fails this.
  const elapsed = Date.now() - startedAt;
  assert.ok(
    elapsed < 2_000,
    `deadline did not terminate: ${elapsed}ms. This transport never settles, so ` +
      `the helper must have aborted it on the timer or it would run forever.`
  );
};

test('deadline terminates a transport that ignores its abort signal', async () => {
  await expectDeadline(() => new Promise(() => {}));
});

test('deadline also terminates a stalled JSON response body', async () => {
  await expectDeadline(async () => ({
    ok: true,
    json: () => new Promise(() => {}),
  }));
});

test('successful JSON completes before the deadline', async () => {
  const payload = { success: true, events: [{ id: 'event-1' }] };
  const result = await fetchJsonWithDeadline('https://example.test/calendar', {
    fetchImpl: async () => ({ ok: true, json: async () => payload }),
    timeoutMs: 100,
  });

  assert.deepEqual(result, payload);
});

test('non-success responses return null without reading a body', async () => {
  let bodyRead = false;
  const result = await fetchJsonWithDeadline('https://example.test/calendar', {
    fetchImpl: async () => ({
      ok: false,
      json: async () => {
        bodyRead = true;
      },
    }),
    timeoutMs: 100,
  });

  assert.equal(result, null);
  assert.equal(bodyRead, false);
});

test('events calendar SSR uses the bounded helper and preserves its empty fallback', async () => {
  const source = await readFile(pageUrl, 'utf8');

  assert.match(source, /fetchJsonWithDeadline\(url, \{ timeoutMs: 5_000 \}\)/);
  assert.match(source, /catch \(err\) \{\s*return \{ props: \{ fallbackData: null \} \};\s*\}/);
});

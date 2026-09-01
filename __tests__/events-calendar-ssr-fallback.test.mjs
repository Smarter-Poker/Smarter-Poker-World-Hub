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
  assert.ok(Date.now() - startedAt < 250, 'deadline did not terminate promptly');
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

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
let source = await readFile(new URL('../src/lib/reelsPrefetcher.js', import.meta.url), 'utf8');
const contractSource = await readFile(new URL('../src/lib/reelsDeliveryContract.mjs', import.meta.url), 'utf8');
source = source.replace('./reelsDeliveryContract.mjs', `data:text/javascript;base64,${Buffer.from(contractSource).toString('base64')}`);
const author = '11111111-1111-4111-8111-111111111111';
const media = n => `https://test-project.supabase.co/storage/v1/object/public/social-media/videos/${author}/${n}.mp4`;
const settle = async () => { for (let n = 0; n < 4; n++) await new Promise(resolve => setImmediate(resolve)); };
async function scenario(run) {
    const oldFetch = globalThis.fetch;
    const oldOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test-project.supabase.co';
    const module = await import(`data:text/javascript;base64,${Buffer.from(source + `\n//${Math.random()}`).toString('base64')}`);
    try { await run(module); } finally {
        globalThis.fetch = oldFetch;
        if (oldOrigin === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
        else process.env.NEXT_PUBLIC_SUPABASE_URL = oldOrigin;
    }
}
const rangeResponse = () => new Response(new Uint8Array(4), { status: 206, headers: { 'content-range': 'bytes 0-3/40' } });

test('trusted native origin only, exact range and explicit cleanup', () => scenario(async ({ prefetchVideoStart }) => {
    const calls = [];
    globalThis.fetch = (url, options) => { calls.push({ url, options }); return new Promise(() => {}); };
    for (const invalid of [media(1).replace('test-project.supabase.co', 'test-project.supabase.co.evil.test'), media(1).replace('https:', 'http:'), media(1) + '?token=x', media(1).replace('/public/', '/sign/'), media(1).replace(author, 'someone'), media(1).replace('/1.mp4', '/nested/1.mp4'), 'https://youtube.com/watch?v=123']) {
        assert.equal(typeof prefetchVideoStart(invalid), 'function');
    }
    const stop = prefetchVideoStart(media(1));
    prefetchVideoStart(media(1))(); // A duplicate caller cannot cancel the owner.
    await settle();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].options.headers.Range, 'bytes=0-1499999');
    assert.equal(calls[0].options.credentials, 'omit');
    assert.equal(calls[0].options.priority, 'low');
    assert.equal(calls[0].options.mode, 'cors');
    assert.equal(calls[0].options.signal.aborted, false);
    stop();
    assert.equal(calls[0].options.signal.aborted, true);
    prefetchVideoStart(media(1));
    await settle();
    assert.equal(calls.length, 2);
}));

test('only two adjacent requests can remain in flight', () => scenario(async ({ prefetchVideoStart }) => {
    const calls = [];
    globalThis.fetch = (url) => { calls.push(url); return new Promise(() => {}); };
    const stop = prefetchVideoStart(media(1));
    prefetchVideoStart(media(2));
    prefetchVideoStart(media(3));
    await settle();
    assert.equal(calls.length, 2);
    stop();
    prefetchVideoStart(media(3));
    await settle();
    assert.equal(calls.length, 3);
}));

test('failed or ignored range is never remembered or retried automatically', () => scenario(async ({ prefetchVideoStart }) => {
    let calls = 0;
    globalThis.fetch = async () => { calls++; throw new Error('offline'); };
    prefetchVideoStart(media(1));
    await settle();
    assert.equal(calls, 1);
    prefetchVideoStart(media(1));
    await settle();
    assert.equal(calls, 2);
    let cancelled = 0;
    globalThis.fetch = async () => ({ status: 200, type: 'basic', headers: new Headers(), body: { cancel: async () => { cancelled++; } } });
    prefetchVideoStart(media(2));
    await settle();
    prefetchVideoStart(media(2));
    await settle();
    assert.equal(cancelled, 2);
}));

test('confirmed warm URLs are deduplicated within a bounded 32-entry window', () => scenario(async ({ prefetchVideoStart }) => {
    const calls = [];
    globalThis.fetch = async url => { calls.push(url); return rangeResponse(); };
    for (let n = 0; n < 33; n++) { prefetchVideoStart(media(n)); await settle(); }
    prefetchVideoStart(media(32));
    await settle();
    assert.equal(calls.length, 33);
    prefetchVideoStart(media(0));
    await settle();
    assert.equal(calls.length, 34);
}));


test('opaque, oversized and cancelled-before-start responses do not warm media', () => scenario(async ({ prefetchVideoStart }) => {
    let calls = 0;
    let cancelled = 0;
    globalThis.fetch = async () => { calls++; return { status: 0, type: 'opaque', headers: new Headers(), body: { cancel: async () => { cancelled++; } } }; };
    const stop = prefetchVideoStart(media(1));
    stop();
    await settle();
    assert.equal(calls, 0);
    prefetchVideoStart(media(1));
    await settle();
    prefetchVideoStart(media(1));
    await settle();
    assert.equal(cancelled, 2);
    globalThis.fetch = async () => ({ status: 206, type: 'basic', headers: new Headers({ 'content-range': 'bytes 0-3/40' }), body: { getReader: () => ({ read: async () => ({ done: false, value: new Uint8Array(1_500_001) }), cancel: async () => { cancelled++; } }) } });
    prefetchVideoStart(media(2));
    await settle();
    prefetchVideoStart(media(2));
    await settle();
    assert.equal(cancelled, 4);
}));


test('adaptive prefetch honors Saver, observed budget and constrained network', () => scenario(async ({ prefetchVideoStart }) => {
    const calls = [];
    globalThis.fetch = async (url, options) => { calls.push(options); return rangeResponse(); };
    prefetchVideoStart(media(1), { dataSaver: true });
    prefetchVideoStart(media(2), { observedBytes: 6_000_000 });
    await settle();
    assert.equal(calls.length, 0);
    prefetchVideoStart(media(3), { connection: { effectiveType: '3g' } });
    await settle();
    assert.equal(calls[0].headers.Range, 'bytes=0-299999');
}));

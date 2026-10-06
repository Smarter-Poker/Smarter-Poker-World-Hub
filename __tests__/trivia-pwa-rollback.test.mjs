import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

import { triviaArtCacheName } from '../scripts/trivia-art/art-cache-name.mjs';

const ROOT = process.cwd();
const WORKER_SOURCE = readFileSync(join(ROOT, 'worker/index.js'), 'utf8');
const NEXT_CONFIG = readFileSync(join(ROOT, 'next.config.js'), 'utf8');

function createCache(requests = []) {
    const urls = new Set(requests);
    return {
        async keys() {
            return [...urls].map((url) => ({ url }));
        },
        async delete(request) {
            return urls.delete(typeof request === 'string' ? request : request.url);
        },
        has(url) {
            return urls.has(url);
        },
    };
}

function loadWorker(cacheMap, { refuseCacheDeletes = [] } = {}) {
    const listeners = new Map();
    let claimed = 0;
    const lifecycle = [];
    const refused = new Set(refuseCacheDeletes);
    const caches = {
        async keys() { return [...cacheMap.keys()]; },
        async delete(name) {
            lifecycle.push(`cache-delete:${name}`);
            if (refused.has(name)) return false;
            return cacheMap.delete(name);
        },
        async open(name) {
            if (!cacheMap.has(name)) cacheMap.set(name, createCache());
            return cacheMap.get(name);
        },
    };
    const self = {
        caches,
        clients: {
            async claim() {
                lifecycle.push('clients-claim');
                claimed += 1;
            },
            async matchAll() { return []; },
        },
        registration: { showNotification: async () => {} },
        navigator: {},
        skipWaiting() {},
        addEventListener(type, handler) { listeners.set(type, handler); },
    };
    vm.runInNewContext(WORKER_SOURCE, { self, caches, URL, console }, { filename: 'worker/index.js' });
    return { listeners, claimed: () => claimed, lifecycle };
}

test('the installed worker treats its compiled Trivia manifest as authority in either rollout direction', async () => {
    const current = triviaArtCacheName(ROOT);
    const workerCache = WORKER_SOURCE.match(/const TRIVIA_ART_CACHE = '(trivia-art-[0-9a-f]+)'/)?.[1];
    const runtimeCache = NEXT_CONFIG.match(/cacheName: '(trivia-art-[0-9a-f]+)'/)?.[1];
    assert.equal(workerCache, current, 'the worker must migrate to the exact shipped art digest');
    assert.equal(runtimeCache, current, 'runtime writes and activation cleanup must name one cache');
    const workboxOptionsAt = NEXT_CONFIG.indexOf('workboxOptions: {');
    const workboxClaimAt = NEXT_CONFIG.indexOf('clientsClaim: false', workboxOptionsAt);
    const runtimeCachingAt = NEXT_CONFIG.indexOf('runtimeCaching: [', workboxOptionsAt);
    assert.ok(
        workboxOptionsAt >= 0 && workboxClaimAt > workboxOptionsAt && workboxClaimAt < runtimeCachingAt,
        'the generated Workbox worker must not claim clients in parallel with custom activation cleanup'
    );

    const currentCache = createCache(['https://smarter.poker/images/trivia/current.webp']);
    const priorCache = createCache(['https://smarter.poker/images/trivia/rejected-prior.webp']);
    const forwardCache = createCache(['https://smarter.poker/images/trivia/rejected-forward.webp']);
    const sharedCache = createCache([
        'https://smarter.poker/images/trivia/rejected-shared.webp',
        'https://smarter.poker/images/world/keep.webp',
    ]);
    const cacheMap = new Map([
        [current, currentCache],
        ['trivia-art-prior-rejected', priorCache],
        ['trivia-art-forward-candidate', forwardCache],
        ['static-assets', sharedCache],
        ['unrelated-cache', createCache(['https://smarter.poker/keep'])],
    ]);
    const worker = loadWorker(cacheMap);
    const activate = worker.listeners.get('activate');
    assert.equal(typeof activate, 'function', 'the root worker must own an activation migration');

    let completion;
    activate({ waitUntil(promise) { completion = Promise.resolve(promise); } });
    assert.ok(completion, 'activation must extend its lifetime through cache migration');
    await completion;

    assert.equal(worker.claimed(), 1, 'the installed worker must claim its open clients');
    const claimAt = worker.lifecycle.indexOf('clients-claim');
    assert.ok(claimAt > worker.lifecycle.indexOf('cache-delete:trivia-art-prior-rejected'));
    assert.ok(claimAt > worker.lifecycle.indexOf('cache-delete:trivia-art-forward-candidate'));
    assert.deepEqual([...cacheMap.keys()].sort(), [current, 'static-assets', 'unrelated-cache'].sort());
    assert.equal(currentCache.has('https://smarter.poker/images/trivia/current.webp'), true);
    assert.equal(sharedCache.has('https://smarter.poker/images/trivia/rejected-shared.webp'), false);
    assert.equal(sharedCache.has('https://smarter.poker/images/world/keep.webp'), true);
});

test('activation fails closed before claiming clients when rejected Trivia art cannot retire', async () => {
    const current = triviaArtCacheName(ROOT);
    const cacheMap = new Map([
        [current, createCache(['https://smarter.poker/images/trivia/current.webp'])],
        ['trivia-art-prior-rejected', createCache(['https://smarter.poker/images/trivia/rejected.webp'])],
    ]);
    const worker = loadWorker(cacheMap, { refuseCacheDeletes: ['trivia-art-prior-rejected'] });
    const activate = worker.listeners.get('activate');

    let completion;
    activate({ waitUntil(promise) { completion = Promise.resolve(promise); } });
    await assert.rejects(completion, /Trivia art cache migration postcondition failed/);

    assert.equal(worker.claimed(), 0, 'a mixed cache release must never take control of an open page');
    assert.equal(cacheMap.has('trivia-art-prior-rejected'), true);
});

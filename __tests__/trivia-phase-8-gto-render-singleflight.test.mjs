import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { renderGtoPanelSingleflight } from '../src/lib/trivia/gtoRenderSingleflight.mjs';

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

const identity = {
    cacheDigest: 'a'.repeat(64),
    ownerToken: '11111111-1111-4111-8111-111111111111',
    leaseSeconds: 180,
};

test('two simultaneous cache misses purchase exactly one render', async () => {
    const generation = deferred();
    const generationStarted = deferred();
    let claimHeld = false;
    let cachedUrl = null;
    let generateCalls = 0;
    let releaseCalls = 0;

    const dependencies = {
        ...identity,
        readCachedImage: async () => cachedUrl,
        claimRender: async () => {
            if (claimHeld) return { acquired: false, retryAfterMs: 12_345 };
            claimHeld = true;
            return { acquired: true };
        },
        generateImage: async () => {
            generateCalls += 1;
            generationStarted.resolve();
            return generation.promise;
        },
        uploadImage: async image => {
            assert.equal(image, 'generated-image');
            cachedUrl = 'https://cdn.example/render.png';
            return cachedUrl;
        },
        releaseRender: async () => {
            releaseCalls += 1;
            claimHeld = false;
        },
    };

    const ownerRequest = renderGtoPanelSingleflight(dependencies);
    await generationStarted.promise;

    const concurrentRequest = await renderGtoPanelSingleflight({
        ...dependencies,
        ownerToken: '22222222-2222-4222-8222-222222222222',
    });
    assert.deepEqual(concurrentRequest, { state: 'pending', retryAfterMs: 12_345 });
    assert.equal(generateCalls, 1);

    generation.resolve('generated-image');
    assert.deepEqual(await ownerRequest, {
        state: 'ready',
        imageUrl: 'https://cdn.example/render.png',
        fromCache: false,
    });
    assert.equal(generateCalls, 1);
    assert.equal(releaseCalls, 1);
});

test('the claim owner re-reads cache before the paid provider call', async () => {
    let cacheReads = 0;
    let generated = false;
    let released = false;
    const result = await renderGtoPanelSingleflight({
        ...identity,
        readCachedImage: async () => {
            cacheReads += 1;
            return cacheReads === 2 ? 'https://cdn.example/race-winner.png' : null;
        },
        claimRender: async () => ({ acquired: true }),
        generateImage: async () => {
            generated = true;
            return 'must-not-run';
        },
        uploadImage: async () => 'must-not-run',
        releaseRender: async () => { released = true; },
    });

    assert.deepEqual(result, {
        state: 'ready',
        imageUrl: 'https://cdn.example/race-winner.png',
        fromCache: true,
    });
    assert.equal(cacheReads, 2);
    assert.equal(generated, false);
    assert.equal(released, true);
});

test('release failure never masks the owned generation error', async () => {
    const generationError = new Error('provider refused request');
    const releaseError = new Error('release transport failed');
    let observedRelease = null;

    await assert.rejects(
        renderGtoPanelSingleflight({
            ...identity,
            readCachedImage: async () => null,
            claimRender: async () => ({ acquired: true }),
            generateImage: async () => { throw generationError; },
            uploadImage: async () => 'must-not-run',
            releaseRender: async () => { throw releaseError; },
            onReleaseError: (error, context) => { observedRelease = { error, context }; },
        }),
        error => error === generationError,
    );
    assert.equal(observedRelease.error, releaseError);
    assert.equal(observedRelease.context.primaryError, generationError);
});

test('the API route uses the full digest claim and a lease longer than its runtime', () => {
    const route = readFileSync(new URL('../pages/api/trivia/render-gto-panel.js', import.meta.url), 'utf8');
    assert.match(route, /export const config = \{ maxDuration: 120 \}/);
    assert.match(route, /const RENDER_CLAIM_LEASE_SECONDS = 180/);
    assert.match(route, /const cacheDigest = hash\.digest\('hex'\)/);
    assert.match(route, /crypto\.randomUUID\(\)/);
    assert.match(route, /rpc\('trivia_claim_gto_render_v1'/);
    assert.match(route, /rpc\('trivia_release_gto_render_v1'/);
    assert.match(route, /error: 'render_in_progress'/);
    assert.match(route, /signal: AbortSignal\.timeout\(90_000\)/);
});

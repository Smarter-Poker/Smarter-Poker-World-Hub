// LAW: a refused or unavailable WebSocket constructor never crashes any page.
//
// Production incident (2026-11-26 / 2026-11-27, DailyDigest.client_crash alert 449588):
// Over 114 crashes landed in client_crash_log across /hub/venues/[id],
// /hub/commander/leagues, /hub/reels, and /hub/promotions with:
//   Error: WebSocket not available: Failed to construct 'WebSocket':
//   Failed to create a WebSocket: the provided URL is invalid.
//
// Root cause: @supabase/realtime-js synchronously calls `new WebSocket(url)` inside
// `channel.subscribe()` -> `realtime.connect()` -> `socketAdapter.connect()`.
// When a restricted browser refuses WebSocket construction, the synchronous throw
// escaped React `useEffect`, hit the root ErrorBoundary, and tore down the page.
//
// Fix: harden every browser Supabase client at the authoritative client/transport
// boundary (src/lib/realtimeTransportGuard.js) via both resilient transport and
// realtime.connect / channel.subscribe / removeChannel guards.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import {
    RefusedWebSocket,
    createResilientWebSocketTransport,
    hardenSupabaseRealtime,
    createHardenedSupabaseClient,
} from '../src/lib/realtimeTransportGuard.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const PROD_ERROR =
    "Failed to construct 'WebSocket': Failed to create a WebSocket: the provided URL is invalid.";

function flushMicrotasks() {
    return new Promise((resolve) => setTimeout(resolve, 25));
}

function makeThrowingWebSocket(message = PROD_ERROR) {
    return class ThrowingWebSocket {
        constructor() {
            throw new DOMException(message, 'SyntaxError');
        }
    };
}

test('baseline reproduction: unhardened @supabase/supabase-js throws synchronously on refused WebSocket', async () => {
    const ThrowingWS = makeThrowingWebSocket();
    const raw = createClient('https://kuklfnapbkmacvwxktbh.supabase.co', 'sb_publishable_test_key', {
        auth: { persistSession: false, autoRefreshToken: false },
        realtime: { transport: ThrowingWS },
    });

    try {
        assert.throws(
            () => {
                raw.channel('venue-1919-repro')
                    .on('postgres_changes', { event: '*', schema: 'public', table: 'venue_checkins' }, () => {})
                    .subscribe();
            },
            /WebSocket not available:.*Failed to construct 'WebSocket'/,
            'Expected unhardened SDK to reproduce the exact synchronous production crash'
        );
    } finally {
        await raw.removeAllChannels().catch(() => {});
        await raw.realtime.disconnect().catch(() => {});
    }
});

test('hardened client degrades cleanly on the exact production WebSocket refusal without crashing', async () => {
    const warnings = [];
    const refusals = [];
    const statuses = [];
    const ThrowingWS = makeThrowingWebSocket();

    const client = createHardenedSupabaseClient(
        createClient,
        'https://kuklfnapbkmacvwxktbh.supabase.co\n',
        'sb_publishable_test_key\n',
        { auth: { persistSession: false, autoRefreshToken: false } },
        {
            NativeSocket: ThrowingWS,
            warn: (...args) => warnings.push(args.join(' ')),
            onRefused: (err) => refusals.push(err),
        }
    );

    let channel = null;
    assert.doesNotThrow(() => {
        channel = client
            .channel('venue-1919-live')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'venue_checkins' }, () => {})
            .subscribe((status, err) => statuses.push({ status, err }));
    });

    assert.ok(channel, 'subscribe() must still return the channel object for chaining and cleanup');

    await flushMicrotasks();

    assert.equal(refusals.length, 1, 'onRefused should fire once for the deterministic constructor refusal');
    assert.equal(warnings.length, 1, 'warning should be logged once without spamming console');
    assert.match(warnings[0], /Failed to construct 'WebSocket'/);
    assert.ok(
        statuses.some((s) => s.status === 'CHANNEL_ERROR' || s.status === 'CLOSED'),
        `expected CHANNEL_ERROR/CLOSED notification, got ${JSON.stringify(statuses)}`
    );

    // A second page/effect opening another channel on the same degraded client must
    // also never throw, never retry the broken constructor, and notify CHANNEL_ERROR.
    const secondStatuses = [];
    let secondChannel = null;
    assert.doesNotThrow(() => {
        secondChannel = client
            .channel('commander-leagues-live')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'commander_leagues' }, () => {})
            .subscribe((status, err) => secondStatuses.push({ status, err }));
    });
    assert.ok(secondChannel);
    await flushMicrotasks();

    assert.equal(refusals.length, 1, 'degraded client must not spin retrying the broken WebSocket constructor');
    assert.equal(warnings.length, 1, 'degraded client must not repeat warnings');
    assert.ok(
        secondStatuses.some((s) => s.status === 'CHANNEL_ERROR'),
        `expected second channel to receive CHANNEL_ERROR, got ${JSON.stringify(secondStatuses)}`
    );

    // Cleanup on React unmount must never throw or reject.
    await assert.doesNotReject(async () => {
        await client.removeChannel(channel);
        await client.removeChannel(secondChannel);
        await client.removeChannel(null);
        await client.realtime.disconnect();
    });
});

test('hardened client handles missing global WebSocket and synchronous connect() throws', async () => {
    const warnings = [];
    const Transport = createResilientWebSocketTransport({
        NativeSocket: null,
        warn: (...args) => warnings.push(args.join(' ')),
    });

    const origWS = globalThis.WebSocket;
    try {
        globalThis.WebSocket = undefined;
        const sock = new Transport('wss://kuklfnapbkmacvwxktbh.supabase.co/realtime/v1/websocket');
        assert.ok(sock instanceof RefusedWebSocket);
        assert.equal(sock.readyState, RefusedWebSocket.CLOSED);
    } finally {
        globalThis.WebSocket = origWS;
    }

    // Also verify defense-in-depth when realtime.connect() throws BEFORE reaching transport.
    const fakeStatuses = [];
    const fakeClient = {
        realtime: {
            connect() {
                throw new Error('WebSocket not available: synthetic pre-transport throw');
            },
        },
        channel() {
            const ch = {
                subscribe(cb) {
                    fakeClient.realtime.connect();
                    if (cb) cb('SUBSCRIBED');
                    return ch;
                },
                unsubscribe() {
                    throw new Error('cleanup throw');
                },
            };
            return ch;
        },
        removeChannel() {
            throw new Error('removeChannel throw');
        },
    };

    hardenSupabaseRealtime(fakeClient, { warn: (...args) => warnings.push(args.join(' ')) });

    let ch;
    assert.doesNotThrow(() => {
        ch = fakeClient.channel('test').subscribe((status) => fakeStatuses.push(status));
    });
    assert.ok(ch);
    await flushMicrotasks();
    await assert.doesNotReject(() => ch.unsubscribe());
    await assert.doesNotReject(() => fakeClient.removeChannel(ch));
});

test('healthy browsers receive the exact native WebSocket instance untouched', () => {
    const constructed = [];
    class HealthyWebSocket {
        static CONNECTING = 0;
        static OPEN = 1;
        static CLOSING = 2;
        static CLOSED = 3;
        constructor(url, protocols) {
            this.url = url;
            this.protocols = protocols;
            this.readyState = 1;
            constructed.push(this);
        }
        send() {}
        close() {}
    }

    const Transport = createResilientWebSocketTransport({ NativeSocket: HealthyWebSocket });
    const instance = new Transport('wss://kuklfnapbkmacvwxktbh.supabase.co/realtime/v1/websocket', ['phoenix']);
    assert.ok(instance instanceof HealthyWebSocket, 'must return the exact native WebSocket instance');
    assert.equal(instance, constructed[0]);
    assert.deepEqual(instance.protocols, ['phoenix']);
});

test('source contract: authoritative and secondary browser Supabase clients all wire realtimeTransportGuard', () => {
    const requiredHardenedClients = [
        'src/lib/supabase.ts',
        'pages/hub/home-games/[slug]/dashboard.js',
        'pages/u/[username].js',
        'pages/hub/training/drill-builder.js',
        'src/engine/CentralBus.js',
        'lib/game-engine-service.ts',
        'lib/god-mode-service.ts',
    ];

    for (const rel of requiredHardenedClients) {
        const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
        assert.match(
            src,
            /realtimeTransportGuard/,
            `${rel} must import realtimeTransportGuard so a refused WebSocket can never crash the app`
        );
        assert.match(
            src,
            /createHardenedSupabaseClient|hardenSupabaseRealtime/,
            `${rel} must harden its Supabase client instance`
        );
    }
});

test('source contract: no unguarded browser createClient() exists outside server/API/SSR/test files', () => {
    const scanDirs = ['src', 'pages', 'lib'];
    const violations = [];

    function walk(dir) {
        const full = path.join(ROOT, dir);
        if (!fs.existsSync(full)) return;
        for (const entry of fs.readdirSync(full, { withFileTypes: true })) {
            const rel = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (['node_modules', '.next', 'tests', '__tests__', 'scrapers'].includes(entry.name)) continue;
                if (rel === 'pages/api' || rel.startsWith('pages/api/')) continue;
                walk(rel);
                continue;
            }
            if (!/\.(js|jsx|ts|tsx|mjs)$/.test(entry.name)) continue;
            if (/Server|Admin|server|middleware|cron|sitemap|rss|scraper|Brain|ChipBridge|GameController|authMiddleware|operatorAuth|hgOperator|rpcBridge|cashoutBridge|clawbot|delivery|imageVault|magazineCompiler|vaultHarvester|publicFeedData|locationPages|venueContributionsServer|apiSupabase|realtimeTransportGuard/i.test(rel)) {
                continue;
            }
            const raw = fs.readFileSync(path.join(ROOT, rel), 'utf8');
            // Strip line/block comments so historical comments mentioning createClient() don't match.
            const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/.*$/gm, '$1');
            if (!/\bcreateClient\s*\(/.test(src)) continue;
            // Skip SSR-only server helpers (use SUPABASE_SERVICE_ROLE_KEY or only inside getServerSideProps).
            const isServerHelperCall = /SUPABASE_SERVICE_ROLE_KEY/.test(src) && !/lib\/god-mode-service\.ts/.test(rel);
            const hasBrowserUse =
                !isServerHelperCall &&
                /typeof window|useEffect|useState|NEXT_PUBLIC_SUPABASE_ANON_KEY/.test(src) &&
                !/export\s+(?:async\s+)?function\s+get(?:ServerSide|Static)Props[\s\S]*createClient\s*\(/.test(src);
            if (!hasBrowserUse) continue;
            if (!/createHardenedSupabaseClient|hardenSupabaseRealtime/.test(src)) {
                violations.push(rel);
            }
        }
    }

    for (const dir of scanDirs) walk(dir);
    assert.deepEqual(
        violations,
        [],
        `Found unhardened browser createClient() files: ${violations.join(', ')}. Route them through createHardenedSupabaseClient / hardenSupabaseRealtime from src/lib/realtimeTransportGuard.js.`
    );
});

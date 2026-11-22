/**
 * Shared Club Arena tables (smarter.poker/g/<id>) and Lightning pools
 * (smarter.poker/l/<id>). Pins UUID normalization, share query parameter
 * sanitization (?i=, ?cluster=, ?invite=), target/signup path builders,
 * server reads (anon key only, graceful { status: 'unknown' } degradation on
 * HTTP/network failures), strict PII stripping, Chips/Diamonds copy with zero
 * currency signs ($) and zero em-dashes, shared Head key overrides against
 * pages/_app.js, crawler safety, invite attribution cookie rules, and Satori
 * display:'flex' compliance on pages/api/og/club-game.js.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    buyInRangeWords,
    chipAmount,
    cleanGamePreview,
    clubArenaLightningPath,
    clubArenaTablePath,
    clubInviteLoginPath,
    clubInviteSignupPath,
    gamePreviewText,
    gameVariantWords,
    hasSignedInSession,
    normalizeGameId,
    readSharedLightning,
    readSharedTable,
    sanitizeShareParams,
    seatsWords,
    stakesWords,
} from '../src/lib/sharedGameLink.js';

const read = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const TABLE_ID = '8c5474fd-f1e6-4112-91f9-6d6e8af4c842';
const CLUSTER_ID = '11111111-2222-4333-8444-555555555555';

test('ids are lower-cased uuids; malformed values are rejected', () => {
    assert.equal(normalizeGameId(` ${TABLE_ID.toUpperCase()} `), TABLE_ID);
    for (const bad of ['8c5474fd', `${TABLE_ID}x`, '../etc/passwd', '<script>', '', null, undefined, 7, `${TABLE_ID.slice(0, -1)}g`]) {
        assert.equal(normalizeGameId(bad), null, String(bad));
    }
});

test('share query params sanitize i, cluster, and invite while rejecting injection/garbage', () => {
    assert.deepEqual(
        sanitizeShareParams({
            i: ' abc2345 ',
            cluster: ` ${CLUSTER_ID.toUpperCase()} `,
            invite: 'a1B2c3D4_ef56-7890',
        }),
        { i: 'ABC2345', cluster: CLUSTER_ID, invite: 'a1B2c3D4_ef56-7890' }
    );
    // Arrays (Next.js repeated query keys) pick the first element cleanly.
    assert.deepEqual(
        sanitizeShareParams({ i: ['ABCD234', 'OTHER99'], cluster: [CLUSTER_ID, 'bad'], invite: ['token_123456', 'x'] }),
        { i: 'ABCD234', cluster: CLUSTER_ID, invite: 'token_123456' }
    );
    // XSS, SQLi, traversal, whitespace, too-short and too-long values are rejected.
    for (const bad of [
        '<script>alert(1)</script>',
        'javascript:alert(1)',
        '../../etc/passwd',
        'abc',
        'A'.repeat(25),
        'ABC 2345',
        'ABC-2345',
        '',
        null,
    ]) {
        assert.equal(sanitizeShareParams({ i: bad }).i, null, `i=${String(bad)}`);
    }
    for (const bad of ['not-a-uuid', `${CLUSTER_ID}0`, '<img onerror=1>', '', null]) {
        assert.equal(sanitizeShareParams({ cluster: bad }).cluster, null, `cluster=${String(bad)}`);
    }
    for (const bad of ['short7', 'x'.repeat(65), 'tok<script>', 'tok en12345', 'tok/123456', '', null]) {
        assert.equal(sanitizeShareParams({ invite: bad }).invite, null, `invite=${String(bad)}`);
    }
});

test('target and signup path builders preserve safe params and refuse open redirects', () => {
    assert.equal(clubArenaTablePath(TABLE_ID), `/hub/club-arena/table/${TABLE_ID}`);
    assert.equal(
        clubArenaTablePath(TABLE_ID, { i: 'abc2345', cluster: CLUSTER_ID, invite: 'token_12345678' }),
        `/hub/club-arena/table/${TABLE_ID}?i=ABC2345&cluster=${CLUSTER_ID}&invite=token_12345678`
    );
    assert.equal(
        clubArenaTablePath(TABLE_ID, { i: '<bad>', cluster: 'bad', invite: 'bad' }),
        `/hub/club-arena/table/${TABLE_ID}`
    );
    assert.equal(clubArenaTablePath('bad-id'), '/hub/club-arena');

    // Lightning only carries ?i=, never cluster/invite.
    assert.equal(clubArenaLightningPath(CLUSTER_ID), `/hub/club-arena/lightning/${CLUSTER_ID}`);
    assert.equal(
        clubArenaLightningPath(CLUSTER_ID, { i: 'abc2345', cluster: TABLE_ID, invite: 'token_12345678' }),
        `/hub/club-arena/lightning/${CLUSTER_ID}?i=ABC2345`
    );
    assert.equal(clubArenaLightningPath('bad-id'), '/hub/club-arena');

    const tableTarget = clubArenaTablePath(TABLE_ID, { i: 'ABC2345', cluster: CLUSTER_ID });
    assert.equal(
        clubInviteSignupPath(tableTarget, 'abc2345'),
        `/auth/signup?invite=ABC2345&redirect=${encodeURIComponent(tableTarget)}`
    );
    assert.equal(
        clubInviteSignupPath(tableTarget, null),
        `/auth/signup?redirect=${encodeURIComponent(tableTarget)}`
    );
    assert.equal(
        clubInviteLoginPath(tableTarget, 'ABC2345'),
        `/auth/login?invite=ABC2345&redirect=${encodeURIComponent(tableTarget)}`
    );
    // Open redirect attempt falls back to /hub/club-arena.
    assert.equal(
        clubInviteSignupPath('https://evil.example/phish', 'ABC2345'),
        `/auth/signup?invite=ABC2345&redirect=${encodeURIComponent('/hub/club-arena')}`
    );
    assert.equal(
        clubInviteSignupPath('//evil.example/phish', 'ABC2345'),
        `/auth/signup?invite=ABC2345&redirect=${encodeURIComponent('/hub/club-arena')}`
    );
});

test('cleanGamePreview strips unknown/PII fields and formats stakes & buy-ins with zero $ and zero em-dash', () => {
    const cleaned = cleanGamePreview({
        found: true,
        kind: 'table',
        id: TABLE_ID,
        name: '  High Roller Cash  ',
        game: 'plo5',
        stakes: '$2/$5',
        smallBlind: '2',
        bigBlind: 5,
        maxPlayers: 6,
        currentPlayers: 4,
        minBuyIn: 200,
        maxBuyIn: 1000,
        status: 'active',
        isBombPot: true,
        isStraddle: 'yes',
        isAllInOrFold: false,
        clusterId: CLUSTER_ID.toUpperCase(),
        club: 'Midway Union',
        asset: 'CHIPS',
        // PII / forbidden fields that must NEVER survive:
        players: [{ name: 'Alice', cards: 'AsKs' }],
        seats: [{ userId: 'u1' }],
        userId: 'secret-user',
        email: 'player@example.com',
        wallet: 9999,
        holeCards: 'AhKd',
    });

    assert.deepEqual(cleaned, {
        kind: 'table',
        asset: 'chips',
        clusterId: CLUSTER_ID,
        name: 'High Roller Cash',
        game: 'plo5',
        stakes: '2/5',
        status: 'active',
        club: 'Midway Union',
        smallBlind: 2,
        bigBlind: 5,
        maxPlayers: 6,
        currentPlayers: 4,
        minBuyIn: 200,
        maxBuyIn: 1000,
        isBombPot: true,
    });
    assert.equal(cleaned.players, undefined);
    assert.equal(cleaned.seats, undefined);
    assert.equal(cleaned.userId, undefined);
    assert.equal(cleaned.email, undefined);
    assert.equal(cleaned.wallet, undefined);
    assert.equal(cleaned.holeCards, undefined);
    assert.equal(cleaned.isStraddle, undefined);
    assert.equal(cleaned.isAllInOrFold, undefined);

    assert.equal(gameVariantWords(cleaned), 'PLO5 Bomb Pot');
    assert.equal(stakesWords(cleaned), '2/5');
    assert.equal(stakesWords({ smallBlind: 0.25, bigBlind: 0.5 }), '0.25/0.50');
    assert.equal(stakesWords({ stakes: '$1/$2' }), '1/2');
    assert.equal(buyInRangeWords(cleaned), '200 To 1,000 Chips');
    assert.equal(buyInRangeWords({ minBuyIn: 500, maxBuyIn: 500, asset: 'diamonds' }), '500 Diamonds');
    assert.equal(buyInRangeWords({ minBuyIn: 100 }), 'Min 100 Chips');
    assert.equal(buyInRangeWords({ maxBuyIn: 500 }), 'Up To 500 Chips');
    assert.equal(seatsWords(cleaned), '4/6 Seated');
    assert.equal(seatsWords({ maxPlayers: 2 }), 'Heads-Up (2-Max)');
    assert.equal(seatsWords({ kind: 'lightning', maxPlayers: 6 }), '6-Max Fast-Fold');
    assert.equal(chipAmount(1.9), '1.90');
    assert.equal(chipAmount(25000), '25,000');

    const tableText = gamePreviewText(cleaned, 'table');
    assert.equal(tableText.headline, 'High Roller Cash');
    assert.equal(
        tableText.description,
        'PLO5 Bomb Pot | 2/5 Chips | Buy-In 200 To 1,000 Chips | 4/6 Seated | Midway Union. Open Table On Smarter.Poker.'
    );
    assert.doesNotMatch(tableText.headline + tableText.description, /[\$—]/);

    const lightningPreview = cleanGamePreview({
        kind: 'lightning',
        name: '0.25/0.50 Lightning NLH',
        game: 'nlh',
        smallBlind: 0.25,
        bigBlind: 0.5,
        minBuyIn: 20,
        maxBuyIn: 100,
        maxPlayers: 6,
        club: 'Midway Union',
        asset: 'chips',
    });
    const lightningText = gamePreviewText(lightningPreview, 'lightning');
    assert.equal(lightningText.headline, '0.25/0.50 Lightning NLH');
    assert.equal(
        lightningText.description,
        'NLH Lightning | 0.25/0.50 Chips | Buy-In 20 To 100 Chips | 6-Max Fast-Fold | Midway Union. Play Lightning Poker On Smarter.Poker.'
    );
    assert.doesNotMatch(lightningText.headline + lightningText.description, /[\$—]/);
});

test('readSharedTable and readSharedLightning use anon key only and degrade gracefully on errors', async () => {
    let seen;
    const okTableFetch = async (url, init) => {
        seen = { url, init };
        return {
            ok: true,
            json: async () => ({
                found: true,
                kind: 'table',
                name: 'NLH 1/2',
                game: 'nlh',
                smallBlind: 1,
                bigBlind: 2,
                minBuyIn: 40,
                maxBuyIn: 200,
                maxPlayers: 6,
                currentPlayers: 3,
                club: 'Midway Union',
                secretField: 'drop-me',
            }),
        };
    };

    const tableRes = await readSharedTable(TABLE_ID, okTableFetch);
    assert.equal(tableRes.status, 'found');
    assert.equal(tableRes.preview.name, 'NLH 1/2');
    assert.equal(tableRes.preview.secretField, undefined);
    assert.match(seen.url, /\/rest\/v1\/rpc\/fn_ca_table_share_preview$/);
    assert.deepEqual(JSON.parse(seen.init.body), { p_table_id: TABLE_ID });
    assert.ok(seen.init.headers.apikey);
    assert.equal(seen.init.headers.Authorization, undefined);

    // found: false -> missing
    assert.deepEqual(
        await readSharedTable(TABLE_ID, async () => ({ ok: true, json: async () => ({ found: false }) })),
        { status: 'missing' }
    );
    // invalid id -> missing without calling fetch
    let called = false;
    assert.deepEqual(
        await readSharedTable('not-a-uuid', async () => {
            called = true;
            return { ok: true, json: async () => ({}) };
        }),
        { status: 'missing' }
    );
    assert.equal(called, false);

    // HTTP 404 (uninstalled migration), 400, 503, network error, bad JSON -> { status: 'unknown' }
    for (const status of [404, 400, 500, 503]) {
        assert.deepEqual(
            await readSharedTable(TABLE_ID, async () => ({ ok: false, status })),
            { status: 'unknown' },
            `table status ${status}`
        );
    }
    assert.deepEqual(
        await readSharedTable(TABLE_ID, async () => {
            throw new Error('network down');
        }),
        { status: 'unknown' }
    );
    assert.deepEqual(
        await readSharedTable(TABLE_ID, async () => ({
            ok: true,
            json: async () => {
                throw new Error('bad json');
            },
        })),
        { status: 'unknown' }
    );

    // Lightning RPC
    const okLightningFetch = async (url, init) => {
        seen = { url, init };
        return {
            ok: true,
            json: async () => ({
                found: true,
                kind: 'lightning',
                name: 'Lightning 1/2',
                game: 'nlh',
                smallBlind: 1,
                bigBlind: 2,
                maxPlayers: 6,
                minBuyIn: 50,
                maxBuyIn: 200,
                club: 'Midway Union',
            }),
        };
    };
    const lRes = await readSharedLightning(CLUSTER_ID, okLightningFetch);
    assert.equal(lRes.status, 'found');
    assert.equal(lRes.preview.kind, 'lightning');
    assert.match(seen.url, /\/rest\/v1\/rpc\/fn_ca_lightning_share_preview$/);
    assert.deepEqual(JSON.parse(seen.init.body), { p_cluster_id: CLUSTER_ID });
    assert.ok(seen.init.headers.apikey);
    assert.equal(seen.init.headers.Authorization, undefined);

    assert.deepEqual(
        await readSharedLightning(CLUSTER_ID, async () => ({ ok: true, json: async () => ({ found: false }) })),
        { status: 'missing' }
    );
    assert.deepEqual(
        await readSharedLightning(CLUSTER_ID, async () => ({ ok: false, status: 404 })),
        { status: 'unknown' }
    );
    assert.deepEqual(await readSharedLightning('bad', okLightningFetch), { status: 'missing' });
});

test('hasSignedInSession recognizes only a real shared Supabase session', () => {
    const store = v => ({ getItem: () => v });
    assert.equal(hasSignedInSession(store(JSON.stringify({ access_token: 't', user: { id: 'u' } }))), true);
    assert.equal(hasSignedInSession(store(null)), false);
    assert.equal(hasSignedInSession(store('{not json')), false);
    assert.equal(hasSignedInSession(store(JSON.stringify({ user: { id: 'u' } }))), false);
    assert.equal(hasSignedInSession(undefined), false);
});

test('both /g/[id] and /l/[id] replace all application preview defaults through shared Head keys', () => {
    const app = read('pages/_app.js');
    for (const pagePath of ['pages/g/[id].js', 'pages/l/[id].js']) {
        const page = read(pagePath);
        for (const property of [
            'og:type',
            'og:site_name',
            'og:url',
            'og:title',
            'og:description',
            'og:image',
            'og:image:width',
            'og:image:height',
            'og:image:type',
            'twitter:card',
            'twitter:title',
            'twitter:description',
            'twitter:image',
        ]) {
            const findTag = source =>
                [...source.matchAll(/<meta\b[^>]*>/g)]
                    .map(m => m[0])
                    .find(tag => tag.includes(`property="${property}"`) || tag.includes(`name="${property}"`));
            const defaultKey = findTag(app)?.match(/key="([^"]+)"/)?.[1];
            const overrideKey = findTag(page)?.match(/key="([^"]+)"/)?.[1];
            assert.ok(defaultKey, `Application default key for ${property}`);
            assert.equal(overrideKey, defaultKey, `${pagePath} must replace default ${property}`);
        }
        assert.match(page, /<link key="canonical" rel="canonical" href=\{pageUrl\} \/>/);
    }
});

test('/g/[id] and /l/[id] redirect signed-in visitors, preserve attribution, never redirect crawlers, and use zero em-dashes', () => {
    const tablePage = read('pages/g/[id].js');
    assert.match(tablePage, /const target = clubArenaTablePath\(id, shareParams\);/);
    assert.match(tablePage, /if \(hasSignedInSession\(window\.localStorage\)\) window\.location\.replace\(target\);/);
    assert.match(tablePage, /if \(inviteCode\) rememberInvite\(inviteCode\);/);
    assert.match(tablePage, /if \(canonicalInvite && !bot\)/);
    assert.match(tablePage, /if \(!isInviteFresh\(existing\)\)/);
    assert.match(tablePage, /res\.setHeader\(\s*'Set-Cookie'/);
    assert.match(tablePage, /\/api\/og\/club-game\?kind=table/);
    assert.match(tablePage, /Create Account &amp; Play/);
    assert.match(tablePage, /Open Table/);
    assert.doesNotMatch(tablePage, /httpEquiv="refresh"/);
    assert.doesNotMatch(tablePage, /redirect:\s*\{/);
    assert.doesNotMatch(tablePage, /—/);

    const lightningPage = read('pages/l/[id].js');
    assert.match(lightningPage, /const target = clubArenaLightningPath\(id, shareParams\);/);
    assert.match(lightningPage, /if \(hasSignedInSession\(window\.localStorage\)\) window\.location\.replace\(target\);/);
    assert.match(lightningPage, /if \(inviteCode\) rememberInvite\(inviteCode\);/);
    assert.match(lightningPage, /if \(canonicalInvite && !bot\)/);
    assert.match(lightningPage, /if \(!isInviteFresh\(existing\)\)/);
    assert.match(lightningPage, /res\.setHeader\(\s*'Set-Cookie'/);
    assert.match(lightningPage, /\/api\/og\/club-game\?kind=lightning/);
    assert.match(lightningPage, /Create Account &amp; Play/);
    assert.match(lightningPage, /Open Lightning Game/);
    assert.doesNotMatch(lightningPage, /httpEquiv="refresh"/);
    assert.doesNotMatch(lightningPage, /redirect:\s*\{/);
    assert.doesNotMatch(lightningPage, /—/);
});

test('pages/api/og/club-game.js obeys edge runtime, server-only facts, zero $ / em-dash, and Satori display:flex on every element', () => {
    const og = read('pages/api/og/club-game.js');
    assert.match(og, /export const config = \{\s*runtime:\s*'edge'\s*\};/);
    assert.match(og, /readSharedTable\(id\)/);
    assert.match(og, /readSharedLightning\(id\)/);
    assert.match(og, /normalizeGameId\(searchParams\.get\('id'\) \|\| ''\)/);
    assert.doesNotMatch(og, /searchParams\.get\('(name|title|club|stakes|buyin|buyIn|text|amount|seats)'\)/);
    assert.doesNotMatch(og, /\$\{?\s*['"]?\$/);
    assert.doesNotMatch(og, /[♠-♧]/);
    assert.doesNotMatch(og, /—/);

    // Satori law: every intrinsic HTML element inside JSX MUST specify display: 'flex'.
    const htmlOpenTags = [...og.matchAll(/<(div|span|p|section|header|footer|main)\b([^>]*)>/g)];
    assert.ok(htmlOpenTags.length >= 6, 'Expected OG JSX elements to be verified');
    for (const [fullTag, tagName, attrs] of htmlOpenTags) {
        assert.match(
            attrs,
            /display:\s*'flex'/,
            `Satori requires display:'flex' on every <${tagName}> element; missing in: ${fullTag}`
        );
    }
});

test('next.config.js, vercel.json, and middleware.ts do not intercept /g/*, /l/*, or /api/og/club-game', () => {
    const nextCfg = read('next.config.js');
    const vercelCfg = read('vercel.json');
    const middleware = read('middleware.ts');

    assert.doesNotMatch(nextCfg, /source:\s*['"]\/(?:g|l)(?:\/|:|\b)/);
    assert.doesNotMatch(nextCfg, /source:\s*['"]\/api\/og\/club-game/);
    assert.doesNotMatch(vercelCfg, /"source":\s*"\/(?:g|l)(?:\/|:)/);
    assert.doesNotMatch(vercelCfg, /"source":\s*"\/api\/og\/club-game/);
    // /api/og/club-game must not be in middleware's auth-required or explicit API matchers.
    assert.doesNotMatch(middleware, /\/api\/og/);
});

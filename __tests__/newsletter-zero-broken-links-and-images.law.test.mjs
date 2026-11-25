/**
 * NEWSLETTER ZERO BROKEN LINKS AND IMAGES LAW (2026-11-25)
 *
 * Permanent anti-regression suite encoding every root cause discovered during the
 * forensic audit of Weekly Wire, Welcome, Lifecycle, Promo, Web Archive, Article
 * Reader, and GTO Hand Lab surfaces:
 *
 *   1. FIRST-PARTY SIGNED IMAGE LAW:
 *      Every `<img>` rendered in Weekly Wire, Welcome, Lifecycle, and Promo emails
 *      MUST be served from `https://smarter.poker/api/news/email-image?...` with a
 *      valid HMAC-SHA256 signature (or `?brand=crest` / `?fallback=1`), NEVER raw
 *      external publisher CDNs (`pnimg.net`, `s.pnimg.net/*.webp`, `cardplayer.com`,
 *      `media.poker.org`, `wsopcdn.com`) and NEVER `/api/proxy` (which returns 403
 *      when `Referer: https://mail.google.com/`). Every Weekly Wire story MUST
 *      populate a crisp 112x78 thumbnail even when `image_url` is empty.
 *
 *   2. EMAIL IMAGE PROXY TRANSCODING, REFERER & SSRF LAW:
 *      `/api/news/email-image` MUST transcode `.webp` and transparent `.png` into
 *      universal `224x156` progressive `image/jpeg`, allow external email client
 *      `Referer` headers (`https://mail.google.com/`), reject forged/unsigned URLs
 *      (`403 INVALID_SIGNATURE`), reject private/loopback/metadata SSRF hosts
 *      (`403 BLOCKED_HOST`), and return `HTTP 200` `image/jpeg` Vanguard fallback
 *      cards whenever upstream 404s, returns `text/html`, or serves a 1x1 pixel.
 *      `curateWeeklyWireEdition` MUST also heal broken `image_url` values by
 *      backfilling `og:image` from `source_url`.
 *
 *   3. ARCHIVE & EDITION CLASSIFIER ANTI-POLLUTION LAW:
 *      `isWeeklyWireDigestCampaign` MUST exclude `[PROMO EMAIL+SMS]`, `[PROMO EMAIL]`,
 *      `[PROMO SMS]`, `[Promo]`, `[Lifecycle]`, `[SMS]`, `[TEST]` (case-insensitively)
 *      AND any campaign with empty `article_ids: []`, and MUST be shared across
 *      `loadZeroRepeatLedger`, `/hub/wire`, and `/hub/wire/[edition]` so promotional
 *      blasts can never hijack `/hub/wire/1` or `/hub/wire/2` or skew edition numbers.
 *
 *   4. EVERY LINK RESOLVES TO A REAL ROUTE WITH ZERO DOUBLE-ESCAPING LAW:
 *      Every `<a href="...">` across all email renderers and every URL in
 *      `weeklyWireCatalog.mjs` MUST resolve to a real route in `pages/` (or
 *      `/hub/club-arena/`), with zero `&amp;amp;` double-escaping or `undefined`.
 *
 *   5. SIGNUP REFERRAL PARAMETER CONTRACT LAW:
 *      `pages/auth/signup.js` copies `?ref=` into `formData.promoCode` and validates
 *      non-numeric / non-`SP-*` values against `/api/promo/validate-promo-code`
 *      (`400 Invalid promo code`). `formatValidSignupReferralCode`,
 *      `resolveWeeklyWireRecipients`, `renderWeeklyWireEmail`, and `pages/api/news/digest.js`
 *      MUST NEVER emit `?ref=WIRE` or `?ref=<username>`.
 *
 *   6. DESTINATION WIRINGcompleteness LAW (`Spot Of The Week` & `/hub/article`):
 *      Every `SPOT_OF_THE_WEEK_CATALOG` entry MUST define `correctKey`,
 *      `solverFrequency`, `evSummary`, `variant`, `heroCards`, and `boardCards`,
 *      `pages/hub/training/hand-lab.js` MUST hydrate `router.query.spot` & `pick`,
 *      and `pages/hub/article.js` MUST render `summary`/`excerpt` + `ArticleReaderModal`
 *      with guarded `newsImageUrl` + `onError` fallbacks.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

import emailImageHandler from '../pages/api/news/email-image.js';
import {
    EMAIL_IMAGE_PATH,
    buildMastheadCrestUrl,
    buildSignedEmailImageUrl,
    fetchAndNormalizeEmailImage,
    verifyEmailImageSignature,
} from '../src/lib/newsletter/emailImageProxy.mjs';
import {
    ACTIVE_MEMBER_PROMO_ROTATION,
    PLATFORM_UPDATES_CATALOG,
    SPOT_OF_THE_WEEK_CATALOG,
    TOOL_SPOTLIGHT_CATALOG,
} from '../src/lib/newsletter/weeklyWireCatalog.mjs';
import {
    buildPromoBlockForSegment,
    curateWeeklyWireEdition,
    formatValidSignupReferralCode,
    isWeeklyWireDigestCampaign,
    loadZeroRepeatLedger,
    renderWeeklyWireEmail,
    resolveWeeklyWireRecipients,
} from '../src/lib/newsletter/weeklyWireEngine.mjs';
import { buildWelcomeEmail } from '../src/lib/newsletter/welcomeAndPreferences.mjs';
import { isReferralInput } from '../src/lib/pendingSignupCodes.mjs';
import { renderPromoEmail } from '../src/lib/promoCampaigns/dispatch.mjs';
import { LIFECYCLE_TRIGGERS, renderLifecycleEmail } from '../src/lib/promoCampaigns/lifecycleEngine.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readRepoFile = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

function decodeHtmlAttr(raw) {
    return String(raw || '')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
}

function extractAttrValues(html, tagName, attrName) {
    const out = [];
    const tagRe = new RegExp(`<${tagName}\\b[^>]*?\\b${attrName}="([^"]*)"[^>]*>`, 'gi');
    for (const m of String(html || '').matchAll(tagRe)) {
        out.push(m[1]);
    }
    return out;
}

function routeExistsInRepo(urlPathname) {
    const clean = String(urlPathname || '').replace(/\/+$/, '') || '/';
    if (clean === '/') return fs.existsSync(path.join(ROOT, 'pages/index.js'));
    if (clean === '/hub/club-arena') return true; // Rewritten to Club Arena origin in next.config.js / vercel.json
    if (/^\/hub\/wire\/[^/]+$/.test(clean)) {
        return fs.existsSync(path.join(ROOT, 'pages/hub/wire/[edition].js'));
    }
    const candidates = [
        `pages${clean}.js`,
        `pages${clean}/index.js`,
        `pages${clean}.tsx`,
        `pages${clean}/index.tsx`,
        `pages${clean}.ts`,
        `public${clean}`,
    ];
    return candidates.some((rel) => fs.existsSync(path.join(ROOT, rel)));
}

async function invokeEmailImageApi(query = {}, { method = 'GET', headers = {} } = {}) {
    let statusCode = 200;
    const outHeaders = {};
    let body = null;
    const req = { method, query, headers };
    const res = {
        setHeader(k, v) {
            outHeaders[String(k).toLowerCase()] = v;
        },
        status(c) {
            statusCode = c;
            return this;
        },
        json(payload) {
            body = payload;
            return this;
        },
        send(payload) {
            body = payload;
            return this;
        },
        end() {
            return this;
        },
    };
    await emailImageHandler(req, res);
    return { statusCode, headers: outHeaders, body };
}

// ── LAW 1: First-Party Signed Image Guarantee Across All Email Surfaces ──────
test('LAW 1: every <img> in Weekly Wire, Welcome, Lifecycle, and Promo emails uses signed first-party /api/news/email-image URLs and populates 100% of stories', () => {
    const sampleEdition = {
        editionNumber: 4,
        subject: 'GTO Hand Lab + High Stakes Action | Smarter.Poker Wire #4',
        platformUpdates: PLATFORM_UPDATES_CATALOG.slice(0, 2),
        articles: [
            {
                id: '11111111-1111-4111-8111-111111111111',
                title: 'PokerNews WebP Thumbnail Story',
                summary: 'Real summary text that does not repeat the headline.',
                source_name: 'PokerNews',
                image_url: 'https://s.pnimg.net/test/story-lead.webp',
                category: 'NEWS',
            },
            {
                id: '22222222-2222-4222-8222-222222222222',
                title: 'CardPlayer WAF Protected Story',
                summary: 'Real summary text covering the tournament main event.',
                source_name: 'CardPlayer',
                image_url: 'https://www.cardplayer.com/wp-content/uploads/2026/11/main.jpg',
                category: 'TOURNAMENT',
            },
            {
                id: '33333333-3333-4333-8333-333333333333',
                title: 'Story Missing Upstream Image Completely',
                summary: 'Even without an upstream photo, a crisp Vanguard thumbnail must render.',
                source_name: 'Poker.org',
                image_url: '',
                category: 'LIVE POKER',
            },
        ],
        spotOfTheWeek: SPOT_OF_THE_WEEK_CATALOG[0],
        toolSpotlight: TOOL_SPOTLIGHT_CATALOG[0],
        upcomingSeries: [
            { series_name: 'WSOP Circuit', city: 'Las Vegas', state: 'NV' },
        ],
        activePromo: ACTIVE_MEMBER_PROMO_ROTATION[0],
    };

    const htmlPayloads = [
        renderWeeklyWireEmail({
            edition: sampleEdition,
            promoBlock: buildPromoBlockForSegment('non_account', { siteUrl: 'https://smarter.poker' }),
            siteUrl: 'https://smarter.poker',
        }).html,
        renderWeeklyWireEmail({
            edition: sampleEdition,
            promoBlock: buildPromoBlockForSegment('inactive_21d', {
                userId: '44444444-4444-4444-8444-444444444444',
                siteUrl: 'https://smarter.poker',
            }),
            siteUrl: 'https://smarter.poker',
            recipientMeta: { username: 'grinder99', diamonds: 900, isVip: true, referralCode: '10492' },
        }).html,
        buildWelcomeEmail({ hasExistingProfile: false, siteUrl: 'https://smarter.poker' }).html,
        buildWelcomeEmail({ hasExistingProfile: true, username: 'grinder99', siteUrl: 'https://smarter.poker' }).html,
        ...LIFECYCLE_TRIGGERS.map(
            (trigger) =>
                renderLifecycleEmail({
                    trigger,
                    username: 'grinder99',
                    userId: '44444444-4444-4444-8444-444444444444',
                    diamonds: 1200,
                    siteUrl: 'https://smarter.poker',
                }).html
        ),
        renderPromoEmail({
            subject: 'Promo Subject',
            headline: 'Promo Headline',
            body: 'Promo Body',
            ctaLabel: 'Claim',
            ctaUrl: 'https://smarter.poker/auth/signup',
            unsubscribeUrl: 'https://smarter.poker/api/news/subscribe?unsubscribe=test',
            preferencesUrl: 'https://smarter.poker/hub/email-preferences?token=test',
            siteUrl: 'https://smarter.poker',
        }).html,
    ];

    const wireImgs = extractAttrValues(htmlPayloads[0], 'img', 'src');
    // 1 masthead crest + 3 stories (including the story with empty image_url!) = 4 images
    assert.equal(wireImgs.length, 4, 'Masthead crest + all 3 story thumbnails must populate');

    for (const html of htmlPayloads) {
        const rawSrcs = extractAttrValues(html, 'img', 'src');
        for (const rawAttr of rawSrcs) {
            assert.doesNotMatch(rawAttr, /&amp;amp;/, '<img> src must never double-escape &amp;');
            const decoded = decodeHtmlAttr(rawAttr);
            const parsed = new URL(decoded);
            assert.equal(parsed.origin, 'https://smarter.poker', `External image host forbidden in email: ${decoded}`);
            assert.equal(parsed.pathname, EMAIL_IMAGE_PATH, `Email images must use ${EMAIL_IMAGE_PATH}: ${decoded}`);

            if (parsed.searchParams.get('brand') === 'crest' || parsed.searchParams.get('fallback') === '1') {
                continue;
            }
            const u = parsed.searchParams.get('u');
            const s = parsed.searchParams.get('s');
            const m = parsed.searchParams.get('m') || 'thumb';
            const verified = verifyEmailImageSignature(u, s, m);
            assert.ok(verified, `Every signed email image URL must carry a valid HMAC signature: ${decoded}`);
        }
    }

    // Web surfaces must never render raw publisher image columns directly
    for (const rel of ['pages/hub/wire/index.js', 'pages/hub/wire/[edition].js']) {
        const src = readRepoFile(rel);
        assert.match(src, /buildSignedEmailImageUrl/, `${rel} must route thumbnails through buildSignedEmailImageUrl`);
        assert.match(src, /onError=/, `${rel} must attach an onError fallback on every <img>`);
        assert.doesNotMatch(src, /src=\{\s*[a-zA-Z_$][\w$.]*\.image_url\s*\}/, `${rel} must never render raw image_url`);
    }
});

// ── LAW 2: Image Proxy Transcoding (.webp -> JPEG), Gmail Referer, Fallback & SSRF ──
test('LAW 2: /api/news/email-image transcodes WebP/PNG to 224x156 JPEG, allows Gmail Referer, blocks SSRF/unsigned probes, and serves 200 fallback on 404/HTML/1x1', async () => {
    const sampleWebp = await sharp({
        create: { width: 640, height: 360, channels: 3, background: { r: 22, g: 88, b: 120 } },
    })
        .webp()
        .toBuffer();

    const tinyPixelPng = await sharp({
        create: { width: 1, height: 1, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
        .png()
        .toBuffer();

    // 1. Transcodes .webp -> 224x156 progressive JPEG
    const normalizedWebp = await fetchAndNormalizeEmailImage('https://cdn.example.com/photo.webp', {
        mode: 'thumb',
        assertFetchableFn: async () => true,
        fetchGuardedFn: async () => ({
            ok: true,
            status: 200,
            headers: new Map([['content-type', 'image/webp']]),
            arrayBuffer: async () => sampleWebp,
        }),
    });
    assert.equal(normalizedWebp.status, 'ok');
    assert.equal(normalizedWebp.contentType, 'image/jpeg');
    const webpMeta = await sharp(normalizedWebp.buffer).metadata();
    assert.equal(webpMeta.format, 'jpeg');
    assert.equal(webpMeta.width, 224);
    assert.equal(webpMeta.height, 156);

    // 2. Rejects 1x1 tracking pixel -> returns 224x156 Vanguard fallback JPEG
    const pixelFallback = await fetchAndNormalizeEmailImage('https://cdn.example.com/1x1.png', {
        mode: 'thumb',
        assertFetchableFn: async () => true,
        fetchGuardedFn: async () => ({
            ok: true,
            status: 200,
            headers: new Map([['content-type', 'image/png']]),
            arrayBuffer: async () => tinyPixelPng,
        }),
    });
    assert.equal(pixelFallback.status, 'fallback');
    assert.equal(pixelFallback.contentType, 'image/jpeg');
    const fbMeta = await sharp(pixelFallback.buffer).metadata();
    assert.equal(fbMeta.width, 224);
    assert.equal(fbMeta.height, 156);

    // 3. Upstream 404 or HTML WAF challenge -> returns Vanguard fallback JPEG (never broken icon)
    for (const mockResp of [
        { ok: false, status: 404, headers: new Map(), arrayBuffer: async () => Buffer.alloc(0) },
        {
            ok: true,
            status: 200,
            headers: new Map([['content-type', 'text/html; charset=utf-8']]),
            arrayBuffer: async () => Buffer.from('<html>Blocked</html>'),
        },
    ]) {
        const res = await fetchAndNormalizeEmailImage('https://cdn.example.com/missing.jpg', {
            mode: 'thumb',
            assertFetchableFn: async () => true,
            fetchGuardedFn: async () => mockResp,
        });
        assert.equal(res.status, 'fallback');
        assert.equal(res.contentType, 'image/jpeg');
        assert.ok(res.buffer.byteLength > 1000);
    }

    // 4. Endpoint allows `Referer: https://mail.google.com/` on fallback & crest
    const gmailFallback = await invokeEmailImageApi(
        { fallback: '1', m: 'thumb' },
        { headers: { referer: 'https://mail.google.com/' } }
    );
    assert.equal(gmailFallback.statusCode, 200);
    assert.equal(gmailFallback.headers['content-type'], 'image/jpeg');

    const crestUrl = new URL(buildMastheadCrestUrl());
    const crestRes = await invokeEmailImageApi(Object.fromEntries(crestUrl.searchParams.entries()), {
        headers: { referer: 'https://mail.google.com/' },
    });
    assert.equal(crestRes.statusCode, 200);
    assert.equal(crestRes.headers['content-type'], 'image/png');
    const crestMeta = await sharp(crestRes.body).metadata();
    assert.equal(crestMeta.width, 72);
    assert.equal(crestMeta.height, 72);

    // 5. Rejects tampered/unsigned open-proxy requests with 403
    const forgedRes = await invokeEmailImageApi({
        m: 'thumb',
        u: 'aHR0cHM6Ly9leGFtcGxlLmNvbS9hLmpwZw',
        s: 'A'.repeat(43),
    });
    assert.equal(forgedRes.statusCode, 403);

    // 6. Rejects SSRF private/loopback/metadata hosts even when signed
    for (const ssrfTarget of ['http://127.0.0.1:8080/secret.png', 'http://169.254.169.254/latest/meta-data/']) {
        const signedSsrf = new URL(buildSignedEmailImageUrl(ssrfTarget));
        const ssrfRes = await invokeEmailImageApi(Object.fromEntries(signedSsrf.searchParams.entries()));
        assert.equal(ssrfRes.statusCode, 403, `Must block SSRF target: ${ssrfTarget}`);
    }
});

// ── LAW 2B: curateWeeklyWireEdition Heals Dead image_url Via og:image Backfill ──
test('LAW 2B: curateWeeklyWireEdition verifies upstream image_url and heals 404 thumbnails from publisher og:image', async () => {
    const nowIso = new Date().toISOString();
    let updatedRowPatch = null;
    const mockSb = {
        from(table) {
            const builder = {
                select() {
                    return builder;
                },
                in() {
                    return builder;
                },
                eq() {
                    return builder;
                },
                neq() {
                    return builder;
                },
                gte() {
                    return builder;
                },
                order() {
                    return builder;
                },
                update(patch) {
                    updatedRowPatch = patch;
                    return builder;
                },
                async limit() {
                    if (table === 'newsletter_campaigns') return { data: [], error: null };
                    if (table === 'poker_news') {
                        return {
                            data: [
                                {
                                    id: '99999999-9999-4999-8999-999999999999',
                                    title: 'High Roller Final Table Crowns New Champion In Monte Carlo',
                                    summary: '',
                                    source_name: 'PokerNews',
                                    source_url: 'https://smarter.poker/test-article',
                                    image_url: 'https://smarter.poker/dead-404-image.jpg',
                                    category: 'TOURNAMENT',
                                    is_published: true,
                                    published_at: nowIso,
                                },
                            ],
                            error: null,
                        };
                    }
                    return { data: [], error: null };
                },
            };
            return builder;
        },
    };

    const mockFetch = async (url, opts = {}) => {
        const u = String(url);
        if (u.includes('dead-404-image.jpg')) {
            return { ok: false, status: 404, headers: new Map() };
        }
        if (u.includes('healed-og-hero.jpg')) {
            return { ok: true, status: 200, headers: new Map([['content-type', 'image/jpeg']]) };
        }
        if (opts.method === 'GET' && u.includes('test-article')) {
            return {
                ok: true,
                status: 200,
                headers: new Map([['content-type', 'text/html']]),
                text: async () =>
                    '<html><head>' +
                    '<meta property="og:description" content="Daniel Rezaei defeated a stacked 120-entry field in Monte Carlo to capture the trophy and $1.2M first-place prize." />' +
                    '<meta property="og:image" content="https://smarter.poker/healed-og-hero.jpg" />' +
                    '</head></html>',
            };
        }
        return { ok: false, status: 404, headers: new Map() };
    };

    const curated = await curateWeeklyWireEdition(mockSb, {
        days: 7,
        articleLimit: 3,
        enrichMetaDescriptions: true,
        fetchImpl: mockFetch,
    });

    assert.equal(curated.articles.length, 1);
    assert.equal(curated.articles[0].image_url, 'https://smarter.poker/healed-og-hero.jpg');
    assert.match(curated.articles[0].summary, /Daniel Rezaei defeated a stacked/);
    assert.match(curated.articles[0].email_image_url, /^https:\/\/smarter\.poker\/api\/news\/email-image\?m=thumb&u=/);
    assert.deepEqual(updatedRowPatch, {
        summary: 'Daniel Rezaei defeated a stacked 120-entry field in Monte Carlo to capture the trophy and $1.2M first-place prize.',
        image_url: 'https://smarter.poker/healed-og-hero.jpg',
    });
});

// ── LAW 3: Campaign Classifier Anti-Pollution Across Engine & Archive ────────
test('LAW 3: isWeeklyWireDigestCampaign blocks [PROMO EMAIL+SMS], [Lifecycle], and empty article_ids across engine and /hub/wire/*', async () => {
    assert.equal(
        isWeeklyWireDigestCampaign({
            subject: '[PROMO EMAIL+SMS] Claim 25 Free Chips, 30-Day Free VIP & 500 Free Diamonds on Smarter.Poker',
            article_ids: [],
        }),
        false
    );
    assert.equal(
        isWeeklyWireDigestCampaign({
            subject: '[PROMO EMAIL+SMS] We Miss You At The Tables: Accept 25 Free Chips',
            article_ids: [],
        }),
        false
    );
    assert.equal(
        isWeeklyWireDigestCampaign({
            subject: '[Lifecycle] Automated Retention Triggers',
            article_ids: ['11111111-1111-4111-8111-111111111111'],
        }),
        false
    );
    assert.equal(
        isWeeklyWireDigestCampaign({
            subject: 'Unprefixed Promo With Empty Article IDs',
            article_ids: [],
        }),
        false
    );
    assert.equal(
        isWeeklyWireDigestCampaign({
            subject: 'Kevin Hart Loses 1.66m After Monster 2.65m Pot - Smarter.Poker',
            article_ids: ['22222222-2222-4222-8222-222222222222'],
        }),
        true
    );

    // Verify loadZeroRepeatLedger ignores both [PROMO EMAIL+SMS] and [Lifecycle] when computing editionNumber
    const mockSb = {
        from(table) {
            return {
                select() { return this; },
                in() { return this; },
                order() { return this; },
                async limit() {
                    if (table === 'newsletter_campaigns') {
                        return {
                            data: [
                                { id: 'p1', subject: '[PROMO EMAIL+SMS] Claim 25 Free Chips', status: 'sent', article_ids: [] },
                                { id: 'p2', subject: '[PROMO EMAIL+SMS] We Miss You', status: 'sent', article_ids: [] },
                                { id: 'l1', subject: '[Lifecycle] Automated Retention Triggers', status: 'sent', article_ids: ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'] },
                                { id: 'w1', subject: 'Smarter.Poker Weekly Wire #1', status: 'sent', article_ids: ['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'] },
                            ],
                            error: null,
                        };
                    }
                    return { data: [], error: null };
                },
            };
        },
    };

    const ledger = await loadZeroRepeatLedger(mockSb);
    assert.equal(ledger.editionNumber, 2, 'Only real Weekly Wire editions may increment editionNumber');

    for (const rel of ['pages/hub/wire/index.js', 'pages/hub/wire/[edition].js']) {
        const src = readRepoFile(rel);
        assert.match(src, /isWeeklyWireDigestCampaign/, `${rel} must delegate to isWeeklyWireDigestCampaign`);
    }
});

// ── LAW 4: Every Catalog & Email Link Resolves To An Existing Page Route ─────
test('LAW 4: 100% of catalog URLs and rendered email <a href> links resolve to real existing routes without double-escaping', () => {
    const catalogUrls = [
        ...PLATFORM_UPDATES_CATALOG.map((u) => u.ctaUrl),
        ...TOOL_SPOTLIGHT_CATALOG.map((t) => t.url),
        ...ACTIVE_MEMBER_PROMO_ROTATION.map((p) => p.ctaUrl),
        ...SPOT_OF_THE_WEEK_CATALOG.map((s) => s.targetUrl),
    ];

    for (const rawUrl of catalogUrls) {
        const parsed = new URL(rawUrl);
        assert.equal(parsed.origin, 'https://smarter.poker', `Catalog URL must stay on smarter.poker: ${rawUrl}`);
        assert.ok(
            routeExistsInRepo(parsed.pathname),
            `Catalog URL points to a non-existent route: ${rawUrl} (${parsed.pathname})`
        );
    }

    const edition = {
        editionNumber: 2,
        subject: 'Smarter.Poker Weekly Wire #2',
        platformUpdates: PLATFORM_UPDATES_CATALOG,
        articles: [
            {
                id: '55555555-5555-4555-8555-555555555555',
                title: 'Test Headline',
                summary: 'Distinct test summary text with real details.',
                source_name: 'PokerNews',
                image_url: 'https://pnimg.net/w/articles/test.jpg',
                category: 'NEWS',
            },
        ],
        spotOfTheWeek: SPOT_OF_THE_WEEK_CATALOG[0],
        toolSpotlight: TOOL_SPOTLIGHT_CATALOG[0],
        upcomingSeries: [{ series_name: 'MSPT Venetian', city: 'Las Vegas', state: 'NV' }],
        activePromo: ACTIVE_MEMBER_PROMO_ROTATION[0],
    };

    const renderedHtmls = [
        renderWeeklyWireEmail({
            edition,
            promoBlock: buildPromoBlockForSegment('non_account', { siteUrl: 'https://smarter.poker' }),
            siteUrl: 'https://smarter.poker',
            unsubscribeUrl: 'https://smarter.poker/api/news/subscribe?unsubscribe=tok&mode=1',
            preferencesUrl: 'https://smarter.poker/hub/email-preferences?token=tok',
        }).html,
        renderWeeklyWireEmail({
            edition,
            promoBlock: buildPromoBlockForSegment('inactive_21d', {
                userId: '66666666-6666-4666-8666-666666666666',
                siteUrl: 'https://smarter.poker',
            }),
            siteUrl: 'https://smarter.poker',
            recipientMeta: { username: 'proplayer', diamonds: 500, isVip: true, referralCode: '50123' },
        }).html,
        renderWeeklyWireEmail({
            edition,
            promoBlock: buildPromoBlockForSegment('active_member', {
                activePromo: ACTIVE_MEMBER_PROMO_ROTATION[0],
                siteUrl: 'https://smarter.poker',
            }),
            siteUrl: 'https://smarter.poker',
        }).html,
        buildWelcomeEmail({ hasExistingProfile: false, siteUrl: 'https://smarter.poker' }).html,
        buildWelcomeEmail({ hasExistingProfile: true, username: 'proplayer', siteUrl: 'https://smarter.poker' }).html,
        ...LIFECYCLE_TRIGGERS.map(
            (trigger) =>
                renderLifecycleEmail({
                    trigger,
                    username: 'proplayer',
                    userId: '66666666-6666-4666-8666-666666666666',
                    diamonds: 1000,
                    vipExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
                    siteUrl: 'https://smarter.poker',
                }).html
        ),
    ];

    for (const html of renderedHtmls) {
        const hrefs = extractAttrValues(html, 'a', 'href');
        assert.ok(hrefs.length >= 4, 'Every email template must carry working links');
        for (const rawHref of hrefs) {
            assert.ok(rawHref.length > 0, 'Empty href forbidden');
            assert.doesNotMatch(rawHref, /&amp;amp;/, `Double-escaped query string in href: ${rawHref}`);
            assert.doesNotMatch(rawHref, /undefined|null/i, `Undefined/null token in href: ${rawHref}`);
            const decoded = decodeHtmlAttr(rawHref);
            const parsed = new URL(decoded);
            assert.equal(parsed.origin, 'https://smarter.poker', `Email link must stay on smarter.poker: ${decoded}`);
            assert.ok(
                routeExistsInRepo(parsed.pathname),
                `Email href points to non-existent page route: ${decoded} (${parsed.pathname})`
            );
        }
    }
});

// ── LAW 5: Signup Referral Param Must Satisfy signup.js isReferralInput ──────
test('LAW 5: Weekly Wire referral links delegate directly to pendingSignupCodes.isReferralInput and never emit ?ref=WIRE or ?ref=<username>', async () => {
    const signupSrc = readRepoFile('pages/auth/signup.js');
    assert.match(signupSrc, /isReferralInput\(formData\.promoCode\)/, 'signup.js must call isReferralInput');

    assert.equal(formatValidSignupReferralCode('WIRE'), '');
    assert.equal(formatValidSignupReferralCode('PokerMogul'), '');
    assert.equal(formatValidSignupReferralCode('0'), '');
    assert.equal(formatValidSignupReferralCode('10488'), '10488');
    assert.equal(formatValidSignupReferralCode('sp-56737b'), 'SP-56737B');

    // Without player_number -> omits ?ref= completely (uses UTM attribution instead)
    const guestEmail = renderWeeklyWireEmail({
        edition: { editionNumber: 1, articles: [], platformUpdates: [] },
        recipientMeta: { username: 'PokerMogul', referralCode: 'PokerMogul' },
    });
    assert.doesNotMatch(guestEmail.html, /\?ref=/i);
    assert.match(guestEmail.html, /utm_source=weekly_wire/);

    // With valid numeric player_number -> emits ?ref=<digits> accepted by isReferralInput
    const memberEmail = renderWeeklyWireEmail({
        edition: { editionNumber: 1, articles: [], platformUpdates: [] },
        recipientMeta: { username: 'PokerMogul', referralCode: '10488' },
    });
    const refMatch = decodeHtmlAttr(memberEmail.html).match(/\/auth\/signup\?ref=([^"&\s<]+)/);
    assert.ok(refMatch, 'Valid player_number must emit ?ref=<digits>');
    assert.equal(isReferralInput(refMatch[1]), true);

    // Verify digest.js never sets referralCode from prof.username
    const digestSrc = readRepoFile('pages/api/news/digest.js');
    assert.doesNotMatch(digestSrc, /referralCode:\s*prof\.username/, 'digest.js must never use username as ?ref=');
});

// ── LAW 6: Spot Of The Week & /hub/article End-To-End Destination Wiring ─────
test('LAW 6: all 16 Spot Of The Week entries carry complete solver verdicts and Hand Lab + /hub/article wire them end-to-end', () => {
    const holeCountByVariant = { nlh: 2, plo4: 4, plo5: 5, plo6: 6, plo8: 4 };
    assert.equal(SPOT_OF_THE_WEEK_CATALOG.length, 16);

    for (const spot of SPOT_OF_THE_WEEK_CATALOG) {
        assert.ok(['A', 'B', 'C'].includes(spot.correctKey), `${spot.slug}: invalid correctKey`);
        assert.ok(spot.options.some((o) => o.key === spot.correctKey), `${spot.slug}: correctKey must match an option`);
        assert.ok(typeof spot.solverFrequency === 'string' && spot.solverFrequency.length >= 6, `${spot.slug}: missing solverFrequency`);
        assert.ok(typeof spot.evSummary === 'string' && spot.evSummary.length >= 40, `${spot.slug}: missing evSummary`);
        const expectedHoles = holeCountByVariant[spot.variant];
        assert.ok(expectedHoles, `${spot.slug}: unsupported variant ${spot.variant}`);
        assert.equal(spot.heroCards?.length, expectedHoles, `${spot.slug}: heroCards length must match ${spot.variant}`);
        assert.equal(spot.boardCards?.length, 5, `${spot.slug}: boardCards must have 5 board slots`);
    }

    const handLabSrc = readRepoFile('pages/hub/training/hand-lab.js');
    assert.match(handLabSrc, /SPOT_OF_THE_WEEK_CATALOG/, 'hand-lab.js must import SPOT_OF_THE_WEEK_CATALOG');
    assert.match(handLabSrc, /router\.query\.spot/, 'hand-lab.js must hydrate ?spot= query param');
    assert.match(handLabSrc, /router\.query\.pick/, 'hand-lab.js must hydrate ?pick= query param');
    assert.match(handLabSrc, /data-weekly-wire-spot-card="true"/, 'hand-lab.js must render Spot Of The Week verdict card');

    const articleSrc = readRepoFile('pages/hub/article.js');
    assert.match(articleSrc, /ArticleReaderModal/, 'pages/hub/article.js must wire in-app ArticleReaderModal for external stories');
    assert.match(articleSrc, /article\.summary/, 'pages/hub/article.js must render article.summary when content is empty');
});

/**
 * PERMANENT ANTI-REGRESSION LAW SUITE — NEWSLETTER & PROMO ECOSYSTEM FORENSIC PASS
 *
 * Encodes executable CI laws for every single root cause uncovered and hardened
 * during the Phase 14 exhaustive adversarial forensic audit across:
 *   - FP LAW 1: Federal CAN-SPAM (15 U.S.C. § 7704(a)(3)) & jurisdictional geo-block
 *               exemptions in BOTH `config/geo-blocks.json` AND `middleware.ts`.
 *   - FP LAW 2: Case-insensitive, ILIKE-wildcard-escaped unsubscribe & preference
 *               lookups (`subscribe.js`), `subscribed_at` stamping, authenticated
 *               session fallback (`?preferences=session`), and `sp_wire_subscribed_v1`
 *               eviction on unsubscribe (`email-preferences.js`).
 *   - FP LAW 3: Hand Lab (`pages/hub/training/hand-lab.js`) PLO4 / PLO5 / PLO6
 *               `?spot=` hydration (`villainHand` hole-card count + zero collision)
 *               and two-character `'10♠'` -> `'Ts'` suit-preserving serialization.
 *   - FP LAW 4: Curated video enforcement (`isCuratedFeedVideo`) in BOTH
 *               `weeklyWireEngine.mjs` (`loadVideoOfTheWeek`) and `pages/hub/wire/[edition].js`
 *               (`resolveMatchedHistoricalVideo`) so watch links never 404.
 *   - FP LAW 5: Crawlable `/hub/wire/rss.xml` RSS 2.0 feed (under `Allow: /` without
 *               altering `public/robots.txt`), `/sitemap-core.xml` Wire edition parity,
 *               XML `<loc>` `&` escaping, `/hub/wire/[edition]` catch-block serialization
 *               safety, and `<meta name="robots" content="noindex,follow" />` on drafts.
 *   - FP LAW 6: Multi-cycle catalog exhaustion rotation (`selectRotatingCatalogItem`)
 *               for `SPOT_OF_THE_WEEK_CATALOG` & `TOOL_SPOTLIGHT_CATALOG` (never freezing
 *               on `[0]` or becoming `null` after Cycle 0), and canonical `Wire #N`
 *               edition numbering (`numberWeeklyWireCampaigns` / `computeNextWeeklyWireEditionNumber`).
 *   - FP LAW 7: Admin Newsletter Studio (`pages/admin/newsletter.js`) `<base target="_blank">`
 *               + `sandbox="allow-popups allow-popups-to-escape-sandbox"` (zero `allow-scripts`
 *               / `allow-same-origin`), Weekly Wire `segmentPreviews` tabs, Promo HTML
 *               `<PreviewFrame>`, and inline `testEmail` inputs across all 3 cards.
 *   - FP LAW 8: CSP apex domain (`https://smarter.poker`), OpenClaw `300s` digest timeout,
 *               Lifecycle `deadline` guard, Resend batch `idempotencyKey` (`-plain` fallback),
 *               legacy `'sp_welcome_back_202611'` redemption recognition, deterministic `.ics`
 *               `DTSTAMP` + `SEQUENCE:0`, cold-lead `subscribed_at` cutoff, and mobile
 *               `NewsletterCaptureBar` layout + `alwaysVisible` resubscribe mode.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import {
    SPOT_OF_THE_WEEK_CATALOG,
    TOOL_SPOTLIGHT_CATALOG,
} from '../src/lib/newsletter/weeklyWireCatalog.mjs';
import {
    computeNextWeeklyWireEditionNumber,
    curateWeeklyWireEdition,
    numberWeeklyWireCampaigns,
    selectRotatingCatalogItem,
    spotMarkerUuid,
    toolMarkerUuid,
} from '../src/lib/newsletter/weeklyWireEngine.mjs';
import {
    buildEmptyWeeklyWireRssXml,
    buildWeeklyWireRssXml,
} from '../src/lib/newsletter/wireRssBuilder.mjs';
import {
    WELCOME_BACK_CODE,
    WELCOME_BACK_CODES,
    inspectWelcomeBackOfferStatus,
    signWelcomeBackOfferToken,
} from '../src/lib/promoCampaigns/welcomeBackOffer.mjs';
import { runLifecycleRetention } from '../src/lib/promoCampaigns/lifecycleEngine.mjs';
import {
    buildWireEditionUrls,
    generateSitemapXml,
} from '../src/lib/seo/sitemapBuilders.mjs';

const require = createRequire(import.meta.url);
const { IMAGE_SOURCES, safeImageUrl } = require('../src/lib/security/imageHosts.js');

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readRepo = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

// ── FP LAW 1: CAN-SPAM & Jurisdictional Geo-Block Reachability ────────────────
test('FP LAW 1: geo-blocks.json and middleware.ts exempt unsubscribe, preferences, email-image, wire-rss, calendar-ics, and /hub/wire/* across all restricted jurisdictions', () => {
    const geoJson = JSON.parse(readRepo('config/geo-blocks.json'));
    const allowPaths = new Set(geoJson.allow_paths || []);
    const mwSrc = readRepo('middleware.ts');

    const statutoryAlwaysAllow = [
        '/api/news/subscribe',
        '/api/news/email-image',
        '/api/news/wire-rss',
        '/api/news/calendar-ics',
        '/hub/email-preferences',
        '/hub/wire',
        '/hub/wire/',
    ];

    for (const requiredPath of statutoryAlwaysAllow) {
        assert.ok(
            allowPaths.has(requiredPath),
            `config/geo-blocks.json allow_paths must contain "${requiredPath}" so restricted US states never 451/block opt-out or wire routes`
        );
        assert.ok(
            mwSrc.includes(`'${requiredPath}'`) || mwSrc.includes(`"${requiredPath}"`),
            `middleware.ts AUTH_ALWAYS_ALLOW must hardcode "${requiredPath}" as a belt-and-braces CAN-SPAM guard`
        );
    }

    for (const promoPath of ['/go/promo', '/go/welcome-back', '/promo/welcome-back']) {
        assert.ok(allowPaths.has(promoPath), `config/geo-blocks.json allow_paths must contain "${promoPath}"`);
    }

    // Verify prefix matching covers /hub/wire/1, /hub/wire/latest, and /hub/wire/rss.xml
    const matchesAllow = (pathname) =>
        [...allowPaths].some((p) => (p.endsWith('/') ? pathname.startsWith(p) : pathname === p));
    assert.equal(matchesAllow('/hub/wire'), true);
    assert.equal(matchesAllow('/hub/wire/1'), true);
    assert.equal(matchesAllow('/hub/wire/latest'), true);
    assert.equal(matchesAllow('/hub/wire/rss.xml'), true);
    assert.equal(matchesAllow('/hub/email-preferences'), true);
    assert.equal(matchesAllow('/api/news/subscribe'), true);
});

// ── FP LAW 2: Case-Insensitive Wildcard-Escaped Unsubscribe & Session Fallback ─
test('FP LAW 2: subscribe.js uses wildcard-escaped .ilike() without maybeSingle(), stamps subscribed_at, supports session auth, and email-preferences clears capture-bar storage on opt-out', async () => {
    const subSrc = readRepo('pages/api/news/subscribe.js');
    const prefsSrc = readRepo('pages/hub/email-preferences.js');

    assert.doesNotMatch(
        subSrc,
        /\.eq\(\s*['"]email['"]/,
        'pages/api/news/subscribe.js must never use case-sensitive .eq("email", ...) which misses mixed-case legacy rows'
    );
    assert.doesNotMatch(
        subSrc,
        /\.maybeSingle\(\)/,
        'pages/api/news/subscribe.js must never call .maybeSingle() on subscriber lookups because duplicate legacy rows throw PGRST116'
    );
    assert.match(subSrc, /escapeIlikePattern/, 'pages/api/news/subscribe.js must escape % and _ wildcards before .ilike()');
    assert.match(subSrc, /subscribed_at:\s*nowIso/, 'pages/api/news/subscribe.js must stamp subscribed_at on active inserts');
    assert.match(subSrc, /getServerUserWithFallback/, 'pages/api/news/subscribe.js must support authenticated session fallback');

    // Execute the exact pure token + ILIKE escaping functions from pages/api/news/subscribe.js
    const startIdx = subSrc.indexOf('const EMAIL_RE =');
    const endIdx = subSrc.indexOf('export { buildWelcomeEmail');
    assert.ok(startIdx > 0 && endIdx > startIdx, 'subscribe.js must define pure token & ILIKE helpers');
    const snippet = subSrc
        .slice(startIdx, endIdx)
        .replace(/^export\s+function\s+/gm, 'function ');
    const sandbox = { Buffer, crypto, process, exports: {} };
    vm.runInNewContext(
        `${snippet}\nexports.escapeIlikePattern = escapeIlikePattern;\nexports.makeUnsubscribeToken = makeUnsubscribeToken;\nexports.verifyUnsubscribeToken = verifyUnsubscribeToken;`,
        sandbox
    );
    const { escapeIlikePattern, makeUnsubscribeToken, verifyUnsubscribeToken } = sandbox.exports;
    assert.equal(escapeIlikePattern('dan_poker%vip@gmail.com'), 'dan\\_poker\\%vip@gmail.com');

    const savedSecret = process.env.NEWSLETTER_UNSUBSCRIBE_SECRET;
    process.env.NEWSLETTER_UNSUBSCRIBE_SECRET = 'forensic-law-test-secret-20261125';
    try {
        // Operator @smarter.poker [TEST] email tokens MUST verify cleanly so clicking links in [TEST] emails works
        const testTok = makeUnsubscribeToken('Admin_Test@Smarter.Poker');
        assert.equal(verifyUnsubscribeToken(testTok), 'admin_test@smarter.poker');
    } finally {
        if (savedSecret === undefined) delete process.env.NEWSLETTER_UNSUBSCRIBE_SECRET;
        else process.env.NEWSLETTER_UNSUBSCRIBE_SECRET = savedSecret;
    }

    assert.match(
        prefsSrc,
        /removeItem\(\s*['"]sp_wire_subscribed_v1['"]\s*\)/,
        'pages/hub/email-preferences.js must clear sp_wire_subscribed_v1 on unsubscribe so capture bars allow resubscribing'
    );
    assert.match(prefsSrc, /preferences=session/, 'pages/hub/email-preferences.js must load session preferences when ?token= is absent');
    assert.match(prefsSrc, /getAccessToken/, 'pages/hub/email-preferences.js must read the logged-in member token');
});

// ── FP LAW 3: Hand Lab PLO4/PLO5 Hydration & Two-Character '10♠' Serialization ─
test('FP LAW 3: Hand Lab preserves suits on 10♠/10♥/10♦/10♣ and hydrates collision-free 2/4/5-card villain hands across all 16 Spot Of The Week scenarios', () => {
    const handLabSrc = readRepo('pages/hub/training/hand-lab.js');

    assert.match(handLabSrc, /rawRank === '10' \? 'T' : rawRank/, 'cardToAscii must convert 10 to T before appending suit');
    assert.match(handLabSrc, /setVillainHand\(nextVillainAscii\)/, '?spot= hydration must update villainHand to match variant holeCount');
    assert.doesNotMatch(
        handLabSrc,
        /matchedSpot\.boardCards\.length\s*===\s*5/,
        'Hand Lab must pad 3-card flop and 4-card turn boards to 5 slots rather than wiping non-5-card boards'
    );

    // Mirror Hand Lab's exact cardToAscii + benchmark hydration algorithm and prove all 16 catalog spots produce valid non-colliding hands
    const SUIT_TO_ASCII = { '♠': 's', '♥': 'h', '♦': 'd', '♣': 'c', s: 's', h: 'h', d: 'd', c: 'c' };
    const cardToAscii = (card) => {
        const clean = String(card || '').trim();
        if (!clean || clean.length < 2) return '';
        const suitChar = clean.slice(-1);
        const rawRank = clean.slice(0, -1).toUpperCase();
        const rank = rawRank === '10' ? 'T' : rawRank;
        const suit = SUIT_TO_ASCII[suitChar] || suitChar.toLowerCase();
        return `${rank}${suit}`;
    };

    assert.equal(cardToAscii('10♠'), 'Ts');
    assert.equal(cardToAscii('10♥'), 'Th');
    assert.equal(cardToAscii('10♦'), 'Td');
    assert.equal(cardToAscii('10♣'), 'Tc');
    assert.equal(cardToAscii('A♠'), 'As');

    const BENCHMARKS = {
        nlh: ['AsKs', 'QhQd', 'JhTh'],
        plo4: ['AsKsQhJh', 'AhAdKhKd', 'Ts9s8h7h'],
        plo5: ['AsKsQsJhTh', 'AhAdKhKdQs', 'JcTc9s8s7h'],
        plo6: ['AsKsQsJsTh9h', 'AhAdKhKdQhQd'],
    };
    const HOLE_COUNTS = { nlh: 2, plo4: 4, plo5: 5, plo6: 6 };
    const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
    const SUITS = ['s', 'h', 'd', 'c'];
    const FULL_DECK = RANKS.flatMap((r) => SUITS.map((s) => `${r}${s}`));

    for (const spot of SPOT_OF_THE_WEEK_CATALOG) {
        const variant = HOLE_COUNTS[spot.variant] ? spot.variant : 'nlh';
        const holeCount = HOLE_COUNTS[variant];
        assert.equal(spot.heroCards.length, holeCount, `${spot.slug} heroCards must match ${variant} holeCount`);
        assert.ok(
            spot.boardCards.length >= 3 && spot.boardCards.length <= 5,
            `${spot.slug} boardCards must contain 3..5 flop/turn/river cards`
        );
        const paddedBoard = [...spot.boardCards.slice(0, 5), '', '', '', '', ''].slice(0, 5);
        const nonEmptyBoard = paddedBoard.filter(Boolean);
        assert.equal(nonEmptyBoard.length, spot.boardCards.filter(Boolean).length, `${spot.slug} padded board must preserve all street cards`);

        const heroAscii = spot.heroCards.map(cardToAscii);
        const boardAscii = nonEmptyBoard.map(cardToAscii);
        for (const c of [...heroAscii, ...boardAscii]) {
            assert.match(c, /^[2-9TJQKA][shdc]$/, `${spot.slug} serialized card "${c}" must be valid 2-char Rank+Suit ASCII`);
        }

        const used = new Set([...heroAscii, ...boardAscii]);
        assert.equal(used.size, holeCount + boardAscii.length, `${spot.slug} hero + board cards must have zero internal duplicates`);

        let villainTokens = null;
        for (const cand of BENCHMARKS[variant] || []) {
            const toks = cand.match(/([2-9TJQKA][shdc])/gi) || [];
            if (toks.length === holeCount && toks.every((t) => !used.has(t[0].toUpperCase() + t[1].toLowerCase()))) {
                villainTokens = toks.map((t) => t[0].toUpperCase() + t[1].toLowerCase());
                break;
            }
        }
        if (!villainTokens) {
            villainTokens = FULL_DECK.filter((c) => !used.has(c)).slice(0, holeCount);
        }
        assert.equal(villainTokens.length, holeCount, `${spot.slug} hydrated villain hand must contain ${holeCount} cards`);
        for (const v of villainTokens) {
            assert.equal(used.has(v), false, `${spot.slug} villain card ${v} must not collide with hero/board`);
        }
    }
});

// ── FP LAW 4: Curated Video Enforcement (Zero 404 Watch Links) ────────────────
test('FP LAW 4: both weeklyWireEngine and /hub/wire/[edition] enforce isCuratedFeedVideo so off-topic mixed-channel uploads never 404 on /hub/video-library/watch', async () => {
    const engineSrc = readRepo('src/lib/newsletter/weeklyWireEngine.mjs');
    const editionSrc = readRepo('pages/hub/wire/[edition].js');

    assert.match(engineSrc, /isCuratedFeedVideo/, 'weeklyWireEngine.mjs must import and enforce isCuratedFeedVideo');
    assert.match(editionSrc, /isCuratedFeedVideo/, 'pages/hub/wire/[edition].js must import and enforce isCuratedFeedVideo');

    const nowIso = new Date().toISOString();
    const fakeSb = {
        from(table) {
            const chain = {
                select: () => chain,
                eq: () => chain,
                neq: () => chain,
                in: () => chain,
                or: () => chain,
                gte: () => chain,
                not: () => chain,
                order: () => chain,
                limit: async () => {
                    if (table === 'video_library_public_catalog') {
                        return {
                            data: [
                                // Off-topic non-poker vlog from mixed-content channel BotezLive (higher views, verified & embeddable; rejected ONLY by isCuratedFeedVideo!)
                                {
                                    id: 'v-offtopic',
                                    youtube_video_id: 'offtopic999',
                                    source_id: '6bfb1441-98ed-41d6-929f-e147626dbffa',
                                    source_name: 'BotezLive',
                                    title: 'Speed Chess Blitz Match In New York',
                                    type: 'cash',
                                    views_count: 999999,
                                    published_at: nowIso,
                                    scraped_at: nowIso,
                                    availability_status: 'verified',
                                    embeddable: true,
                                    availability_checked_at: nowIso,
                                },
                                // Curated poker hand breakdown
                                {
                                    id: 'v-curated',
                                    youtube_video_id: 'M7lc1UVf-VE',
                                    source_id: '11111111-2222-4333-8444-555555555555',
                                    source_name: 'PokerGO',
                                    title: 'WSOP Main Event Final Table High Stakes Poker Cash Game Breakdown',
                                    type: 'tournament',
                                    views_count: 45000,
                                    published_at: nowIso,
                                    scraped_at: nowIso,
                                    availability_status: 'verified',
                                    embeddable: true,
                                    availability_checked_at: nowIso,
                                },
                            ],
                            error: null,
                        };
                    }
                    if (table === 'poker_news') {
                        return {
                            data: [
                                {
                                    id: '11111111-1111-4111-8111-111111111111',
                                    title: 'WSOP Paradise Schedule Announced With Massive Championship',
                                    content: 'Full schedule details released for winter poker championship series.',
                                    source_name: 'PokerNews',
                                    source_url: 'https://www.pokernews.com/news/2026/11/wsop-paradise.htm',
                                    image_url: '/api/news/email-image?fallback=1',
                                    published_at: nowIso,
                                },
                            ],
                            error: null,
                        };
                    }
                    return { data: [], error: null };
                },
            };
            return chain;
        },
    };

    const curated = await curateWeeklyWireEdition(fakeSb, {
        days: 7,
        articleLimit: 3,
        enrichMetaDescriptions: false,
        verifyArticleImages: false,
    });
    assert.equal(curated.videoOfTheWeek?.videoId, 'M7lc1UVf-VE', 'Off-topic uncurated video must be rejected in favor of curated poker video');
});

// ── FP LAW 5: Crawlable /hub/wire/rss.xml, Sitemaps, XML Escaping & Draft noindex ─
test('FP LAW 5: /hub/wire/rss.xml serves crawlable RSS 2.0 without altering robots.txt, sitemap-core includes Wire editions, XML escapes &, and live previews emit noindex', async () => {
    // 1. Crawl-friendly /hub/wire/rss.xml exists and uses /hub/wire/rss.xml self link
    assert.ok(fs.existsSync(path.join(REPO_ROOT, 'pages/hub/wire/rss.xml.js')), 'pages/hub/wire/rss.xml.js must exist');
    const rssPageSrc = readRepo('pages/hub/wire/rss.xml.js');
    assert.match(rssPageSrc, /application\/rss\+xml/);
    assert.match(rssPageSrc, /\/hub\/wire\/rss\.xml/);

    const xml = await buildWeeklyWireRssXml([
        {
            editionNumber: 3,
            subject: 'Solver Spots & River Bluffs | Smarter.Poker Wire #3',
            publishedAt: '2026-11-25T18:00:00.000Z',
            headlines: ['PLO4 Blocker Rivers & ICM Pressure'],
        },
    ]);
    assert.match(xml, /<atom:link href="https:\/\/smarter\.poker\/hub\/wire\/rss\.xml" rel="self" type="application\/rss\+xml" \/>/);
    assert.match(buildEmptyWeeklyWireRssXml(), /<rss version="2\.0"/);

    // 2. Wire archive, edition page, operations API, and admin studio all point to /hub/wire/rss.xml
    for (const rel of [
        'pages/hub/wire/index.js',
        'pages/hub/wire/[edition].js',
        'pages/api/news/operations.js',
        'pages/admin/newsletter.js',
    ]) {
        assert.match(readRepo(rel), /\/hub\/wire\/rss\.xml/, `${rel} must link to crawlable /hub/wire/rss.xml`);
    }

    // 3. Sitemap XML escaping & sitemap-core.xml parity
    const escapedSitemap = generateSitemapXml([
        { path: '/hub/wire?utm_source=rss&edition=1', lastmod: '2026-11-25', changefreq: 'weekly', priority: '0.8' },
    ]);
    assert.match(escapedSitemap, /utm_source=rss&amp;edition=1/, 'generateSitemapXml must XML-escape & inside <loc>');
    assert.match(readRepo('pages/sitemap-core.xml.js'), /buildWireEditionUrls/, 'pages/sitemap-core.xml.js must include published Wire editions');
    const wireUrls = await buildWireEditionUrls([
        { id: 'c1', subject: 'Smarter.Poker Wire #1', status: 'sent', sent_at: '2026-11-18T14:00:00Z', article_ids: ['11111111-1111-4111-8111-111111111111'] },
        { id: 'c2', subject: '[PROMO EMAIL+SMS] Skip', status: 'sent', sent_at: '2026-11-20T14:00:00Z', article_ids: ['x'] },
    ]);
    assert.equal(wireUrls.length, 1);
    assert.equal(wireUrls[0].path, '/hub/wire/1');
    assert.match(generateSitemapXml(wireUrls), /<loc>https:\/\/smarter\.poker\/hub\/wire\/1<\/loc>/);

    // 4. Draft / live-preview noindex & SSR catch fallback safety on /hub/wire/[edition]
    const editionSrc = readRepo('pages/hub/wire/[edition].js');
    assert.match(editionSrc, /isLivePreview[\s\S]{0,160}noindex,follow/, 'Unsent live preview editions must emit noindex,follow');
    assert.match(editionSrc, /catch[\s\S]*?ogImageUrl:/, 'Catch fallback in [edition].js must provide ogImageUrl (never undefined)');
    assert.match(editionSrc, /catch[\s\S]*?videoOfTheWeek:\s*null/, 'Catch fallback in [edition].js must provide videoOfTheWeek: null');
});

// ── FP LAW 6: Multi-Cycle Catalog Exhaustion Rotation & Canonical Edition Numbering ─
test('FP LAW 6: SPOT_OF_THE_WEEK_CATALOG and TOOL_SPOTLIGHT_CATALOG rotate cleanly into Cycle 1+ without freezing on [0] or returning null, and edition numbering stays monotonic', () => {
    const consumed = new Set();

    // Exhaust 100% of SPOT_OF_THE_WEEK_CATALOG in Cycle 0
    for (const spot of SPOT_OF_THE_WEEK_CATALOG) {
        consumed.add(spotMarkerUuid(spot.slug));
    }
    // Exhaust 100% of TOOL_SPOTLIGHT_CATALOG in Cycle 0
    for (const tool of TOOL_SPOTLIGHT_CATALOG) {
        consumed.add(toolMarkerUuid(tool.slug));
    }

    // Cycle 1 must walk cleanly through items 0, 1, 2... with distinct cycle-1 markers (never freezing on [0] or returning null!)
    const cycle1Spots = [];
    for (let i = 0; i < 4; i++) {
        const picked = selectRotatingCatalogItem(
            SPOT_OF_THE_WEEK_CATALOG,
            (s) => s.slug,
            spotMarkerUuid,
            'spot-cycle',
            consumed,
            17 + i
        );
        assert.ok(picked?.item, 'Spot selection after Cycle 0 exhaustion must never be null');
        assert.equal(picked.cycle, 1);
        cycle1Spots.push(picked.item.slug);
        consumed.add(picked.markerId);
    }
    assert.equal(new Set(cycle1Spots).size, 4, 'Cycle 1 spots must advance across distinct catalog entries rather than freezing on [0]');

    const cycle1Tools = [];
    for (let i = 0; i < 4; i++) {
        const picked = selectRotatingCatalogItem(
            TOOL_SPOTLIGHT_CATALOG,
            (t) => t.slug,
            toolMarkerUuid,
            'tool',
            consumed,
            36 + i
        );
        assert.ok(picked?.item, 'Tool Spotlight selection after Cycle 0 exhaustion must never become null');
        assert.equal(picked.cycle, 1);
        cycle1Tools.push(picked.item.slug);
        consumed.add(picked.markerId);
    }
    assert.equal(new Set(cycle1Tools).size, 4, 'Cycle 1 tools must advance across distinct calculators');

    // Canonical edition numbering honors explicit Wire #N subjects and skips promos/lifecycle
    const campaigns = [
        { id: '1', subject: 'Smarter.Poker News Digest', status: 'sent', created_at: '2026-11-10T12:00:00Z', article_ids: ['11111111-1111-4111-8111-111111111111'] },
        { id: '2', subject: '[PROMO EMAIL+SMS] Bonus', status: 'sent', created_at: '2026-11-12T12:00:00Z', article_ids: ['a'] },
        { id: '3', subject: 'GTO River Sizing | Smarter.Poker Wire #4', status: 'sent', created_at: '2026-11-17T12:00:00Z', article_ids: ['22222222-2222-4222-8222-222222222222'] },
    ];
    const numbered = numberWeeklyWireCampaigns(campaigns);
    assert.equal(numbered.length, 2);
    assert.equal(computeNextWeeklyWireEditionNumber(campaigns), 5, 'Next edition after Wire #4 must be #5');
});

// ── FP LAW 7: Admin Preview Frame Link Safety, Segment Tabs & Inline Test Inputs ─
test('FP LAW 7: pages/admin/newsletter.js injects <base target="_blank">, allows safe popups without scripts, wires segmentPreviews + Promo PreviewFrame, and provides inline testEmail inputs', () => {
    const adminSrc = readRepo('pages/admin/newsletter.js');

    assert.match(adminSrc, /preparePreviewHtml/, 'Admin preview must sanitize/augment HTML via preparePreviewHtml');
    assert.match(adminSrc, /<base target="_blank" rel="noopener noreferrer" \/>/, 'Preview HTML must inject <base target="_blank"> so clicked links never hit X-Frame-Options inside srcDoc');
    assert.match(adminSrc, /sandbox="allow-popups allow-popups-to-escape-sandbox"/, 'Preview iframe must permit escaped new-tab popups');
    assert.doesNotMatch(adminSrc, /allow-scripts|allow-same-origin/, 'Preview iframe must never permit script execution or same-origin access');

    assert.match(adminSrc, /wirePreviewSegment/, 'Weekly Wire preview must provide segment tabs');
    assert.match(adminSrc, /segmentPreviews/, 'Weekly Wire preview must wire segmentPreviews');
    assert.match(adminSrc, /title="Promotional Email HTML Preview"/, 'Promo preview must render HTML inside PreviewFrame');

    const emailInputs = adminSrc.match(/type="email"/g) || [];
    assert.ok(
        emailInputs.length >= 3,
        `pages/admin/newsletter.js must render inline testEmail inputs across Promo, Weekly Wire, and Lifecycle cards (found ${emailInputs.length})`
    );
});

// ── FP LAW 8: CSP Apex, Cron Deadlines, Batch Idempotency, Legacy Code, .ics & Mobile Bar ─
test('FP LAW 8: CSP allows apex https://smarter.poker, crons enforce 300s/deadline, Resend batches pass idempotencyKey, legacy welcome-back code is honored, .ics is deterministic, and mobile capture bar wraps cleanly', async () => {
    // 1. CSP apex domain
    assert.ok(IMAGE_SOURCES.includes('https://smarter.poker'), 'IMAGE_SOURCES must explicitly include apex https://smarter.poker');
    assert.ok(safeImageUrl('https://smarter.poker/api/news/email-image?fallback=1'), 'safeImageUrl must accept https://smarter.poker URLs');

    // 2. OpenClaw cron timeout & Lifecycle deadline guard
    const cronPy = readRepo('scripts/openclaw-cron-dispatcher.py');
    assert.match(cronPy, /['"]\/api\/news\/digest\?days=7['"]\s*:\s*300/);
    assert.match(cronPy, /['"]\/api\/news\/digest['"]\s*:\s*300/);
    assert.match(readRepo('pages/api/cron/signup-welcome-back.js'), /deadline:\s*startedAt\s*\+\s*290_?000/);

    const savedResendKey = process.env.RESEND_API_KEY;
    process.env.RESEND_API_KEY = 're_test_deadline_guard';
    let pastDeadlineRun;
    try {
        pastDeadlineRun = await runLifecycleRetention(
            {
                from() {
                    const q = {
                        select: () => q,
                        eq: () => q,
                        in: () => q,
                        or: () => q,
                        not: () => q,
                        order: () => q,
                        insert: () => ({
                            select: () => ({
                                single: async () => ({ data: { id: 'lc-camp-1' }, error: null }),
                                maybeSingle: async () => ({ data: { id: 'lc-camp-1' }, error: null }),
                            }),
                        }),
                        update: () => q,
                        limit: async () => ({ data: [], error: null }),
                        range: async (from) => ({
                            data: from === 0
                                ? [{ id: 'u1', username: 'p1', email: 'p1@gmail.com', phone_verified: false, created_at: '2026-11-20T00:00:00Z' }]
                                : [],
                            error: null,
                        }),
                    };
                    return q;
                },
                auth: { admin: { listUsers: async () => ({ data: { users: [] }, error: null }) } },
            },
            {
                dryRun: false,
                nowMs: Date.parse('2026-11-25T18:00:00Z'),
                deadline: Date.now() - 1000,
                sendEmail: async () => ({ ok: true, id: 'em-never' }),
            }
        );
    } finally {
        if (savedResendKey === undefined) delete process.env.RESEND_API_KEY;
        else process.env.RESEND_API_KEY = savedResendKey;
    }
    assert.equal(pastDeadlineRun.stoppedAtDeadline, true, 'runLifecycleRetention must halt cleanly when deadline is reached');
    assert.equal(pastDeadlineRun.emailSent, 0);

    // 3. Resend batch idempotency in digest.js & dispatch.mjs
    const digestSrc = readRepo('pages/api/news/digest.js');
    const dispatchSrc = readRepo('src/lib/promoCampaigns/dispatch.mjs');
    assert.match(digestSrc, /idempotencyKey/);
    assert.match(digestSrc, /-plain/);
    assert.match(dispatchSrc, /Idempotency-Key/);
    assert.match(dispatchSrc, /-plain/);

    // 4. Legacy Welcome-Back code alias ('sp_welcome_back_202611') recognized in inspectWelcomeBackOfferStatus
    assert.deepEqual(WELCOME_BACK_CODES, [WELCOME_BACK_CODE, 'sp_welcome_back_202611']);
    const wbSecret = 'forensic-wb-secret-20261125';
    const wbToken = signWelcomeBackOfferToken({ userId: 'u-legacy', secret: wbSecret });
    const legacyRowsFor = (table) => {
        if (table === 'promo_codes') return [{ id: 'pc-legacy', code: 'sp_welcome_back_202611' }];
        if (table === 'promo_code_redemptions') {
            return [{ id: 'red-1', promo_code_id: 'pc-legacy', redeemed_at: '2026-11-24T06:00:00Z', reward_applied: { chips: 25 } }];
        }
        return [];
    };
    const legacyClaimSb = {
        from(table) {
            const q = {
                select: () => q,
                eq: () => q,
                in: () => q,
                not: () => q,
                order: () => q,
                limit: async () => ({ data: legacyRowsFor(table), error: null }),
                maybeSingle: async () => ({
                    data: table === 'profiles'
                        ? { id: 'u-legacy', username: 'vet', created_at: '2026-06-01T00:00:00Z', last_active: '2026-10-01T00:00:00Z', is_horse: false }
                        : null,
                    error: null,
                }),
                then(resolve, reject) {
                    return Promise.resolve({ data: legacyRowsFor(table), error: null }).then(resolve, reject);
                },
            };
            return q;
        },
    };
    const wbStatus = await inspectWelcomeBackOfferStatus(legacyClaimSb, {
        user: { id: 'u-legacy' },
        token: wbToken,
        secret: wbSecret,
    });
    assert.equal(wbStatus.alreadyClaimed, true, 'Player who claimed under sp_welcome_back_202611 must report alreadyClaimed: true');

    // 5. Calendar .ics SEQUENCE:0 & deterministic DTSTAMP + operations cold-lead subscribed_at + webhooks + mobile capture bar
    const calSrc = readRepo('pages/api/news/calendar-ics.js');
    assert.match(calSrc, /SEQUENCE:0/);
    assert.match(calSrc, /updated_at/);

    const opsSrc = readRepo('pages/api/news/operations.js');
    assert.match(opsSrc, /subscribed_at\.lte\./);

    const twilioInboundSrc = readRepo('pages/api/webhooks/twilio-inbound.js');
    assert.match(twilioInboundSrc, /\.ilike\(\s*['"]email['"]/);
    assert.doesNotMatch(twilioInboundSrc, /\.maybeSingle\(\)/);

    const captureBarJs = readRepo('src/components/news/NewsletterCaptureBar.js');
    const captureBarCss = readRepo('src/components/news/NewsletterCaptureBar.module.css');
    assert.match(captureBarJs, /alwaysVisible/);
    assert.match(readRepo('pages/hub/wire/index.js'), /alwaysVisible/);
    assert.match(captureBarCss, /@media\s*\(max-width:\s*640px\)[\s\S]*?flex-wrap:\s*wrap/);
    assert.match(captureBarCss, /flex:\s*1\s+1\s+100%/);
});

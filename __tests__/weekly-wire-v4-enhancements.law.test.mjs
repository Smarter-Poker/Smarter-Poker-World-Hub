/**
 * WEEKLY WIRE V4 COMPLETE ENHANCEMENT & ANTI-REGRESSION LAW SUITE (2026-11-25)
 *
 * Permanently guards all 7 Weekly Wire V4 & Deliverability upgrades:
 *   1. Pure-vector (zero <text>/<tspan>) 600x240 poker-felt Spot Of The Week card
 *      renderer (`spotCardSvg.mjs` + signed `/api/news/email-image?spot=<slug>&s=<hmac>`),
 *      supporting 2-card NLH, 4-card PLO4, and 5-card PLO5 hands + 0..5 board cards.
 *   2. Kings Club (`25450`) live tournament schedule curation + RFC 5545 `.ics`
 *      Add To Calendar endpoint (`/api/news/calendar-ics?tid=<uuid>`) with Chips-only
 *      formatting (never `$` currency symbols on chips, never em dashes).
 *   3. Geo-personalized `Live Poker Near You This Week` matching `profiles` location
 *      (`state`, `city`, `poker_near_me_preferences`) against `unified_events_calendar`.
 *   4. Viral subscriber referral milestones (`public.referrals` completed count +
 *      tiered progress bar in `Share & Earn Free Diamonds`).
 *   5. Top Poker Video Of The Week (`video_library_public_catalog` + permanent
 *      `videoMarkerUuid` Zero-Repeat Ledger, never touching `social_reels` or `origin_type`).
 *   6. SEO compounding: RSS 2.0 syndication (`/api/news/wire-rss`), XML sitemaps
 *      (`/hub/wire` + `/hub/wire/<edition>` with real `lastmod`), and escaped JSON-LD.
 *   7. Sender-reputation shield (`evaluateColdSubscriberSunset` 90d re-permission /
 *      120d sunset, Resend webhook `engaged:YYYY-MM-DD` stamping, 1-click `?keep=`
 *      confirmation, live DNS DMARC/BIMI readiness, and sandboxed Desktop/Mobile
 *      email preview iframes in `/admin/newsletter`).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import sharp from 'sharp';

import emailImageHandler from '../pages/api/news/email-image.js';
import {
    buildTournamentIcs,
    escapeIcsText,
    foldIcsLine,
    formatBuyIn,
    formatGuarantee,
} from '../pages/api/news/calendar-ics.js';
import {
    SPOT_IMAGE_DIMENSIONS,
    buildSpotCardImageUrl,
    computeSpotCardImageSignature,
    renderSpotCardImage,
    verifySpotCardImageSignature,
} from '../src/lib/newsletter/emailImageProxy.mjs';
import { buildSpotFeltSvg, parseCardToken } from '../src/lib/newsletter/spotCardSvg.mjs';
import { SPOT_OF_THE_WEEK_CATALOG } from '../src/lib/newsletter/weeklyWireCatalog.mjs';
import {
    KINGS_CLUB_UUID,
    buildPromoBlockForSegment,
    computeReferralMilestone,
    curateWeeklyWireEdition,
    evaluateColdSubscriberSunset,
    isWeeklyWireDigestCampaign,
    matchRecipientNearbyEvents,
    normalizeKingsClubTournament,
    normalizeUsStateCode,
    renderWeeklyWireEmail,
    resolveProfileLocation,
    resolveWeeklyWireRecipients,
    videoMarkerUuid,
} from '../src/lib/newsletter/weeklyWireEngine.mjs';
import { STATIC_PAGES } from '../src/lib/seo/sitemapBuilders.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readRepo = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const FORBIDDEN_PALETTE_HEX_RE = /#(?:fbbf24|f59e0b|eab308|fde047|facc15|c084fc|a855f7|9333ea|8b5cf6|7c3aed)\b/i;

async function callEmailImage(query = {}, method = 'GET') {
    let statusCode = 200;
    const headers = {};
    let body = null;
    const req = { method, query, headers: { referer: 'https://mail.google.com/' } };
    const res = {
        setHeader(k, v) {
            headers[String(k).toLowerCase()] = v;
        },
        status(c) {
            statusCode = c;
            return this;
        },
        json(p) {
            body = p;
            return this;
        },
        send(p) {
            body = p;
            return this;
        },
        end() {
            return this;
        },
    };
    await emailImageHandler(req, res);
    return { statusCode, headers, body };
}

function loadWireRssHelpers() {
    const raw = readRepo('pages/api/news/wire-rss.js')
        .replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
        .replace(/export\s+default\s+async\s+function\s+handler[\s\S]*$/m, '')
        .replace(/\bexport\s+function\s+/g, 'function ');
    const ctx = {
        isWeeklyWireDigestCampaign,
        Date,
        Number,
        String,
        Array,
        Set,
        Map,
        RegExp,
        parseInt,
    };
    ctx.globalThis = ctx;
    vm.runInNewContext(
        `${raw}\nglobalThis.__rss = { escapeXml, numberWeeklyWireEditions, buildWeeklyWireRssXml };`,
        ctx
    );
    return ctx.__rss;
}

function loadResendEngagementHelpers() {
    const raw = readRepo('pages/api/webhooks/resend.js')
        .replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
        .replace(/^export\s+\{[\s\S]*?\};\s*$/gm, '')
        .replace(/export\s+const\s+config\s*=[\s\S]*?;\s*\n/, '')
        .replace(/export\s+default\s+async\s+function\s+handler[\s\S]*$/m, '')
        .replace(/\bexport\s+(async\s+)?function\s+/g, '$1function ');
    const ctx = {
        Buffer,
        Date,
        Number,
        String,
        Array,
        Set,
        RegExp,
        console,
    };
    ctx.globalThis = ctx;
    vm.runInNewContext(
        `${raw}\nglobalThis.__eng = { isEngagementStampableSource, stampSubscriberEngagement };`,
        ctx
    );
    return ctx.__eng;
}

// ── LAW 1: Pure-Vector Spot Of The Week Felt Graphic & Signed Endpoint ───────
test('V4 LAW 1: all 16 Spot Of The Week catalog spots render pure-vector (zero <text>) 600x240 JPEGs with HMAC verification', async () => {
    assert.deepEqual(SPOT_IMAGE_DIMENSIONS, { width: 600, height: 240 });
    assert.ok(SPOT_OF_THE_WEEK_CATALOG.length >= 16);

    assert.deepEqual(parseCardToken('A♠'), { rank: 'A', suit: 's' });
    assert.deepEqual(parseCardToken('T♣'), { rank: 'T', suit: 'c' });
    assert.equal(parseCardToken(''), null);

    for (const spot of SPOT_OF_THE_WEEK_CATALOG) {
        const svg = buildSpotFeltSvg(spot);
        assert.doesNotMatch(svg, /<\s*(?:text|tspan)\b/i, `Spot ${spot.slug} must use pure vector paths (zero <text>)`);
        assert.doesNotMatch(svg, FORBIDDEN_PALETTE_HEX_RE, `Spot ${spot.slug} must never use yellow or purple hexes`);

        const rendered = await renderSpotCardImage(spot);
        assert.equal(rendered.status, 'spot');
        assert.equal(rendered.contentType, 'image/jpeg');
        const meta = await sharp(rendered.buffer).metadata();
        assert.equal(meta.format, 'jpeg');
        assert.equal(meta.width, 600);
        assert.equal(meta.height, 240);

        const signedUrl = buildSpotCardImageUrl(spot.slug);
        const parsed = new URL(signedUrl);
        assert.equal(parsed.origin, 'https://smarter.poker');
        assert.equal(parsed.pathname, '/api/news/email-image');
        assert.equal(parsed.searchParams.get('spot'), spot.slug);
        const sig = parsed.searchParams.get('s');
        assert.ok(verifySpotCardImageSignature(spot.slug, sig)?.slug === spot.slug);
    }

    // API handler serves 200 image/jpeg for signed spot and rejects unsigned/forged/unknown
    const firstSpot = SPOT_OF_THE_WEEK_CATALOG[0];
    const validSig = computeSpotCardImageSignature(firstSpot.slug);
    const okRes = await callEmailImage({ spot: firstSpot.slug, s: validSig });
    assert.equal(okRes.statusCode, 200);
    assert.equal(okRes.headers['content-type'], 'image/jpeg');
    assert.equal(okRes.headers['x-image-status'], 'spot');

    const badSigRes = await callEmailImage({ spot: firstSpot.slug, s: 'x'.repeat(43) });
    assert.equal(badSigRes.statusCode, 403);

    const unknownSlugUrl = buildSpotCardImageUrl('non-existent-spot-slug');
    assert.match(unknownSlugUrl, /fallback=1&m=hero/);
});

// ── LAW 2: Kings Club Schedule & RFC 5545 `.ics` Calendar Feed ───────────────
test('V4 LAW 2: Kings Club tournament curation & RFC 5545 calendar-ics enforce CRLF, 75-octet folding, 15m VALARM, and Chips-only formatting', () => {
    assert.equal(KINGS_CLUB_UUID, 'a41434bb-8d0c-400a-8f0d-e8b3d65afed4');

    const sampleTournament = {
        id: '12345678-1234-4234-8234-123456789abc',
        name: 'Kings Club Sunday Major Championship With Deep Stacks, Semi-Colons; And Long Title Folding Check',
        game_type: 'NLH',
        buy_in_amount: 500,
        buy_in_fee: 50,
        guaranteed_prize: 25000,
        start_time: '2026-11-29T01:00:00.000Z',
        status: 'ANNOUNCED',
    };

    assert.equal(formatBuyIn(sampleTournament), '500 + 50 Chips');
    assert.equal(formatBuyIn({ buy_in_amount: 0, buy_in_fee: 0 }), 'Freeroll');
    assert.equal(formatGuarantee(sampleTournament), '25,000 Chips GTD');

    const ics = buildTournamentIcs(sampleTournament, { now: new Date('2026-11-25T20:00:00Z') });
    assert.ok(ics.includes('\r\n'), '.ics must use CRLF line endings');
    assert.match(ics, /BEGIN:VCALENDAR\r\n/);
    assert.match(ics, /BEGIN:VEVENT\r\n/);
    assert.match(ics, /UID:12345678-1234-4234-8234-123456789abc@smarter\.poker\r\n/);
    assert.match(ics, /DTSTART:20261129T010000Z\r\n/);
    assert.match(ics, /DTEND:20261129T030000Z\r\n/);
    assert.match(ics, /TRIGGER:-PT15M\r\n/);
    assert.doesNotMatch(ics, /\$\d/, 'Chips in Club Arena .ics must never carry a $ currency symbol');
    assert.doesNotMatch(ics, /[—–]/, '.ics must not contain em/en dashes');

    for (const physicalLine of ics.split('\r\n')) {
        assert.ok(
            Buffer.byteLength(physicalLine, 'utf8') <= 75,
            `RFC 5545 line exceeded 75 octets: ${physicalLine}`
        );
    }

    assert.equal(buildTournamentIcs({ ...sampleTournament, status: 'CANCELLED' }), null);
    assert.equal(buildTournamentIcs({ ...sampleTournament, start_time: 'not-a-date' }), null);
    assert.equal(escapeIcsText('A, B; C\\D\nNext'), 'A\\, B\\; C\\\\D\\nNext');
    assert.ok(foldIcsLine('SUMMARY:' + 'X'.repeat(120)).includes('\r\n '));

    const normalizedCard = normalizeKingsClubTournament(sampleTournament);
    assert.equal(normalizedCard.buyInLabel, '500 + 50 Chips');
    assert.equal(normalizedCard.gtdLabel, '25,000 Chips GTD');
    assert.equal(normalizedCard.icsUrl, 'https://smarter.poker/api/news/calendar-ics?tid=12345678-1234-4234-8234-123456789abc');

    const icsRouteCode = readRepo('pages/api/news/calendar-ics.js')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:\\])\/\/[^\n]*/g, '$1');
    assert.doesNotMatch(icsRouteCode, /\.from\(\s*['"]profiles['"]\s*\)/, 'calendar-ics must never read profiles');
    assert.doesNotMatch(icsRouteCode, /club_tournaments/, 'calendar-ics must never touch retired club_tournaments');
});

// ── LAW 3 & LAW 4: Geo-Personalized Nearby Poker & Referral Milestone Bar ────
test('V4 LAW 3 & 4: geo-matching prioritizes recipient city/state, filters stale/suppressed events, and referral milestones compute accurate progress', () => {
    assert.equal(normalizeUsStateCode('Illinois'), 'IL');
    assert.equal(normalizeUsStateCode('nv.'), 'NV');
    assert.equal(normalizeUsStateCode('UnknownLand'), '');

    const profileFromPrefs = {
        city: '',
        state: '',
        poker_near_me_preferences: JSON.stringify({ lastLocationCity: 'Chicago', lastLocationState: 'Illinois' }),
    };
    assert.deepEqual(resolveProfileLocation(profileFromPrefs), {
        stateCode: 'IL',
        city: 'Chicago',
        label: 'Chicago, IL',
    });

    const nowMs = Date.parse('2026-11-25T18:00:00Z');
    const calendarPool = [
        { venue_id: 101, venue_name: 'Rivers Des Plaines', event_name: 'Deepstack Daily', city: 'Des Plaines', state: 'IL', is_recurring: true, day_of_week: 'Friday', buy_in: 200, is_active: true, is_suppressed: false },
        { venue_id: 102, venue_name: 'Chicago Charitable Room', event_name: 'Nightly Bounty', city: 'Chicago', state: 'Illinois', is_recurring: true, day_of_week: 'Wednesday', buy_in: 150, is_active: true, is_suppressed: false },
        { venue_id: 103, venue_name: 'Expired One-Off', event_name: 'Old Event', city: 'Chicago', state: 'IL', is_recurring: false, specific_date: '2026-10-01', is_active: true, is_suppressed: false },
        { venue_id: 104, venue_name: 'Suppressed Room', event_name: 'Hidden', city: 'Chicago', state: 'IL', is_recurring: true, day_of_week: 'Monday', is_active: true, is_suppressed: true },
        { venue_id: 201, venue_name: 'Bellagio', event_name: 'Five Diamond', city: 'Las Vegas', state: 'NV', is_recurring: true, day_of_week: 'Saturday', is_active: true, is_suppressed: false },
    ];

    const matched = matchRecipientNearbyEvents(profileFromPrefs, calendarPool, { limit: 2, nowMs });
    assert.equal(matched.length, 2);
    assert.equal(matched[0].venue_id, 102, 'Exact same-city IL event must rank ahead of statewide IL match');
    assert.equal(matched[1].venue_id, 101);

    const m0 = computeReferralMilestone(0);
    assert.equal(m0.nextTarget, 1);
    assert.equal(m0.progressPct, 0);

    const m2 = computeReferralMilestone(2);
    assert.equal(m2.diamondsEarned, 1000);
    assert.equal(m2.nextTarget, 3);
    assert.equal(m2.remaining, 1);
    assert.equal(m2.tierLabel, 'Recruiter');

    const m12 = computeReferralMilestone(12);
    assert.equal(m12.diamondsEarned, 6000);
    assert.equal(m12.nextTarget, null);
    assert.equal(m12.progressPct, 100);
    assert.equal(m12.tierLabel, 'Crew Legend');
});

// ── LAW 5: Video Of The Week Zero-Repeat Ledger & Full V4 Email Rendering ────
test('V4 LAW 5: curateWeeklyWireEdition tracks Video Of The Week in Zero-Repeat Ledger without touching social_reels, and renderWeeklyWireEmail wires all V4 blocks', async () => {
    const engineSrc = readRepo('src/lib/newsletter/weeklyWireEngine.mjs');
    const editionPageSrc = readRepo('pages/hub/wire/[edition].js');
    assert.doesNotMatch(engineSrc, /social_reels|origin_type/, 'weeklyWireEngine must never touch social_reels or origin_type');
    assert.doesNotMatch(editionPageSrc, /social_reels|origin_type/, 'wire/[edition] must never touch social_reels or origin_type');

    const nowIso = new Date().toISOString();
    const vidA = {
        youtube_video_id: 'dQw4w9WgXcQ',
        source_id: 'TRITON',
        source_name: 'Triton Poker',
        type: 'tournament',
        title: 'Million Dollar Final Table River Hero Call Breakdown',
        thumbnail_url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
        views_text: '142K views',
        views_count: 142000,
        duration: '14:22',
        published_at: nowIso,
        scraped_at: nowIso,
        availability_status: 'verified',
        embeddable: true,
        availability_checked_at: nowIso,
    };
    const vidB = {
        ...vidA,
        youtube_video_id: 'M7lc1UVf-VE',
        title: 'High Stakes Deepstack 4-Bet Pot Solver Analysis',
        views_count: 98000,
    };

    const makeMockSb = (sentIds = []) => ({
        from(table) {
            if (table === 'newsletter_campaigns') {
                const rows = sentIds.length
                    ? [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', subject: 'Smarter.Poker Wire #1', status: 'sent', article_ids: sentIds }]
                    : [];
                const chain = {
                    select: () => chain,
                    in: () => chain,
                    order: () => chain,
                    limit: async () => ({ data: rows, error: null }),
                    range: async (from) => ({ data: from === 0 ? rows : [], error: null }),
                };
                return chain;
            }
            if (table === 'poker_news') {
                const chain = {
                    select: () => chain,
                    eq: () => chain,
                    neq: () => chain,
                    gte: () => chain,
                    order: () => chain,
                    limit: async () => ({ data: [], error: null }),
                    range: async (from) => ({
                        data: from === 0
                            ? [{
                                id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
                                title: 'WSOP Main Event Shatters Attendance Record In Las Vegas',
                                summary: 'Record field gathers for championship main event play.',
                                source_name: 'PokerNews',
                                source_url: 'https://example.com/wsop',
                                image_url: 'https://cdn.example.com/wsop.jpg',
                                category: 'TOURNAMENT',
                                is_published: true,
                                published_at: nowIso,
                            }]
                            : [],
                        error: null,
                    }),
                };
                return chain;
            }
            const emptyChain = {
                select: () => emptyChain,
                eq: () => emptyChain,
                in: () => emptyChain,
                gte: () => emptyChain,
                order: () => emptyChain,
                limit: async () => ({ data: [], error: null }),
            };
            return emptyChain;
        },
    });

    // Edition 1 picks vidA and records videoMarkerUuid(vidA)
    const ed1 = await curateWeeklyWireEdition(makeMockSb([]), {
        enrichMetaDescriptions: false,
        fetchVideosFn: async () => [vidA, vidB],
        fetchTournamentsFn: async () => [
            {
                id: '99999999-9999-4999-8999-999999999999',
                name: 'Kings Club Nightly Deepstack',
                game_type: 'NLH',
                buy_in_amount: 200,
                buy_in_fee: 20,
                guaranteed_prize: 10000,
                start_time: new Date(Date.now() + 3600_000).toISOString(),
                status: 'ANNOUNCED',
            },
        ],
    });
    assert.equal(ed1.videoOfTheWeek.videoId, 'dQw4w9WgXcQ');
    assert.ok(ed1.ledgerUuidsToRecord.includes(videoMarkerUuid('dQw4w9WgXcQ')));
    assert.equal(ed1.kingsClubTournaments.length, 1);

    // Edition 2 (after ed1 markers are recorded) skips vidA and selects vidB
    const ed2 = await curateWeeklyWireEdition(makeMockSb(ed1.ledgerUuidsToRecord), {
        enrichMetaDescriptions: false,
        fetchVideosFn: async () => [vidA, vidB],
    });
    assert.equal(ed2.videoOfTheWeek.videoId, 'M7lc1UVf-VE', 'Consumed Video Of The Week must never repeat');

    // Render full V4 email with Spot felt image, Video card, Kings Club .ics, Geo nearby, Referral bar, and Re-permission banner
    const rendered = renderWeeklyWireEmail({
        edition: ed1,
        promoBlock: buildPromoBlockForSegment('active_member', { siteUrl: 'https://smarter.poker' }),
        siteUrl: 'https://smarter.poker',
        unsubscribeUrl: 'https://smarter.poker/api/news/subscribe?unsubscribe=tok123.sig456',
        preferencesUrl: 'https://smarter.poker/hub/email-preferences?token=tok123.sig456',
        recipientMeta: {
            username: 'acehigh',
            diamonds: 2400,
            isVip: true,
            referralCode: '10888',
            referralCount: 2,
            needsRepermission: true,
            unsubToken: 'tok123.sig456',
            locationLabel: 'Chicago, IL',
            nearbyEvents: [
                { venue_id: 102, venue_name: 'Rivers Casino', event_name: 'Deepstack', city: 'Des Plaines', state: 'IL', is_recurring: true, day_of_week: 'Friday', buy_in: 200 },
            ],
        },
    });

    assert.match(rendered.html, /\/api\/news\/email-image\?spot=/, 'Email must render signed Spot Of The Week felt image');
    assert.match(rendered.html, /\/api\/news\/calendar-ics\?tid=99999999-9999-4999-8999-999999999999/, 'Email must render tournament .ics link');
    assert.match(rendered.html, /\/hub\/video-library\/watch\/dQw4w9WgXcQ\//, 'Email must render first-party Video Of The Week watch link');
    assert.match(rendered.html, /Live Poker Near You \(Chicago, IL\)/, 'Email must render geo-personalized nearby block');
    assert.match(rendered.html, /\/hub\/venues\/102/, 'Email must deep-link to local venue page');
    assert.match(rendered.html, /2 completed referrals/, 'Email must render live referral milestone progress');
    assert.match(rendered.html, /\/api\/news\/subscribe\?keep=tok123\.sig456/, 'Email must render 1-click re-permission confirmation link');
    assert.doesNotMatch(rendered.html, FORBIDDEN_PALETTE_HEX_RE, 'Email must contain zero yellow or purple hexes');
    assert.doesNotMatch(rendered.html, /[—–]/, 'Email must contain zero em/en dashes');
});

// ── LAW 6: SEO Compounding (RSS 2.0, XML Sitemaps, Escaped JSON-LD) ──────────
test('V4 LAW 6: RSS 2.0 feed escapes XML & excludes non-Wire blasts, /hub/wire is in sitemaps, and wire pages emit JSON-LD', () => {
    const { buildWeeklyWireRssXml, numberWeeklyWireEditions } = loadWireRssHelpers();

    const rawCampaigns = [
        { id: '1', subject: '[PROMO EMAIL+SMS] 25 Free Chips', status: 'sent', article_ids: ['a'] },
        { id: '2', subject: 'Smarter.Poker News — 8 stories', status: 'sent', article_ids: ['11111111-1111-4111-8111-111111111111'] },
        { id: '3', subject: '[Lifecycle] Welcome Back', status: 'sent', article_ids: ['b'] },
        { id: '4', subject: 'GTO & ICM <Edge> | Smarter.Poker Wire #2', status: 'sent', article_ids: ['22222222-2222-4222-8222-222222222222'] },
    ];
    const filtered = numberWeeklyWireEditions(rawCampaigns.filter(isWeeklyWireDigestCampaign));
    assert.equal(filtered.length, 2);
    assert.equal(filtered[0].editionNumber, 1);
    assert.equal(filtered[1].editionNumber, 2);

    const xml = buildWeeklyWireRssXml([
        {
            editionNumber: 2,
            subject: 'GTO & ICM <Edge> | Smarter.Poker Wire #2',
            publishedAt: '2026-11-25T14:00:00.000Z',
            headlines: ['High Stakes "Monster" Pot & Final Table'],
        },
    ]);
    assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
    assert.match(xml, /<rss version="2\.0" xmlns:atom="http:\/\/www\.w3\.org\/2005\/Atom">/);
    assert.match(xml, /<atom:link href="https:\/\/smarter\.poker\/api\/news\/wire-rss" rel="self" type="application\/rss\+xml" \/>/);
    assert.match(xml, /<title>GTO &amp; ICM &lt;Edge&gt; \| Smarter\.Poker Wire #2<\/title>/);
    assert.match(xml, /<guid isPermaLink="true">https:\/\/smarter\.poker\/hub\/wire\/2<\/guid>/);

    // Sitemap registration
    assert.ok(STATIC_PAGES.some((p) => p.path === '/hub/wire'), 'STATIC_PAGES must include /hub/wire');
    const sitemapSrc = readRepo('pages/sitemap.xml.js');
    assert.match(sitemapSrc, /path:\s*['"]\/hub\/wire['"]/);
    assert.match(sitemapSrc, /buildWireEditionUrls/);

    // JSON-LD & RSS alternate link on /hub/wire & /hub/wire/[edition]
    for (const rel of ['pages/hub/wire/index.js', 'pages/hub/wire/[edition].js']) {
        const src = readRepo(rel);
        assert.match(src, /application\/rss\+xml/);
        assert.match(src, /application\/ld\+json/);
        assert.match(src, /\\u003c/, `${rel} must escape < as \\u003c inside JSON-LD script tags`);
    }
});

// ── LAW 7: Cold-Lead Sunset Shield, Webhook Engagement Stamp & Admin Previewers
test('V4 LAW 7: cold-lead sunset shield, webhook open/click engagement stamping, subscribe ?keep=, and admin sandboxed preview iframes hold end-to-end', async () => {
    const nowMs = Date.parse('2026-11-25T18:00:00Z');
    const daysAgoIso = (d) => new Date(nowMs - d * 86_400_000).toISOString();

    // <90d imported cold lead -> normal active
    assert.equal(
        evaluateColdSubscriberSunset({ source: 'owner_list_20261118', subscribed_at: daysAgoIso(45) }, { hasAccount: false, nowMs }).status,
        'active'
    );
    // 95d imported cold lead without account -> repermission_window banner
    const rep = evaluateColdSubscriberSunset({ source: 'owner_list_20261118', subscribed_at: daysAgoIso(95) }, { hasAccount: false, nowMs });
    assert.equal(rep.status, 'repermission_window');
    assert.equal(rep.showRepermissionBanner, true);
    assert.equal(rep.suppressSend, false);

    // 130d imported cold lead without account & zero engagement -> sunset_suppressed
    const sun = evaluateColdSubscriberSunset({ source: 'admin_import', created_at: daysAgoIso(130) }, { hasAccount: false, nowMs });
    assert.equal(sun.status, 'sunset_suppressed');
    assert.equal(sun.suppressSend, true);

    // Engaged subscriber or existing account holder is NEVER sunsetted even after 200 days
    assert.equal(
        evaluateColdSubscriberSunset({ source: 'engaged:2026-11-20', subscribed_at: daysAgoIso(200) }, { hasAccount: false, nowMs }).suppressSend,
        false
    );
    assert.equal(
        evaluateColdSubscriberSunset({ source: 'owner_list_20261118', subscribed_at: daysAgoIso(200) }, { hasAccount: true, nowMs }).suppressSend,
        false
    );

    // Resend webhook open/click stamping preserves pref:wire_only and snooze:* while stamping cold imports
    const { isEngagementStampableSource, stampSubscriberEngagement } = loadResendEngagementHelpers();
    assert.equal(isEngagementStampableSource('owner_list_20261118'), true);
    assert.equal(isEngagementStampableSource('admin_import'), true);
    assert.equal(isEngagementStampableSource('engaged:2026-10-01'), true);
    assert.equal(isEngagementStampableSource('pref:wire_only'), false);
    assert.equal(isEngagementStampableSource('snooze:2026-12-25T00:00:00Z'), false);
    assert.equal(isEngagementStampableSource('unsubscribe'), false);

    const updates = [];
    const fakeWebhookSb = {
        from() {
            return {
                select: () => ({
                    ilike: () => ({
                        limit: async () => ({
                            data: [
                                { id: 'sub-cold', source: 'owner_list_20261118', is_active: true },
                                { id: 'sub-pref', source: 'pref:wire_only', is_active: true },
                                { id: 'sub-off', source: 'owner_list_20261118', is_active: false },
                            ],
                        }),
                    }),
                }),
                update: (patch) => ({
                    eq: async (_col, id) => {
                        updates.push({ id, patch });
                        return { error: null };
                    },
                }),
            };
        },
    };
    const stampedCount = await stampSubscriberEngagement(fakeWebhookSb, 'Reader@Example.com', {
        now: new Date('2026-11-25T18:00:00Z'),
    });
    assert.equal(stampedCount, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(updates)), [{ id: 'sub-cold', patch: { source: 'engaged:2026-11-25' } }]);

    // resolveWeeklyWireRecipients honors sunset_suppressed, repermission_window, referralCounts, and nearbyEvents
    const audienceSb = {
        from(table) {
            const eqFilters = new Map();
            const chain = {
                select: () => chain,
                eq: (col, val) => {
                    eqFilters.set(col, val);
                    return chain;
                },
                in: () => chain,
                like: () => chain,
                or: () => chain,
                not: () => chain,
                order: () => chain,
                limit: async () => ({
                    data: table === 'unified_events_calendar'
                        ? [{ venue_id: 55, venue_name: 'Horseshoe Hammond', event_name: 'Deepstack', city: 'Hammond', state: 'IN', is_recurring: true, day_of_week: 'Saturday', is_active: true, is_suppressed: false }]
                        : [],
                    error: null,
                }),
                range: async (from) => {
                    if (from > 0) return { data: [], error: null };
                    if (table === 'profiles') {
                        return {
                            data: [{
                                id: 'u-member-1',
                                username: 'hoosier_pro',
                                email: 'member@gmail.com',
                                diamonds: 800,
                                is_vip: false,
                                player_number: 20401,
                                is_horse: false,
                                city: 'Hammond',
                                state: 'Indiana',
                                last_active: daysAgoIso(2),
                            }],
                            error: null,
                        };
                    }
                    if (table === 'newsletter_subscribers') {
                        if (eqFilters.get('is_active') === false) {
                            return { data: [], error: null };
                        }
                        return {
                            data: [
                                { id: 's-1', email: 'cold130@gmail.com', is_active: true, source: 'owner_list_20261118', subscribed_at: daysAgoIso(130) },
                                { id: 's-2', email: 'cold95@gmail.com', is_active: true, source: 'owner_list_20261118', subscribed_at: daysAgoIso(95) },
                                { id: 's-3', email: 'engaged150@gmail.com', is_active: true, source: 'engaged:2026-11-10', subscribed_at: daysAgoIso(150) },
                            ],
                            error: null,
                        };
                    }
                    if (table === 'referrals') {
                        return {
                            data: [{ referrer_id: 'u-member-1' }, { referrer_id: 'u-member-1' }, { referrer_id: 'u-member-1' }],
                            error: null,
                        };
                    }
                    return { data: [], error: null };
                },
            };
            return chain;
        },
    };

    const resolved = await resolveWeeklyWireRecipients(audienceSb, { nowMs });
    assert.equal(resolved.skippedColdSunset, 1, '130-day unengaged cold import must be sunset-suppressed');
    assert.equal(resolved.repermissionCount, 1, '95-day cold import must enter re-permission window');
    const byEmail = new Map(resolved.recipients.map((r) => [r.email, r]));
    assert.equal(byEmail.has('cold130@gmail.com'), false);
    assert.equal(byEmail.get('cold95@gmail.com')?.needsRepermission, true);
    assert.equal(byEmail.has('engaged150@gmail.com'), true);
    assert.equal(byEmail.get('member@gmail.com')?.referralCount, 3);
    assert.equal(byEmail.get('member@gmail.com')?.nearbyEvents?.length, 1);
    assert.equal(byEmail.get('member@gmail.com')?.locationLabel, 'Hammond, IN');

    // Source contracts on subscribe.js, digest.js, lifecycle.js, operations.js, and admin/newsletter.js
    assert.match(readRepo('pages/api/news/subscribe.js'), /req\.query\?\.keep/);
    assert.match(readRepo('pages/api/news/digest.js'), /\bhtmlPreview\b/);
    assert.match(readRepo('pages/api/news/lifecycle.js'), /\bhtmlPreviews\b/);
    assert.match(readRepo('pages/api/news/operations.js'), /\breadEmailDnsReadiness\b/);
    const adminSrc = readRepo('pages/admin/newsletter.js');
    assert.match(adminSrc, /<iframe[\s\S]*?sandbox=""/, 'Admin newsletter studio must render sandboxed preview iframes');
    assert.match(adminSrc, /Desktop 640px/);
    assert.match(adminSrc, /Mobile 375px/);
    assert.doesNotMatch(adminSrc, FORBIDDEN_PALETTE_HEX_RE, 'Admin newsletter studio must never use yellow or purple hexes');
});

// ── LAW 8: Client Bundle Isolation (No Server/Sharp Imports Inside React Render) ─
test('V4 LAW 8: /hub/wire and /hub/wire/[edition] client components never reference emailImageProxy, wireEngine, or server-only modules outside getServerSideProps', () => {
    for (const rel of ['pages/hub/wire/index.js', 'pages/hub/wire/[edition].js']) {
        const src = readRepo(rel);
        const defaultExportIdx = src.indexOf('export default function');
        assert.ok(defaultExportIdx > 0, `${rel} must define export default function`);
        const clientComponentBody = src.slice(defaultExportIdx);
        assert.doesNotMatch(
            clientComponentBody,
            /\b(?:emailImageProxy|buildSignedEmailImageUrl|buildSpotCardImageUrl|wireEngine|wireCatalog|createClient|sharp)\b/,
            `${rel} client component body must read pre-serialized SSR props only so Webpack never bundles sharp or node:* builtins into the browser`
        );
    }
});

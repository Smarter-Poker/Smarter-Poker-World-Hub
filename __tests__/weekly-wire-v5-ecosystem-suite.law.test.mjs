/**
 * PERMANENT ANTI-REGRESSION LAW SUITE — WEEKLY WIRE V5 COMPLETE ECOSYSTEM SUITE
 *
 * Verifies all 13 V5 upgrades end-to-end across engines, APIs, shortlinks,
 * webhooks, cron monitors, Hub settings, Trivia, Hand Lab, Web Archive, and Admin Studio:
 *   - V5 LAW 1: Canonical UTM First-Touch Attribution (`utmAttribution.mjs` <-> `firstTouch.mjs`)
 *               across Weekly Wire, Promo Email, Lifecycle, Welcome Email, `/go/promo`, and `/go/welcome-back`,
 *               preserving HMAC `?pt=` / `?wb=` / `?ref=` and skipping signed `/api/news/*` routes.
 *   - V5 LAW 2: Resend Per-Section Click Heatmap (`classifyClickedEmailSection`, `parseCampaignSectionClicks`,
 *               `mergeFinalCampaignErrorSummary`, `resend.js`, `operations.js`, `admin/newsletter.js`).
 *   - V5 LAW 3: Community Spot Of The Week Vote Tallies (`spot-vote.js`, `parseSpotVotesSummary`,
 *               `wireCampaignPredicate.mjs` exclusion, Hand Lab + `/hub/wire/[edition]` vote split bars,
 *               and `previousSpotRecap` in Weekly Wire).
 *   - V5 LAW 4: 16-Item `TRIVIA_OF_THE_WEEK_CATALOG`, `triviaMarkerUuid` Zero-Repeat Ledger rotation,
 *               email rendering, `/hub/trivia?wire_q=&pick=` interactive verdict, and `/hub/wire/[edition]` card.
 *   - V5 LAW 5: Kings Club Winner's Circle (`loadRecentKingsClubWinners`, Chips-only formatting) and
 *               7-Day GTO Training & Personal Assistant Pulse (`trainingPulse` -> `/hub/personal-assistant`).
 *   - V5 LAW 6: Live Weekly Wire Publication Hooks (`submitToIndexNow` + batched In-App `notifications`
 *               bell companion in `pages/api/news/digest.js`) and Bulk Domain (`send.mail.smarter.poker` +
 *               7-day bounce/complaint watch) in `pages/api/cron/email-deliverability-check.js`.
 *   - V5 LAW 7: Top-Of-Funnel SEO & News Hub Subscriber Capture Expansion (`NewsletterCaptureBar.js`
 *               across `/hub/news`, `/learn/*`, `/poker-rooms/*`, `/freerolls`, `/rules/*`, `/games/*`,
 *               `/research/*`, `/glossary/*`, `/hub/venues/*`, `/hub/tours/*` + subscribed-member auto-hide)
 *               and `/hub/settings/notifications` Weekly Wire & Email Cadence controls.
 *   - V5 LAW 8: Web Archive Instant Search (`/hub/wire`), Prev/Next Edition Navigation (`/hub/wire/[edition]`
 *               with `V4 LAW 8` client-bundle isolation intact), Saved Promo Drafts (`save_promo_draft` /
 *               `delete_promo_draft`), and Admin Attributed Signups Counter (`attributionSummary`).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

import { parseFirstTouch } from '../src/lib/acquisition/firstTouch.mjs';
import {
    appendNewsletterUtm,
    classifyClickedEmailSection,
    sanitizeUtmTag,
} from '../src/lib/newsletter/utmAttribution.mjs';
import {
    PROMO_DRAFT_SUBJECT_PREFIX,
    SPOT_VOTE_SUBJECT_PREFIX,
    applyCampaignTelemetryEvent,
    mergeFinalCampaignErrorSummary,
    parseCampaignSectionClicks,
    parseCampaignTelemetrySummary,
    parsePromoDraftSummary,
    parseSpotVotesSummary,
    serializePromoDraftSummary,
    serializeSpotVotesSummary,
} from '../src/lib/newsletter/campaignTelemetry.mjs';
import { isWeeklyWireDigestCampaign } from '../src/lib/newsletter/wireCampaignPredicate.mjs';
import {
    SPOT_OF_THE_WEEK_CATALOG,
    TRIVIA_OF_THE_WEEK_CATALOG,
} from '../src/lib/newsletter/weeklyWireCatalog.mjs';
import {
    curateWeeklyWireEdition,
    loadRecentKingsClubWinners,
    renderWeeklyWireEmail,
    resolveWeeklyWireRecipients,
    spotMarkerUuid,
    triviaMarkerUuid,
} from '../src/lib/newsletter/weeklyWireEngine.mjs';
import { buildWelcomeEmail } from '../src/lib/newsletter/welcomeAndPreferences.mjs';
import { renderPromoEmail } from '../src/lib/promoCampaigns/dispatch.mjs';
import { renderLifecycleEmail } from '../src/lib/promoCampaigns/lifecycleEngine.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readRepo = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

const FORBIDDEN_PALETTE_HEX_RE = /#(?:fbbf24|f59e0b|eab308|fde047|fef08a|d97706|ca8a04|a855f7|c084fc|8b5cf6|d8b4fe|9333ea|7c3aed)\b/i;

// ── V5 LAW 1: Canonical First-Touch UTM Attribution Across All Engines & Shortlinks ─
test('V5 LAW 1: UTM attribution tags survive firstTouch.mjs parsing across all 4 email engines and /go/* shortlinks while preserving HMAC tokens and skipping signed API links', () => {
    assert.equal(sanitizeUtmTag('Weekly Wire #2!'), 'weekly_wire_2');

    // Signed & API endpoints MUST NEVER be mutated
    for (const untouched of [
        'https://smarter.poker/api/news/subscribe?unsubscribe=abc.def',
        'https://smarter.poker/api/news/email-image?spot=slug&s=123',
        'https://smarter.poker/api/news/calendar-ics?tid=11111111-1111-4111-8111-111111111111',
        'https://www.pokernews.com/news/2026/11/story.htm',
        'mailto:news@smarter.poker',
    ]) {
        assert.equal(appendNewsletterUtm(untouched, { source: 'weekly_wire', campaign: 'wire_ed_2' }), untouched);
    }

    // Preserves HMAC ?pt= and ?redirect= while registering cleanly in firstTouch.mjs parseFirstTouch!
    const taggedSignup = appendNewsletterUtm(
        'https://smarter.poker/auth/signup?redirect=%2Fhub%2Fclub-arena%2F%3Fjoin%3D25450&pt=eyJ2IjoxfQ.sig123',
        { source: 'promo_campaign', medium: 'email', campaign: 'non_accounts', content: 'primary_cta' }
    );
    const parsedUrl = new URL(taggedSignup);
    assert.equal(parsedUrl.searchParams.get('pt'), 'eyJ2IjoxfQ.sig123');
    assert.equal(parsedUrl.searchParams.get('redirect'), '/hub/club-arena/?join=25450');

    const ft = parseFirstTouch(parsedUrl.search, parsedUrl.pathname);
    assert.equal(ft?.utm_source, 'promo_campaign');
    assert.equal(ft?.utm_medium, 'email');
    assert.equal(ft?.utm_campaign, 'non_accounts');

    // Verify all 4 email renderers + both /go/* shortlink routes emit utm_source
    const welcome = buildWelcomeEmail({ hasExistingProfile: false });
    assert.match(welcome.html, /utm_source=welcome_email/);

    const promo = renderPromoEmail({
        subject: '25 Free Chips',
        headline: '25 Free Chips',
        body: 'Claim your bonus in Kings Club.',
        ctaLabel: 'Claim Now',
        ctaUrl: 'https://smarter.poker/auth/signup?pt=tok.sig',
        scope: 'non_accounts',
    });
    assert.match(promo.html, /utm_source=promo_campaign/);
    assert.match(promo.html, /pt=tok\.sig/);

    const lc = renderLifecycleEmail({
        trigger: 'unverified_48h',
        username: 'Grinder',
        ctaUrl: 'https://smarter.poker/hub/verify-phone?pt=tok.sig',
    });
    assert.match(lc.html, /utm_source=lifecycle/);

    assert.match(readRepo('pages/go/promo.js'), /appendNewsletterUtm/);
    assert.match(readRepo('pages/go/promo.js'), /promo_sms/);
    assert.match(readRepo('pages/go/welcome-back.js'), /appendNewsletterUtm/);
    assert.match(readRepo('pages/go/welcome-back.js'), /welcome_back_sms/);
});

// ── V5 LAW 2: Resend Per-Section Click Heatmap & Backwards Compatibility ──────
test('V5 LAW 2: Resend click telemetry classifies clicked sections accurately and preserves section heatmaps across batch finalization', () => {
    assert.equal(classifyClickedEmailSection('https://smarter.poker/hub/training/hand-lab?spot=btn-vs-bb&pick=A'), 'spot');
    assert.equal(classifyClickedEmailSection('https://smarter.poker/hub/trivia?wire_q=pot-odds&pick=B'), 'trivia');
    assert.equal(classifyClickedEmailSection('https://smarter.poker/hub/video-library/watch/abc123/wsop'), 'video');
    assert.equal(classifyClickedEmailSection('https://smarter.poker/hub/club-arena/?join=25450'), 'kings_club');
    assert.equal(classifyClickedEmailSection('https://smarter.poker/auth/signup?pt=abc'), 'promo');
    assert.equal(classifyClickedEmailSection('https://smarter.poker/hub/venues/102'), 'nearby');
    assert.equal(classifyClickedEmailSection('https://smarter.poker/tools/icm-calculator'), 'tool');
    assert.equal(classifyClickedEmailSection('https://smarter.poker/hub/article?id=123'), 'news');
    assert.equal(classifyClickedEmailSection('https://smarter.poker/hub/wire/2'), 'archive');

    let summary = null;
    summary = applyCampaignTelemetryEvent(summary, 'email.opened').errorSummary;
    summary = applyCampaignTelemetryEvent(summary, 'email.clicked', {
        clickedUrl: 'https://smarter.poker/hub/training/hand-lab?spot=plo4-bare-nut-flush-blocker-river-202611&pick=A',
    }).errorSummary;
    summary = applyCampaignTelemetryEvent(summary, 'email.clicked', {
        clickedUrl: 'https://smarter.poker/hub/training/hand-lab?spot=plo4-bare-nut-flush-blocker-river-202611&pick=B',
    }).errorSummary;
    summary = applyCampaignTelemetryEvent(summary, 'email.clicked', {
        clickedUrl: 'https://smarter.poker/hub/trivia?wire_q=pot-odds&pick=B',
    }).errorSummary;

    const merged = mergeFinalCampaignErrorSummary(summary, ['batch-2 retry ok']);
    const base = parseCampaignTelemetrySummary(merged);
    assert.deepEqual(base, { opens: 1, clicks: 3, cleanErrorSummary: 'batch-2 retry ok' });
    assert.deepEqual(parseCampaignSectionClicks(merged), { spot: 2, trivia: 1 });

    assert.match(readRepo('pages/api/webhooks/resend.js'), /clickedUrl/);
    assert.match(readRepo('pages/api/webhooks/resend.js'), /parseCampaignSectionClicks/);
});

// ── V5 LAW 3: Spot Of The Week Community Vote Tallies & Previous Spot Recap ───
test('V5 LAW 3: Spot Vote serializer, privacy-hashed voter UUIDs, wireCampaignPredicate exclusion, and previousSpotRecap hold end-to-end', () => {
    // [SPOT-VOTE] and [PROMO DRAFT] rows MUST NEVER be mistaken for Weekly Wire editions
    assert.equal(
        isWeeklyWireDigestCampaign({
            subject: `${SPOT_VOTE_SUBJECT_PREFIX}plo4-bare-nut-flush-blocker-river-202611`,
            status: 'cancelled',
            article_ids: ['11111111-1111-4111-8111-111111111111'],
        }),
        false
    );
    assert.equal(
        isWeeklyWireDigestCampaign({
            subject: `${PROMO_DRAFT_SUBJECT_PREFIX}Holiday Kings Club Drop`,
            status: 'cancelled',
            article_ids: ['11111111-1111-4111-8111-111111111111'],
        }),
        false
    );

    const encodedVotes = serializeSpotVotesSummary({ A: 3, B: 6, C: 1 });
    assert.deepEqual(parseSpotVotesSummary(encodedVotes), { A: 3, B: 6, C: 1 });

    // Verify pure voter UUID + percentage helpers inside pages/api/news/spot-vote.js
    const spotVoteSrc = readRepo('pages/api/news/spot-vote.js');
    assert.match(spotVoteSrc, /SPOT_VOTE_SUBJECT_PREFIX/);
    assert.match(spotVoteSrc, /status:\s*['"]cancelled['"]/);
    assert.match(spotVoteSrc, /audience:\s*['"]active_subscribers['"]/);

    const fnStart = spotVoteSrc.indexOf('export function computeSpotVoterUuid');
    assert.ok(fnStart > 0, 'spot-vote.js must export computeSpotVoterUuid');
    const fnEnd = spotVoteSrc.indexOf('export default async function handler');
    const pureSpotSnippet = spotVoteSrc
        .slice(fnStart, fnEnd)
        .replace(/^export\s+function\s+/gm, 'function ');
    const sb = { crypto, exports: {} };
    vm.runInNewContext(
        `${pureSpotSnippet}\nexports.computeSpotVoterUuid = computeSpotVoterUuid;\nexports.computeVotePercentages = computeVotePercentages;`,
        sb
    );
    const v1 = sb.exports.computeSpotVoterUuid('spot-a', 'u:user-1');
    const v2 = sb.exports.computeSpotVoterUuid('spot-a', 'u:user-1');
    const v3 = sb.exports.computeSpotVoterUuid('spot-a', 'u:user-2');
    assert.equal(v1, v2);
    assert.notEqual(v1, v3);
    assert.match(v1, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    assert.deepEqual(
        JSON.parse(JSON.stringify(sb.exports.computeVotePercentages({ A: 1, B: 3, C: 0 }))),
        { A: 25, B: 75, C: 0 }
    );

    // Geo-blocks & middleware exempt /api/news/spot-vote
    const geoJson = JSON.parse(readRepo('config/geo-blocks.json'));
    assert.ok(geoJson.allow_paths.includes('/api/news/spot-vote'));
    assert.match(readRepo('middleware.ts'), /\/api\/news\/spot-vote/);
});

// ── V5 LAW 4 & 5: Trivia Catalog + Kings Club Winners + 7d Training Pulse ─────
test('V5 LAW 4 & 5: 16-item Trivia catalog rotates in Zero-Repeat Ledger, Kings Club Winners format Chips-only, and 7d Training Pulse renders Personal Assistant CTA', async () => {
    assert.ok(TRIVIA_OF_THE_WEEK_CATALOG.length >= 16, 'TRIVIA_OF_THE_WEEK_CATALOG must contain at least 16 poker trivia challenges');
    const seenSlugs = new Set();
    for (const q of TRIVIA_OF_THE_WEEK_CATALOG) {
        assert.ok(q.slug && !seenSlugs.has(q.slug), `Duplicate or missing trivia slug: ${q.slug}`);
        seenSlugs.add(q.slug);
        assert.equal(q.options.length, 4, `${q.slug} must provide 4 options A..D`);
        assert.ok(['A', 'B', 'C', 'D'].includes(q.answerKey), `${q.slug} must specify valid answerKey`);
        assert.ok(q.explanation && q.explanation.length >= 25, `${q.slug} must include educational explanation`);
        assert.doesNotMatch(`${q.question} ${q.explanation}`, /[—–]/, `${q.slug} must contain zero em/en dashes`);
    }

    const nowMs = Date.parse('2026-11-25T20:00:00Z');
    const nowIso = new Date(nowMs).toISOString();
    const prevSpot = SPOT_OF_THE_WEEK_CATALOG[0];
    const prevSpotMarker = spotMarkerUuid(prevSpot.slug);

    const mockSb = {
        from(table) {
            const filters = {};
            const q = {
                select: () => q,
                eq: (col, val) => { filters[col] = val; return q; },
                neq: () => q,
                in: () => q,
                or: () => q,
                not: () => q,
                like: () => q,
                ilike: () => q,
                gte: () => q,
                order: () => q,
                limit: async () => {
                    if (table === 'newsletter_campaigns') {
                        if (filters.status === 'cancelled') {
                            return {
                                data: [{
                                    id: 'sv-1',
                                    subject: `${SPOT_VOTE_SUBJECT_PREFIX}${prevSpot.slug}`,
                                    status: 'cancelled',
                                    error_summary: serializeSpotVotesSummary({ A: 2, B: 6, C: 2 }),
                                }],
                                error: null,
                            };
                        }
                        return {
                            data: [{
                                id: 'camp-ed-1',
                                subject: 'Smarter.Poker Wire #1',
                                status: 'sent',
                                created_at: '2026-11-18T14:00:00Z',
                                completed_at: '2026-11-18T14:05:00Z',
                                article_ids: [prevSpotMarker],
                            }],
                            error: null,
                        };
                    }
                    if (table === 'tournaments' && filters.status === 'COMPLETED') {
                        return {
                            data: [{
                                id: '99999999-8888-4777-8666-555555555555',
                                name: 'Kings Club Sunday Championship',
                                club_id: 'a41434bb-8d0c-400a-8f0d-e8b3d65afed4',
                                game_type: 'NLH',
                                buy_in_amount: 500,
                                prize_pool: 24500,
                                guaranteed_prize: 20000,
                                current_players: 49,
                                start_time: '2026-11-23T01:00:00Z',
                                status: 'COMPLETED',
                            }],
                            error: null,
                        };
                    }
                    if (table === 'poker_news') {
                        return {
                            data: [{
                                id: '11111111-1111-4111-8111-111111111111',
                                title: 'WPT World Championship Field Surges In Las Vegas',
                                content: 'Tournament organizers report record satellite entries ahead of December main event.',
                                source_name: 'CardPlayer',
                                source_url: 'https://www.cardplayer.com/poker-news/wpt-2026',
                                image_url: '/api/news/email-image?fallback=1',
                                published_at: nowIso,
                            }],
                            error: null,
                        };
                    }
                    return { data: [], error: null };
                },
                range: async (from) => {
                    if (from > 0) return { data: [], error: null };
                    if (table === 'profiles') {
                        return {
                            data: [{
                                id: 'u-trainer-1',
                                username: 'solver_ace',
                                email: 'trainer@gmail.com',
                                diamonds: 1400,
                                is_vip: true,
                                player_number: 10999,
                                is_horse: false,
                                last_active: nowIso,
                            }],
                            error: null,
                        };
                    }
                    if (table === 'training_progress') {
                        return {
                            data: [
                                { user_id: 'u-trainer-1', game_id: 'mtt-icm', authority_hands_played: 42, authority_last_played_at: nowIso, last_played_at: nowIso },
                                { user_id: 'u-trainer-1', game_id: 'btn-vs-bb', authority_hands_played: 28, authority_last_played_at: nowIso, last_played_at: nowIso },
                            ],
                            error: null,
                        };
                    }
                    return { data: [], error: null };
                },
            };
            return q;
        },
    };

    const winners = await loadRecentKingsClubWinners(mockSb, { nowMs });
    assert.equal(winners.length, 1);
    assert.doesNotMatch(JSON.stringify(winners), /\$\d/, 'Kings Club winners must never attach $ currency symbols to Chips');

    const curated = await curateWeeklyWireEdition(mockSb, {
        days: 7,
        articleLimit: 3,
        enrichMetaDescriptions: false,
        verifyArticleImages: false,
        nowMs,
    });
    assert.ok(curated.triviaOfTheWeek?.slug, 'Curated edition must include Trivia Of The Week');
    const recordedIds = curated.ledgerUuidsToRecord || [];
    assert.ok(
        recordedIds.includes(triviaMarkerUuid(curated.triviaOfTheWeek.slug)),
        'Curated edition must record triviaMarkerUuid in Zero-Repeat Ledger markers'
    );
    assert.equal(curated.previousSpotRecap?.slug, prevSpot.slug, 'Curated edition must resolve previousSpotRecap from prior issue');
    assert.equal(curated.recentWinners?.length, 1, 'Curated edition must include recent Kings Club completed winners');

    const audience = await resolveWeeklyWireRecipients(mockSb, { nowMs });
    const trainer = audience.recipients.find((r) => r.email === 'trainer@gmail.com');
    assert.ok(trainer?.trainingPulse?.games7d >= 2, 'Active member must receive 7-day GTO trainingPulse summary');

    const rendered = renderWeeklyWireEmail({ edition: curated, recipientMeta: trainer });
    assert.match(rendered.html, /Poker Trivia Of The Week/i);
    assert.match(rendered.html, /wire_q=/);
    assert.match(rendered.html, /24,500 Chips/);
    assert.doesNotMatch(rendered.html, /\$24,500/);
    assert.match(rendered.html, /\/hub\/personal-assistant/);
    assert.match(rendered.html, /utm_source=weekly_wire/);
    assert.doesNotMatch(rendered.html, FORBIDDEN_PALETTE_HEX_RE);
    assert.doesNotMatch(rendered.html, /[—–]/);
});

// ── V5 LAW 6, 7 & 8: Publication Hooks, Bulk DNS, Capture Expansion, Settings, Archive & Admin ─
test('V5 LAW 6, 7 & 8: IndexNow + Bell companion, bulk DNS + bounce monitor, SEO capture bar routes, Notifications settings toggle, Trivia verdict, Archive search/nav, and Saved Promo Drafts hold', async () => {
    // 1. digest.js IndexNow + In-App Notifications bell companion
    const digestSrc = readRepo('pages/api/news/digest.js');
    assert.match(digestSrc, /submitToIndexNow/, 'digest.js must ping IndexNow when a live Weekly Wire edition publishes');
    assert.match(digestSrc, /weekly_wire_published/, 'digest.js must insert weekly_wire_published in-app notifications for opted-in members');

    // 2. email-deliverability-check.js bulk domain DNS + 7d bounce/complaint monitor
    const delivSrc = readRepo('pages/api/cron/email-deliverability-check.js');
    assert.match(delivSrc, /send\.mail\.\$\{DOMAIN\}|send\.mail\.smarter\.poker/, 'Deliverability cron must verify send.mail.smarter.poker SPF');
    assert.match(delivSrc, /_dmarc\.\$\{DOMAIN\}|_dmarc\.smarter\.poker/, 'Deliverability cron must verify _dmarc.smarter.poker');
    assert.match(delivSrc, /bounceRatePct/, 'Deliverability cron must compute 7-day rolling bounceRatePct');
    assert.match(delivSrc, /complaintRatePct/, 'Deliverability cron must compute 7-day rolling complaintRatePct');

    // 3. NewsletterCaptureBar top-of-funnel SEO & News Hub route expansion
    const captureSrc = readRepo('src/components/news/NewsletterCaptureBar.js');
    const routeFnStart = captureSrc.indexOf('export function normalizeCapturePath');
    const routeFnEnd = captureSrc.indexOf('export default function NewsletterCaptureBar');
    assert.ok(routeFnStart >= 0 && routeFnEnd > routeFnStart);
    const pureRouteSnippet = captureSrc
        .slice(routeFnStart, routeFnEnd)
        .replace(/^export\s+function\s+/gm, 'function ');
    const routeSb = { exports: {} };
    vm.runInNewContext(
        `${pureRouteSnippet}\nexports.isNewsletterCaptureRoute = isNewsletterCaptureRoute;\nexports.deriveCaptureSource = deriveCaptureSource;\nexports.deriveCaptureHeadline = deriveCaptureHeadline;`,
        routeSb
    );
    for (const seoRoute of [
        '/hub/news',
        '/learn/poker-math',
        '/rules/texas-holdem',
        '/games/plo5',
        '/poker-rooms/states/texas',
        '/freerolls',
        '/weekend-tournaments',
        '/research/annual-state-of-poker-2026',
        '/glossary/icm',
        '/hub/venues/1828',
        '/hub/tours/wsop',
        '/tools/icm-calculator',
        '/hub/wire',
    ]) {
        assert.equal(routeSb.exports.isNewsletterCaptureRoute(seoRoute), true, `${seoRoute} must activate NewsletterCaptureBar`);
        assert.ok(routeSb.exports.deriveCaptureSource(seoRoute).startsWith('capture:'));
        assert.ok(routeSb.exports.deriveCaptureHeadline(seoRoute).length > 15);
    }
    assert.equal(routeSb.exports.isNewsletterCaptureRoute('/auth/login'), false);
    assert.equal(routeSb.exports.isNewsletterCaptureRoute('/admin/newsletter'), false);

    // 4. Notifications settings toggle, Trivia verdict card, Hand Lab vote split, Archive search & Prev/Next nav, Admin drafts + attribution
    const notifSettingsSrc = readRepo('pages/hub/settings/notifications.js');
    assert.match(notifSettingsSrc, /Weekly Wire And Email Cadence/);
    assert.match(notifSettingsSrc, /preferences=session/);

    const triviaHubSrc = readRepo('pages/hub/trivia/index.js');
    assert.match(triviaHubSrc, /TRIVIA_OF_THE_WEEK_CATALOG/);
    assert.match(triviaHubSrc, /wire_q/);

    const handLabSrc = readRepo('pages/hub/training/hand-lab.js');
    assert.match(handLabSrc, /\/api\/news\/spot-vote/);

    const wireIndexSrc = readRepo('pages/hub/wire/index.js');
    assert.match(wireIndexSrc, /Search Editions, Headlines Or Topics/);

    const wireEditionSrc = readRepo('pages/hub/wire/[edition].js');
    assert.match(wireEditionSrc, /prevEditionNumber/);
    assert.match(wireEditionSrc, /nextEditionNumber/);
    assert.match(wireEditionSrc, /triviaOfTheWeek/);
    assert.match(wireEditionSrc, /recentWinners/);

    const opsSrc = readRepo('pages/api/news/operations.js');
    assert.match(opsSrc, /save_promo_draft/);
    assert.match(opsSrc, /delete_promo_draft/);
    assert.match(opsSrc, /attributionSummary/);

    const adminSrc = readRepo('pages/admin/newsletter.js');
    assert.match(adminSrc, /save_promo_draft/);
    assert.match(adminSrc, /attributionSummary/);
    assert.doesNotMatch(adminSrc, FORBIDDEN_PALETTE_HEX_RE);
});

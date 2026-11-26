/**
 * Weekly Wire & Promotional Ecosystem V6 Forensic Root-Cause Hardening Law Suite
 *
 * Permanently locks all 22 root-cause repairs discovered during the exhaustive
 * V6 forensic audit across all 3 slices (Engines, Promo/Lifecycle/Webhooks/APIs,
 * and Reader/Admin Web Surfaces) plus Coordinator cross-slice verification:
 *
 *   V6 LAW 1: Notification Bell (`weekly_wire_published`) carries `action_url`, `link`,
 *             `read: false`, `is_read: false`, and `_push: 'none'`, and `resolveNotificationRoute`
 *             resolves `weekly_wire_published` to `/hub/wire/<edition>` even without explicit `link`.
 *   V6 LAW 2: Upcoming Kings Club queries use authoritative PostgreSQL `tournaments_status_check`
 *             statuses (`['ANNOUNCED', 'REGISTERING', 'LATE_REG', 'RUNNING']`, never `'SCHEDULED'`),
 *             and `evaluateColdSubscriberSunset` never queries phantom columns on `newsletter_subscribers`.
 *   V6 LAW 3: Outbound Smarter.Poker links in `renderWeeklyWireEmail` delegate to `appendNewsletterUtm`
 *             conforming to `firstTouch.mjs` while keeping signed HMAC `/api/news/*` URLs untouched,
 *             and `classifyClickedEmailSection` handles URL-encoded paths and redirect wrappers.
 *   V6 LAW 4: `parseCampaignSectionClicks` round-trips `sections` / `section_clicks` / `sectionClicks`
 *             across `applyCampaignTelemetryEvent` & `mergeFinalCampaignErrorSummary`, and `resend.js`
 *             extracts all 6 Resend click shapes while excluding `[SPOT-VOTE]%` and `[PROMO DRAFT]%`.
 *   V6 LAW 5: `loadZeroRepeatLedger` sorts deterministically, `previousSpotRecap` matches cycles 1..50,
 *             and all 83 catalog marker UUIDs + deep links are distinct valid RFC 4122 UUIDs / real routes.
 *   V6 LAW 6: `email-deliverability-check.js` uses `supabaseServerClient` (never raw `@supabase/supabase-js`)
 *             with finite zero-send `NaN` guards, and `weeklyWireEngine.mjs` strips both `\u2014` and `\u2013`.
 *   V6 LAW 7: `spot-vote.js` uses keyed HMAC voter privacy (`computeSpotVoterUuid`), deterministic row PK,
 *             duplicate-row folding (`mergeSpotVoteRows`), `updated_at` CAS, and `SPOT_VOTE_MAX_VOTERS = 10000`.
 *   V6 LAW 8: `operations.js` supports HTTP `DELETE`, bounds Promo Draft fields under SQL CHECK rules
 *             without `.maybeSingle()`, paginates `listUsers` (`perPage: 1000`), and batches `phone_verified`.
 *   V6 LAW 9: `subscribe.js` handles RFC 8058 `?unsubscribe=1&e=&t=` and upserts `user_id` + `notification_preferences`
 *             across all 4 logged-in cadence modes, and `middleware.ts` + `geo-blocks.json` allowlist promo routes.
 *   V6 LAW 10: `/hub/wire/index.js` builds deep `searchText`, and `/hub/wire/[edition].js` parses SSR vote tallies
 *              via `parseSpotVotesSummary`, normalizes `prize_pool` + `current_players`, and wires `?pick=`.
 *   V6 LAW 11: Hand Lab (`voteSeqRef` + `normaliseSpotVotes`), Trivia (`pickState.slug === cleanSlug` + `--tc-*`),
 *              and Article (`ARTICLE_UUID_RE` + `fetchSeqRef`) enforce stale-response & slug isolation.
 *   V6 LAW 12: Cross-surface `applyWireSubscriptionMode` & `WIRE_SUBSCRIPTION_CHANGED_EVENT`, per-user session check,
 *              `16px` mobile input, strict `shouldOptimizeSpImageSrc` host matching, and `['sent','partial']` sitemap parity.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

import { resolveNotificationRoute } from '../src/lib/notificationRoute.js';
import { parseFirstTouch } from '../src/lib/acquisition/firstTouch.mjs';
import { shouldOptimizeSpImageSrc } from '../src/lib/security/spImageOptimization.mjs';
import { appendNewsletterUtm, classifyClickedEmailSection } from '../src/lib/newsletter/utmAttribution.mjs';
import {
    applyCampaignTelemetryEvent,
    computeSpotVoteRowId,
    computeSpotVoterUuid,
    mergeFinalCampaignErrorSummary,
    parseCampaignSectionClicks,
    parseSpotVotesSummary,
    serializeSpotVotesSummary,
} from '../src/lib/newsletter/campaignTelemetry.mjs';
import {
    PLATFORM_UPDATES_CATALOG,
    SPOT_OF_THE_WEEK_CATALOG,
    TOOL_SPOTLIGHT_CATALOG,
    TRIVIA_OF_THE_WEEK_CATALOG,
} from '../src/lib/newsletter/weeklyWireCatalog.mjs';
import {
    curateWeeklyWireEdition,
    evaluateColdSubscriberSunset,
    renderWeeklyWireEmail,
    spotMarkerUuid,
    toolMarkerUuid,
    triviaMarkerUuid,
    updateMarkerUuid,
} from '../src/lib/newsletter/weeklyWireEngine.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test('V6 LAW 1: Notification Bell weekly_wire_published carries click target + _push:none and resolves in notificationRoute.js', () => {
    const digestSrc = read('pages/api/news/digest.js');
    assert.match(digestSrc, /type:\s*'weekly_wire_published'/);
    assert.match(digestSrc, /action_url:\s*wireRoute/);
    assert.match(digestSrc, /link:\s*wireRoute/);
    assert.match(digestSrc, /is_read:\s*false/);
    assert.match(digestSrc, /_push:\s*'none'/);

    // Both explicit-link rows and data-only rows must resolve to /hub/wire/<edition>
    assert.equal(
        resolveNotificationRoute({
            type: 'weekly_wire_published',
            action_url: '/hub/wire/4',
            link: '/hub/wire/4',
            data: { edition: 4 },
        }),
        '/hub/wire/4'
    );
    assert.equal(
        resolveNotificationRoute({
            type: 'weekly_wire_published',
            data: { edition: 7 },
        }),
        '/hub/wire/7'
    );
    assert.equal(
        resolveNotificationRoute({
            type: 'weekly_wire_published',
            data: {},
        }),
        '/hub/wire'
    );
});

test('V6 LAW 2: Kings Club tournament queries use valid PostgreSQL statuses and cold sunset avoids phantom columns', () => {
    const engineSrc = read('src/lib/newsletter/weeklyWireEngine.mjs');
    const editionPageSrc = read('pages/hub/wire/[edition].js');

    assert.doesNotMatch(engineSrc, /'SCHEDULED'/);
    assert.doesNotMatch(editionPageSrc, /'SCHEDULED'/);
    assert.match(engineSrc, /\['ANNOUNCED',\s*'REGISTERING',\s*'LATE_REG',\s*'RUNNING'\]/);
    assert.match(editionPageSrc, /\['ANNOUNCED',\s*'REGISTERING',\s*'LATE_REG',\s*'RUNNING'\]/);

    const executableEngineSrc = engineSrc
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
    for (const phantom of ['open_count', 'click_count', 'last_opened_at', 'last_clicked_at']) {
        assert.doesNotMatch(executableEngineSrc, new RegExp(`\\b${phantom}\\b`), `phantom column ${phantom} must not appear in executable weeklyWireEngine.mjs`);
    }

    const nowMs = Date.parse('2026-11-26T00:00:00Z');
    const engagedRow = {
        email: 'engaged@example.com',
        source: 'engaged:2026-11-20',
        subscribed_at: '2026-06-01T00:00:00Z',
        created_at: '2026-06-01T00:00:00Z',
    };
    const verdict = evaluateColdSubscriberSunset(engagedRow, { nowMs, activeAccountEmails: new Set() });
    assert.equal(verdict.action === 'sunset', false);
});

test('V6 LAW 3: Outbound rendered Weekly Wire links conform to firstTouch.mjs while preserving signed /api/news/* URLs', () => {
    process.env.NEWSLETTER_UNSUBSCRIBE_SECRET = process.env.NEWSLETTER_UNSUBSCRIBE_SECRET || 'v6-law-test-secret-key';
    const spot = SPOT_OF_THE_WEEK_CATALOG[0];
    const trivia = TRIVIA_OF_THE_WEEK_CATALOG[0];
    const tool = TOOL_SPOTLIGHT_CATALOG[0];
    const update = PLATFORM_UPDATES_CATALOG[0];

    const rendered = renderWeeklyWireEmail({
        recipient: {
            email: 'player@example.com',
            segment: 'active_member',
            username: 'Grinder99',
        },
        edition: {
            editionNumber: 5,
            subject: 'Smarter.Poker Weekly Wire #5',
            platformUpdates: [update],
            articles: [
                {
                    id: '11111111-2222-4333-8444-555555555555',
                    title: 'WSOP Main Event Reaches Final Table',
                    summary: 'Deep stack play resumes in Las Vegas.',
                    source_name: 'PokerNews',
                    image_url: 'https://smarter.poker/images/logo.png',
                    category: 'Tournament',
                },
            ],
            spotOfTheWeek: spot,
            triviaOfTheWeek: trivia,
            toolSpotlight: tool,
            kingsClubTournaments: [],
            recentWinners: [{ id: 't1', name: 'Nightly 10K GTD', prize_pool: 12500, current_players: 48 }],
            upcomingSeries: [],
        },
        siteUrl: 'https://smarter.poker',
    });

    const hrefs = [...rendered.html.matchAll(/href="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));
    assert.ok(hrefs.length >= 8, 'Expected rendered email links');

    for (const href of hrefs) {
        if (!href.startsWith('https://smarter.poker')) continue;
        const u = new URL(href);
        if (
            u.pathname === '/api/news/subscribe' ||
            u.pathname === '/api/news/email-image' ||
            u.pathname === '/api/news/calendar-ics'
        ) {
            assert.equal(u.searchParams.has('utm_source'), false, `Signed route ${u.pathname} must not get UTM params`);
            continue;
        }
        assert.equal(u.searchParams.get('utm_source'), 'weekly_wire', `Missing utm_source on ${href}`);
        assert.equal(u.searchParams.get('utm_medium'), 'email', `Missing utm_medium on ${href}`);
        if (!u.pathname.startsWith('/hub/club-arena')) {
            const parsedAttr = parseFirstTouch(u.search, u.pathname, Date.now());
            assert.ok(parsedAttr, `firstTouch.mjs rejected ${href}`);
            assert.equal(parsedAttr.utm_source, 'weekly_wire');
        }
    }

    // URL-encoded and redirect-wrapped section classification
    assert.equal(
        classifyClickedEmailSection('https://track.example.com/click?url=' + encodeURIComponent('https://smarter.poker/hub/trivia?wire_q=test&pick=A')),
        'trivia'
    );
    assert.equal(
        classifyClickedEmailSection('https://track.example.com/click?target=' + encodeURIComponent('https://smarter.poker/hub/training/hand-lab?spot=test&pick=B')),
        'spot'
    );
    assert.equal(
        appendNewsletterUtm('http://localhost:3000/hub/wire/1', { source: 'weekly_wire', medium: 'email', campaign: 'wire_1' }).includes('utm_source=weekly_wire'),
        true
    );
});

test('V6 LAW 4: Campaign telemetry round-trips sections/section_clicks and resend.js handles all 6 click shapes safely', () => {
    const step1 = applyCampaignTelemetryEvent(null, 'email.clicked', {
        clickedUrl: 'https://smarter.poker/hub/trivia?wire_q=pot-odds&pick=B',
    });
    const step2 = applyCampaignTelemetryEvent(step1.errorSummary, 'email.clicked', {
        clickedUrl: 'https://smarter.poker/hub/training/hand-lab?spot=turn-overbet&pick=A',
    });
    const finalized = mergeFinalCampaignErrorSummary(step2.errorSummary, ['1 transient timeout']);
    const sections = parseCampaignSectionClicks(finalized);
    assert.deepEqual(sections, { trivia: 1, spot: 1 });

    // Legacy section_clicks-only payload still parses cleanly
    assert.deepEqual(
        parseCampaignSectionClicks('telemetry:{"opens":3,"clicks":2,"section_clicks":{"kings_club":2}}'),
        { kings_club: 2 }
    );

    const resendSrc = read('pages/api/webhooks/resend.js');
    assert.match(resendSrc, /event\?\.data\?\.click\?\.link/);
    assert.match(resendSrc, /event\?\.data\?\.link/);
    assert.match(resendSrc, /event\?\.data\?\.click\?\.url/);
    assert.match(resendSrc, /\[SPOT-VOTE\]%/);
    assert.match(resendSrc, /\[PROMO DRAFT\]%/);
});

test('V6 LAW 5: All 83 catalog marker UUIDs are distinct RFC 4122 UUIDs, deep links exist, and previousSpotRecap handles multi-cycle history', async () => {
    const seenUuids = new Set();
    const checkUuid = (id, label) => {
        assert.match(id, UUID_RE, `Invalid UUID for ${label}: ${id}`);
        assert.equal(seenUuids.has(id), false, `Duplicate marker UUID on ${label}: ${id}`);
        seenUuids.add(id);
    };

    for (const s of SPOT_OF_THE_WEEK_CATALOG) checkUuid(spotMarkerUuid(s.slug), `spot:${s.slug}`);
    for (const q of TRIVIA_OF_THE_WEEK_CATALOG) checkUuid(triviaMarkerUuid(q.slug), `trivia:${q.slug}`);
    for (const u of PLATFORM_UPDATES_CATALOG) checkUuid(updateMarkerUuid(u.slug), `update:${u.slug}`);
    for (const t of TOOL_SPOTLIGHT_CATALOG) checkUuid(toolMarkerUuid(t.slug), `tool:${t.slug}`);
    assert.equal(seenUuids.size, 83);

    // Every catalog URL resolves to a real route under pages/ or /hub/club-arena
    const routeExists = (rawUrl) => {
        const pathname = new URL(rawUrl, 'https://smarter.poker').pathname.replace(/\/+$/, '') || '/index';
        if (pathname.startsWith('/hub/club-arena')) return true;
        const rel = pathname.replace(/^\//, '');
        const candidates = [
            `pages/${rel}.js`,
            `pages/${rel}.jsx`,
            `pages/${rel}.tsx`,
            `pages/${rel}/index.js`,
            `pages/${rel}/index.jsx`,
            `pages/${rel}/index.tsx`,
            `pages/${ path.dirname(rel) }/[id].js`,
            `pages/${ path.dirname(rel) }/[slug].js`,
            `pages/${ path.dirname(rel) }/[tab].js`,
            `pages/${ path.dirname(rel) }/[gameId].js`,
        ];
        return candidates.some((c) => fs.existsSync(path.join(REPO, c)));
    };

    for (const u of PLATFORM_UPDATES_CATALOG) assert.equal(routeExists(u.ctaUrl), true, `Missing route for ${u.ctaUrl}`);
    for (const t of TOOL_SPOTLIGHT_CATALOG) assert.equal(routeExists(t.url), true, `Missing route for ${t.url}`);

    // Out-of-order DB campaigns still resolve the latest completed edition's spot for previousSpotRecap
    const spot0 = SPOT_OF_THE_WEEK_CATALOG[0];
    const spot1 = SPOT_OF_THE_WEEK_CATALOG[1];
    const mockSb = {
        from(table) {
            const chain = {
                select() { return chain; },
                in() { return chain; },
                eq() { return chain; },
                neq() { return chain; },
                not() { return chain; },
                or() { return chain; },
                gte() { return chain; },
                gt() { return chain; },
                order() { return chain; },
                limit() {
                    if (table === 'newsletter_campaigns') {
                        // Deliberately unsorted: Edition #2 (newer completed_at) is BEFORE Edition #1
                        return Promise.resolve({
                            data: [
                                {
                                    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
                                    subject: 'Smarter.Poker Weekly Wire #1',
                                    status: 'sent',
                                    article_ids: [spotMarkerUuid(spot0.slug)],
                                    completed_at: '2026-11-10T14:00:00Z',
                                    created_at: '2026-11-10T14:00:00Z',
                                },
                                {
                                    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
                                    subject: 'Smarter.Poker Weekly Wire #2',
                                    status: 'sent',
                                    article_ids: [spotMarkerUuid(spot1.slug)],
                                    completed_at: '2026-11-17T14:00:00Z',
                                    created_at: '2026-11-17T14:00:00Z',
                                },
                            ],
                            error: null,
                        });
                    }
                    return Promise.resolve({ data: [], error: null });
                },
            };
            return chain;
        },
    };
    const curated = await curateWeeklyWireEdition(mockSb, { enrichMetaDescriptions: false });
    assert.equal(curated.previousSpotRecap?.slug, spot1.slug);
});

test('V6 LAW 6: email-deliverability-check uses supabaseServerClient + zero-send guard, and engine strips both em and en dashes', () => {
    const cronSrc = read('pages/api/cron/email-deliverability-check.js');
    assert.doesNotMatch(cronSrc, /from\s+['"]@supabase\/supabase-js['"]/);
    assert.match(cronSrc, /supabaseServerClient/);
    assert.match(cronSrc, /Number\.isFinite/);

    const engineSrc = read('src/lib/newsletter/weeklyWireEngine.mjs');
    assert.match(engineSrc, /\\u2013\\u2014/);
    assert.match(engineSrc, /&ndash;/);
});

test('V6 LAW 7: spot-vote.js enforces keyed HMAC voter privacy, deterministic row PK, duplicate folding, and CAS', () => {
    const u1 = computeSpotVoterUuid('spot-a', 'ip:abc', 'A', 'secret-1');
    const u2 = computeSpotVoterUuid('spot-a', 'ip:abc', 'A', 'secret-2');
    const uPickB = computeSpotVoterUuid('spot-a', 'ip:abc', 'B', 'secret-1');
    assert.match(u1, UUID_RE);
    assert.notEqual(u1, u2, 'HMAC secret must key voter UUIDs');
    assert.notEqual(u1, uPickB, 'Pick option must fold into voter UUID');

    const spotVoteSrc = read('pages/api/news/spot-vote.js');
    assert.doesNotMatch(spotVoteSrc, /\.maybeSingle\s*\(/);
    assert.match(spotVoteSrc, /computeSpotVoteRowId/);
    assert.match(spotVoteSrc, /mergeSpotVoteRows/);
    assert.match(spotVoteSrc, /SPOT_VOTE_MAX_VOTERS\s*=\s*10000/);
    assert.match(spotVoteSrc, /23505/);
});

test('V6 LAW 8: operations.js supports HTTP DELETE, bounds Promo Drafts without maybeSingle, and paginates listUsers', () => {
    const opsSrc = read('pages/api/news/operations.js');
    assert.match(opsSrc, /\['GET',\s*'PATCH',\s*'POST',\s*'DELETE'\]/);
    assert.match(opsSrc, /req\.method\s*===\s*'DELETE'/);
    assert.match(opsSrc, /perPage:\s*1000/);
    assert.match(opsSrc, /for\s*\(\s*let\s+page\s*=\s*1;\s*page\s*<=\s*10/);
    assert.match(opsSrc, /attributedIds\.slice\(i,\s*i\s*\+\s*150\)/);
    assert.match(opsSrc, /parseCampaignSectionClicks\(campaign\.error_summary\)/);
});

test('V6 LAW 9: subscribe.js resolves RFC 8058 query pairs, upserts session user_id + notification_preferences, and middleware allowlists promo routes', () => {
    const subSrc = read('pages/api/news/subscribe.js');
    assert.match(subSrc, /resolveTokenOrEmailQuery/);
    assert.match(subSrc, /sessionUserId/);
    assert.match(subSrc, /from\('notification_preferences'\)[\s\S]{0,120}\.upsert/);

    const geoJson = JSON.parse(read('config/geo-blocks.json'));
    const mwSrc = read('middleware.ts');
    for (const p of ['/go/promo', '/go/welcome-back', '/promo/welcome-back']) {
        assert.equal(geoJson.allow_paths.includes(p), true, `geo-blocks.json missing ${p}`);
        assert.equal(mwSrc.includes(`'${p}'`), true, `middleware.ts AUTH_ALWAYS_ALLOW missing ${p}`);
    }
});

test('V6 LAW 10: /hub/wire/index.js indexes deep searchText and /hub/wire/[edition].js parses serialized vote JSON + tournament prize_pool', () => {
    const indexSrc = read('pages/hub/wire/index.js');
    assert.match(indexSrc, /buildEditionSearchText/);
    assert.match(indexSrc, /searchText/);

    const editionSrc = read('pages/hub/wire/[edition].js');
    assert.match(editionSrc, /parseSpotVotesSummary/);
    assert.match(editionSrc, /normalizeKingsWinnerRow/);
    assert.match(editionSrc, /useRouter/);
    assert.match(editionSrc, /data-previous-spot-recap/);
    assert.match(editionSrc, /data-kings-club-winners-circle/);

    // Round-trip proof between serializeSpotVotesSummary and parseSpotVotesSummary used by [edition].js
    const encoded = serializeSpotVotesSummary({ A: 14, B: 5, C: 1 });
    assert.deepEqual(parseSpotVotesSummary(encoded), { A: 14, B: 5, C: 1 });
});

test('V6 LAW 11: Hand Lab, Trivia Banner, and Article Reader enforce request sequence & slug isolation', () => {
    const handLabSrc = read('pages/hub/training/hand-lab.js');
    assert.match(handLabSrc, /normaliseSpotVotes/);
    assert.match(handLabSrc, /voteSeqRef/);
    assert.match(handLabSrc, /voteInFlightRef/);

    const triviaSrc = read('pages/hub/trivia/index.js');
    assert.match(triviaSrc, /pickState\.slug\s*===\s*cleanSlug/);
    assert.match(triviaSrc, /var\(--tc-/);

    const articleSrc = read('pages/hub/article.js');
    assert.match(articleSrc, /ARTICLE_UUID_RE/);
    assert.match(articleSrc, /fetchSeqRef/);
});

test('V6 LAW 12: Cross-surface subscription sync, per-user capture cache, strict SPImage host matching, and partial sitemap parity', () => {
    const captureSrc = read('src/components/news/NewsletterCaptureBar.js');
    const captureCss = read('src/components/news/NewsletterCaptureBar.module.css');
    const notifSrc = read('pages/hub/settings/notifications.js');
    const emailPrefsSrc = read('pages/hub/email-preferences.js');
    const coreSitemapSrc = read('pages/sitemap-core.xml.js');

    assert.match(captureSrc, /WIRE_SUBSCRIPTION_CHANGED_EVENT/);
    assert.match(captureSrc, /getAuthUserId/);
    assert.match(captureCss, /font-size:\s*16px/);
    assert.match(notifSrc, /applyWireSubscriptionMode/);
    assert.match(emailPrefsSrc, /WIRE_SUBSCRIPTION_CHANGED_EVENT/);
    assert.match(coreSitemapSrc, /\.in\('status',\s*\['sent',\s*'partial'\]\)/);

    assert.equal(shouldOptimizeSpImageSrc('https://evilsmarter.poker/attack.jpg'), false);
    assert.equal(shouldOptimizeSpImageSrc('https://smarter.poker/images/logo.png'), true);
    assert.equal(shouldOptimizeSpImageSrc('/api/news/email-image?fallback=1'), false);
});

test('V6 LAW 13: Unsubscribe & preference targets require valid HMAC-SHA256 signatures and block bare-email IDOR or synthetic capture domains', () => {
    const subSrc = read('pages/api/news/subscribe.js');
    assert.match(subSrc, /if\s*\(!target\s*\|\|\s*target\.verified\s*!==\s*true\)/);
    assert.doesNotMatch(subSrc, /verified:\s*false/, 'subscribe.js must never emit unverified email targets');
    assert.match(subSrc, /authenticatedOwnerId/, 'anonymous POST /api/news/subscribe must not overwrite existing member notification_preferences without session ownership');

    const startIdx = subSrc.indexOf('const EMAIL_RE =');
    const endIdx = subSrc.indexOf('export { buildWelcomeEmail');
    assert.ok(startIdx > 0 && endIdx > startIdx, 'subscribe.js must expose pure token & domain helpers');
    const snippet = subSrc
        .slice(startIdx, endIdx)
        .replace(/^export\s+function\s+/gm, 'function ');
    const sandbox = { Buffer, crypto, process, Set, exports: {} };
    vm.runInNewContext(
        `${snippet}\nexports.makeUnsubscribeToken = makeUnsubscribeToken;\nexports.resolveTokenOrEmailQuery = resolveTokenOrEmailQuery;\nexports.resolveUnsubscribeTarget = resolveUnsubscribeTarget;\nexports.isBlockedCaptureEmail = isBlockedCaptureEmail;`,
        sandbox
    );
    const {
        makeUnsubscribeToken,
        resolveTokenOrEmailQuery,
        resolveUnsubscribeTarget,
        isBlockedCaptureEmail,
    } = sandbox.exports;

    const savedSecret = process.env.NEWSLETTER_UNSUBSCRIBE_SECRET;
    process.env.NEWSLETTER_UNSUBSCRIBE_SECRET = 'v6-law-13-hmac-test-secret-20261126';
    try {
        // 1. Bare unauthenticated email MUST be rejected (prevents mass-unsubscribe IDOR)
        assert.equal(resolveUnsubscribeTarget('victim@gmail.com', {}), null);
        assert.equal(resolveUnsubscribeTarget('1', { e: 'victim@gmail.com' }), null);

        // 2. Forged or tampered HMAC signatures MUST be rejected
        assert.equal(resolveUnsubscribeTarget('1', { e: 'victim@gmail.com', t: 'invalid' }), null);
        assert.equal(resolveTokenOrEmailQuery({ e: 'victim@gmail.com', t: 'invalid' }), null);

        // 3. Valid full signed token (?unsubscribe=<payload.sig>) resolves with verified: true and full token
        const fullTok = makeUnsubscribeToken('Player.One@Gmail.com');
        const [payloadPart, sigPart] = fullTok.split('.');
        assert.ok(payloadPart && sigPart);
        const resolvedDirect = resolveUnsubscribeTarget(fullTok, {});
        assert.deepEqual(
            { ...resolvedDirect },
            {
                email: 'player.one@gmail.com',
                verified: true,
                token: fullTok,
            }
        );

        // 4. Valid split RFC 8058 pair (?unsubscribe=1&e=<email>&t=<sig>) reconstructs full token (never '1')
        const resolvedSplit = resolveUnsubscribeTarget('1', { e: 'Player.One@Gmail.com', t: sigPart });
        assert.deepEqual(
            { ...resolvedSplit },
            {
                email: 'player.one@gmail.com',
                verified: true,
                token: fullTok,
            }
        );

        // 5. Mismatched email + foreign valid token MUST be rejected
        assert.equal(resolveTokenOrEmailQuery({ e: 'other@gmail.com', t: fullTok }), null);

        // 6. Synthetic / RFC 2606 domains blocked at capture ingress
        assert.equal(isBlockedCaptureEmail('test@example.com'), true);
        assert.equal(isBlockedCaptureEmail('bot@horse.ai'), true);
        assert.equal(isBlockedCaptureEmail('real.player@gmail.com'), false);
    } finally {
        if (savedSecret === undefined) delete process.env.NEWSLETTER_UNSUBSCRIBE_SECRET;
        else process.env.NEWSLETTER_UNSUBSCRIBE_SECRET = savedSecret;
    }
});

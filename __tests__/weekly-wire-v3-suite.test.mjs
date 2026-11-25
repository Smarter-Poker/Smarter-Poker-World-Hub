import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
    isCompetitorSponsoredPost,
    normalizeEditorialTitle,
} from '../src/lib/newsletter/editorialCleaners.mjs';
import { SPOT_OF_THE_WEEK_CATALOG } from '../src/lib/newsletter/weeklyWireCatalog.mjs';
import {
    curateWeeklyWireEdition,
    renderWeeklyWireEmail,
    resolveWeeklyWireRecipients,
    spotMarkerUuid,
} from '../src/lib/newsletter/weeklyWireEngine.mjs';
import { resolvePromoAudience } from '../src/lib/promoCampaigns/dispatch.mjs';
import {
    applyCampaignTelemetryEvent,
    extractResendCampaignId,
    lifecycleMarkerUuid,
    parseCampaignTelemetrySummary,
    runLifecycleRetention,
} from '../src/lib/promoCampaigns/lifecycleEngine.mjs';
import {
    buildWelcomeEmail,
    derivePreferenceMode,
    maskEmailAddress,
} from '../src/lib/newsletter/welcomeAndPreferences.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BANNED_PALETTE = /#(fbbf24|f59e0b|fcd34d|fde047|eab308|facc15|d97706|c084fc|a855f7|8b5cf6|7c3aed|9333ea|d8b4fe|e9d5ff)\b/i;

function createMockSupabase(initial = {}) {
    const tables = {
        newsletter_campaigns: [...(initial.newsletter_campaigns || [])],
        poker_news: [...(initial.poker_news || [])],
        poker_series: [...(initial.poker_series || [])],
        newsletter_subscribers: [...(initial.newsletter_subscribers || [])],
        notification_preferences: [...(initial.notification_preferences || [])],
        profiles: [...(initial.profiles || [])],
        club_members: [...(initial.club_members || [])],
        promo_codes: [...(initial.promo_codes || [])],
        promo_code_redemptions: [...(initial.promo_code_redemptions || [])],
        sms_delivery_receipts: [...(initial.sms_delivery_receipts || [])],
        commander_members: [...(initial.commander_members || [])],
        commander_onboarding_leads: [...(initial.commander_onboarding_leads || [])],
        commander_leads: [...(initial.commander_leads || [])],
        commander_home_members: [...(initial.commander_home_members || [])],
    };

    return {
        tables,
        from(table) {
            let rows = [...(tables[table] || [])];
            const state = {
                filters: [],
                limitCount: null,
                rangeBounds: null,
                insertPayload: null,
                updatePayload: null,
            };

            const apply = () => {
                let out = rows.filter((r) => state.filters.every((fn) => fn(r)));
                if (state.rangeBounds) {
                    out = out.slice(state.rangeBounds[0], state.rangeBounds[1] + 1);
                } else if (typeof state.limitCount === 'number') {
                    out = out.slice(0, state.limitCount);
                }
                return out;
            };

            const builder = {
                select() {
                    return builder;
                },
                eq(col, val) {
                    state.filters.push((r) => r?.[col] === val);
                    return builder;
                },
                neq(col, val) {
                    state.filters.push((r) => r?.[col] !== val);
                    return builder;
                },
                in(col, vals) {
                    const set = new Set(vals || []);
                    state.filters.push((r) => set.has(r?.[col]));
                    return builder;
                },
                gte(col, val) {
                    state.filters.push((r) => String(r?.[col] || '') >= String(val));
                    return builder;
                },
                lte(col, val) {
                    state.filters.push((r) => String(r?.[col] || '') <= String(val));
                    return builder;
                },
                like(col, pat) {
                    const re = new RegExp(`^${String(pat).replace(/%/g, '.*')}$`, 'i');
                    state.filters.push((r) => re.test(String(r?.[col] || '')));
                    return builder;
                },
                ilike(col, pat) {
                    const re = new RegExp(`^${String(pat).replace(/%/g, '.*')}$`, 'i');
                    state.filters.push((r) => re.test(String(r?.[col] || '')));
                    return builder;
                },
                or() {
                    return builder;
                },
                order() {
                    return builder;
                },
                limit(n) {
                    state.limitCount = n;
                    return builder;
                },
                range(a, b) {
                    state.rangeBounds = [a, b];
                    return builder;
                },
                insert(payload) {
                    const arr = Array.isArray(payload) ? payload : [payload];
                    const inserted = arr.map((item, idx) => ({
                        id: item.id || `mock-${table}-${tables[table].length + idx + 1}`,
                        created_at: item.created_at || new Date().toISOString(),
                        ...item,
                    }));
                    tables[table].push(...inserted);
                    rows = inserted;
                    state.filters = [];
                    return builder;
                },
                update(patch) {
                    state.updatePayload = patch;
                    const matched = apply();
                    for (const row of matched) {
                        Object.assign(row, patch);
                    }
                    rows = matched;
                    state.filters = [];
                    return builder;
                },
                async maybeSingle() {
                    const out = apply();
                    return { data: out[0] || null, error: null };
                },
                then(resolve, reject) {
                    try {
                        const out = apply();
                        return Promise.resolve({ data: out, error: null, count: out.length }).then(resolve, reject);
                    } catch (e) {
                        return Promise.reject(e).then(resolve, reject);
                    }
                },
            };
            return builder;
        },
    };
}

test('editorialCleaners normalizes ALL-CAPS headlines + poker acronyms and blocks rival sponsored ads', () => {
    assert.equal(
        normalizeEditorialTitle('WSOP SUPER CIRCUIT PUNTA CANA: BLACK FRIDAY PACKAGE DEAL'),
        'WSOP Super Circuit Punta Cana: Black Friday Package Deal'
    );
    assert.equal(
        normalizeEditorialTitle('Circuit Couples Clash Sparks Run To Wsopc New Orleans Nlh Main Event Title'),
        'Circuit Couples Clash Sparks Run To WSOPC New Orleans NLH Main Event Title'
    );

    // Rival GTO / club app advertorials blocked
    assert.equal(
        isCompetitorSponsoredPost({
            title: "GTO Lab's Black Friday Offer Will Save You 25% on a Pro Subscription",
            summary: "This is a deal you can't pass up.",
        }),
        true
    );
    assert.equal(
        isCompetitorSponsoredPost({
            title: 'Save 30% Off GTO Wizard Annual Plan With Promo Code',
        }),
        true
    );

    // Real tournament series packages kept
    assert.equal(
        isCompetitorSponsoredPost({
            title: 'WSOP SUPER CIRCUIT PUNTA CANA: BLACK FRIDAY PACKAGE DEAL',
            source_url: 'https://www.wsop.com/news/wsop-super-circuit-punta-cana-black-friday-package-deal/',
        }),
        false
    );
});

test('Weekly Wire V3 curates Spot Of The Week, live series, preheader, personal stats, referral URL, and preferences link', async () => {
    const nowIso = new Date().toISOString();
    const db = createMockSupabase({
        newsletter_campaigns: [
            {
                id: 'camp-old',
                subject: 'Wire #1',
                status: 'sent',
                article_ids: [spotMarkerUuid(SPOT_OF_THE_WEEK_CATALOG[0].slug)],
                created_at: nowIso,
            },
        ],
        poker_news: [
            {
                id: '11111111-1111-4111-8111-111111111111',
                title: "GTO Lab's Black Friday Offer Will Save You 25% on a Pro Subscription",
                summary: 'Rival ad should be skipped.',
                source_name: 'PokerNews',
                is_published: true,
                published_at: nowIso,
            },
            {
                id: '22222222-2222-4222-8222-222222222222',
                title: 'WSOP SUPER CIRCUIT PUNTA CANA: CHAMPIONSHIP SCHEDULE ANNOUNCED',
                summary: 'Full championship schedule and main event structure announced for Punta Cana.',
                source_name: 'WSOP',
                image_url: 'https://smarter.poker/cards/news.png',
                category: 'TOURNAMENT',
                is_published: true,
                published_at: nowIso,
            },
        ],
        poker_series: [
            {
                id: 'series-1',
                series_name: 'Mid-States Poker Tour Venetian',
                venue_name: 'The Venetian',
                city: 'Las Vegas',
                state: 'NV',
                start_date: '2026-12-01',
                end_date: '2026-12-15',
                is_suppressed: false,
            },
        ],
    });

    const edition = await curateWeeklyWireEdition(db, {
        days: 7,
        articleLimit: 5,
        enrichMetaDescriptions: false,
    });

    assert.equal(edition.diagnostics.skippedCompetitorAds, 1);
    assert.equal(edition.articles.length, 1);
    assert.equal(
        edition.articles[0].title,
        'WSOP Super Circuit Punta Cana: Championship Schedule Announced'
    );
    // Spot #0 was consumed in camp-old -> advances to Spot #1
    assert.equal(edition.spotOfTheWeek.slug, SPOT_OF_THE_WEEK_CATALOG[1].slug);
    assert.equal(edition.upcomingSeries.length, 1);

    const rendered = renderWeeklyWireEmail({
        edition,
        siteUrl: 'https://smarter.poker',
        unsubscribeUrl: 'https://smarter.poker/api/news/subscribe?unsubscribe=tok123',
        preferencesUrl: 'https://smarter.poker/hub/email-preferences?token=tok123',
        recipientMeta: {
            username: 'acegrinder',
            diamonds: 1450,
            isVip: true,
            referralCode: '84210',
        },
    });

    assert.match(rendered.html, /mso-hide:all/); // hidden inbox preheader
    assert.match(rendered.html, /\/hub\/wire\/2/); // web edition link
    assert.match(rendered.html, /acegrinder/); // personal pulse card
    assert.match(rendered.html, /1,450/); // formatted diamonds
    assert.match(rendered.html, /Spot Of The Week/); // interactive GTO quiz
    assert.match(rendered.html, /Mid-States Poker Tour Venetian/); // live series radar
    assert.match(rendered.html, /\/auth\/signup\?ref=84210/); // numeric player_number referral loop
    assert.doesNotMatch(rendered.html, /\/auth\/signup\?ref=WIRE/i);
    assert.match(rendered.html, /\/hub\/email-preferences\?token=tok123/); // preferences center
    assert.doesNotMatch(rendered.html, BANNED_PALETTE);
    assert.doesNotMatch(rendered.html, /\u2014/);
});

test('preference modes wire_only and snooze_30d filter promo broadcasts while preserving Weekly Wire rules', async () => {
    const nowMs = Date.parse('2026-11-25T03:00:00Z');
    const futureIso = new Date(nowMs + 10 * 86400000).toISOString();

    assert.equal(derivePreferenceMode({ is_active: true, source: 'pref:wire_only' }, nowMs), 'wire_only');
    assert.equal(derivePreferenceMode({ is_active: true, source: `snooze:${futureIso}` }, nowMs), 'snooze_30d');
    assert.equal(derivePreferenceMode({ is_active: false, source: 'pref:all' }, nowMs), 'unsubscribed');

    const db = createMockSupabase({
        newsletter_subscribers: [
            { id: '1', email: 'wireonly@gmail.com', is_active: true, source: 'pref:wire_only' },
            { id: '2', email: 'snoozed@gmail.com', is_active: true, source: `snooze:${futureIso}` },
            { id: '3', email: 'fullsub@gmail.com', is_active: true, source: 'pref:all' },
        ],
    });

    const wireAudience = await resolveWeeklyWireRecipients(db, { audienceMode: 'subscribers_only', nowMs });
    const wireEmails = wireAudience.recipients.map((r) => r.email);
    assert.equal(wireEmails.includes('wireonly@gmail.com'), true, 'wire_only stays subscribed to Weekly Wire');
    assert.equal(wireEmails.includes('snoozed@gmail.com'), false, 'active snooze skips Weekly Wire');
    assert.equal(wireEmails.includes('fullsub@gmail.com'), true);

    const promoAudience = await resolvePromoAudience(db, { scope: 'non_accounts', nowMs });
    const promoEmails = promoAudience.emails.map((r) => (typeof r === 'string' ? r : r.email));
    assert.equal(promoEmails.includes('wireonly@gmail.com'), false, 'wire_only skips promo blasts');
    assert.equal(promoEmails.includes('snoozed@gmail.com'), false, 'active snooze skips promo blasts');
    assert.equal(promoEmails.includes('fullsub@gmail.com'), true);
});

test('Day-0 Welcome Email and preference helpers round-trip cleanly with Vanguard palette', () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-signing-secret-v3';
    assert.equal(maskEmailAddress('newplayer@gmail.com'), 'n***@gmail.com');

    const leadWelcome = buildWelcomeEmail({
        hasExistingProfile: false,
        siteUrl: 'https://smarter.poker',
        unsubscribeUrl: 'https://smarter.poker/api/news/subscribe?unsubscribe=tok1',
        preferencesUrl: 'https://smarter.poker/hub/email-preferences?token=tok1',
    });
    assert.match(leadWelcome.subject, /25 Free Chips/);
    assert.match(leadWelcome.html, /pt=/);
    assert.doesNotMatch(leadWelcome.html, BANNED_PALETTE);

    const memberWelcome = buildWelcomeEmail({
        hasExistingProfile: true,
        username: 'shark99',
        siteUrl: 'https://smarter.poker',
        unsubscribeUrl: 'https://smarter.poker/api/news/subscribe?unsubscribe=tok2',
        preferencesUrl: 'https://smarter.poker/hub/email-preferences?token=tok2',
    });
    assert.match(memberWelcome.subject, /Weekly Wire/);
    assert.doesNotMatch(memberWelcome.html, BANNED_PALETTE);
});

test('lifecycleEngine enforces once-ever unverified_48h, 90d welcome_back_21d, 60d vip_diamond_nudge, and 20h dailyGate', async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-signing-secret-v3';
    const nowMs = Date.parse('2026-11-25T16:00:00Z');
    const daysAgo = (d) => new Date(nowMs - d * 86400000).toISOString();

    const uUnverified = '10000000-0000-4000-8000-000000000101';
    const uDormant25 = '10000000-0000-4000-8000-000000000102';
    const uVipSoon = '10000000-0000-4000-8000-000000000103';

    const db = createMockSupabase({
        profiles: [
            {
                id: uUnverified,
                username: 'unverified_hero',
                email: 'unverified@gmail.com',
                phone_verified: false,
                diamonds: 100,
                is_vip: false,
                is_horse: false,
                created_at: daysAgo(3),
                last_active: daysAgo(3),
            },
            {
                id: uDormant25,
                username: 'dormant_25d',
                email: 'dormant25@gmail.com',
                phone: '+13124567890',
                phone_verified: true,
                diamonds: 50,
                is_vip: false,
                is_horse: false,
                created_at: daysAgo(60),
                last_active: daysAgo(25),
            },
            {
                id: uVipSoon,
                username: 'vip_expiring',
                email: 'vipsoon@gmail.com',
                phone_verified: true,
                diamonds: 800,
                is_vip: true,
                vip_expires_at: new Date(nowMs + 2 * 86400000).toISOString(),
                is_horse: false,
                created_at: daysAgo(90),
                last_active: daysAgo(2),
            },
        ],
    });

    const sentEmails = [];
    const sentSms = [];
    const preview = await runLifecycleRetention(db, { dryRun: true, nowMs });
    assert.equal(preview.counts.unverified_48h, 1);
    assert.equal(preview.counts.welcome_back_21d, 1);
    assert.equal(preview.counts.vip_diamond_nudge, 1);

    const liveRun = await runLifecycleRetention(db, {
        dryRun: false,
        nowMs,
        sendEmailFn: async (msg) => {
            sentEmails.push(msg);
            return { ok: true };
        },
        sendSmsFn: async (to, body) => {
            sentSms.push({ to, body });
            return { ok: true };
        },
    });
    assert.equal(liveRun.emailSent, 3);
    assert.equal(db.tables.newsletter_campaigns.length, 1);
    assert.equal(
        db.tables.newsletter_campaigns[0].article_ids.includes(lifecycleMarkerUuid('unverified_48h', uUnverified)),
        true
    );

    // Immediate second run without dailyGate -> 0 due because markers are recorded!
    const repeatPreview = await runLifecycleRetention(db, {
        dryRun: true,
        nowMs: nowMs + 3600000,
    });
    assert.equal(repeatPreview.dueTotal, 0, 'recorded lifecycle markers must prevent duplicate nudges');

    // dailyGate within 20h skips immediately
    const gated = await runLifecycleRetention(db, {
        dryRun: false,
        dailyGate: true,
        nowMs: nowMs + 3600000,
    });
    assert.equal(gated.alreadyRanToday, true);
});

test('Resend campaign open/click telemetry helpers and BIMI/UI assets meet strict repo standards', () => {
    const campId = '48e3bd93-52e8-4a1b-8f15-75f3d03e2cdd';
    assert.equal(extractResendCampaignId([{ name: 'campaign_id', value: campId }]), campId);
    assert.equal(extractResendCampaignId({ campaign_id: campId }), campId);

    const afterOpen = applyCampaignTelemetryEvent(null, 'email.opened');
    const afterClick = applyCampaignTelemetryEvent(afterOpen.errorSummary, 'email.clicked');
    const parsed = parseCampaignTelemetrySummary(afterClick.errorSummary);
    assert.equal(parsed.opens, 1);
    assert.equal(parsed.clicks, 1);

    // BIMI Tiny-PS SVG validation
    const bimi = fs.readFileSync(path.join(REPO_ROOT, 'public/brand/bimi-logo.svg'), 'utf8');
    assert.match(bimi, /baseProfile="tiny-ps"/);
    assert.match(bimi, /<title>Smarter\.Poker<\/title>/);
    assert.doesNotMatch(bimi, /<script/i);
    assert.doesNotMatch(bimi, BANNED_PALETTE);

    // New growth & archive surfaces adhere to Vanguard palette
    for (const rel of [
        'src/components/news/NewsletterCaptureBar.js',
        'src/components/news/NewsletterCaptureBar.module.css',
        'pages/hub/email-preferences.js',
        'pages/hub/wire/index.js',
        'pages/hub/wire/[edition].js',
        'src/lib/promoCampaigns/lifecycleEngine.mjs',
        'pages/admin/newsletter.js',
    ]) {
        const src = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
        assert.doesNotMatch(src, BANNED_PALETTE, `${rel} must not contain yellow or purple hex codes`);
    }
});

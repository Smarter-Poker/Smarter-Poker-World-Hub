/**
 * NEWSLETTER, PROMO, LIFECYCLE & NEWS HUB END-TO-END WIRING & OPS LAW (2026-11-25)
 *
 * Encodes permanent root-cause anti-regression laws for every defect discovered and
 * fixed in Pass 2 of the exhaustive forensic audit:
 *
 *   - LAW P2-1: Admin Operations Route & Subscriber Reactivation Law
 *     `/admin/newsletter` must NEVER send writes to `/api/admin/*` (which Next.js
 *     `middleware.ts` blocks with `403 MFA challenge required` when `mfa_session`
 *     is absent), and reactivating a subscriber must clear suppressed `source`
 *     values (`snooze:*`, `unsubscribe`, `resend_bounce`, `resend_complaint`,
 *     `sms_opt_out`, `admin_deactivated`).
 *
 *   - LAW P2-2: Next.js 16 `<SPImage>` Optimizer & Zero Third-Party CSP Fallback Law
 *     `shouldOptimizeSpImageSrc` must mark `/api/*`, query-string local paths, and
 *     `data:`/`blob:` URIs unoptimized (preventing `/_next/image` `HTTP 400
 *     INVALID_IMAGE_OPTIMIZE_REQUEST`), zero `pexels.com` fallback URLs may remain
 *     in News Hub components, all `onError` handlers must guard against relative-URL
 *     loops via `dataset.fb`, and `/hub/wire` + `/hub/wire/[edition]` must emit
 *     signed first-party `og:image` & `twitter:image` meta tags.
 *
 *   - LAW P2-3: 21-Day Inactivity & Welcome-Back Redemption Producer/Consumer Parity Law
 *     `resolveWeeklyWireRecipients`, `runLifecycleRetention`, `resolvePromoAudience`,
 *     and `inspectWelcomeBackOfferStatus` must evaluate the exact same 4 activity
 *     tables (`profiles.last_active`, `club_members.last_active_at` + `last_active`,
 *     `ca_browser_bindings.last_seen`, `training_progress.last_played_at`) and
 *     completed `promo_code_redemptions.reward_applied` so no player is ever invited
 *     to a Welcome-Back Offer that rejects them on click.
 *
 *   - LAW P2-4: `notification_preferences` & Webhook State-Machine Parity Law
 *     `weeklyWireEngine.mjs`, `lifecycleEngine.mjs`, and `dispatch.mjs` must select
 *     and honor `marketing_enabled` & `email_enabled` (while preserving Weekly Wire
 *     delivery for explicit `pref:wire_only` subscribers); `twilio-inbound.js` must
 *     scope `STOP`/`START` strictly to `sms_enabled` without disabling email;
 *     `resend.js` must use `.ilike()` without `.maybeSingle()` crashes; and
 *     `subscribe.js` must synchronize preferences and clear `snooze:*` on re-subscribe.
 *
 *   - LAW P2-5: Resend Campaign Telemetry Preservation & `started_at` Audit Law
 *     `resend.js` must record opens/clicks across `sending`, `sent`, and `partial`
 *     campaigns, and `mergeFinalCampaignErrorSummary` must preserve accumulated
 *     `telemetry:{...}` counters when `digest.js`, `dispatch.mjs`, and
 *     `lifecycleEngine.mjs` finalize batch sends.
 *
 *   - LAW P2-6: 4-Engine Email Template Parity & Promo Token Continuity Law
 *     `renderPromoEmail`, `buildWelcomeEmail`, `renderLifecycleEmail`, and
 *     `renderWeeklyWireEmail` must all emit hidden `mso-hide:all` preheaders,
 *     first-party `/api/news/email-image?brand=crest` masthead emblems,
 *     `Email Preferences` + `Unsubscribe` + `Web Archive` links, and zero em dashes;
 *     `unverified_48h` must deep-link to `/hub/verify-phone?next=%2Fhub%2Fclub-arena%2F%3Fjoin%3D25450`;
 *     and `/hub/verify-phone` must preserve `?pt=` across `selfPath`.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
    applyCampaignTelemetryEvent,
    mergeFinalCampaignErrorSummary,
    parseCampaignTelemetrySummary,
    resolveAdminSubscriberPatch,
} from '../src/lib/newsletter/campaignTelemetry.mjs';
import {
    PLATFORM_UPDATES_CATALOG,
    SPOT_OF_THE_WEEK_CATALOG,
    TOOL_SPOTLIGHT_CATALOG,
} from '../src/lib/newsletter/weeklyWireCatalog.mjs';
import {
    buildPromoBlockForSegment,
    renderWeeklyWireEmail,
    resolveWeeklyWireRecipients,
} from '../src/lib/newsletter/weeklyWireEngine.mjs';
import { buildWelcomeEmail } from '../src/lib/newsletter/welcomeAndPreferences.mjs';
import { renderPromoEmail, resolvePromoAudience } from '../src/lib/promoCampaigns/dispatch.mjs';
import {
    LIFECYCLE_TRIGGERS,
    renderLifecycleEmail,
    runLifecycleRetention,
} from '../src/lib/promoCampaigns/lifecycleEngine.mjs';
import {
    WELCOME_BACK_CODE,
    inspectWelcomeBackOfferStatus,
    signWelcomeBackOfferToken,
} from '../src/lib/promoCampaigns/welcomeBackOffer.mjs';
import { safeImageUrl } from '../src/lib/security/imageHosts.js';
import { shouldOptimizeSpImageSrc } from '../src/lib/security/spImageOptimization.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readRepoFile = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

function createMultiTableSupabaseDouble(tables = {}) {
    function createQuery(tableName) {
        const filters = [];
        let rangeBounds = null;
        let limitCount = null;
        let singleMode = false;

        const applyFilters = () => {
            let rows = Array.isArray(tables[tableName]) ? [...tables[tableName]] : [];
            for (const fn of filters) {
                rows = rows.filter(fn);
            }
            if (rangeBounds) {
                rows = rows.slice(rangeBounds[0], rangeBounds[1] + 1);
            } else if (typeof limitCount === 'number') {
                rows = rows.slice(0, limitCount);
            }
            if (singleMode) {
                return { data: rows[0] || null, error: null };
            }
            return { data: rows, error: null };
        };

        const builder = {
            select() {
                return builder;
            },
            eq(col, val) {
                filters.push((r) => r?.[col] === val);
                return builder;
            },
            neq(col, val) {
                filters.push((r) => r?.[col] !== val);
                return builder;
            },
            in(col, vals) {
                const set = new Set(vals || []);
                filters.push((r) => set.has(r?.[col]));
                return builder;
            },
            like(col, pattern) {
                if (pattern === '%@%') filters.push((r) => String(r?.[col] || '').includes('@'));
                else if (pattern === 'sms:%') filters.push((r) => String(r?.[col] || '').startsWith('sms:'));
                return builder;
            },
            or(expr) {
                if (expr.includes('is_active.is.null,is_active.eq.true')) {
                    filters.push((r) => r?.is_active == null || r?.is_active === true);
                }
                return builder;
            },
            order() {
                return builder;
            },
            range(from, to) {
                rangeBounds = [from, to];
                return Promise.resolve(applyFilters());
            },
            limit(n) {
                limitCount = n;
                return builder;
            },
            maybeSingle() {
                singleMode = true;
                return Promise.resolve(applyFilters());
            },
            then(onFulfilled, onRejected) {
                return Promise.resolve(applyFilters()).then(onFulfilled, onRejected);
            },
        };
        return builder;
    }

    return {
        from(tableName) {
            return createQuery(tableName);
        },
        auth: {
            admin: {
                async listUsers() {
                    return { data: { users: [] }, error: null };
                },
            },
        },
    };
}

// ── LAW P2-1: Admin Operations Non-/api/admin/* Gate & Reactivation Snooze Clearing ──
test('LAW P2-1: /admin/newsletter calls /api/news/operations (never /api/admin/*) and reactivating clears snooze/bounce/unsubscribe sources', () => {
    const adminPage = readRepoFile('pages/admin/newsletter.js');
    const opsApi = readRepoFile('pages/api/news/operations.js');
    const legacyAdminApi = readRepoFile('pages/api/admin/newsletter.js');

    assert.doesNotMatch(
        adminPage,
        /fetch\(\s*[`'"]\/api\/admin\//,
        'pages/admin/newsletter.js must never fetch /api/admin/* directly (blocked by middleware.ts MFA cookie gate)'
    );
    assert.match(adminPage, /\/api\/news\/operations/, 'pages/admin/newsletter.js must route operations through /api/news/operations');
    assert.match(opsApi, /getServerUserWithFallback/, 'pages/api/news/operations.js must verify JWT via getServerUserWithFallback');
    assert.match(opsApi, /\['admin', 'superadmin', 'god'\]/, 'pages/api/news/operations.js must enforce ADMIN_ROLES');
    assert.match(opsApi, /\.not\('reward_applied', 'is', null\)/, 'welcome_back_redemptions stat must exclude rolled-back null claims');
    assert.match(legacyAdminApi, /operationsHandler/, 'pages/api/admin/newsletter.js must delegate to /api/news/operations');

    const nowIso = '2026-11-25T16:30:00.000Z';
    for (const staleSource of [
        'snooze:2026-12-25T00:00:00.000Z',
        'unsubscribe',
        'resend_bounce',
        'resend_complaint',
        'sms_opt_out',
        'admin_deactivated',
        '',
    ]) {
        const reactivated = resolveAdminSubscriberPatch(true, staleSource, nowIso);
        assert.deepEqual(
            reactivated,
            { is_active: true, unsubscribed_at: null, source: 'admin_reactivated' },
            `Reactivating subscriber with source="${staleSource}" must clear suppression source`
        );
    }

    // Explicit Weekly Wire-only preference is NOT an opt-out and stays intact on active rows
    const wireOnly = resolveAdminSubscriberPatch(true, 'pref:wire_only', nowIso);
    assert.deepEqual(wireOnly, { is_active: true, unsubscribed_at: null });

    const deactivated = resolveAdminSubscriberPatch(false, 'news_hub', nowIso);
    assert.deepEqual(deactivated, {
        is_active: false,
        unsubscribed_at: nowIso,
        source: 'admin_deactivated',
    });
});

// ── LAW P2-2: Next.js 16 SPImage Optimization, Zero Pexels CSP Fallbacks & Wire OG Tags ──
test('LAW P2-2: shouldOptimizeSpImageSrc prevents Next.js 16 400s on /api/* & query paths, News Hub has zero Pexels fallbacks, and /hub/wire emits signed og:image', () => {
    // Dynamic /api/*, query-string local paths, data:/blob:, and unconfigured remote hosts MUST NOT go through /_next/image
    assert.equal(shouldOptimizeSpImageSrc('/api/proxy?url=https%3A%2F%2Fpnimg.net%2Fa.jpg'), false);
    assert.equal(shouldOptimizeSpImageSrc('/api/news/email-image?fallback=1&m=hero'), false);
    assert.equal(shouldOptimizeSpImageSrc('https://smarter.poker/api/news/email-image?brand=crest'), false);
    assert.equal(shouldOptimizeSpImageSrc('/images/avatar.png?v=2'), false);
    assert.equal(shouldOptimizeSpImageSrc('data:image/png;base64,iVBORw0KGgo='), false);
    assert.equal(shouldOptimizeSpImageSrc('blob:https://smarter.poker/123'), false);
    assert.equal(shouldOptimizeSpImageSrc('https://i.ytimg.com/vi/abc/hqdefault.jpg'), false);

    // Static local assets and whitelisted CDN hosts remain eligible for optimization
    assert.equal(shouldOptimizeSpImageSrc('/default-avatar.png'), true);
    assert.equal(shouldOptimizeSpImageSrc('https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/venue-logos/1.png'), true);
    assert.equal(shouldOptimizeSpImageSrc('https://img.youtube.com/vi/abc/hqdefault.jpg'), true);

    const newsFiles = [
        'pages/hub/news.js',
        'src/components/news/NewsBox.js',
        'src/components/news/VideoCard.js',
        'src/components/news/MSPTBox.js',
        'pages/api/news/source-boxes.js',
    ];
    for (const rel of newsFiles) {
        const src = readRepoFile(rel);
        assert.doesNotMatch(src, /pexels\.com/i, `${rel} must never reference un-allowlisted images.pexels.com`);
    }

    assert.ok(safeImageUrl('/api/news/email-image?fallback=1&m=hero'), 'First-party hero fallback must pass CSP safeImageUrl');
    assert.ok(safeImageUrl('/api/news/email-image?fallback=1&m=thumb'), 'First-party thumb fallback must pass CSP safeImageUrl');

    for (const rel of ['src/components/news/NewsBox.js', 'src/components/news/VideoCard.js', 'src/components/news/MSPTBox.js']) {
        const src = readRepoFile(rel);
        assert.match(src, /dataset\.fb/, `${rel} must guard onError fallback swap with dataset.fb to prevent relative-URL loops`);
    }

    for (const rel of ['pages/hub/wire/index.js', 'pages/hub/wire/[edition].js']) {
        const src = readRepoFile(rel);
        assert.match(src, /property="og:image"/, `${rel} must emit og:image meta tag`);
        assert.match(src, /name="twitter:image"/, `${rel} must emit twitter:image meta tag`);
        assert.match(src, /name="twitter:card"\s+content="summary_large_image"/, `${rel} must emit summary_large_image twitter:card`);
    }
});

// ── LAW P2-3: 21-Day Inactivity & Redemption Parity Across All 4 Engines ─────
test('LAW P2-3: Weekly Wire, Lifecycle, Promo Audience, and Welcome-Back Acceptance agree 100% on 21-day activity across Club Arena, Browser Bindings, and GTO Training', async () => {
    const nowMs = Date.parse('2026-11-25T16:00:00.000Z');
    const dayMs = 86_400_000;
    const oldIso = new Date(nowMs - 26 * dayMs).toISOString(); // 26d ago (inside 22..30d lifecycle window & >=21d inactive)
    const createdIso = new Date(nowMs - 60 * dayMs).toISOString();
    const recentIso = new Date(nowMs - 3 * dayMs).toISOString(); // 3d ago (active!)

    const uDormant = '10000000-0000-4000-8000-000000000001';
    const uActiveClub = '10000000-0000-4000-8000-000000000002';
    const uActiveBinding = '10000000-0000-4000-8000-000000000003';
    const uActiveTraining = '10000000-0000-4000-8000-000000000004';
    const uRolledBackClaim = '10000000-0000-4000-8000-000000000005';
    const uCompletedClaim = '10000000-0000-4000-8000-000000000006';
    const promoCodeUuid = '90000000-0000-4000-8000-000000000099';

    const sb = createMultiTableSupabaseDouble({
        newsletter_campaigns: [],
        newsletter_subscribers: [],
        notification_preferences: [],
        sms_delivery_receipts: [],
        promo_codes: [{ id: promoCodeUuid, code: WELCOME_BACK_CODE }],
        promo_code_redemptions: [
            { id: 'r1', promo_code_id: promoCodeUuid, user_id: uRolledBackClaim, reward_applied: null },
            { id: 'r2', promo_code_id: promoCodeUuid, user_id: uCompletedClaim, reward_applied: { chipsAwarded: 25 } },
        ],
        profiles: [
            { id: uDormant, username: 'dormant1', email: 'dormant1@gmail.com', phone_verified: true, created_at: createdIso, last_active: oldIso },
            { id: uActiveClub, username: 'club1', email: 'club1@gmail.com', phone_verified: true, created_at: createdIso, last_active: oldIso },
            { id: uActiveBinding, username: 'bind1', email: 'bind1@gmail.com', phone_verified: true, created_at: createdIso, last_active: oldIso },
            { id: uActiveTraining, username: 'train1', email: 'train1@gmail.com', phone_verified: true, created_at: createdIso, last_active: oldIso },
            { id: uRolledBackClaim, username: 'retry1', email: 'retry1@gmail.com', phone_verified: true, created_at: createdIso, last_active: oldIso },
            { id: uCompletedClaim, username: 'claimed1', email: 'claimed1@gmail.com', phone_verified: true, created_at: createdIso, last_active: oldIso },
        ],
        club_members: [
            { user_id: uActiveClub, is_bot: false, last_active_at: null, last_active: recentIso },
        ],
        ca_browser_bindings: [
            { user_id: uActiveBinding, last_seen: recentIso },
        ],
        training_progress: [
            { user_id: uActiveTraining, last_played_at: recentIso },
        ],
    });

    // 1. Weekly Wire recipient segmentation
    const wireRes = await resolveWeeklyWireRecipients(sb, { nowMs });
    const byEmail = new Map(wireRes.recipients.map((r) => [r.email, r.segment]));
    assert.equal(byEmail.get('dormant1@gmail.com'), 'inactive_21d');
    assert.equal(byEmail.get('retry1@gmail.com'), 'inactive_21d', 'Rolled-back null redemption must remain eligible');
    assert.equal(byEmail.get('club1@gmail.com'), 'active_member', 'club_members.last_active must mark player active');
    assert.equal(byEmail.get('bind1@gmail.com'), 'active_member', 'ca_browser_bindings.last_seen must mark player active');
    assert.equal(byEmail.get('train1@gmail.com'), 'active_member', 'training_progress.last_played_at must mark player active');
    assert.equal(byEmail.get('claimed1@gmail.com'), 'active_member', 'Completed Welcome-Back claimer must not get Welcome-Back CTA again');

    // 2. Lifecycle Retention `welcome_back_21d` queue
    const lifecyclePreview = await runLifecycleRetention(sb, { dryRun: true, nowMs });
    assert.equal(lifecyclePreview.counts.welcome_back_21d, 2, 'Only uDormant and uRolledBackClaim qualify for welcome_back_21d');

    // 3. Promo Audience `inactive_21d` scope
    const promoAud = await resolvePromoAudience(sb, { scope: 'inactive_21d', nowMs });
    assert.deepEqual(promoAud.emails.sort(), ['dormant1@gmail.com', 'retry1@gmail.com']);

    // 4. Consumer `inspectWelcomeBackOfferStatus` agrees 100% with all 3 producers
    const secret = 'unit-test-wb-secret-key-20261125';
    for (const [uid, expectedEligible, expectedAlreadyClaimed] of [
        [uDormant, true, false],
        [uRolledBackClaim, true, false],
        [uActiveClub, false, false],
        [uActiveBinding, false, false],
        [uActiveTraining, false, false],
        [uCompletedClaim, true, true],
    ]) {
        const wbToken = signWelcomeBackOfferToken({ userId: uid, nowMs, secret });
        const status = await inspectWelcomeBackOfferStatus(sb, {
            user: { id: uid, created_at: createdIso },
            token: wbToken,
            nowMs,
            secret,
        });
        assert.equal(status.eligible, expectedEligible, `Consumer eligibility mismatch for ${uid}`);
        assert.equal(Boolean(status.alreadyClaimed), expectedAlreadyClaimed, `Consumer alreadyClaimed mismatch for ${uid}`);
    }
});

// ── LAW P2-4: Notification Preferences & Webhook State-Machine Parity ────────
test('LAW P2-4: marketing_enabled=false mutes promos/lifecycle while honoring explicit pref:wire_only on Weekly Wire, and webhooks scope SMS/email cleanly', async () => {
    const nowMs = Date.parse('2026-11-25T16:00:00.000Z');
    const createdIso = new Date(nowMs - 60 * 86_400_000).toISOString();
    const dormantIso = new Date(nowMs - 25 * 86_400_000).toISOString();

    const uWireOnly = '20000000-0000-4000-8000-000000000001';
    const uBounced = '20000000-0000-4000-8000-000000000002';
    const uSmsMuted = '20000000-0000-4000-8000-000000000003';

    const sb = createMultiTableSupabaseDouble({
        newsletter_campaigns: [],
        newsletter_subscribers: [
            { id: 's1', email: 'wireonly@gmail.com', is_active: true, source: 'pref:wire_only', user_id: uWireOnly },
        ],
        notification_preferences: [
            // Chosen via /hub/email-preferences -> Weekly Wire Only sets marketing_enabled: false, email_enabled: true
            { user_id: uWireOnly, mute_all: false, email_enabled: true, marketing_enabled: false, sms_enabled: true },
            // Bounced/unsubscribed account with marketing_enabled: false and no pref:wire_only override
            { user_id: uBounced, mute_all: false, email_enabled: true, marketing_enabled: false, sms_enabled: true },
            // SMS STOP user: sms_enabled: false, marketing_enabled: true (email stays active!)
            { user_id: uSmsMuted, mute_all: false, email_enabled: true, marketing_enabled: true, sms_enabled: false },
        ],
        sms_delivery_receipts: [],
        promo_codes: [],
        promo_code_redemptions: [],
        profiles: [
            { id: uWireOnly, username: 'wirefan', email: 'wireonly@gmail.com', phone: '+13124012345', phone_verified: true, created_at: createdIso, last_active: dormantIso },
            { id: uBounced, username: 'bounced1', email: 'bounced1@gmail.com', phone: '+13124012346', phone_verified: true, created_at: createdIso, last_active: dormantIso },
            { id: uSmsMuted, username: 'smsstop1', email: 'smsstop1@gmail.com', phone: '+13124012347', phone_verified: true, created_at: createdIso, last_active: dormantIso },
        ],
        club_members: [],
        ca_browser_bindings: [],
        training_progress: [],
    });

    // Weekly Wire delivers to uWireOnly and uSmsMuted, but mutes uBounced
    const wireRes = await resolveWeeklyWireRecipients(sb, { nowMs });
    assert.deepEqual(
        wireRes.recipients.map((r) => r.email).sort(),
        ['smsstop1@gmail.com', 'wireonly@gmail.com']
    );

    // Lifecycle suppresses uWireOnly & uBounced completely, and sends email ONLY (0 SMS) to uSmsMuted
    const lcPreview = await runLifecycleRetention(sb, { dryRun: true, nowMs });
    assert.equal(lcPreview.counts.welcome_back_21d, 1, 'Only uSmsMuted receives lifecycle email');
    assert.equal(lcPreview.smsCandidates, 0, 'uSmsMuted must receive 0 lifecycle SMS because sms_enabled=false');

    // Static webhook & subscribe invariants
    const twilioSrc = readRepoFile('pages/api/webhooks/twilio-inbound.js');
    assert.doesNotMatch(twilioSrc, /marketing_enabled:\s*false/, 'SMS STOP in twilio-inbound.js must never kill email marketing_enabled');
    assert.match(twilioSrc, /sms_enabled:\s*!optingOut/, 'twilio-inbound.js must mirror both STOP and START onto sms_enabled');

    const resendSrc = readRepoFile('pages/api/webhooks/resend.js');
    assert.doesNotMatch(resendSrc, /\.from\('profiles'\)[\s\S]{0,120}maybeSingle\(\)/, 'resend.js must not use maybeSingle() on profiles email lookup');
    assert.match(resendSrc, /\.ilike\('email',\s*email\)/, 'resend.js must match emails case-insensitively');

    const subscribeSrc = readRepoFile('pages/api/news/subscribe.js');
    assert.match(subscribeSrc, /wasSnoozed/, 'POST /api/news/subscribe must clear active snooze:* when user re-subscribes');
    assert.match(subscribeSrc, /marketing_enabled:\s*true/, 'Selecting all/subscribing must restore marketing_enabled: true');
});

// ── LAW P2-5: Resend Telemetry Preservation Across Batch Finalization ────────
test('LAW P2-5: Resend webhook tracks sending/sent/partial campaigns and mergeFinalCampaignErrorSummary preserves opens/clicks across batch completion', () => {
    // Early opens/clicks arrive while campaign is still `status = 'sending'`
    let summary = null;
    summary = applyCampaignTelemetryEvent(summary, 'email.opened').errorSummary;
    summary = applyCampaignTelemetryEvent(summary, 'email.opened').errorSummary;
    summary = applyCampaignTelemetryEvent(summary, 'email.clicked').errorSummary;

    // 1. Clean send (`errors = []`) MUST NOT wipe out `telemetry:{"opens":2,"clicks":1}`!
    const finalizedClean = mergeFinalCampaignErrorSummary(summary, []);
    assert.equal(finalizedClean, 'telemetry:{"opens":2,"clicks":1}');
    assert.deepEqual(parseCampaignTelemetrySummary(finalizedClean), {
        opens: 2,
        clicks: 1,
        cleanErrorSummary: null,
    });

    // 2. Partial send (`errors = ['email: timeout']`) preserves BOTH error prefix AND telemetry!
    const finalizedPartial = mergeFinalCampaignErrorSummary(summary, ['email: timeout']);
    assert.equal(finalizedPartial, 'email: timeout | telemetry:{"opens":2,"clicks":1}');
    assert.deepEqual(parseCampaignTelemetrySummary(finalizedPartial), {
        opens: 2,
        clicks: 1,
        cleanErrorSummary: 'email: timeout',
    });

    // 3. Zero telemetry + zero errors cleanly produces `null`
    assert.equal(mergeFinalCampaignErrorSummary(null, []), null);

    const resendSrc = readRepoFile('pages/api/webhooks/resend.js');
    assert.match(
        resendSrc,
        /new Set\(\['sending',\s*'sent',\s*'partial'\]\)/,
        'resend.js must track opens/clicks during sending, sent, and partial statuses'
    );

    for (const rel of [
        'pages/api/news/digest.js',
        'src/lib/promoCampaigns/dispatch.mjs',
        'src/lib/promoCampaigns/lifecycleEngine.mjs',
    ]) {
        const src = readRepoFile(rel);
        assert.match(src, /mergeFinalCampaignErrorSummary/, `${rel} must preserve telemetry via mergeFinalCampaignErrorSummary`);
        assert.match(src, /started_at:/, `${rel} must populate started_at on newsletter_campaigns insert`);
    }
});

// ── LAW P2-6: 4-Engine Email Parity & Promo Token Continuity ─────────────────
test('LAW P2-6: all 4 email engines include masthead crest, hidden preheader, Email Preferences, Web Archive, and zero em dashes, and verify-phone preserves pt', () => {
    const sampleEdition = {
        editionNumber: 5,
        subject: 'WSOP Main Event — Final Table | Smarter.Poker Wire #5',
        platformUpdates: PLATFORM_UPDATES_CATALOG.slice(0, 1),
        articles: [
            {
                id: '55555555-5555-4555-8555-555555555555',
                title: 'High Stakes Pot — River Bluff',
                summary: 'Action recap from the streamed cash table.',
                source_name: 'PokerNews',
                image_url: '',
                category: 'NEWS',
            },
        ],
        spotOfTheWeek: SPOT_OF_THE_WEEK_CATALOG[0],
        toolSpotlight: TOOL_SPOTLIGHT_CATALOG[0],
        upcomingSeries: [],
        activePromo: null,
    };

    const payloads = [
        renderPromoEmail({
            subject: 'Special Offer — 25 Free Chips',
            headline: '25 Free Chips — Instant Access',
            body: 'Join Kings Club — verify your phone number today.',
            ctaLabel: 'Claim — Now',
            ctaUrl: 'https://smarter.poker/auth/signup',
            unsubscribeUrl: 'https://smarter.poker/api/news/subscribe?unsubscribe=tok1',
            preferencesUrl: 'https://smarter.poker/hub/email-preferences?token=tok1',
            siteUrl: 'https://smarter.poker',
        }),
        buildWelcomeEmail({
            hasExistingProfile: false,
            siteUrl: 'https://smarter.poker',
            unsubscribeUrl: 'https://smarter.poker/api/news/subscribe?unsubscribe=tok1',
            preferencesUrl: 'https://smarter.poker/hub/email-preferences?token=tok1',
        }),
        ...LIFECYCLE_TRIGGERS.map((trigger) =>
            renderLifecycleEmail({
                trigger,
                username: 'aceplayer',
                userId: '66666666-6666-4666-8666-666666666666',
                diamonds: 750,
                siteUrl: 'https://smarter.poker',
                unsubscribeUrl: 'https://smarter.poker/api/news/subscribe?unsubscribe=tok1',
                preferencesUrl: 'https://smarter.poker/hub/email-preferences?token=tok1',
            })
        ),
        renderWeeklyWireEmail({
            edition: sampleEdition,
            promoBlock: buildPromoBlockForSegment('non_account', { siteUrl: 'https://smarter.poker' }),
            siteUrl: 'https://smarter.poker',
            unsubscribeUrl: 'https://smarter.poker/api/news/subscribe?unsubscribe=tok1',
            preferencesUrl: 'https://smarter.poker/hub/email-preferences?token=tok1',
        }),
    ];

    for (const item of payloads) {
        assert.doesNotMatch(item.html, /[—–]/, 'Email HTML must never contain em/en dashes');
        assert.doesNotMatch(item.text, /[—–]/, 'Email plain-text must never contain em/en dashes');
        assert.match(item.html, /mso-hide:all/, 'Every email must include hidden inbox preheader');
        assert.match(
            item.html,
            /https:\/\/smarter\.poker\/api\/news\/email-image\?brand=crest/,
            'Every email must include the first-party Smarter.Poker masthead crest'
        );
        assert.match(item.html, /Email Preferences/, 'Every email must expose 1-click Email Preferences');
        assert.match(item.html, /Unsubscribe/, 'Every email must expose 1-click Unsubscribe');
        assert.match(item.html, /\/hub\/wire/, 'Every email must link to the /hub/wire Web Archive');
        assert.match(item.html, /Oak Lawn,\s*IL\s*60453/, 'Every email must include the CAN-SPAM postal address');
    }

    const unverifiedEmail = renderLifecycleEmail({
        trigger: 'unverified_48h',
        username: 'newplayer',
        siteUrl: 'https://smarter.poker',
    });
    assert.equal(
        unverifiedEmail.ctaUrl,
        'https://smarter.poker/hub/verify-phone?next=%2Fhub%2Fclub-arena%2F%3Fjoin%3D25450',
        'unverified_48h CTA must auto-forward verified players directly into Kings Club (25450)'
    );

    const verifyPhoneSrc = readRepoFile('pages/hub/verify-phone.js');
    assert.match(
        verifyPhoneSrc,
        /if \(initialPt\) selfParts\.push\(`pt=\$\{encodeURIComponent\(initialPt\)\}`\)/,
        'pages/hub/verify-phone.js must preserve ?pt= in selfPath across auth redirects'
    );
});

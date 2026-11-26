/**
 * Smarter.Poker Weekly Wire V2 API (/api/news/digest)
 *
 * Upgraded multi-section intelligence newsletter combining:
 *   1. Smarter.Poker Platform Upgrades, Optimizations & Enhancements (lifetime single-use)
 *   2. Audience-Segmented Promotion Banner (New-Lead Signup vs 21d Inactive Welcome-Back vs Active Member Spotlight)
 *   3. Storyline-Deduplicated World Poker News with hero thumbnails & non-echoing meta descriptions
 *   4. Rotating Tool / GTO Trainer Spotlight of the Week (lifetime single-use)
 *
 * Strictly enforces a permanent Zero-Repeat Ledger in `public.newsletter_campaigns.article_ids`
 * so no article UUID, storyline cluster, platform upgrade, or tool spotlight ever repeats.
 *
 * POST (or GET, for schedulers) /api/news/digest
 *   Auth  : Verified admin Supabase JWT, Authorization: Bearer $CRON_SECRET,
 *           x-admin-key: $ADMIN_API_KEY, OR 90s HMAC x-operator-signature (preview/test only)
 *   Query : ?dryRun=1                     preview curated edition + segment counts, send nothing
 *           ?days=7                       look-back window for poker_news (1..30)
 *           ?limit=5                      poker_news stories per edition (1..12)
 *           ?audience=opted_in_all        'opted_in_all' (default) or 'subscribers_only'
 *   Body  : { action: 'test', testEmail, segment? }           -> send single [TEST] edition
 *           { action: 'queue_update', badge, title, summary, ctaUrl } -> queue custom Platform Upgrade
 */
import crypto from 'crypto';
import { Resend } from 'resend';
import { resendApiKey, resendFrom } from '../../../src/lib/email/resendAccount.mjs';
import { sendEmail as sendSingleDigestEmail } from '../../../src/lib/dailyDigest/delivery.mjs';
import {
    DEFAULT_POSTAL_ADDRESS,
    isAllowedSmarterPokerUrl,
    verifyOperatorTestSignature,
} from '../../../src/lib/promoCampaigns/dispatch.mjs';
import {
    buildPromoBlockForSegment,
    curateWeeklyWireEdition,
    formatValidSignupReferralCode,
    normalizeExplicitTestEmail,
    renderWeeklyWireEmail,
    resolveWeeklyWireRecipients,
} from '../../../src/lib/newsletter/weeklyWireEngine.mjs';
import { mergeFinalCampaignErrorSummary } from '../../../src/lib/newsletter/campaignTelemetry.mjs';
import { harvestWeeklyWireEditionToVault } from '../../../src/lib/magazine/vaultHarvester.mjs';
import { submitToIndexNow } from '../../../src/lib/seo/indexingService.mjs';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/apiErrorHandler';

export const config = { maxDuration: 300 };

let _supabase = null;
function getSupabase() {
    if (!_supabase) _supabase = createClient();
    return _supabase;
}

async function authorize(req) {
    const cronSecret = (process.env.CRON_SECRET || '').trim();
    if (cronSecret && req.headers.authorization === `Bearer ${cronSecret}`) {
        return { kind: 'cron', userId: null };
    }
    const adminKey = (process.env.ADMIN_API_KEY || '').trim();
    if (adminKey && req.headers['x-admin-key'] === adminKey) {
        return { kind: 'operator', userId: null };
    }

    if (req.method === 'POST' && req.body && typeof req.body === 'object') {
        const bodyAction = String(req.body.action || '').trim();
        const isDry = ['1', 'true', 'yes'].includes(String(req.query?.dryRun || '').toLowerCase());
        const effectiveAction = bodyAction === 'test' ? 'test' : isDry || bodyAction === 'preview' ? 'preview' : '';
        if (
            effectiveAction &&
            verifyOperatorTestSignature({
                action: effectiveAction,
                testEmail: req.body.testEmail || '',
                testPhone: '',
                timestampHeader: req.headers['x-operator-timestamp'] || '',
                signatureHeader: req.headers['x-operator-signature'] || '',
            })
        ) {
            return { kind: 'operator_test', userId: null };
        }
    }

    const { user } = await getServerUserWithFallback(req, getSupabase());
    if (!user?.id) return null;
    const { data: profile } = await getSupabase()
        .from('profiles')
        .select('role, is_admin')
        .eq('id', user.id)
        .maybeSingle();
    if (!profile || (!profile.is_admin && !['admin', 'superadmin', 'god'].includes(profile.role))) return null;
    return { kind: 'admin', userId: user.id };
}

function clampInt(value, fallback, min, max) {
    const n = parseInt(value, 10);
    if (Number.isNaN(n)) return fallback;
    return Math.min(Math.max(n, min), max);
}

const safeQ = (v) => (Array.isArray(v) ? String(v[0]) : v == null ? v : String(v));

const DEFAULT_DIGEST_FROM = 'Smarter.Poker News <news@smarter.poker>';
const DEFAULT_SITE_URL = 'https://smarter.poker';
const MAX_RECIPIENTS = 5000;
const SEND_BATCH_SIZE = 100;
const DEFAULT_WINDOW_DAYS = 7;
const DEFAULT_ARTICLE_COUNT = 5;

function log(event, fields) {
    try {
        console.log('[News Digest]', JSON.stringify({ event, ...fields }));
    } catch (_e) {
        console.log('[News Digest]', event);
    }
}

function unsubscribeSecret() {
    return (
        process.env.NEWSLETTER_UNSUBSCRIBE_SECRET ||
        process.env.CRON_SECRET ||
        process.env.SUPABASE_SERVICE_ROLE_KEY ||
        ''
    );
}

function b64url(buf) {
    return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function makeUnsubscribeToken(email) {
    const secret = unsubscribeSecret();
    const normalized = String(email).trim().toLowerCase();
    if (!secret) return normalized;
    const payload = b64url(Buffer.from(normalized, 'utf8'));
    const sig = b64url(crypto.createHmac('sha256', secret).update(payload).digest());
    return `${payload}.${sig}`;
}

async function sendBatch(resend, messages, idempotencyKey = '') {
    const attempt = async (payload, opts) => {
        const result = opts ? await resend.batch.send(payload, opts) : await resend.batch.send(payload);
        if (result?.error) throw new Error(result.error.message || 'Resend batch error');
        return result;
    };

    try {
        await attempt(messages, idempotencyKey ? { idempotencyKey } : undefined);
        return { sent: messages.length, failed: 0, error: null };
    } catch (_firstErr) {
        try {
            await attempt(
                messages.map(({ headers, tags, ...rest }) => rest),
                idempotencyKey ? { idempotencyKey: `${idempotencyKey}-plain` } : undefined
            );
            return { sent: messages.length, failed: 0, error: null };
        } catch (retryError) {
            return {
                sent: 0,
                failed: messages.length,
                error: retryError?.message || String(retryError),
            };
        }
    }
}

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'private, no-store');

    if (!['GET', 'POST'].includes(req.method)) {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }
    if (!applyRateLimit(req, res, req.method === 'GET' ? LIMITS.read : LIMITS.write)) return;

    const authorization = await authorize(req);
    if (!authorization) {
        log('unauthorized', { method: req.method });
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const sb = getSupabase();
    const bodyObj = req.method === 'POST' && req.body && typeof req.body === 'object' ? req.body : {};
    const bodyAction = String(bodyObj.action || '').trim();

    let campaignId = null;
    try {
        // ── Queue a custom Smarter.Poker Platform Upgrade / Optimization ──
        if (req.method === 'POST' && bodyAction === 'queue_update') {
            const badge = String(bodyObj.badge || 'Platform Upgrade').trim().slice(0, 40);
            const title = String(bodyObj.title || '').trim().slice(0, 160);
            const summary = String(bodyObj.summary || '').trim().slice(0, 420);
            const ctaUrl = String(bodyObj.ctaUrl || 'https://smarter.poker/hub').trim();

            if (!title || !summary) {
                return res.status(400).json({ success: false, error: 'Upgrade headline and summary are required.' });
            }
            if (!isAllowedSmarterPokerUrl(ctaUrl)) {
                return res.status(400).json({ success: false, error: 'Destination URL must be an https://smarter.poker link.' });
            }

            const slug = `sp-update-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
            const uniqueSourceUrl = `${ctaUrl}${ctaUrl.includes('#') ? '-' : '#'}${slug}`;

            const { data: inserted, error: insertErr } = await sb
                .from('poker_news')
                .insert({
                    slug,
                    title,
                    summary,
                    excerpt: summary,
                    source_name: 'Smarter.Poker',
                    source_url: uniqueSourceUrl,
                    image_caption: badge,
                    category: 'platform_update',
                    is_published: false,
                    published_at: new Date().toISOString(),
                })
                .select('id, slug, title, summary, image_caption, source_url')
                .maybeSingle();

            if (insertErr) throw insertErr;
            return res.status(200).json({
                success: true,
                queuedUpdate: inserted,
                message: 'Platform upgrade queued for the next Weekly Wire edition.',
            });
        }

        const dryRun =
            bodyAction === 'preview' ||
            ['1', 'true', 'yes'].includes(String(safeQ(req.query.dryRun) || '').toLowerCase());
        const isTestSend = bodyAction === 'test';
        const testOnly = isTestSend;
        const days = clampInt(bodyObj.days ?? safeQ(req.query.days), DEFAULT_WINDOW_DAYS, 1, 30);
        const articleLimit = clampInt(bodyObj.limit ?? safeQ(req.query.limit), DEFAULT_ARTICLE_COUNT, 1, 12);
        const audienceMode =
            (bodyObj.audience ?? safeQ(req.query.audience)) === 'subscribers_only'
                ? 'subscribers_only'
                : 'opted_in_all';
        const excludedArticleIds = Array.isArray(bodyObj.excludedArticleIds) ? bodyObj.excludedArticleIds : [];

        const apiKey = resendApiKey();
        if (!apiKey && !dryRun) {
            log('not_configured', { reason: 'Resend API key missing' });
            return res.status(503).json({
                success: false,
                error: 'Email provider is not configured. No Weekly Wire digest was sent.',
            });
        }

        const from = resendFrom(process.env.NEWS_DIGEST_FROM || DEFAULT_DIGEST_FROM);
        const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || DEFAULT_SITE_URL).replace(/\/+$/, '');

        const edition = await curateWeeklyWireEdition(sb, {
            days,
            articleLimit,
            updateLimit: 2,
            excludedArticleIds,
            enrichMetaDescriptions: true,
            siteUrl,
        });

        // Dry-well zero-repeat safeguard: never mail an empty or recycled edition.
        const hasMinimumFreshContent =
            edition.articles.length >= 3 ||
            (edition.platformUpdates.length >= 1 && edition.articles.length >= 2);

        if (!hasMinimumFreshContent && !dryRun && !isTestSend) {
            log('skipped_insufficient_fresh_content', {
                days,
                freshArticles: edition.articles.length,
                freshUpdates: edition.platformUpdates.length,
            });
            return res.status(200).json({
                success: true,
                dryRun: false,
                skipped: true,
                sent: 0,
                recipients: 0,
                articles: edition.articles.length,
                platformUpdates: edition.platformUpdates.length,
                subject: null,
                message: 'Skipped send: insufficient net-new un-sent stories since the last edition.',
            });
        }

        // ── Single-Recipient Test Send (does not consume Zero-Repeat Ledger) ──
        if (isTestSend) {
            const targetEmail = normalizeExplicitTestEmail(bodyObj.testEmail || safeQ(req.query.testEmail) || '');
            if (!targetEmail) {
                return res.status(400).json({ success: false, error: 'Enter a valid test email address.' });
            }
            const previewSegment = ['non_account', 'inactive_21d', 'active_member'].includes(bodyObj.segment)
                ? bodyObj.segment
                : 'active_member';
            const unsubToken = makeUnsubscribeToken(targetEmail);
            const unsubUrl = `${siteUrl}/api/news/subscribe?unsubscribe=${encodeURIComponent(unsubToken)}`;
            const preferencesUrl = `${siteUrl}/hub/email-preferences?token=${encodeURIComponent(unsubToken)}`;
            let testRecipientMeta = null;
            try {
                const { data: profRows } = await sb
                    .from('profiles')
                    .select('id, username, diamonds, is_vip, vip_expires_at, player_number')
                    .ilike('email', targetEmail)
                    .limit(1);
                const prof = Array.isArray(profRows) ? profRows[0] : null;
                if (prof?.id) {
                    testRecipientMeta = {
                        email: targetEmail,
                        userId: String(prof.id),
                        segment: previewSegment,
                        username: prof.username || '',
                        diamonds: Number(prof.diamonds || 0),
                        isVip: Boolean(prof.is_vip),
                        vipExpiresAt: prof.vip_expires_at || null,
                        referralCode: formatValidSignupReferralCode(
                            prof.player_number ? String(prof.player_number) : ''
                        ),
                    };
                }
            } catch (_metaErr) {
                /* test preview continues cleanly if profile lookup is unavailable */
            }
            const promoBlock = buildPromoBlockForSegment(previewSegment, {
                userId: testRecipientMeta?.userId || '',
                activePromo: edition.activePromo,
                siteUrl,
            });
            const rendered = renderWeeklyWireEmail({
                edition,
                promoBlock,
                siteUrl,
                postalAddress: DEFAULT_POSTAL_ADDRESS,
                unsubscribeUrl: unsubUrl,
                preferencesUrl,
                recipientMeta: testRecipientMeta,
                subjectOverride: `[TEST] ${edition.subject}`,
            });

            const sendRes = await sendSingleDigestEmail({
                to: [targetEmail],
                subject: `[TEST] ${edition.subject}`,
                html: rendered.html,
                text: rendered.text,
                from: process.env.NEWS_DIGEST_FROM || DEFAULT_DIGEST_FROM,
                headers: {
                    'List-Unsubscribe': `<${unsubUrl}>`,
                    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
                },
            });

            if (!sendRes?.ok) {
                return res.status(502).json({
                    success: false,
                    error: sendRes?.error || 'Unable to send test Weekly Wire email.',
                });
            }

            return res.status(200).json({
                success: true,
                testOnly: true,
                targetEmail,
                segment: previewSegment,
                from,
                subject: `[TEST] ${edition.subject}`,
                editionNumber: edition.editionNumber,
                platformUpdatesCount: edition.platformUpdates.length,
                articlesCount: edition.articles.length,
                toolSpotlight: edition.toolSpotlight?.title || null,
            });
        }

        // ── Resolve Unified Opted-In Segmented Audience ──
        const audienceRes = await resolveWeeklyWireRecipients(sb, { audienceMode });
        const recipientsList = audienceRes.recipients.slice(0, MAX_RECIPIENTS);
        const recipientsCount = recipientsList.length;

        if (dryRun) {
            const sampleUnsub = `${siteUrl}/api/news/subscribe?unsubscribe=preview`;
            const samplePreferencesUrl = `${siteUrl}/hub/email-preferences?token=preview`;
            const sampleRecipientFor = (seg) => recipientsList.find((r) => r.segment === seg) || null;
            const segmentPreviews = {
                non_account: renderWeeklyWireEmail({
                    edition,
                    promoBlock: buildPromoBlockForSegment('non_account', { activePromo: edition.activePromo, siteUrl }),
                    siteUrl,
                    unsubscribeUrl: sampleUnsub,
                    preferencesUrl: samplePreferencesUrl,
                    recipientMeta: sampleRecipientFor('non_account'),
                }).html,
                inactive_21d: renderWeeklyWireEmail({
                    edition,
                    promoBlock: buildPromoBlockForSegment('inactive_21d', { activePromo: edition.activePromo, siteUrl }),
                    siteUrl,
                    unsubscribeUrl: sampleUnsub,
                    preferencesUrl: samplePreferencesUrl,
                    recipientMeta: sampleRecipientFor('inactive_21d'),
                }).html,
                active_member: renderWeeklyWireEmail({
                    edition,
                    promoBlock: buildPromoBlockForSegment('active_member', { activePromo: edition.activePromo, siteUrl }),
                    siteUrl,
                    unsubscribeUrl: sampleUnsub,
                    preferencesUrl: samplePreferencesUrl,
                    recipientMeta: sampleRecipientFor('active_member'),
                }).html,
            };

            // Live Desktop/Mobile preview for /admin/newsletter: synthetic active-member sample so no
            // real player data is rendered; venue data is public so a real nearby match is reused.
            const nearbySample = recipientsList.find((r) => Array.isArray(r.nearbyEvents) && r.nearbyEvents.length > 0);
            const htmlPreview = renderWeeklyWireEmail({
                edition,
                promoBlock: buildPromoBlockForSegment('active_member', { activePromo: edition.activePromo, siteUrl }),
                siteUrl,
                unsubscribeUrl: sampleUnsub,
                preferencesUrl: samplePreferencesUrl,
                recipientMeta: {
                    email: 'preview@smarter.poker',
                    userId: '',
                    segment: 'active_member',
                    username: 'sample_member',
                    diamonds: 1250,
                    isVip: true,
                    referralCode: '',
                    referralCount: 2,
                    nearbyEvents: nearbySample?.nearbyEvents || [],
                    locationLabel: nearbySample?.locationLabel || '',
                },
            }).html;

            log('dry_run', {
                recipients: recipientsCount,
                articles: edition.articles.length,
                updates: edition.platformUpdates.length,
                days,
            });

            return res.status(200).json({
                success: true,
                dryRun: true,
                editionNumber: edition.editionNumber,
                audienceMode,
                recipients: recipientsCount,
                segmentCounts: audienceRes.segmentCounts,
                subject: edition.subject,
                articles: edition.articles.length,
                articleItems: edition.articles,
                platformUpdates: edition.platformUpdates,
                spotOfTheWeek: edition.spotOfTheWeek,
                toolSpotlight: edition.toolSpotlight,
                upcomingSeries: edition.upcomingSeries,
                activePromo: edition.activePromo,
                diagnostics: edition.diagnostics,
                segmentPreviews,
                htmlPreview,
                kingsClubTournaments: edition.kingsClubTournaments || [],
                videoOfTheWeek: edition.videoOfTheWeek || null,
                skippedColdSunset: audienceRes.skippedColdSunset || 0,
                repermissionCount: audienceRes.repermissionCount || 0,
                droppedInvalid: audienceRes.droppedInvalid,
                from,
                emailConfigured: Boolean(apiKey),
                sent: 0,
                message: 'Dry run - no email was sent.',
            });
        }

        if (recipientsCount === 0) {
            log('skipped', { reason: 'no opted-in recipients', dropped: audienceRes.droppedInvalid });
            return res.status(200).json({
                success: true,
                dryRun: false,
                sent: 0,
                recipients: 0,
                articles: edition.articles.length,
                subject: edition.subject,
                message: 'No active opted-in recipients - nothing sent.',
            });
        }

        // ── Persist Campaign Row + Permanent Zero-Repeat Ledger UUIDs Before Send ──
        const { data: campaign, error: campaignError } = await sb
            .from('newsletter_campaigns')
            .insert({
                subject: edition.subject.slice(0, 200),
                status: 'sending',
                lookback_days: days,
                article_limit: Math.max(1, Math.min(20, edition.articles.length || articleLimit)),
                article_ids: edition.ledgerUuidsToRecord,
                recipient_count: recipientsCount,
                started_at: new Date().toISOString(),
                created_by: authorization.userId,
            })
            .select('id')
            .maybeSingle();

        if (campaignError) throw campaignError;
        if (!campaign?.id) throw new Error('Campaign audit row was not created');
        campaignId = campaign.id;

        const resend = new Resend(apiKey);
        let sent = 0;
        let failed = 0;
        const errors = [];
        let batchIndex = 0;

        for (let i = 0; i < recipientsList.length; i += SEND_BATCH_SIZE) {
            const chunk = recipientsList.slice(i, i + SEND_BATCH_SIZE);
            const messages = chunk.map((recipient) => {
                const unsubToken = makeUnsubscribeToken(recipient.email);
                const unsubscribeUrl = `${siteUrl}/api/news/subscribe?unsubscribe=${encodeURIComponent(unsubToken)}`;
                const preferencesUrl = `${siteUrl}/hub/email-preferences?token=${encodeURIComponent(unsubToken)}`;
                const promoBlock = buildPromoBlockForSegment(recipient.segment, {
                    userId: recipient.userId || '',
                    activePromo: edition.activePromo,
                    siteUrl,
                });
                const rendered = renderWeeklyWireEmail({
                    edition,
                    promoBlock,
                    siteUrl,
                    postalAddress: DEFAULT_POSTAL_ADDRESS,
                    unsubscribeUrl,
                    preferencesUrl,
                    recipientMeta: {
                        ...recipient,
                        unsubToken,
                        nearbyEvents: recipient.nearbyEvents || [],
                        locationLabel: recipient.locationLabel || '',
                        referralCount: recipient.referralCount,
                        needsRepermission: recipient.needsRepermission === true,
                    },
                });
                return {
                    from,
                    to: [recipient.email],
                    subject: edition.subject,
                    html: rendered.html,
                    text: rendered.text,
                    headers: {
                        'List-Unsubscribe': `<${unsubscribeUrl}>`,
                        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
                    },
                    tags: [{ name: 'campaign_id', value: String(campaign.id) }],
                };
            });

            const batchIdempotencyKey = `wire-${campaignId}-batch-${batchIndex}`;
            const result = await sendBatch(resend, messages, batchIdempotencyKey);
            batchIndex += 1;
            sent += result.sent;
            failed += result.failed;
            if (result.error && errors.length < 5) errors.push(result.error);
        }

        log('sent', {
            campaignId,
            editionNumber: edition.editionNumber,
            sent,
            failed,
            recipients: recipientsCount,
            articles: edition.articles.length,
            updates: edition.platformUpdates.length,
        });

        const campaignStatus = failed === 0 ? 'sent' : sent > 0 ? 'partial' : 'failed';
        let existingErrSummary = null;
        try {
            const { data: latestRow } = await sb
                .from('newsletter_campaigns')
                .select('error_summary')
                .eq('id', campaignId)
                .maybeSingle();
            existingErrSummary = latestRow?.error_summary || null;
        } catch {
            /* preserve send errors if readback unavailable */
        }
        const { error: campaignUpdateError } = await sb
            .from('newsletter_campaigns')
            .update({
                status: campaignStatus,
                sent_count: sent,
                failed_count: failed,
                error_summary: mergeFinalCampaignErrorSummary(existingErrSummary, errors),
                completed_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            })
            .eq('id', campaignId);

        if (campaignUpdateError) {
            log('campaign_audit_failed', { campaignId, sent, failed });
            return res.status(500).json({
                success: false,
                sent,
                failed,
                recipients: recipientsCount,
                error: 'Email was processed but campaign history could not be finalized.',
            });
        }

        if (!dryRun && !testOnly && sent > 0) {
            try {
                await harvestWeeklyWireEditionToVault(sb, edition, { campaignId });
            } catch (_vaultErr) {
                /* non-blocking monthly magazine vault bank */
            }

            try {
                await submitToIndexNow([
                    new URL('/hub/wire', siteUrl).href,
                    new URL(`/hub/wire/${edition.editionNumber}`, siteUrl).href,
                ]);
            } catch (_idxErr) {
                /* non-blocking */
            }

            try {
                const memberUserIds = [...new Set(recipientsList.map((r) => r.userId).filter(Boolean))].slice(0, 2000);
                const wireRoute = `/hub/wire/${edition.editionNumber}`;
                for (let i = 0; i < memberUserIds.length; i += 200) {
                    const chunk = memberUserIds.slice(i, i + 200);
                    await sb.from('notifications').insert(
                        chunk.map((uid) => ({
                            user_id: uid,
                            type: 'weekly_wire_published',
                            title: `Weekly Wire #${edition.editionNumber} Is Live`,
                            message: edition.articles?.[0]?.title
                                ? `Top Story: ${edition.articles[0].title}`
                                : 'New Solver Spot, Poker News & Kings Club Schedule Ready.',
                            action_url: wireRoute,
                            link: wireRoute,
                            data: {
                                kind: 'weekly_wire',
                                edition: edition.editionNumber,
                                url: wireRoute,
                                link: wireRoute,
                                action_url: wireRoute,
                                _push: 'none',
                            },
                            read: false,
                            is_read: false,
                        }))
                    );
                }
            } catch (_notifErr) {
                /* non-blocking */
            }
        }

        return res.status(200).json({
            success: failed === 0,
            dryRun: false,
            editionNumber: edition.editionNumber,
            sent,
            failed,
            recipients: recipientsCount,
            segmentCounts: audienceRes.segmentCounts,
            articles: edition.articles.length,
            platformUpdates: edition.platformUpdates.length,
            toolSpotlight: edition.toolSpotlight?.title || null,
            videoOfTheWeek: edition.videoOfTheWeek?.title || null,
            skippedColdSunset: audienceRes.skippedColdSunset || 0,
            droppedInvalid: audienceRes.droppedInvalid,
            campaignId,
            subject: edition.subject,
            errors: errors.length ? errors : undefined,
        });
    } catch (error) {
        if (campaignId) {
            try {
                await sb
                    .from('newsletter_campaigns')
                    .update({
                        status: 'failed',
                        error_summary: String(error?.message || error).slice(0, 1000),
                        completed_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', campaignId);
            } catch (_auditErr) {
                /* best effort */
            }
        }
        try { reportApiError(error, req); } catch (_e) { /* noop */ }
        log('error', { message: error?.message || String(error) });
        return res.status(500).json({ success: false, error: error?.message || 'Weekly Wire digest failed' });
    }
}

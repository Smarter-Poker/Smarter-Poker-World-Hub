/**
 * Smarter.Poker Monthly Magazine Public Reader, Admin Studio & Monthly Publisher API (/api/news/magazine)
 *
 * Public GET:
 *   - `?list=1`                          -> Published issues list (`status = 'published'`)
 *   - `?issue=latest|<slug>|<number>`    -> Single published issue + normalized 44-page manifest
 *   - Admin/Cron with `?includeReview=1` -> Includes `accumulating`/`review` issues + `vaultSummary`
 *   - Cron `GET ?action=monthly_publish` -> 1st-of-month OpenClaw automated compile + publish
 *
 * Admin / Cron POST:
 *   - `action: 'harvest'`                -> Harvests current/target `issuePeriod` vault
 *   - `action: 'compile'`                -> Compiles 44-page Card Player manifest into `review`
 *   - `action: 'publish'`                -> Publishes online, pings IndexNow, inserts Bell notifications,
 *                                           and optionally dispatches Cover-Reveal email once idempotently
 *   - `action: 'monthly_publish'`        -> Harvests + compiles `previousIssuePeriod()` + publishes
 *   - `action: 'pin_item'` / `'exclude_item'` -> Editorial vault item controls
 *   - `action: 'test_email'`             -> Dispatches `[TEST]` Cover-Reveal email & returns `htmlPreview`
 */
import crypto from 'node:crypto';
import { Resend } from 'resend';
import { createClient } from '../../../src/lib/supabaseServerClient.js';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/apiErrorHandler';
import { resendApiKey, resendFrom } from '../../../src/lib/email/resendAccount.mjs';
import { sendEmail as sendSingleDigestEmail } from '../../../src/lib/dailyDigest/delivery.mjs';
import {
    normalizeExplicitTestEmail,
    verifyOperatorTestSignature,
} from '../../../src/lib/promoCampaigns/dispatch.mjs';
import { resolveWeeklyWireRecipients } from '../../../src/lib/newsletter/weeklyWireEngine.mjs';
import { mergeFinalCampaignErrorSummary } from '../../../src/lib/newsletter/campaignTelemetry.mjs';
import { submitToIndexNow } from '../../../src/lib/seo/indexingService.mjs';
import { makeUnsubscribeToken } from './subscribe.js';
import {
    MAGAZINE_POSTAL_ADDRESS,
    MAGAZINE_SITE_URL,
    currentIssuePeriod,
    isValidIssuePeriod,
    normalizeIssueManifest,
    previousIssuePeriod,
    stripMagazineDashes,
} from '../../../src/lib/magazine/magazineSchema.mjs';
import { harvestMonthlyMagazineVault } from '../../../src/lib/magazine/vaultHarvester.mjs';
import {
    buildMagazineManifestFromVault,
    compileMonthlyMagazineIssue,
} from '../../../src/lib/magazine/magazineCompiler.mjs';
import { renderMonthlyMagazineCoverEmail } from '../../../src/lib/magazine/magazineEmailRenderer.mjs';

export const config = { maxDuration: 300 };

const ADMIN_ROLES = ['admin', 'superadmin', 'god'];
const DEFAULT_MAGAZINE_FROM = 'Smarter.Poker Magazine <news@smarter.poker>';
const SEND_BATCH_SIZE = 100;
const MAX_MAGAZINE_RECIPIENTS = 5000;

const ISSUE_SUMMARY_COLUMNS =
    'id, issue_number, volume_number, issue_period, slug, title, cover_headline, cover_subheadline, editor_note, cover_image_url, status, page_count, published_at, email_campaign_id, updated_at';

let _supabase = null;
function getSupabase() {
    if (!_supabase) _supabase = createClient();
    return _supabase;
}

const safeQ = (v) => (Array.isArray(v) ? String(v[0]) : v == null ? '' : String(v));

function verifyMagazineTestHmac(req, testEmail = '') {
    const bodyAction = String(req.body?.action || '').trim();
    const confirmSend = String(req.body?.confirmSend || '').trim();
    const allowOnlinePublishOnly =
        bodyAction === 'publish' && req.body?.sendEmail === false && confirmSend === 'PUBLISH_MAGAZINE_ONLINE';
    if (
        bodyAction !== 'test_email' &&
        bodyAction !== 'test' &&
        bodyAction !== 'compile' &&
        bodyAction !== 'harvest' &&
        !allowOnlinePublishOnly
    ) {
        return false;
    }

    const tsHeader = String(req.headers['x-operator-timestamp'] || '').trim();
    const sigHeader = String(req.headers['x-operator-signature'] || '').trim().toLowerCase();

    if (
        (bodyAction === 'test_email' || bodyAction === 'test' || bodyAction === 'compile') &&
        verifyOperatorTestSignature({
            action: bodyAction === 'compile' ? 'preview' : 'test',
            testEmail,
            testPhone: '',
            timestampHeader: tsHeader,
            signatureHeader: sigHeader,
        })
    ) {
        return true;
    }

    const secret = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
    if (!secret || !/^\d{10,13}$/.test(tsHeader) || !/^[0-9a-f]{64}$/.test(sigHeader)) return false;
    const tsSec = tsHeader.length > 10 ? Math.floor(Number(tsHeader) / 1000) : Number(tsHeader);
    const nowSec = Math.floor(Date.now() / 1000);
    if (!Number.isFinite(tsSec) || Math.abs(nowSec - tsSec) > 90) return false;

    const msg = allowOnlinePublishOnly
        ? `${tsHeader}:publish:${String(testEmail || '').trim().toLowerCase()}::${confirmSend}`
        : `${tsHeader}:${bodyAction}:${String(testEmail || '').trim().toLowerCase()}:`;
    const expected = crypto.createHmac('sha256', secret).update(msg).digest('hex');
    const a = Buffer.from(sigHeader, 'hex');
    const b = Buffer.from(expected, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function authorizeAdminOrCron(req) {
    const cronSecret = (process.env.CRON_SECRET || '').trim();
    if (cronSecret && req.headers.authorization === `Bearer ${cronSecret}`) {
        return { kind: 'cron', userId: null };
    }
    const adminKey = (process.env.ADMIN_API_KEY || '').trim();
    if (adminKey && req.headers['x-admin-key'] === adminKey) {
        return { kind: 'operator', userId: null };
    }

    if (req.method === 'POST' && req.body && typeof req.body === 'object') {
        if (verifyMagazineTestHmac(req, req.body.testEmail || '')) {
            return { kind: 'operator_test', userId: null };
        }
    }

    const sb = getSupabase();
    try {
        const authRes = await getServerUserWithFallback(req, sb);
        const user = authRes?.user ?? authRes;
        if (!user?.id) return null;
        const { data: profRows, error } = await sb
            .from('profiles')
            .select('role, is_admin')
            .eq('id', user.id)
            .limit(1);
        const profile = Array.isArray(profRows) ? profRows[0] : null;
        if (error || !profile || (!profile.is_admin && !ADMIN_ROLES.includes(profile.role))) {
            return null;
        }
        return { kind: 'admin', userId: user.id };
    } catch {
        return null;
    }
}

async function loadVaultSummary(sb, period) {
    const summary = {
        issuePeriod: period,
        totalItems: 0,
        vaultedImagesCount: 0,
        countsBySection: {},
        topCandidates: [],
    };
    try {
        const { data: rows } = await sb
            .from('magazine_vault_items')
            .select('id, section, headline, vaulted_image_url, editorial_score, is_pinned, is_excluded')
            .eq('issue_period', period)
            .order('is_pinned', { ascending: false })
            .order('editorial_score', { ascending: false })
            .limit(500);

        const list = Array.isArray(rows) ? rows : [];
        summary.totalItems = list.length;
        for (const r of list) {
            const sec = String(r.section || 'news_brief');
            summary.countsBySection[sec] = (summary.countsBySection[sec] || 0) + 1;
            if (r.vaulted_image_url && !String(r.vaulted_image_url).includes('fallback=1')) {
                summary.vaultedImagesCount += 1;
            }
        }
        summary.topCandidates = list.slice(0, 12);
    } catch {
        /* graceful fallback */
    }
    return summary;
}

async function sendResendBatch(resend, messages, idempotencyKey = '') {
    const attempt = async (payload, opts) => {
        const result = opts ? await resend.batch.send(payload, opts) : await resend.batch.send(payload);
        if (result?.error) throw new Error(result.error.message || 'Resend batch error');
        return result;
    };
    try {
        await attempt(messages, idempotencyKey ? { idempotencyKey } : undefined);
        return { sent: messages.length, failed: 0, error: null };
    } catch {
        try {
            await attempt(
                messages.map(({ headers, tags, ...rest }) => rest),
                idempotencyKey ? { idempotencyKey: `${idempotencyKey}-plain` } : undefined
            );
            return { sent: messages.length, failed: 0, error: null };
        } catch (retryErr) {
            return {
                sent: 0,
                failed: messages.length,
                error: retryErr?.message || String(retryErr),
            };
        }
    }
}

async function dispatchCoverRevealBroadcast(sb, { issue, manifest, siteUrl, createdBy = null }) {
    if (issue?.email_campaign_id) {
        return {
            alreadyEmailed: true,
            emailCampaignId: issue.email_campaign_id,
            sent: 0,
            failed: 0,
        };
    }

    const apiKey = resendApiKey();
    if (!apiKey) {
        return {
            alreadyEmailed: false,
            skippedNoApiKey: true,
            emailCampaignId: null,
            sent: 0,
            failed: 0,
        };
    }

    const from = resendFrom(process.env.NEWS_DIGEST_FROM || DEFAULT_MAGAZINE_FROM);
    const audienceRes = await resolveWeeklyWireRecipients(sb, { audienceMode: 'opted_in_all' });
    const recipients = (audienceRes?.recipients || []).slice(0, MAX_MAGAZINE_RECIPIENTS);

    if (recipients.length === 0) {
        return {
            alreadyEmailed: false,
            emailCampaignId: null,
            sent: 0,
            failed: 0,
        };
    }

    const sampleRendered = renderMonthlyMagazineCoverEmail({
        issue,
        manifest,
        siteUrl,
        postalAddress: MAGAZINE_POSTAL_ADDRESS,
    });

    const auditSubject = `[PROMO MAGAZINE] ${sampleRendered.subject}`.slice(0, 200);
    const { data: campRows, error: campErr } = await sb
        .from('newsletter_campaigns')
        .insert({
            subject: auditSubject,
            status: 'sending',
            lookback_days: 30,
            article_limit: 1,
            article_ids: [],
            recipient_count: recipients.length,
            started_at: new Date().toISOString(),
            created_by: createdBy || null,
        })
        .select('id')
        .limit(1);

    if (campErr) throw campErr;
    const campaignId = Array.isArray(campRows) ? campRows[0]?.id : campRows?.id;
    if (!campaignId) throw new Error('Unable to create magazine email audit campaign');

    // Stamp `email_campaign_id` immediately before batching so concurrent retries cannot double-send
    if (issue?.id) {
        await sb
            .from('magazine_issues')
            .update({ email_campaign_id: campaignId, updated_at: new Date().toISOString() })
            .eq('id', issue.id);
    }

    const resend = new Resend(apiKey);
    let sent = 0;
    let failed = 0;
    const errors = [];
    let batchIdx = 0;

    for (let i = 0; i < recipients.length; i += SEND_BATCH_SIZE) {
        const chunk = recipients.slice(i, i + SEND_BATCH_SIZE);
        const messages = chunk.map((recipient) => {
            const unsubToken = makeUnsubscribeToken(recipient.email);
            const unsubscribeUrl = `${siteUrl}/api/news/subscribe?unsubscribe=${encodeURIComponent(unsubToken)}`;
            const preferencesUrl = `${siteUrl}/hub/email-preferences?token=${encodeURIComponent(unsubToken)}`;
            const rendered = renderMonthlyMagazineCoverEmail({
                issue,
                manifest,
                siteUrl,
                postalAddress: MAGAZINE_POSTAL_ADDRESS,
                unsubscribeUrl,
                preferencesUrl,
            });
            return {
                from,
                to: [recipient.email],
                subject: rendered.subject,
                html: rendered.html,
                text: rendered.text,
                headers: {
                    'List-Unsubscribe': `<${unsubscribeUrl}>`,
                    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
                },
                tags: [{ name: 'campaign_id', value: String(campaignId) }],
            };
        });

        const resBatch = await sendResendBatch(resend, messages, `mag-${campaignId}-b-${batchIdx}`);
        batchIdx += 1;
        sent += resBatch.sent;
        failed += resBatch.failed;
        if (resBatch.error && errors.length < 5) errors.push(resBatch.error);
    }

    let existingSummary = null;
    try {
        const { data: latestCamp } = await sb
            .from('newsletter_campaigns')
            .select('error_summary')
            .eq('id', campaignId)
            .limit(1);
        existingSummary = Array.isArray(latestCamp) ? latestCamp[0]?.error_summary : null;
    } catch {
        /* ignore */
    }

    const finalStatus = failed === 0 ? 'sent' : sent > 0 ? 'partial' : 'failed';
    await sb
        .from('newsletter_campaigns')
        .update({
            status: finalStatus,
            sent_count: sent,
            failed_count: failed,
            error_summary: mergeFinalCampaignErrorSummary(existingSummary, errors),
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        })
        .eq('id', campaignId);

    return {
        alreadyEmailed: false,
        emailCampaignId: campaignId,
        sent,
        failed,
        errors,
    };
}

async function publishCompiledIssue(sb, { issuePeriod, sendEmail = false, siteUrl, createdBy = null }) {
    let existingRows = [];
    try {
        const { data } = await sb
            .from('magazine_issues')
            .select('*')
            .eq('issue_period', issuePeriod)
            .limit(2);
        existingRows = Array.isArray(data) ? data : [];
    } catch {
        existingRows = [];
    }

    let issue = existingRows[0] || null;
    const wasAlreadyPublished = issue?.status === 'published';
    let manifest;

    if (!issue || !issue.manifest_json) {
        const compiled = await compileMonthlyMagazineIssue(sb, {
            issuePeriod,
            status: 'published',
            siteUrl,
        });
        issue = compiled.issue;
        manifest = compiled.manifest;
    } else {
        manifest = normalizeIssueManifest(issue.manifest_json, issue);
    }

    const nowIso = new Date().toISOString();
    const publishedAt = issue?.published_at || nowIso;

    if (issue?.id) {
        const { data: updatedRows, error: pubErr } = await sb
            .from('magazine_issues')
            .update({
                status: 'published',
                published_at: publishedAt,
                updated_at: nowIso,
            })
            .eq('id', issue.id)
            .select('*')
            .limit(2);
        if (pubErr) throw pubErr;
        if (Array.isArray(updatedRows) && updatedRows[0]) {
            issue = updatedRows[0];
        } else {
            issue = { ...issue, status: 'published', published_at: publishedAt };
        }
    }

    const slug = String(issue?.slug || manifest.slug || issuePeriod);
    const issueRoute = `/hub/magazine/${encodeURIComponent(slug)}`;

    try {
        await submitToIndexNow([`${siteUrl}/hub/magazine`, `${siteUrl}${issueRoute}`]);
    } catch {
        /* non-blocking SEO ping */
    }

    // Insert Bell notifications once on initial publication with `_push: 'none'` (in-app bell only, zero mobile push spam)
    if (!wasAlreadyPublished) {
        try {
            const { data: profRows } = await sb
                .from('profiles')
                .select('id, is_horse')
                .order('last_active', { ascending: false })
                .limit(1200);
            const memberIds = (profRows || [])
                .filter((p) => p?.id && p.is_horse !== true && !String(p.id).startsWith('00000000-0000-0000-0000-'))
                .map((p) => String(p.id))
                .slice(0, 1000);

            for (let i = 0; i < memberIds.length; i += 200) {
                const chunk = memberIds.slice(i, i + 200);
                await sb.from('notifications').insert(
                    chunk.map((uid) => ({
                        user_id: uid,
                        type: 'monthly_magazine_published',
                        title: stripMagazineDashes(`Smarter.Poker Magazine Issue #${manifest.issueNumber} Is Live`),
                        message: stripMagazineDashes(manifest.coverHeadline),
                        action_url: issueRoute,
                        link: issueRoute,
                        data: {
                            kind: 'monthly_magazine',
                            issueNumber: manifest.issueNumber,
                            issuePeriod,
                            slug,
                            url: issueRoute,
                            link: issueRoute,
                            action_url: issueRoute,
                            _push: 'none',
                        },
                        read: false,
                        is_read: false,
                    }))
                );
            }
        } catch {
            /* non-blocking bell notification */
        }
    }

    let emailOutcome = null;
    if (sendEmail) {
        emailOutcome = await dispatchCoverRevealBroadcast(sb, {
            issue,
            manifest,
            siteUrl,
            createdBy,
        });
        if (emailOutcome?.emailCampaignId) {
            issue = { ...issue, email_campaign_id: emailOutcome.emailCampaignId };
        }
    }

    const previewEmail = renderMonthlyMagazineCoverEmail({
        issue,
        manifest,
        siteUrl,
    });

    return {
        issue,
        manifest,
        emailOutcome,
        htmlPreview: previewEmail.html,
    };
}

export default async function handler(req, res) {
    if (!['GET', 'POST'].includes(req.method)) {
        res.setHeader('Allow', 'GET, POST');
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    const queryAction = safeQ(req.query?.action).trim();
    const isActionGet = req.method === 'GET' && Boolean(queryAction);

    if (!applyRateLimit(req, res, req.method === 'POST' || isActionGet ? LIMITS.write : LIMITS.read)) {
        return;
    }

    const sb = getSupabase();
    const siteUrl = String(process.env.NEXT_PUBLIC_SITE_URL || MAGAZINE_SITE_URL).replace(/\/+$/, '');

    try {
        // ── 1. Public / Admin GET (unless GET carries a cron action like `?action=monthly_publish`) ──
        if (req.method === 'GET' && !isActionGet) {
            const wantsReview = ['1', 'true', 'yes'].includes(safeQ(req.query?.includeReview).toLowerCase());
            const auth = wantsReview ? await authorizeAdminOrCron(req) : null;
            if (wantsReview && !auth) {
                return res.status(401).json({ success: false, error: 'Administrator access required for review issues' });
            }

            res.setHeader(
                'Cache-Control',
                wantsReview ? 'private, no-store' : 'public, s-maxage=120, stale-while-revalidate=300'
            );

            const wantsList = ['1', 'true', 'yes'].includes(safeQ(req.query?.list).toLowerCase());
            const targetIssue = safeQ(req.query?.issue).trim();
            const allowedStatuses = wantsReview ? ['published', 'review', 'accumulating'] : ['published'];

            if (wantsList && !targetIssue) {
                const { data: rows, error } = await sb
                    .from('magazine_issues')
                    .select(ISSUE_SUMMARY_COLUMNS)
                    // in-list: bounded 1 to 3 magazine issue status constants
                    .in('status', allowedStatuses.slice(0, 3))
                    .order('issue_number', { ascending: false })
                    .limit(48);

                if (error) throw error;
                const vaultSummary = wantsReview
                    ? await loadVaultSummary(sb, isValidIssuePeriod(safeQ(req.query?.issuePeriod)) ? safeQ(req.query?.issuePeriod) : currentIssuePeriod())
                    : undefined;

                return res.status(200).json({
                    success: true,
                    issues: Array.isArray(rows) ? rows : [],
                    ...(vaultSummary ? { vaultSummary } : {}),
                });
            }

            let issueQuery = sb
                .from('magazine_issues')
                .select('*')
                // in-list: bounded 1 to 3 magazine issue status constants
                .in('status', allowedStatuses.slice(0, 3));

            const selector = targetIssue || 'latest';
            if (selector === 'latest') {
                issueQuery = issueQuery.order('issue_number', { ascending: false }).limit(1);
            } else if (/^\d+$/.test(selector)) {
                issueQuery = issueQuery.eq('issue_number', Number(selector)).limit(1);
            } else if (isValidIssuePeriod(selector)) {
                issueQuery = issueQuery.eq('issue_period', selector).limit(1);
            } else {
                issueQuery = issueQuery.eq('slug', selector).limit(1);
            }

            const { data: foundRows, error: findErr } = await issueQuery;
            if (findErr) throw findErr;
            const row = Array.isArray(foundRows) ? foundRows[0] : null;
            if (!row) {
                return res.status(404).json({ success: false, error: 'Magazine issue not found' });
            }

            const manifest = normalizeIssueManifest(row.manifest_json || {}, row);
            const vaultSummary = wantsReview ? await loadVaultSummary(sb, manifest.issuePeriod) : undefined;

            return res.status(200).json({
                success: true,
                issue: { ...row, manifest_json: manifest },
                manifest,
                ...(vaultSummary ? { vaultSummary } : {}),
            });
        }

        // ── 2. Authorized Admin / Cron Actions (`POST` or `GET ?action=monthly_publish`) ──
        res.setHeader('Cache-Control', 'private, no-store');
        const auth = await authorizeAdminOrCron(req);
        if (!auth) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }

        const body = req.method === 'POST' && req.body && typeof req.body === 'object' ? req.body : {};
        const action = String(body.action || queryAction || '').trim();
        const rawPeriod = String(body.issuePeriod || safeQ(req.query?.issuePeriod) || '').trim();

        if (auth.kind === 'operator_test' && action !== 'test_email' && action !== 'test') {
            return res.status(403).json({ success: false, error: 'Operator test signature restricted to test_email' });
        }

        if (action === 'harvest') {
            const period = isValidIssuePeriod(rawPeriod) ? rawPeriod : currentIssuePeriod();
            const harvestRes = await harvestMonthlyMagazineVault(sb, {
                issuePeriod: period,
                externalBudgetMs: 20_000,
            });
            const vaultSummary = await loadVaultSummary(sb, period);
            return res.status(200).json({
                success: true,
                action: 'harvest',
                ...harvestRes,
                vaultSummary,
            });
        }

        if (action === 'pin_item' || action === 'exclude_item') {
            const targetId = String(body.itemId || body.vaultItemId || body.id || '').trim();
            if (!targetId) {
                return res.status(400).json({ success: false, error: 'Vault item id is required' });
            }
            const { data: existingRows, error: readErr } = await sb
                .from('magazine_vault_items')
                .select('id, issue_period, is_pinned, is_excluded')
                .eq('id', targetId)
                .limit(1);
            if (readErr) throw readErr;
            const current = Array.isArray(existingRows) ? existingRows[0] : null;
            if (!current) {
                return res.status(404).json({ success: false, error: 'Vault item not found' });
            }

            if (action === 'pin_item') {
                const nextPinned = typeof body.pinned === 'boolean' ? body.pinned : !current.is_pinned;
                if (nextPinned && current.issue_period) {
                    await sb
                        .from('magazine_vault_items')
                        .update({ is_pinned: false })
                        .eq('issue_period', current.issue_period)
                        .neq('id', targetId);
                }
                const { data: updated, error: updErr } = await sb
                    .from('magazine_vault_items')
                    .update({
                        is_pinned: nextPinned,
                        ...(nextPinned ? { is_excluded: false } : {}),
                    })
                    .eq('id', targetId)
                    .select('*')
                    .limit(1);
                if (updErr) throw updErr;
                return res.status(200).json({
                    success: true,
                    item: Array.isArray(updated) ? updated[0] : null,
                });
            }

            const nextExcluded = typeof body.excluded === 'boolean' ? body.excluded : !current.is_excluded;
            const { data: updated, error: updErr } = await sb
                .from('magazine_vault_items')
                .update({
                    is_excluded: nextExcluded,
                    ...(nextExcluded ? { is_pinned: false } : {}),
                })
                .eq('id', targetId)
                .select('*')
                .limit(1);
            if (updErr) throw updErr;
            return res.status(200).json({
                success: true,
                item: Array.isArray(updated) ? updated[0] : null,
            });
        }

        if (action === 'compile') {
            const period = isValidIssuePeriod(rawPeriod) ? rawPeriod : currentIssuePeriod();
            if (body.harvestFirst === true) {
                await harvestMonthlyMagazineVault(sb, {
                    issuePeriod: period,
                    externalBudgetMs: 18_000,
                });
            }
            if (body.pinnedVaultItemId) {
                const pinId = String(body.pinnedVaultItemId).trim();
                await sb
                    .from('magazine_vault_items')
                    .update({ is_pinned: false })
                    .eq('issue_period', period);
                await sb
                    .from('magazine_vault_items')
                    .update({ is_pinned: true, is_excluded: false })
                    .eq('id', pinId);
            }

            const compiled = await compileMonthlyMagazineIssue(sb, {
                issuePeriod: period,
                coverHeadline: body.coverHeadline || '',
                coverSubheadline: body.coverSubheadline || '',
                editorNote: body.editorNote || '',
                pinnedVaultItemId: body.pinnedVaultItemId || '',
                siteUrl,
            });
            const emailPreview = renderMonthlyMagazineCoverEmail({
                issue: compiled.issue,
                manifest: compiled.manifest,
                siteUrl,
            });
            const vaultSummary = await loadVaultSummary(sb, period);

            return res.status(200).json({
                success: true,
                action: 'compile',
                issue: compiled.issue,
                manifest: compiled.manifest,
                htmlPreview: emailPreview.html,
                subjectPreview: emailPreview.subject,
                vaultSummary,
            });
        }

        if (action === 'publish') {
            const period = isValidIssuePeriod(rawPeriod) ? rawPeriod : currentIssuePeriod();
            const sendEmail = body.sendEmail === true;
            const published = await publishCompiledIssue(sb, {
                issuePeriod: period,
                sendEmail,
                siteUrl,
                createdBy: auth.userId,
            });
            return res.status(200).json({
                success: true,
                action: 'publish',
                issue: published.issue,
                manifest: published.manifest,
                emailOutcome: published.emailOutcome,
                emailCampaignId: published.issue?.email_campaign_id || null,
                htmlPreview: published.htmlPreview,
            });
        }

        if (action === 'monthly_publish') {
            const period = isValidIssuePeriod(rawPeriod) ? rawPeriod : previousIssuePeriod();
            await harvestMonthlyMagazineVault(sb, {
                issuePeriod: period,
                externalBudgetMs: 18_000,
            });
            await compileMonthlyMagazineIssue(sb, {
                issuePeriod: period,
                siteUrl,
            });
            const wantEmail =
                typeof body.sendEmail === 'boolean'
                    ? body.sendEmail
                    : req.query?.sendEmail !== undefined
                      ? ['1', 'true', 'yes'].includes(safeQ(req.query.sendEmail).toLowerCase())
                      : Boolean(resendApiKey());

            const published = await publishCompiledIssue(sb, {
                issuePeriod: period,
                sendEmail: wantEmail,
                siteUrl,
                createdBy: auth.userId,
            });

            return res.status(200).json({
                success: true,
                action: 'monthly_publish',
                issuePeriod: period,
                issue: published.issue,
                manifest: published.manifest,
                emailOutcome: published.emailOutcome,
                emailCampaignId: published.issue?.email_campaign_id || null,
            });
        }

        if (action === 'test_email' || action === 'test') {
            const period = isValidIssuePeriod(rawPeriod) ? rawPeriod : currentIssuePeriod();
            const rawTargetEmail = String(body.testEmail || safeQ(req.query?.testEmail) || '').trim();
            const targetEmail = rawTargetEmail ? normalizeExplicitTestEmail(rawTargetEmail) : null;
            if (rawTargetEmail && !targetEmail) {
                return res.status(400).json({ success: false, error: 'Enter a valid test email address' });
            }

            let issueRow = null;
            let manifest = null;
            try {
                const { data: issueRows } = await sb
                    .from('magazine_issues')
                    .select('*')
                    .eq('issue_period', period)
                    .limit(1);
                issueRow = Array.isArray(issueRows) ? issueRows[0] : null;
            } catch {
                issueRow = null;
            }

            if (issueRow?.manifest_json) {
                manifest = normalizeIssueManifest(issueRow.manifest_json, issueRow);
            } else {
                let vaultItems = [];
                try {
                    const { data } = await sb
                        .from('magazine_vault_items')
                        .select('*')
                        .eq('issue_period', period)
                        .limit(500);
                    vaultItems = Array.isArray(data) ? data : [];
                } catch {
                    vaultItems = [];
                }
                manifest = buildMagazineManifestFromVault({
                    issueNumber: Number(issueRow?.issue_number || 1),
                    volumeNumber: Number(issueRow?.volume_number || 1),
                    issuePeriod: period,
                    vaultItems,
                    overrides: {
                        coverHeadline: body.coverHeadline || '',
                        coverSubheadline: body.coverSubheadline || '',
                        editorNote: body.editorNote || '',
                        siteUrl,
                    },
                });
            }

            const unsubToken = targetEmail ? makeUnsubscribeToken(targetEmail) : 'preview';
            const unsubscribeUrl = `${siteUrl}/api/news/subscribe?unsubscribe=${encodeURIComponent(unsubToken)}`;
            const preferencesUrl = `${siteUrl}/hub/email-preferences?token=${encodeURIComponent(unsubToken)}`;

            const rendered = renderMonthlyMagazineCoverEmail({
                issue: issueRow || { issue_period: period },
                manifest,
                siteUrl,
                postalAddress: MAGAZINE_POSTAL_ADDRESS,
                unsubscribeUrl,
                preferencesUrl,
            });
            const testSubject = `[TEST] ${rendered.subject}`.slice(0, 198);

            if (!targetEmail) {
                return res.status(200).json({
                    success: true,
                    testOnly: true,
                    previewOnly: true,
                    subject: testSubject,
                    htmlPreview: rendered.html,
                    textPreview: rendered.text,
                });
            }

            if (!resendApiKey()) {
                return res.status(503).json({
                    success: false,
                    error: 'Email provider is not configured',
                    htmlPreview: rendered.html,
                });
            }

            const sendRes = await sendSingleDigestEmail({
                to: [targetEmail],
                from: resendFrom(process.env.NEWS_DIGEST_FROM || DEFAULT_MAGAZINE_FROM),
                subject: testSubject,
                html: rendered.html,
                text: rendered.text,
                headers: {
                    'List-Unsubscribe': `<${unsubscribeUrl}>`,
                    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
                },
            });

            if (!sendRes?.ok) {
                return res.status(502).json({
                    success: false,
                    error: sendRes?.error || 'Unable to send test Cover-Reveal email',
                    htmlPreview: rendered.html,
                });
            }

            return res.status(200).json({
                success: true,
                testOnly: true,
                targetEmail,
                from: resendFrom(process.env.NEWS_DIGEST_FROM || DEFAULT_MAGAZINE_FROM),
                subject: testSubject,
                htmlPreview: rendered.html,
                textPreview: rendered.text,
            });
        }

        return res.status(400).json({
            success: false,
            error: 'Unsupported action. Expected harvest, compile, publish, monthly_publish, pin_item, exclude_item, or test_email.',
        });
    } catch (error) {
        try {
            reportApiError(error, req);
        } catch {
            /* ignore */
        }
        return res.status(500).json({
            success: false,
            error: error?.message || 'Magazine API operation failed',
        });
    }
}

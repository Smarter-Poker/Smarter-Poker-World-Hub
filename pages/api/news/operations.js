/**
 * Newsletter Operations API (`/api/news/operations`)
 *
 * Lives alongside `/api/news/digest`, `/api/news/promo-campaign`, and
 * `/api/news/lifecycle` so `/admin/newsletter` can execute both `GET` reads and
 * `PATCH` subscriber status toggles under verified Supabase JWT + administrator
 * role enforcement without tripping `middleware.ts`'s `/api/admin/*` `mfa_session`
 * cookie block on unenrolled accounts.
 *
 * GET   dashboard counts, subscribers, deliverability readiness, and campaign history
 * PATCH activate/deactivate one subscriber (clearing stale `snooze:*` / opt-out `source` tags on reactivate)
 */
import dns from 'dns';
import { createClient } from '../../../src/lib/supabaseServerClient.js';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth.js';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit.js';
import { reportApiError } from '../../../src/lib/apiErrorHandler.js';
import {
    parseCampaignTelemetrySummary,
    resolveAdminSubscriberPatch,
} from '../../../src/lib/newsletter/campaignTelemetry.mjs';

export { resolveAdminSubscriberPatch };

const DNS_TTL_MS = 5 * 60 * 1000;
const DNS_TIMEOUT_MS = 1500;
const DNS_HOSTS = {
    dmarc: '_dmarc.smarter.poker',
    bimi: 'default._bimi.smarter.poker',
    bimiMail: 'default._bimi.mail.smarter.poker',
};
let _dnsCache = null;

async function resolveTxtJoined(host) {
    try {
        const records = await Promise.race([
            dns.promises.resolveTxt(host),
            new Promise((_, reject) => setTimeout(() => reject(new Error('dns timeout')), DNS_TIMEOUT_MS)),
        ]);
        return (records || []).map((chunks) => (Array.isArray(chunks) ? chunks.join('') : String(chunks)));
    } catch {
        return [];
    }
}

/** Live DMARC / BIMI DNS readiness, cached in memory for five minutes. */
export async function readEmailDnsReadiness(now = Date.now()) {
    if (_dnsCache && now - _dnsCache.at < DNS_TTL_MS) return _dnsCache.value;
    const [dmarcRecords, bimiRecords, bimiMailRecords] = await Promise.all([
        resolveTxtJoined(DNS_HOSTS.dmarc),
        resolveTxtJoined(DNS_HOSTS.bimi),
        resolveTxtJoined(DNS_HOSTS.bimiMail),
    ]);
    const dmarcRecord = dmarcRecords.find((r) => /^\s*v=DMARC1\b/i.test(r)) || null;
    const bimiRecordFound =
        [...bimiRecords, ...bimiMailRecords].find((r) => /^\s*v=BIMI1\b/i.test(r)) || null;
    const value = {
        dmarcConfigured: Boolean(dmarcRecord),
        dmarcRecord,
        bimiDnsConfigured: Boolean(bimiRecordFound),
        bimiRecordFound,
    };
    _dnsCache = { at: now, value };
    return value;
}

export const ADMIN_ROLES = ['admin', 'superadmin', 'god'];
let _supabase = null;

function getSupabase() {
    if (!_supabase) _supabase = createClient();
    return _supabase;
}

function clampInt(value, fallback, min, max) {
    const n = parseInt(Array.isArray(value) ? value[0] : value, 10);
    return Number.isNaN(n) ? fallback : Math.min(Math.max(n, min), max);
}

export async function requireNewsletterAdmin(req, res, supabase = getSupabase()) {
    const { user } = await getServerUserWithFallback(req, supabase);
    if (!user?.id) {
        res.status(401).json({ success: false, error: 'Not authenticated' });
        return null;
    }
    const { data: profile, error } = await supabase
        .from('profiles')
        .select('role, is_admin')
        .eq('id', user.id)
        .maybeSingle();
    if (error || !profile || (!profile.is_admin && !ADMIN_ROLES.includes(profile.role))) {
        res.status(403).json({ success: false, error: 'Admin access required' });
        return null;
    }
    return user;
}

export default async function handler(req, res) {
    if (!['GET', 'PATCH'].includes(req.method)) {
        res.setHeader('Allow', 'GET, PATCH');
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }
    if (!applyRateLimit(req, res, req.method === 'GET' ? LIMITS.read : LIMITS.write)) return;
    const supabase = getSupabase();
    const admin = await requireNewsletterAdmin(req, res, supabase);
    if (!admin) return;

    res.setHeader('Cache-Control', 'private, no-store');

    try {
        if (req.method === 'PATCH') {
            const { id, is_active: isActive } = req.body || {};
            if (typeof id !== 'string' || !id.trim() || typeof isActive !== 'boolean') {
                return res.status(400).json({ success: false, error: 'Subscriber id and status are required' });
            }

            const { data: existing, error: lookupErr } = await supabase
                .from('newsletter_subscribers')
                .select('id, email, user_id, source')
                .eq('id', id.trim())
                .maybeSingle();
            if (lookupErr) throw lookupErr;
            if (!existing) {
                return res.status(404).json({ success: false, error: 'Subscriber not found' });
            }

            const nowIso = new Date().toISOString();
            const patch = resolveAdminSubscriberPatch(isActive, existing.source, nowIso);
            const { data, error } = await supabase
                .from('newsletter_subscribers')
                .update(patch)
                .eq('id', existing.id)
                .select('id,email,is_active,source,subscribed_at,unsubscribed_at,created_at')
                .maybeSingle();
            if (error) throw error;
            if (!data) return res.status(404).json({ success: false, error: 'Subscriber not found' });

            if (existing.user_id) {
                const isSmsRow = String(existing.email || '').trim().toLowerCase().startsWith('sms:');
                const prefPatch = isSmsRow
                    ? {
                          user_id: existing.user_id,
                          sms_enabled: isActive,
                          ...(isActive ? { mute_all: false } : {}),
                          updated_at: nowIso,
                      }
                    : {
                          user_id: existing.user_id,
                          ...(isActive
                              ? { mute_all: false, email_enabled: true, marketing_enabled: true }
                              : { marketing_enabled: false }),
                          updated_at: nowIso,
                      };
                try {
                    await supabase
                        .from('notification_preferences')
                        .upsert(prefPatch, { onConflict: 'user_id' });
                } catch (_prefErr) {
                    /* non-blocking preference mirror */
                }
            }

            return res.status(200).json({ success: true, subscriber: data });
        }

        const page = clampInt(req.query.page, 1, 1, 100000);
        const pageSize = clampInt(req.query.pageSize, 25, 10, 100);
        const search = String(Array.isArray(req.query.search) ? req.query.search[0] : req.query.search || '')
            .trim()
            .slice(0, 120);
        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;

        let subscriberQuery = supabase
            .from('newsletter_subscribers')
            .select('id,email,is_active,source,subscribed_at,unsubscribed_at,created_at', { count: 'exact' })
            .order('created_at', { ascending: false })
            .range(from, to);
        if (search) subscriberQuery = subscriberQuery.ilike('email', `%${search.replace(/[%_]/g, '\\$&')}%`);

        const [
            subscribersResult,
            activeResult,
            inactiveResult,
            smsActiveResult,
            wireOnlyResult,
            campaignCountResult,
            campaignsResult,
            articlesResult,
            promoCodesResult,
        ] = await Promise.all([
            subscriberQuery,
            supabase.from('newsletter_subscribers').select('id', { count: 'exact', head: true }).like('email', '%@%').or('is_active.is.null,is_active.eq.true'),
            supabase.from('newsletter_subscribers').select('id', { count: 'exact', head: true }).like('email', '%@%').eq('is_active', false),
            supabase.from('newsletter_subscribers').select('id', { count: 'exact', head: true }).like('email', 'sms:%').or('is_active.is.null,is_active.eq.true'),
            supabase.from('newsletter_subscribers').select('id', { count: 'exact', head: true }).eq('source', 'pref:wire_only').or('is_active.is.null,is_active.eq.true'),
            supabase.from('newsletter_campaigns').select('id', { count: 'exact', head: true }),
            supabase.from('newsletter_campaigns')
                .select('id,subject,status,lookback_days,article_limit,recipient_count,sent_count,failed_count,error_summary,started_at,completed_at,created_at')
                .order('created_at', { ascending: false })
                .limit(20),
            supabase.from('poker_news')
                .select('id,title,source_name,published_at')
                .eq('is_published', true)
                .order('published_at', { ascending: false })
                .limit(12),
            supabase.from('promo_codes')
                .select('id, code')
                .in('code', ['sp_welcome_back_202611', 'WELCOME_BACK_3WK_202611']),
        ]);

        for (const result of [subscribersResult, activeResult, inactiveResult, smsActiveResult, wireOnlyResult, campaignCountResult, campaignsResult, articlesResult]) {
            if (result.error) throw result.error;
        }

        const coldCutoffIso = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
        const [dnsReadiness, coldLeadsResult] = await Promise.all([
            readEmailDnsReadiness().catch(() => ({
                dmarcConfigured: false,
                dmarcRecord: null,
                bimiDnsConfigured: false,
                bimiRecordFound: null,
            })),
            supabase
                .from('newsletter_subscribers')
                .select('id', { count: 'exact', head: true })
                .in('source', ['owner_list_20261118', 'admin_import'])
                .or('is_active.is.null,is_active.eq.true')
                .lte('created_at', coldCutoffIso)
                .then((r) => r, () => ({ count: 0 })),
        ]);

        let welcomeBackRedemptions = 0;
        const wbCodeIds = (promoCodesResult?.data || []).map((row) => row?.id).filter(Boolean);
        if (wbCodeIds.length > 0) {
            // in-list: bounded by welcome-back promo code variants (<= 2)
            const { count: wbCount } = await supabase
                .from('promo_code_redemptions')
                .select('id', { count: 'exact', head: true })
                .in('promo_code_id', wbCodeIds.slice(0, 10))
                .not('reward_applied', 'is', null);
            welcomeBackRedemptions = wbCount || 0;
        }

        const wireOnlyCount = wireOnlyResult.count || 0;
        const parsedCampaigns = (campaignsResult.data || []).map((campaign) => {
            const telemetry = parseCampaignTelemetrySummary(campaign.error_summary);
            return {
                ...campaign,
                opens: telemetry.opens,
                clicks: telemetry.clicks,
                error_summary: telemetry.cleanErrorSummary,
            };
        });

        return res.status(200).json({
            success: true,
            stats: {
                active: activeResult.count || 0,
                inactive: inactiveResult.count || 0,
                sms_active: smsActiveResult.count || 0,
                wire_only: wireOnlyCount,
                welcome_back_redemptions: welcomeBackRedemptions,
                campaigns: campaignCountResult.count || 0,
                last_sent_at: parsedCampaigns.find((c) => ['sent', 'partial'].includes(c.status))?.completed_at || null,
            },
            wireOnlyCount,
            welcomeBackRedemptions,
            deliverability: {
                bimiSvgPath: '/brand/bimi-logo.svg',
                bimiDnsRecord: 'v=BIMI1; l=https://smarter.poker/brand/bimi-logo.svg;',
                preheaderEnabled: true,
                oneClickUnsubscribe: true,
                dmarcConfigured: dnsReadiness.dmarcConfigured,
                dmarcRecord: dnsReadiness.dmarcRecord,
                bimiDnsConfigured: dnsReadiness.bimiDnsConfigured,
                bimiRecordFound: dnsReadiness.bimiRecordFound,
                rssFeedPath: '/api/news/wire-rss',
                spotImageEngine: true,
                calendarIcsEnabled: true,
                coldSunsetShield: true,
                coldLeads90dCount: coldLeadsResult?.count || 0,
            },
            subscribers: subscribersResult.data || [],
            subscriberPagination: {
                page,
                pageSize,
                total: subscribersResult.count || 0,
                pages: Math.max(1, Math.ceil((subscribersResult.count || 0) / pageSize)),
            },
            campaigns: parsedCampaigns,
            recentArticles: articlesResult.data || [],
        });
    } catch (error) {
        try { reportApiError(error, req); } catch (_e) { /* noop */ }
        console.warn('[Newsletter operations] failed:', error?.message || error);
        return res.status(500).json({ success: false, error: 'Newsletter operations unavailable' });
    }
}

/**
 * Newsletter operations API.
 *
 * GET   dashboard counts, subscribers and campaign history
 * PATCH activate/deactivate one subscriber
 *
 * All access requires a verified Supabase session and an administrator role.
 * The browser never receives service credentials.
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/apiErrorHandler';

const ADMIN_ROLES = ['admin', 'superadmin', 'god'];
let _supabase = null;

function getSupabase() {
    if (!_supabase) _supabase = createClient();
    return _supabase;
}

function clampInt(value, fallback, min, max) {
    const n = parseInt(Array.isArray(value) ? value[0] : value, 10);
    return Number.isNaN(n) ? fallback : Math.min(Math.max(n, min), max);
}

async function requireAdmin(req, res) {
    const supabase = getSupabase();
    const { user } = await getServerUserWithFallback(req, supabase);
    if (!user?.id) {
        res.status(401).json({ success: false, error: 'Not authenticated' });
        return null;
    }
    const { data: profile, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();
    if (error || !profile || !ADMIN_ROLES.includes(profile.role)) {
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
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const supabase = getSupabase();
    res.setHeader('Cache-Control', 'private, no-store');

    try {
        if (req.method === 'PATCH') {
            const { id, is_active: isActive } = req.body || {};
            if (typeof id !== 'string' || typeof isActive !== 'boolean') {
                return res.status(400).json({ success: false, error: 'Subscriber id and status are required' });
            }
            const patch = isActive
                ? { is_active: true, unsubscribed_at: null }
                : { is_active: false, unsubscribed_at: new Date().toISOString() };
            const { data, error } = await supabase
                .from('newsletter_subscribers')
                .update(patch)
                .eq('id', id)
                .select('id,email,is_active,source,subscribed_at,unsubscribed_at,created_at')
                .maybeSingle();
            if (error) throw error;
            if (!data) return res.status(404).json({ success: false, error: 'Subscriber not found' });
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
            campaignCountResult,
            campaignsResult,
            articlesResult,
        ] = await Promise.all([
            subscriberQuery,
            supabase.from('newsletter_subscribers').select('id', { count: 'exact', head: true }).or('is_active.is.null,is_active.eq.true'),
            supabase.from('newsletter_subscribers').select('id', { count: 'exact', head: true }).eq('is_active', false),
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
        ]);

        for (const result of [subscribersResult, activeResult, inactiveResult, campaignCountResult, campaignsResult, articlesResult]) {
            if (result.error) throw result.error;
        }

        return res.status(200).json({
            success: true,
            stats: {
                active: activeResult.count || 0,
                inactive: inactiveResult.count || 0,
                campaigns: campaignCountResult.count || 0,
                last_sent_at: campaignsResult.data?.find((c) => ['sent', 'partial'].includes(c.status))?.completed_at || null,
            },
            subscribers: subscribersResult.data || [],
            subscriberPagination: {
                page,
                pageSize,
                total: subscribersResult.count || 0,
                pages: Math.max(1, Math.ceil((subscribersResult.count || 0) / pageSize)),
            },
            campaigns: campaignsResult.data || [],
            recentArticles: articlesResult.data || [],
        });
    } catch (error) {
        try { reportApiError(error, req); } catch (_e) { /* noop */ }
        console.warn('[Admin newsletter] failed:', error?.message || error);
        return res.status(500).json({ success: false, error: 'Newsletter operations unavailable' });
    }
}

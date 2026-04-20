/**
 * Check Slug Availability API
 *
 * GET /api/social/pages/check-slug?slug=CLUBJAQK&page_id=<optional>
 *
 * Returns: { available: boolean, formatted: string, error?: string }
 */
import { createClient } from '../../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../../src/lib/sentryWrap';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getSupabase() {
    if (!supabaseUrl || !supabaseServiceKey) return null;
    return createClient(supabaseUrl, supabaseServiceKey);
}

// Reserved slugs that conflict with existing routes or system paths
const RESERVED_SLUGS = new Set([
    'create', 'index', 'manage', 'admin', 'settings', 'api',
    'new', 'edit', 'delete', 'search', 'explore', 'discover',
    'help', 'support', 'about', 'terms', 'privacy', 'login',
    'signup', 'register', 'logout', 'profile', 'null', 'undefined',
]);

/**
 * Format a raw input into a valid slug:
 *  - lowercase
 *  - spaces/underscores → hyphens
 *  - strip non-alphanumeric (except hyphens)
 *  - collapse multiple hyphens
 *  - trim leading/trailing hyphens
 *  - cap at 60 chars
 */
export function formatSlug(raw) {
    if (!raw) return '';
    return raw
        .toLowerCase()
        .trim()
        .replace(/[\s_]+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
        .replace(/-{2,}/g, '-')
        .replace(/^-|-$/g, '')
        .substring(0, 60);
}

/**
 * Validate a formatted slug meets all rules
 */
export function validateSlug(slug) {
    if (!slug || slug.length < 3) {
        return { valid: false, error: 'Slug must be at least 3 characters' };
    }
    if (slug.length > 60) {
        return { valid: false, error: 'Slug must be 60 characters or less' };
    }
    if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug) && slug.length >= 3) {
        // Allow single-word slugs (no hyphens) of 3+ chars
        if (!/^[a-z0-9]+$/.test(slug)) {
            return { valid: false, error: 'Slug can only contain lowercase letters, numbers, and hyphens' };
        }
    }
    if (RESERVED_SLUGS.has(slug)) {
        return { valid: false, error: 'This URL is reserved and cannot be used' };
    }
    // Check for UUID-like patterns (would conflict with ID-based routing)
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug)) {
        return { valid: false, error: 'Slug cannot look like a UUID' };
    }
    return { valid: true };
}

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    // Rate limit: prevent brute-force slug enumeration
    if (!applyRateLimit(req, res, LIMITS.read)) return;

    // CDN cache: short TTL since availability can change
    res.setHeader('Cache-Control', 'public, s-maxage=5, stale-while-revalidate=10');

    try {
        const { slug: rawSlug, page_id } = req.query;

        if (!rawSlug) {
            return res.status(400).json({ success: false, available: false, error: 'slug parameter is required' });
        }

        const formatted = formatSlug(rawSlug);

        // Validate format
        const validation = validateSlug(formatted);
        if (!validation.valid) {
            return res.status(200).json({
                success: true,
                available: false,
                formatted,
                error: validation.error,
            });
        }

        // Check uniqueness in database
        const supabase = getSupabase();
        if (!supabase) {
            return res.status(500).json({ success: false, error: 'Server configuration error' });
        }

        let query = supabase
            .from('social_pages')
            .select('id')
            .eq('slug', formatted);

        // If page_id is provided, exclude it (owner keeping their own slug)
        if (page_id) {
            query = query.neq('id', page_id);
        }

        const { data, error } = await query.maybeSingle();

        if (error) {
            return res.status(500).json({ success: false, error: error.message });
        }

        const available = !data;

        // #6: Generate suggestions when slug is taken
        let suggestions = [];
        if (!available) {
            const suffixes = ['-poker', `-${Date.now().toString(36).slice(-4)}`, '-club', '-page', '-hq'];
            const candidateSlugs = suffixes.map(s => (formatted + s).substring(0, 60));
            const { data: takenSlugs } = await supabase
                .from('social_pages')
                .select('slug')
                .in('slug', candidateSlugs);
            const takenSet = new Set((takenSlugs || []).map(r => r.slug));
            suggestions = candidateSlugs.filter(s => !takenSet.has(s)).slice(0, 3);
        }

        // #10: Check slug cooldown (deleted within last 30 days)
        if (available) {
            const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
            const { data: recentlyDeleted } = await supabase
                .from('slug_history')
                .select('id')
                .eq('old_slug', formatted)
                .eq('reason', 'deleted')
                .gte('changed_at', thirtyDaysAgo)
                .limit(1)
                .maybeSingle();
            if (recentlyDeleted) {
                return res.status(200).json({
                    success: true,
                    available: false,
                    formatted,
                    error: 'This URL was recently used and is in a 30-day cooldown period',
                    suggestions: [],
                });
            }
        }

        return res.status(200).json({
            success: true,
            available,
            formatted,
            error: available ? null : 'This URL is already taken',
            suggestions,
        });
    } catch (err) {
        try { reportApiError(err, req); } catch (_sentryErr) {}
        console.error('[check-slug]', err);
        return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
    }
}

/**
 * PUBLIC HOME GAME POSTS API (phase40 hardened)
 * GET /api/public/home-game/[code]/posts
 *
 * Returns published posts from a home group's feed, by club_code.
 *
 * Security posture:
 *   • Private groups are NEVER exposed via this endpoint, even if individual
 *     posts were tagged visible_to='public'. (A post inside a private group
 *     is not reachable by anyone outside the group.)
 *   • Anonymous endpoint (no auth), so rate-limited under LIMITS.read.
 *   • limit/offset clamped to sane bounds (max 50 per page).
 */

import { createClient } from '../../../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../../../src/lib/sentryWrap';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
        _supabase = createClient(url, key);
    }
    return _supabase;
}

function clampInt(raw, defaultVal, min, max) {
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n)) return defaultVal;
    return Math.max(min, Math.min(max, n));
}

export default async function handler(req, res) {
    try {
        if (req.method !== 'GET') {
            res.setHeader('Allow', ['GET']);
            return res.status(405).json({
                success: false,
                error: { code: 'METHOD_NOT_ALLOWED', message: 'Only GET allowed' }
            });
        }

        if (!applyRateLimit(req, res, LIMITS.read)) return;

        // Cache headers must be set AFTER the rate-limit check so we never
        // cache a 429 as a 200.
        res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');

        const { code } = req.query;
        const limit = clampInt(req.query.limit, 20, 1, 50);
        const offset = clampInt(req.query.offset, 0, 0, 10000);

        if (!code || typeof code !== 'string' || code.length > 50) {
            return res.status(400).json({
                success: false,
                error: { code: 'MISSING_CODE', message: 'Valid club_code required' }
            });
        }

        // ── Resolve club_code → group. Private groups are not publicly
        //    reachable, so we filter them out right here regardless of any
        //    per-post visibility flags. ──
        const { data: group, error: groupError } = await getSupabase()
            .from('commander_home_groups')
            .select('id, is_private, is_active')
            .eq('club_code', code)
            .eq('is_active', true)
            .eq('is_private', false)
            .maybeSingle();

        if (groupError || !group) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Group not found' }
            });
        }

        const { data: posts, error, count } = await getSupabase()
            .from('commander_home_posts')
            .select(`
                id,
                content,
                post_type,
                image_urls,
                video_url,
                likes_count,
                comments_count,
                is_pinned,
                created_at,
                author:author_id (
                    id,
                    display_name,
                    avatar_url
                )
            `, { count: 'exact' })
            .eq('group_id', group.id)
            .eq('is_published', true)
            .eq('visible_to', 'public')
            .order('is_pinned', { ascending: false })
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (error) throw error;

        return res.status(200).json({
            success: true,
            data: {
                posts: posts || [],
                total: count,
                limit,
                offset,
            }
        });
    } catch (err) {
        try { reportApiError(err, req); } catch (_sentryErr) {}
        // eslint-disable-next-line no-console
        console.error('[public/home-game/[code]/posts]', err);
        if (!res.headersSent) {
            return res.status(500).json({
                success: false,
                error: { code: 'SERVER_ERROR', message: 'Failed to fetch posts' }
            });
        }
    }
}

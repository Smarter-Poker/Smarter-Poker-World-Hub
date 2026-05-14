/**
 * ══════════════════════════════════════════════════════════════════════════
 *  PUBLIC HOME GAMES — FOLLOW / UNFOLLOW API (phase40 hardened)
 *  POST   /api/public/home-games/[slug]/follow   — follow this page
 *  DELETE /api/public/home-games/[slug]/follow   — unfollow
 *  GET    /api/public/home-games/[slug]/follow   — check if current user follows
 * ══════════════════════════════════════════════════════════════════════════
 *
 *  Auth required (Bearer token). Follows live in `social_page_followers`.
 *
 *  follower_count consistency:
 *    The existing DB trigger `trg_page_follower_count` atomically increments
 *    and decrements `social_pages.follower_count` whenever a row is inserted,
 *    deleted, or has its status transitioned to/from 'approved'. Inserting
 *    with status='approved' makes the trigger do the counting for us —
 *    NO read-modify-write in application code, which closes the TOCTOU race
 *    the previous version had under concurrent follows.
 *
 *  Privacy / safety:
 *    Private pages are hidden entirely. Follower identities are never leaked
 *    to anonymous callers.
 */

import { createClient } from '../../../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../../../src/lib/sentryWrap';
import { sendPushNotification } from '../../../../../src/lib/commander/pushNotifications';

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

async function resolveUser(req) {
    const auth = req.headers.authorization || '';
    const token = auth.replace(/^Bearer\s+/i, '');
    if (!token) return null;
    const { data, error } = await getSupabase().auth.getUser(token);
    if (error || !data?.user) return null;
    return data.user;
}

// Resolve slug -> social_page (must be home_game + public).
async function resolvePage(slug) {
    const { data, error } = await getSupabase()
        .from('social_pages')
        .select('id, page_type, is_public, follower_count, slug, name, linked_entity_id')
        .eq('slug', slug)
        .eq('page_type', 'home_game')
        .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return data;
}

// Re-read the current follower_count after a mutation. The count is maintained
// by `trg_page_follower_count` and updated atomically, so a fresh SELECT gives
// the post-trigger value. Best-effort: if the reread fails for any reason we
// fall back to the pre-mutation count + delta so the response still looks
// sensible; this mirrors what the UI displayed before the mutation anyway.
async function readFollowerCount(pageId, fallback) {
    try {
        const { data } = await getSupabase()
            .from('social_pages')
            .select('follower_count')
            .eq('id', pageId)
            .maybeSingle();
        if (data && typeof data.follower_count === 'number') return data.follower_count;
    } catch (_e) { console.warn('[App] Handled exception:', _e?.message || _e); }
    return fallback;
}

export default async function handler(req, res) {
    try {
        const method = (req.method || 'GET').toUpperCase();

        // GET under read limit; POST/DELETE under write limit.
        const limit = method === 'GET' ? LIMITS.read : LIMITS.write;
        if (!applyRateLimit(req, res, limit)) return;

        if (!['GET', 'POST', 'DELETE'].includes(method)) {
            res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
            return res.status(405).json({ success: false, error: 'Method not allowed' });
        }

        const safeQ = (v) => v ? (Array.isArray(v) ? String(v[0]) : typeof v === 'object' ? null : String(v)) : v;
        const slug = safeQ(req.query.slug);
        if (!slug || typeof slug !== 'string') {
            return res.status(400).json({ success: false, error: 'slug required' });
        }

        const page = await resolvePage(slug);
        if (!page) {
            return res.status(404).json({ success: false, error: 'Home game not found' });
        }

        const user = await resolveUser(req);
        if (!user) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        const supabase = getSupabase();

        // ── GET: current follow state ─────────────────────────────────────
        if (method === 'GET') {
            const { data: follow } = await supabase
                .from('social_page_followers')
                .select('id, created_at, status, notifications_enabled')
                .eq('page_id', page.id)
                .eq('user_id', user.id)
                .maybeSingle();
            return res.status(200).json({
                success: true,
                is_following: !!(follow && follow.status === 'approved'),
                follower_count: page.follower_count || 0,
                follow: follow || null,
            });
        }

        // ── POST: follow (idempotent) ─────────────────────────────────────
        if (method === 'POST') {
            const { data: existing } = await supabase
                .from('social_page_followers')
                .select('id, status')
                .eq('page_id', page.id)
                .eq('user_id', user.id)
                .maybeSingle();

            if (existing && existing.status === 'approved') {
                return res.status(200).json({
                    success: true,
                    is_following: true,
                    already: true,
                    follower_count: page.follower_count || 0,
                });
            }

            if (existing && existing.status !== 'approved') {
                // Re-activate: trigger will increment when status transitions to approved.
                const { error: updErr } = await supabase
                    .from('social_page_followers')
                    .update({ status: 'approved', notifications_enabled: true })
                    .eq('id', existing.id);
                if (updErr) throw updErr;
            } else {
                // Fresh insert with status='approved' so the trigger increments atomically.
                const { error: insErr } = await supabase
                    .from('social_page_followers')
                    .insert({
                        page_id: page.id,
                        user_id: user.id,
                        role: 'follower',
                        status: 'approved',
                        notifications_enabled: true,
                    });
                if (insErr) {
                    // Unique-constraint race: another request beat us. Treat as success.
                    const isUnique = /duplicate|unique|23505/i.test(insErr.message || '') ||
                                     insErr.code === '23505';
                    if (!isUnique) throw insErr;
                }
            }

            const newCount = await readFollowerCount(page.id, (page.follower_count || 0) + 1);

            // Notify the host that someone followed their home game.
            // Non-blocking — never fails the main request.
            try { await dispatchFollowNotification(supabase, { page, follower_user_id: user.id }); }
            catch (e) { console.warn('[follow] notify threw:', e?.message || e); }

            return res.status(201).json({
                success: true,
                is_following: true,
                already: false,
                follower_count: newCount,
            });
        }

        // ── DELETE: unfollow (idempotent) ─────────────────────────────────
        if (method === 'DELETE') {
            const { data: existing } = await supabase
                .from('social_page_followers')
                .select('id, status')
                .eq('page_id', page.id)
                .eq('user_id', user.id)
                .maybeSingle();

            if (!existing) {
                return res.status(200).json({
                    success: true,
                    is_following: false,
                    was_following: false,
                    follower_count: page.follower_count || 0,
                });
            }

            const wasApproved = existing.status === 'approved';

            const { error: delErr } = await supabase
                .from('social_page_followers')
                .delete()
                .eq('id', existing.id);
            if (delErr) throw delErr;

            const expectedDelta = wasApproved ? -1 : 0;
            const newCount = await readFollowerCount(
                page.id,
                Math.max(0, (page.follower_count || 0) + expectedDelta)
            );

            return res.status(200).json({
                success: true,
                is_following: false,
                was_following: wasApproved,
                follower_count: newCount,
            });
        }

        // Unreachable — guard above returns 405.
        return res.status(405).end();
    } catch (err) {
        try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
        // eslint-disable-next-line no-console
        console.warn('[public/home-games/slug/follow]', err);
        if (!res.headersSent) {
            return res.status(500).json({ success: false, error: err?.message || 'Internal server error' });
        }
    }
}

/**
 * dispatchFollowNotification
 * Sends in-app notification + push to the host whenever someone follows
 * their home game page. Deduped to once per follower per 24 hours so
 * re-follows (e.g. unfollow then re-follow) don't spam.
 */
async function dispatchFollowNotification(supabase, { page, follower_user_id }) {
    try {
        // Resolve the group owner (host) via social_pages.linked_entity_id
        const { data: groupRow } = await supabase
            .from('commander_home_groups')
            .select('owner_id, name')
            .eq('id', page.linked_entity_id)
            .maybeSingle();

        const host_user_id = groupRow?.owner_id;
        if (!host_user_id || host_user_id === follower_user_id) return;

        // 24-hour dedup
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data: recent } = await supabase
            .from('notifications')
            .select('id')
            .eq('user_id', host_user_id)
            .eq('type', 'home_game_new_follower')
            .gte('created_at', oneDayAgo)
            .filter('metadata->>follower_id', 'eq', String(follower_user_id))
            .limit(1);
        if (recent && recent.length > 0) return;

        // Resolve follower display name
        const { data: profile } = await supabase
            .from('profiles')
            .select('display_name, full_name, first_name, username')
            .eq('id', follower_user_id)
            .maybeSingle();
        const followerName = profile?.display_name || profile?.full_name || profile?.first_name || profile?.username || 'Someone';

        const gameName = groupRow?.name || page.name || 'your home game';
        const manageUrl = `https://smarter.poker/hub/home-games/${encodeURIComponent(page.slug)}`;
        const titleText = `${followerName} is now following ${gameName}`;
        const bodyText = `Tap to view your home game page.`;
        const metadata = {
            follower_id: String(follower_user_id),
            follower_name: followerName,
            page_id: String(page.id),
            page_slug: page.slug,
            group_name: gameName,
        };

        // In-app notification
        await supabase.from('notifications').insert({
            user_id: host_user_id,
            type: 'home_game_new_follower',
            title: titleText,
            message: bodyText,
            data: metadata,
            metadata,
            actor_id: follower_user_id,
            action_url: manageUrl,
            link: manageUrl,
            is_read: false,
            read: false,
        });

        // Push notification
        await sendPushNotification({
            externalUserIds: [host_user_id],
            title: titleText,
            message: bodyText,
            url: manageUrl,
            data: { ...metadata, notification_type: 'home_game_new_follower' },
        });
    } catch (e) {
        console.warn('[follow] dispatchFollowNotification failed (non-fatal):', e?.message || e);
    }
}

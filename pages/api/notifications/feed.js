/**
 * GET /api/notifications/feed
 * ═══════════════════════════════════════════════════════════════
 * Unified notification feed: social + poker/page notifications,
 * actor profiles pre-joined, read status resolved server-side.
 *
 * Replaces 2 separate API calls + 2 client-side Supabase queries
 * with a single round-trip. Returns in <500ms on warm instances.
 *
 * Response:
 *   { success: true, notifications: [...], totalUnread: number }
 * ═══════════════════════════════════════════════════════════════
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { reportApiError } from '../../../src/lib/sentryWrap';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const supabase = getSupabase();
        const { user: serverUser } = await getServerUserWithFallback(req, supabase);
        if (!serverUser) {
            return res.status(401).json({ success: false, error: 'Auth required' });
        }
        const userId = serverUser.id;

        const limit = Math.min(parseInt(req.query.limit || '50', 10), 100);

        // ── Phase 1: Fetch social notifications + page_followers in parallel ──
        const [socialResult, followsResult] = await Promise.all([
            supabase
                .from('notifications')
                .select('*')
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .limit(limit),
            supabase
                .from('page_followers')
                .select('page_type, page_id')
                .eq('user_id', userId)
                .limit(100),
        ]);

        const socialNotifs = (socialResult.data || []).map(n => ({ ...n, _source: 'social' }));

        // ── Phase 2: Fetch poker notifs (only if user follows pages) ──
        let pokerNotifs = [];
        if (followsResult.data && followsResult.data.length > 0) {
            const orConditions = followsResult.data
                .map(f => `and(page_type.eq.${f.page_type},page_id.eq.${f.page_id})`)
                .join(',');

            const [pageNotifResult, readResult] = await Promise.all([
                supabase
                    .from('page_notifications')
                    .select('*')
                    .or(orConditions)
                    .order('created_at', { ascending: false })
                    .limit(30),
                // We'll get reads after we have the IDs — skip for now, batch below
                Promise.resolve({ data: [] }),
            ]);

            const pageNotifRows = pageNotifResult.data || [];

            if (pageNotifRows.length > 0) {
                const allIds = pageNotifRows.map(n => n.id);
                const { data: reads } = await supabase
                    .from('notification_reads')
                    .select('notification_id')
                    .eq('user_id', userId)
                    .in('notification_id', allIds)
                    .limit(100);

                const readSet = new Set((reads || []).map(r => r.notification_id));
                pokerNotifs = pageNotifRows.map(pn => ({
                    id: 'poker-' + pn.id,
                    user_id: userId,
                    title: pn.title || 'Page Update',
                    message: pn.message || pn.content || '',
                    type: pn.notification_type || 'page_update',
                    read: readSet.has(pn.id),
                    created_at: pn.created_at,
                    data: { page_type: pn.page_type, page_id: pn.page_id },
                    _source: 'poker',
                    actor_name: pn.title || 'Page Update',
                    actor_avatar_url: null,
                    actor_username: null,
                }));
            }
        }

        // ── Phase 3: Merge + sort ──
        const combined = [...socialNotifs, ...pokerNotifs]
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            .slice(0, 60);

        // ── Phase 4: Enrich social notifications with actor profiles (server-side) ──
        const actorIds = [...new Set(
            socialNotifs.map(n => n.data?.actor_id || n.data?.sender_id).filter(Boolean)
        )];
        const actorNames = [...new Set(
            socialNotifs
                .filter(n => !n.data?.actor_id && !n.data?.sender_id)
                .map(n => {
                    const match = n.title?.match(/^([A-Za-z]+\s+[A-Za-z]+)/);
                    return match ? match[1] : null;
                })
                .filter(Boolean)
        )];

        let profileById = {};
        let profileByName = {};

        if (actorIds.length > 0 || actorNames.length > 0) {
            const [byIdResult, byNameResult] = await Promise.all([
                actorIds.length > 0
                    ? supabase.from('profiles')
                        .select('id, username, full_name, avatar_url')
                        .in('id', actorIds)
                        .limit(50)
                    : Promise.resolve({ data: [] }),
                actorNames.length > 0
                    ? supabase.from('profiles')
                        .select('id, username, full_name, avatar_url')
                        .in('full_name', actorNames)
                        .limit(50)
                    : Promise.resolve({ data: [] }),
            ]);

            (byIdResult.data || []).forEach(p => { profileById[p.id] = p; });
            (byNameResult.data || []).forEach(p => {
                if (p.full_name) profileByName[p.full_name.toLowerCase()] = p;
            });
        }

        // ── Phase 5: Apply actor profile enrichment to combined list ──
        const enriched = combined.map(n => {
            if (n._source === 'poker') return n; // poker notifs don't have actor profiles

            const actorId = n.data?.actor_id || n.data?.sender_id;
            const profile = actorId
                ? profileById[actorId]
                : (() => {
                    const match = n.title?.match(/^([A-Za-z]+\s+[A-Za-z]+)/);
                    return match ? profileByName[match[1].toLowerCase()] : null;
                })();

            const displayName = n.data?.actor_name || n.data?.sender_name
                || n.title?.match(/^([A-Za-z]+\s+[A-Za-z]+)/)?.[1]
                || n.title;

            return {
                ...n,
                actor_avatar_url: profile?.avatar_url || null,
                actor_name: displayName,
                actor_username: profile?.username || null,
            };
        });

        const totalUnread = enriched.filter(n => !n.read).length;

        // Short private cache: browser reuses within 15s, stale for 60s
        // User-specific — never shared via CDN
        res.setHeader('Cache-Control', 'private, max-age=15, stale-while-revalidate=60');

        return res.status(200).json({
            success: true,
            notifications: enriched,
            totalUnread,
        });

    } catch (err) {
        try { reportApiError(err, req); } catch (_) {}
        console.warn('[/api/notifications/feed] Error:', err);
        if (!res.headersSent) {
            return res.status(500).json({ success: false, error: 'Internal server error' });
        }
    }
}

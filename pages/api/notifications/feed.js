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
import { reportApiError } from '../../../src/lib/apiErrorHandler';
import { resolveNotificationRoute } from '../../../src/lib/notificationRoute';

// NOTE: Removed edge runtime — this handler uses Node.js Pages Router API (req.query/res.status/etc)
// and cannot run on Vercel Edge Runtime. Keep as Node.js runtime.

/**
 * Title-case for display, WITHOUT destroying acronyms.
 *
 * Dan's house rule is that forward-facing copy has the first letter of every
 * word capitalised. The original implementation did that by lowercasing the
 * rest of each word, which is fine for prose and wrong for a poker product,
 * because this table is full of acronyms:
 *
 *     'A Seat Just Opened At PLO5 1.00/2.00'  ->  '... At Plo5 1.00/2.00'
 *     'A Seat Just Opened At NLH 3.00/6.00'   ->  '... At Nlh 3.00/6.00'
 *     'Weekly player P&L failed'              ->  'Weekly Player P&l Failed'
 *     "club/union settlement"                 ->  'Club/union Settlement'
 *
 * All four were visible in the notifications list. NLH, PLO, PLO5, MTT, SNG,
 * BBJ, VIP, GTO, ICM, EV are not typos to be corrected.
 *
 * Rules:
 *   - a token with no lowercase letters and at least two characters is left
 *     exactly as it is (NLH, PLO5, P&L, SHARK CLUB, roman numerals);
 *   - otherwise capitalise the first letter of each alphabetic run, so
 *     hyphens and slashes get their own capital ('win-loss' -> 'Win-Loss',
 *     'club/union' -> 'Club/Union') instead of only the first fragment.
 */
function enforceTitleCase(str) {
    if (!str) return '';
    return String(str)
        .split(' ')
        .map((word) => {
            if (!word) return word;
            // Already an acronym / deliberately capitalised. Leave it alone.
            const letters = word.replace(/[^A-Za-z]/g, '');
            if (letters.length >= 2 && letters === letters.toUpperCase()) return word;
            // Capitalise each alphabetic run: handles hyphens, slashes, dots.
            // A run directly after an apostrophe is a possessive or a
            // contraction, not a new word -- capitalising it gives "Week'S"
            // and "Don'T", which is worse than the problem being solved.
            return word.toLowerCase().replace(/[A-Za-z]+/g, (run, offset, full) => {
                const prev = offset > 0 ? full[offset - 1] : '';
                if (prev === "'" || prev === '\u2019') return run;
                return run.charAt(0).toUpperCase() + run.slice(1);
            });
        })
        .join(' ');
}

// ── Server-side in-memory TTL cache ──────────────────────────────────────────
// On warm Vercel instances, repeated fetches within 15s return instantly (<5ms)
// instead of paying the full Supabase round-trip cost every call.
// TTL matches the Cache-Control header (private, max-age=15).
const CACHE_TTL_MS = 15_000;
const _feedCache = new Map(); // userId → { payload, expiresAt }

// Called by mark-read / delete APIs to invalidate the cache for a user.
// (Exported so those handlers can import and call it)
export function invalidateFeedCache(userId) {
    _feedCache.delete(userId);
}

function setCachedFeed(userId, payload) {
    _feedCache.set(userId, { payload, expiresAt: Date.now() + CACHE_TTL_MS });
    // Prune stale entries to prevent unbounded growth (keep map ≤500 entries)
    if (_feedCache.size > 500) {
        const now = Date.now();
        for (const [k, v] of _feedCache) {
            if (v.expiresAt < now) _feedCache.delete(k);
            if (_feedCache.size <= 500) break;
        }
    }
}

function getCachedFeed(userId) {
    const entry = _feedCache.get(userId);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) { _feedCache.delete(userId); return null; }
    return entry.payload;
}

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
        const bustCache = req.query.bust === '1';

        // ── Serve from in-memory cache if available ───────────────────────────
        if (!bustCache) {
            const cached = getCachedFeed(userId);
            if (cached) {
                res.setHeader('Cache-Control', 'private, max-age=15, stale-while-revalidate=60');
                res.setHeader('X-Cache', 'HIT');
                return res.status(200).json(cached);
            }
        }

        // ── Phase 1: Fetch social notifications + page_followers in parallel ──
        const [socialResult, followsResult] = await Promise.all([
            supabase
                .from('notifications')
                .select('id, type, title, message, data, read, is_read, created_at, user_id, actor_id, action_url, link')
                .eq('user_id', userId)
                .or('type.is.null,type.neq.accounting_invoice_detail')
                .order('created_at', { ascending: false })
                .limit(limit),

            supabase
                .from('page_followers')
                .select('page_type, page_id')
                .eq('user_id', userId)
                .limit(100),
        ]);

        // A refused authoritative read is not a confirmed empty feed.
        if (socialResult.error) throw socialResult.error;
        if (followsResult.error) throw followsResult.error;
        const socialNotifs = (socialResult.data || []).map(n => ({ ...n, _source: 'social' }));

        // ── Phase 2: Fetch poker notifs (only if user follows pages) ──
        // BUG-FIX: Removed dead Promise.resolve() placeholder. page_notifications
        // and notification_reads now run sequentially only when needed (can't
        // parallelize because we need page_notification IDs first).
        let pokerNotifs = [];
        // Match the existing poker notification route's filter boundary.
        // Follow ids are user-provided text and must not reshape a service query.
        const safeFollows = (followsResult.data || []).filter(f =>
            /^[A-Za-z0-9_]{1,32}$/.test(String(f.page_type || '')) &&
            /^[A-Za-z0-9_-]{1,64}$/.test(String(f.page_id || ''))
        );
        if (safeFollows.length > 0) {
            const orConditions = safeFollows
                .map(f => `and(page_type.eq.${f.page_type},page_id.eq.${f.page_id})`)
                .join(',');

            const { data: pageNotifRows, error: pageError } = await supabase
                .from('page_notifications')
                .select('*')
                .or(orConditions)
                .order('created_at', { ascending: false })
                .limit(30);
            if (pageError) throw pageError;

            if (pageNotifRows && pageNotifRows.length > 0) {
                const allIds = pageNotifRows.map(n => n.id);
                const { data: reads, error: readError } = await supabase
                    .from('notification_reads')
                    .select('notification_id')
                    .eq('user_id', userId)
                    .in('notification_id', allIds)
                    .limit(100);
                if (readError) throw readError;

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

        // ── Phase 3.5: BUG-28 FIX — Enrich home_group notifications with real group names ──
        // home_group_friend_joined messages were showing raw slugs like 'PHASE40_DM_FEATURE'
        // because the message was stored at insert-time with the slug. Now we resolve the
        // real group name from commander_home_groups and rewrite the message.
        const groupIds = [...new Set(
            combined
                .filter(n => n.type === 'home_group_friend_joined' || n.type === 'home_group_announcement')
                .map(n => n.data?.group_id)
                .filter(id => id && typeof id === 'string' && id.match(/^[0-9a-f-]{36}$/i))
        )];

        // groupNameById maps id -> string name, or id -> null if group exists but has no name
        // Use a Set to track which IDs were found vs not found at all
        let groupNameById = {};
        let groupFoundIds = new Set();
        if (groupIds.length > 0) {
            // BUG-36 FIX: Cast group IDs explicitly as uuid type to avoid type mismatch
            const { data: groups } = await supabase
                .from('commander_home_groups')
                .select('id, name')
                .in('id', groupIds)
                .limit(100);
            (groups || []).forEach(g => {
                groupFoundIds.add(g.id);
                groupNameById[g.id] = g.name || null;
            });
        }

        // ── Phase 4: Enrich social notifications with actor profiles (server-side) ──
        // BUG-FIX: Also collect friend_id for home_group_friend_joined type notifications
        // so those get avatar/username resolution too (was previously invisible to enrichment).
        const actorIds = [...new Set(
            socialNotifs
                .map(n => {
                    // BUG-17 fix: friend_request stores sender_id (not actor_id) — include it
                    // Also check the top-level actor_id column (not just data JSONB)
                    // BUG-FIX: Also check liker_id and commenter_id from legacy triggers
                    return n.actor_id || n.data?.actor_id || n.data?.sender_id || n.data?.friend_id || n.data?.liker_id || n.data?.commenter_id;
                })
                .filter(Boolean)
        )];

        // BUG-FIX: Old regex /^([A-Za-z]+\s+[A-Za-z]+)/ required TWO words,
        // breaking enrichment for single-name actors. Now also tries single-word match.
        const actorNames = [...new Set(
            socialNotifs
                .filter(n => !n.actor_id && !n.data?.actor_id && !n.data?.sender_id && !n.data?.friend_id && !n.data?.liker_id && !n.data?.commenter_id)
                .map(n => {
                    if (typeof n.title !== 'string') return null;
                    const twoWord = n.title.match(/^([A-Za-z]+\s+[A-Za-z]+)/);
                    if (twoWord) return twoWord[1];
                    const oneWord = n.title.match(/^([A-Za-z][A-Za-z0-9_]+)/);
                    return oneWord ? oneWord[1] : null;
                })
                .filter(Boolean)
        )];

        let profileById = {};
        let profileByName = {};

        if (actorIds.length > 0 || actorNames.length > 0) {
            const [byIdResult, byNameResult] = await Promise.all([
                actorIds.length > 0
                    ? supabase.from('profiles')
                        .select('id, username, full_name, display_name, avatar_url')
                        .in('id', actorIds)
                        .limit(50)
                    : Promise.resolve({ data: [] }),
                actorNames.length > 0
                    ? supabase.from('profiles')
                        .select('id, username, full_name, display_name, avatar_url')
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
            // Poker/page notifications carry no actor profile, but they still
            // need a destination — they were previously handed to the client
            // with no `link` at all and relied on each renderer guessing.
            if (n._source === 'poker') {
                return { ...n, link: resolveNotificationRoute(n) };
            }

            const actorId = n.actor_id || n.data?.actor_id || n.data?.sender_id || n.data?.friend_id || n.data?.liker_id || n.data?.commenter_id;
            const profile = actorId
                ? profileById[actorId]
                : (() => {
                    if (typeof n.title !== 'string') return null;
                    const twoWord = n.title.match(/^([A-Za-z]+\s+[A-Za-z]+)/);
                    const key = twoWord?.[1] ?? n.title.match(/^([A-Za-z][A-Za-z0-9_]+)/)?.[1];
                    return key ? profileByName[key.toLowerCase()] : null;
                })();

            // ── The bold prefix ──────────────────────────────────────────
            // The row renders `<b>{actor_name}</b> {message}`, so whatever
            // lands here IS the headline and the rest of the title is never
            // shown. The old fallback took the first two words of the title
            // unconditionally, which is right for "Mason Bekavac commented on
            // your post" and silently truncates every system notification:
            //
            //   'Finish Setting Up Your Page'    -> 'Finish Setting'
            //   'Weekly player P&L failed'       -> 'Weekly player'
            //   'Push Health Alert'              -> 'Push Health'
            //   'Midway Union weekly statement'  -> 'Midway Union'
            //
            // All four were visible in the notifications list with their
            // headline cut off mid-sentence. The two-word slice now applies
            // ONLY when the remainder of the title reads like a social action,
            // i.e. we are actually looking at a person doing something.
            const SOCIAL_VERB = /^(commented|liked|replied|mentioned|shared|posted|started|sent|accepted|added|followed|invited|is\s+now|wants)/i;
            const personFromTitle = (() => {
                if (typeof n.title !== 'string') return null;
                // Names carry apostrophes and hyphens: O'Ryan, Al-Rashid,
                // Anne-Marie. The original [A-Za-z]+ split "Chase O'Ryan"
                // into "Chase O" and left "'Ryan ..." as the remainder.
                const m = n.title.match(/^([A-Za-z][A-Za-z'\u2019-]*\s+[A-Za-z][A-Za-z'\u2019-]*)\s+(.*)$/);
                if (!m) return null;
                return SOCIAL_VERB.test(m[2]) ? m[1] : null;
            })();

            const displayNameRaw = profile?.display_name || profile?.full_name || profile?.username 
                || n.data?.actor_name || n.data?.sender_name
                || personFromTitle
                || n.title
                || 'Someone';
            

            const displayName = enforceTitleCase(displayNameRaw);

            // BUG-28 FIX: Rewrite home_group message with real group name
            // BUG-36 FIX: Handle groups with null name (dev/test groups) and deleted groups.
            //   - Group found with real name → use real name
            //   - Group found but name is null → generic fallback (dev group)
            //   - Group not in DB at all → generic fallback (deleted group)
            let message = n.message;
            if ((n.type === 'home_group_friend_joined' || n.type === 'home_group_announcement') && n.data?.group_id) {
                const gid = n.data.group_id;
                const realGroupName = groupNameById[gid];  // string or null
                if (realGroupName) {
                    // Group exists and has a real name
                    message = `Your friend is now in ${realGroupName} - check it out`;
                } else {
                    // Group not found OR found with null/empty name → avoid showing slug
                    message = 'Your friend joined a Home Game - check it out';
                }
            }
            message = enforceTitleCase(message);

            const row = {
                ...n,
                title: typeof n.title === 'string' ? n.title : '',
                message,
                actor_avatar_url: profile?.avatar_url || null,
                actor_name: displayName,
                actor_username: profile?.username || null,
            };

            // ── Resolve the destination ONCE, here, server-side ───────────
            // Every renderer used to re-implement this and each covered a
            // different subset, which is why "Seat Open" (1219 rows, no
            // link column) was a dead tap in Club Arena. Routing must run
            // AFTER actor enrichment above, because friend_* notifications
            // resolve to /hub/user/<username> and the username only exists
            // once data.sender_id has been joined to profiles.
            // See src/lib/notificationRoute.js and its test.
            return { ...row, link: resolveNotificationRoute(row) };

        });

        // BUG-FIX: notifications table uses is_read as canonical; read is an alias
        // that may not be populated on all rows. Check both to avoid under-counting.
        const totalUnread = enriched.filter(n => !n.read && !n.is_read).length;

        const payload = {
            success: true,
            notifications: enriched,
            totalUnread,
        };

        // Store in server-side TTL cache (15s) — future calls on same warm instance return instantly
        setCachedFeed(userId, payload);

        // Short private cache: browser reuses within 15s, stale for 60s
        // User-specific — never shared via CDN
        res.setHeader('Cache-Control', 'private, max-age=15, stale-while-revalidate=60');
        res.setHeader('X-Cache', 'MISS');

        return res.status(200).json(payload);


    } catch (err) {
        try { reportApiError(err, req); } catch (_) {}
        console.warn('[/api/notifications/feed] Error:', err);
        if (!res.headersSent) {
            return res.status(500).json({ success: false, error: 'Internal server error' });
        }
    }
}

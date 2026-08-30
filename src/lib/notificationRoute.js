/**
 * Canonical notification route resolver.
 * ═══════════════════════════════════════════════════════════════════════
 * ONE place that answers: "when a user taps this notification, where do
 * they go?"
 *
 * WHY THIS EXISTS (2026-08-25, Dan)
 * ---------------------------------
 * Before this file there were five notification renderers across two
 * repos, each with its own routing switch, each checking a different
 * subset of the three places a destination can be stored (`link`,
 * `action_url`, or a key inside the `data` / `metadata` JSON). The result
 * was measurable: at the time of writing, production held
 *
 *     waitlist_seat_open  1219 rows   0 with a link
 *     friend_accept       3188 rows   0 with a link
 *     friend_request      1193 rows   0 with a link
 *     union_invoice          4 rows   0 with a link
 *     like / comment        18 rows   0 with a link
 *
 * Every one of those was a dead tap. This module is the single source of
 * truth; `/api/notifications/feed` runs it server-side and hands every
 * client a resolved `link`, so no renderer ever has to route again.
 *
 * RULES
 * -----
 * - Return an app-relative path ('/hub/...') or null. Never a bare word.
 * - Never invent a route. Every path below is confirmed to exist; see
 *   `docs/notification-routes.md` for the proof table.
 * - Adding a producer? Add its type here IN THE SAME COMMIT, and add a
 *   case to __tests__/notificationRoute.test.js.
 */

/** Club Arena is a Vite SPA mounted under this prefix inside the Next app. */
const CA = '/hub/club-arena';

/**
 * Producers disagree about casing and about which JSON column they use.
 * `friend_request` writes data.sender_id; `bonus` writes metadata.clubId;
 * `page_completion_nudge` writes metadata.page_id. Rather than police that
 * from the read side, flatten both columns and accept either spelling.
 */
function payload(n) {
    const data = n && typeof n.data === 'object' && n.data ? n.data : {};
    const meta = n && typeof n.metadata === 'object' && n.metadata ? n.metadata : {};
    // data wins on collision: it is the column the live triggers write.
    return { ...meta, ...data };
}

/** First non-empty value among several possible key spellings. */
function pick(bag, ...keys) {
    for (const k of keys) {
        const v = bag[k];
        if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
    }
    return null;
}

/**
 * Percent-encode one path segment.
 *
 * 232 of 906 usernames in production (26%) contain characters that are not
 * legal unencoded in a URL path: spaces ('solver steve'), apostrophes
 * ("chase o'ryan"), '@' ('@todd') and non-ASCII ('jorg' with an umlaut).
 * The old code interpolated the username raw, so a quarter of all profile
 * deep links were malformed. Mirrored by public.fn_url_encode_segment in
 * the database, which the push-outbox trigger relies on.
 */
function seg(v) {
    return encodeURIComponent(String(v));
}

/** Trim, and reject anything that is not a usable relative or absolute URL. */
function clean(url) {
    if (!url) return null;
    const s = String(url).trim();
    if (!s) return null;
    if (s.startsWith('/') || s.startsWith('http://') || s.startsWith('https://')) return s;
    return null;
}

/**
 * Resolve a notification row to a destination path.
 *
 * @param {object} n - notification row. May carry `actor_username` if the
 *                     caller has already run profile enrichment (the feed
 *                     API has; raw DB readers have not).
 * @returns {string|null} app-relative path, or null when genuinely nowhere
 *                        to go (in which case the row renders unclickable
 *                        rather than pretending and failing).
 */
export function resolveNotificationRoute(n) {
    if (!n) return null;

    // ── 1. Explicit destination already stored on the row ──────────────
    // Backend triggers set these for home_game/home_group/live/system.
    // They are authoritative: never second-guess a producer that told us.
    const explicit = clean(n.link) || clean(n.action_url);
    if (explicit) return explicit;

    const t = String(n.type || '').trim();
    const d = payload(n);

    // ── 2. Club Arena poker types ─────────────────────────────────────
    // The seat-open alert is the single largest dead-click population in
    // the table. data.table_id -> the live table surface.
    if (t === 'waitlist_seat_open' || t === 'seat_available' || t === 'waitlist_ready' || t === 'table_ready') {
        const tableId = pick(d, 'table_id', 'tableId');
        if (tableId) return `${CA}/table/${tableId}`;
        return `${CA}/waitlist`;
    }

    /* An offer that LAPSED goes to the waitlist, never to the table (Dan
       2026-08-30). The seat is gone — that is what this notification says —
       so sending the tap to `/table/<id>` lands the player on a full table
       with nothing to do, which reads as the app being broken rather than as
       "you missed it". The waitlist page is where they can rejoin the queue,
       which is the only action left. The table id is deliberately not used
       even though it is in the payload. */
    if (t === 'waitlist_offer_expired') {
        return `${CA}/waitlist`;
    }

    if (t === 'table_invite' || t === 'your_turn' || t === 'your_turn_reminder' || t === 'time_bank_active' || t === 'hand_won') {
        const tableId = pick(d, 'table_id', 'tableId');
        if (tableId) return `${CA}/table/${tableId}`;
        return null;
    }

    if (t === 'tournament_starting' || t === 'tournament_start' || t === 'tournament_registered') {
        const tid = pick(d, 'tournament_id', 'tournamentId');
        if (tid) return `${CA}/tournaments/${tid}`;
        return `${CA}/tournaments`;
    }

    // ── 3. Union money ────────────────────────────────────────────────
    // union_invoice is the weekly statement ("SHARK CLUB owes Midway Union
    // 220,615.68"). Statements page lists invoices; settlement page is
    // where the chips actually move, so a FAILED settlement goes there.
    if (t === 'union_invoice') {
        const unionId = pick(d, 'union_id', 'unionId');
        if (unionId) return `${CA}/unions/${unionId}/statements`;
        return `${CA}/unions`;
    }

    if (t === 'settlement' || t === 'settlement_failed') {
        const unionId = pick(d, 'union_id', 'unionId');
        if (unionId) return `${CA}/unions/${unionId}/settlement`;
        const clubId = pick(d, 'club_id', 'clubId');
        if (clubId) return `${CA}/clubs/${clubId}/settlement`;
        return `${CA}/settlement-dashboard`;
    }

    if (t === 'cashout_request' || t === 'cashout_approved' || t === 'cashout_denied') {
        const clubId = pick(d, 'club_id', 'clubId');
        if (clubId) return `${CA}/clubs/${clubId}/financials`;
        return `${CA}/wallet`;
    }

    // ── 4. Club Arena club-scoped ─────────────────────────────────────
    if (t === 'club_announcement' || t === 'club_invite') {
        const clubId = pick(d, 'club_id', 'clubId', 'club_slug', 'clubSlug');
        if (clubId) return `${CA}/clubs/${clubId}`;
        return null;
    }

    if (t === 'bonus' || t === 'promotion' || t === 'rakeback') {
        const clubId = pick(d, 'club_id', 'clubId');
        if (clubId) return `${CA}/clubs/${clubId}/promotions`;
        return `${CA}/bonuses`;
    }

    if (t === 'achievement' || t === 'achievement_unlocked') {
        return `${CA}/achievements`;
    }

    // ── 5. Social: posts ──────────────────────────────────────────────
    // Previously `like` and `comment` dropped the post id and dumped the
    // user on the feed root. /hub/social-media?post=<id> is read by
    // pages/hub/social-media/index.js and opens the post directly.
    if (t === 'like' || t === 'comment' || t === 'mention' || t === 'post_like' || t === 'post_comment' || t === 'reply' || t === 'tag') {
        const postId = pick(d, 'post_id', 'postId');
        if (postId) {
            const isReel = d.is_reel === true || d.post_type === 'reel';
            return isReel ? `/hub/reels?id=${postId}` : `/hub/social-media?post=${postId}`;
        }
        return '/hub/social-media';
    }

    // ── 6. Social: people ─────────────────────────────────────────────
    // The feed API resolves data.sender_id -> profiles.username before
    // calling us, so actor_username is normally present here.
    if (t === 'friend_request' || t === 'friend_accept' || t === 'friend_accepted'
        || t === 'new_follow' || t === 'follow' || t === 'follow_request') {
        if (n.actor_username) return `/hub/user/${seg(n.actor_username)}`;
        // A pending request is actionable on the friends screen; a settled
        // one is not, but /hub/friends is still the honest destination.
        return '/hub/friends';
    }

    // ── 7. Messaging ──────────────────────────────────────────────────
    if (t === 'message' || t === 'direct_message' || t === 'new_message') {
        const convo = pick(d, 'conversation_id', 'conversationId', 'thread_id');
        if (convo) return `/hub/messenger?conversation=${convo}`;
        return '/hub/messenger';
    }

    // ── 8. Generic payload shapes, for types we do not know by name ────
    const pageType = pick(d, 'page_type', 'pageType');
    const pageId = pick(d, 'page_id', 'pageId');
    if (pageType && pageId) {
        if (pageType === 'venue') return `/hub/venues/${pageId}`;
        if (pageType === 'tour') return `/hub/tours/${pageId}`;
        if (pageType === 'series') return `/hub/series/${pageId}`;
        return `/club/${pageId}`;
    }

    const clubId = pick(d, 'club_id', 'clubId');
    if (clubId) return `/club/${clubId}`;
    if (pageId) return `/hub/social-pages/${pageId}`;

    const postId = pick(d, 'post_id', 'postId');
    if (postId) {
        const isReel = d.is_reel === true || d.post_type === 'reel';
        return isReel ? `/hub/reels?id=${postId}` : `/hub/social-media?post=${postId}`;
    }

    const tournamentId = pick(d, 'tournament_id', 'tournamentId');
    if (tournamentId) return `${CA}/tournaments/${tournamentId}`;

    const tableId = pick(d, 'table_id', 'tableId');
    if (tableId) return `${CA}/table/${tableId}`;

    if (n.actor_username) return `/hub/user/${seg(n.actor_username)}`;
    if (t.includes('friend') || t.includes('follow')) return '/hub/friends';

    // ── 9. Nowhere to go. Say so, so the row renders unclickable. ──────
    return null;
}

export default resolveNotificationRoute;

/**
 * push-prefs.js -- SINGLE SOURCE OF TRUTH for push notification types.
 *
 * Shared module: safe to import from both server (API routes) and client
 * (settings UI). Contains no Node built-ins and no secrets.
 *
 * DEFAULT-ON, OPT-OUT MODEL (design rule 3 from the PepNationLab handoff):
 *   - A missing notification_preferences row means push IS allowed.
 *   - A missing key in push_type_prefs means that type IS allowed.
 *   - ONLY an explicit `false` suppresses.
 * This is what makes notifications work out of the box for the 990 existing
 * profiles that have never opened the settings page.
 */

// Display groups, in the order the settings page renders them.
export const PUSH_GROUPS = [
    'Messages and Calls',
    'Social',
    'Live and Streams',
    'Home Games',
    'Poker and Clubs',
    'Rewards and Account',
];

/**
 * Every push type smarter.poker can emit.
 * `key`   -- stable identifier, also the notifications.type value
 * `group` -- one of PUSH_GROUPS
 * `label` -- settings row title
 * `desc`  -- settings row subtitle
 */
export const PUSH_TYPES = [
    // -- Messages and Calls ---------------------------------------------------
    { key: 'new_message', group: 'Messages and Calls', label: 'New Messages', desc: 'Someone sends you a direct message' },
    { key: 'incoming_call', group: 'Messages and Calls', label: 'Incoming Calls', desc: 'Someone is calling you right now' },
    { key: 'missed_call', group: 'Messages and Calls', label: 'Missed Calls', desc: 'You missed a call' },

    // -- Social ---------------------------------------------------------------
    { key: 'friend_request', group: 'Social', label: 'Friend Requests', desc: 'Someone wants to connect with you' },
    { key: 'friend_accept', group: 'Social', label: 'Friend Accepted', desc: 'Someone accepted your friend request' },
    { key: 'new_follow', group: 'Social', label: 'New Followers', desc: 'Someone started following you' },
    { key: 'like', group: 'Social', label: 'Post Likes', desc: 'Someone liked your post or reel' },
    { key: 'comment', group: 'Social', label: 'Comments', desc: 'Someone commented on your post' },
    { key: 'mention', group: 'Social', label: 'Mentions', desc: 'Someone mentioned you' },

    // -- Live and Streams -----------------------------------------------------
    { key: 'live', group: 'Live and Streams', label: 'Going Live', desc: 'A player you follow starts streaming' },
    { key: 'live_invite', group: 'Live and Streams', label: 'Stream Invites', desc: 'You are invited to co-host a stream' },
    { key: 'live_gift', group: 'Live and Streams', label: 'Gifts Received', desc: 'Someone sent you a gift on stream' },

    // -- Home Games -----------------------------------------------------------
    { key: 'home_game_new', group: 'Home Games', label: 'New Home Games', desc: 'A group you follow schedules a game' },
    { key: 'home_game_rsvp', group: 'Home Games', label: 'Game RSVPs', desc: 'Someone RSVPs to a game you host' },
    { key: 'home_game_reminder', group: 'Home Games', label: 'Game Reminders', desc: 'A game you joined starts soon' },
    { key: 'home_game_cancelled', group: 'Home Games', label: 'Game Cancelled', desc: 'A game you joined was called off' },
    { key: 'home_group_announcement', group: 'Home Games', label: 'Group Announcements', desc: 'A host posts to your group' },
    { key: 'home_group_friend_joined', group: 'Home Games', label: 'Friends Joining', desc: 'A friend joins a group you are in' },
    { key: 'home_group_request', group: 'Home Games', label: 'Membership Requests', desc: 'Join requests and approvals' },

    // -- Poker and Clubs ------------------------------------------------------
    { key: 'club_announcement', group: 'Poker and Clubs', label: 'Club Announcements', desc: 'Your club posts news' },
    { key: 'table_invite', group: 'Poker and Clubs', label: 'Table Invites', desc: 'You are invited to a table' },
    { key: 'seat_open', group: 'Poker and Clubs', label: 'Seat Available', desc: 'A seat opens on a waitlist you joined' },
    { key: 'tournament_starting', group: 'Poker and Clubs', label: 'Tournament Starting', desc: 'A tournament you registered for begins' },
    { key: 'late_reg_closing', group: 'Poker and Clubs', label: 'Late Reg Closing', desc: 'Last call to register' },
    { key: 'venue_alert', group: 'Poker and Clubs', label: 'Venue Alerts', desc: 'Games running near you' },

    // -- Rewards and Account --------------------------------------------------
    { key: 'diamond_received', group: 'Rewards and Account', label: 'Diamonds Received', desc: 'Someone sent you diamonds' },
    { key: 'bonus', group: 'Rewards and Account', label: 'Bonuses', desc: 'A bonus lands in your account' },
    { key: 'achievement', group: 'Rewards and Account', label: 'Achievements', desc: 'You unlock a badge or milestone' },
    { key: 'daily_challenge', group: 'Rewards and Account', label: 'Daily Challenges', desc: 'A fresh set of daily challenges drops' },
    { key: 'vip', group: 'Rewards and Account', label: 'VIP Status', desc: 'VIP renewals, stipends and expiry warnings' },
    { key: 'venue_claim', group: 'Rewards and Account', label: 'Venue Claims', desc: 'Updates on a venue you claimed' },
    { key: 'system', group: 'Rewards and Account', label: 'System and Security', desc: 'Account, security and platform notices' },

    // Added 2026-08-30 with the #1498 triggers. Cash-outs, credit decisions and
    // settlement disputes had NO server-side notification at all until that
    // migration — the client called a transport retired on 2026-08-19 — so this
    // key has no legacy users and no migration to do.
    //
    // It is its own toggle rather than being folded into `system` because the
    // two are not the same promise: `system` is security and platform notices,
    // and somebody who mutes those should not thereby stop being told that
    // their money moved.
    { key: 'cashier', group: 'Rewards and Account', label: 'Cashier and Credit', desc: 'Cash-outs, credit decisions and settlement disputes' },
];

export const PUSH_TYPE_KEYS = new Set(PUSH_TYPES.map((t) => t.key));

/**
 * Map a raw event / notification type string onto a canonical PushTypeKey.
 * Unknown events return null, which means UNGATED -- they always fire. That is
 * deliberate: a new feature that forgets to register its type still reaches the
 * user rather than silently going dark.
 */
const EVENT_ALIASES = {
    // messaging
    message: 'new_message',
    dm: 'new_message',
    messenger_message: 'new_message',
    call_incoming: 'incoming_call',
    call_missed: 'missed_call',
    // social
    friend_accepted: 'friend_accept',
    follow: 'new_follow',
    home_post_like: 'like',
    home_post_comment: 'comment',
    reel_like: 'like',
    reel_comment: 'comment',
    // live
    live_started: 'live',
    going_live: 'live',
    // home games
    home_game_rsvp_confirmed: 'home_game_rsvp',
    home_game_new_follower: 'home_group_friend_joined',
    home_game_host_broadcast: 'home_group_announcement',
    home_group_announcement_followed: 'home_group_announcement',
    home_group_approved: 'home_group_request',
    home_group_pending_request: 'home_group_request',
    home_group_banned: 'home_group_request',
    home_group_hidden: 'home_group_request',
    home_group_stale_warning: 'home_group_request',
    home_badges_earned: 'achievement',
    // rewards
    venue_claim_approved: 'venue_claim',
    vip_lapse: 'vip',
    vip_stipend: 'vip',
    page_completion_nudge: 'system',
    // poker
    late_reg: 'late_reg_closing',
    game_threshold: 'venue_alert',
    geofence_alert: 'venue_alert',

    // THE ONE THAT WAS MISSING (added 2026-08-28).
    //
    // The Club Arena engine writes `type: 'waitlist_seat_open'`
    // (club-arena server/src/services/supabase/seats.ts, notifyWaitlistSeatOpen),
    // and the DB mirror trigger copies that string straight into
    // push_outbox.event. Nothing in this file knew the word. Measured over the
    // fourteen days before this line existed, that was 2,341 of 2,462 outbox
    // rows -- ninety-five per cent of everything this gate has ever been asked
    // to judge, and it could not name any of it.
    //
    // eventToTypeKey returned null, which is "unknown, allow it", so the
    // failure was invisible: seat offers went out and nobody filed a bug. What
    // it actually cost was the two things a null key silently forfeits:
    //
    //   1. URGENCY. `seat_open` is in URGENT_TYPES precisely so a seat about to
    //      be forfeited pierces quiet hours and the daily cap. An unrecognised
    //      event is never urgent, so the one notification class that must
    //      survive a quiet-hours window was the one being dropped by it. Held
    //      seats expire; the player is not told, and the offer is gone.
    //
    //   2. CONSENT. The "Seat Available" toggle writes
    //      push_type_prefs.seat_open. pushTypeAllowed was asked about `null`
    //      and answered "allow", so switching it off did nothing at all.
    //
    // Neither had bitten yet only because no account had set quiet hours, a
    // daily cap, or that toggle -- there was almost nobody subscribed to push
    // to set them. Enrolment shipped on 2026-08-27, so both were about to.
    waitlist_seat_open: 'seat_open',

    /* The lapse notice belongs to the SAME toggle as the offer (2026-08-30).
       Somebody who has turned "Seat Available" off has said they do not want
       to hear about seats, and being told about one they did not get is still
       hearing about seats. Mapping it also stops it falling through
       eventToTypeKey as null, which means "unknown, allow it" — the exact
       failure documented at length above.

       In practice `fn_offer_open_seat` and `fn_sweep_stale_waitlists` both
       write this row with `data->>'_push' = 'skip'`, so the mirror trigger
       returns before an outbox row exists and this gate is never consulted.
       That is a decision about INTERRUPTING, not about consent, and it can be
       revisited — the mapping is here so revisiting it cannot silently ship
       an ungated push. */
    waitlist_offer_expired: 'seat_open',

    // ── CASHIER, CREDIT AND DISPUTES (added 2026-08-30 with #1498) ──────────
    //
    // These are the event strings the new database triggers write into
    // `notifications.type`, which the mirror trigger copies verbatim into
    // `push_outbox.event`:
    //
    //   NEW (club-arena 20260830_notify_money_flows_server_side.sql):
    //     fn_notify_credit_request -> credit_request | credit_approved | credit_denied
    //     fn_notify_dispute        -> settlement_dispute_filed | dispute_resolved
    //
    //   PRE-EXISTING, and unregistered here until today, which is its own
    //   instance of the bug described above — cash-outs have been notifying
    //   correctly server-side all along, ungated:
    //     fn_notify_agent_on_cashout -> cashout_request
    //     fn_cashout_approve         -> cashout_approved
    //     fn_cashout_release         -> cashout_cancelled | cashout_denied
    //     fn_cashout_request         -> cashout_request_escrow
    //     fn_expire_stale_cashouts   -> cashout_expired_refund
    //
    // These are read out of pg_proc, not guessed. An earlier draft of this list
    // carried four event names I had invented for a trigger of my own
    // (cashout_requested / _completed / _rejected / _expired); that trigger was
    // dropped once the catalogue showed the RPCs already owned the flow, and
    // the invented names went with it. A mapping for an event nothing emits is
    // not harmless — it reads as coverage.
    //
    // They are registered HERE, in the same change that starts emitting them,
    // for the reason written at length above `waitlist_seat_open`: an event this
    // file cannot name returns null from eventToTypeKey, and null means
    // "unknown, allow it". That silently forfeits consent — the Cashier and
    // Credit toggle would render in Settings, write `push_type_prefs.cashier`,
    // and do absolutely nothing. That bug has already happened once here, to
    // 95% of all outbox traffic. Not again on the money paths.
    cashout_request: 'cashier',
    cashout_request_escrow: 'cashier',
    cashout_approved: 'cashier',
    cashout_cancelled: 'cashier',
    cashout_denied: 'cashier',
    cashout_expired_refund: 'cashier',
    credit_request: 'cashier',
    credit_approved: 'cashier',
    credit_denied: 'cashier',
    settlement_dispute_filed: 'cashier',
    dispute_resolved: 'cashier',
    // Invoice and rakeback receipts honor the existing financial push toggle.
    accounting_invoice: 'cashier',

    // ── BLINDING OFF (added 2026-08-30 with #1498's last call site) ────────
    //
    // Emitted by trg_notify_blinding_off on table_seats when the engine flags
    // is_sitting_out / is_away on a LIVE TOURNAMENT seat: the player is paying
    // blinds and antes to not be there.
    //
    // Mapped to `tournament_starting` rather than a key of its own, for the
    // one reason that outranks tidiness: `tournament_starting` is in
    // URGENT_TYPES, so this pierces quiet hours and the daily cap. A player
    // bleeding chips at 3am needs telling at 3am — that is the entire value of
    // the notification, and an unmapped event can never be urgent (see the
    // waitlist_seat_open note above, where exactly that was forfeited).
    //
    // The trade is that muting "Tournament Starting" also mutes this. That is
    // the right side of the trade: both say "your tournament needs you now",
    // and the alternative is a new toggle that is quiet by default at the one
    // hour it matters.
    tournament_blinding_off: 'tournament_starting',

    // ── TOURNAMENT RESUMED (added 2026-09-13) ──────────────────────────────
    //
    // Raised by the Club Arena engine when a tournament picks back up after
    // the hourly :55 maintenance break (Club Arena CLAUDE.md section 13). A
    // player who closed the app during the five-minute freeze was never told
    // that play had restarted, and their seat is being dealt cards, posting
    // blinds and paying antes whether or not they are there to see it.
    //
    // Mapped to `tournament_starting` for exactly the reason blinding-off is:
    // that key is in URGENT_TYPES, so this pierces quiet hours and the daily
    // cap. "Your tournament is running again" at 3am is only worth sending if
    // it is allowed to arrive at 3am. The same trade applies - muting
    // "Tournament Starting" mutes this too - and it is the same right answer.
    tournament_resumed: 'tournament_starting',
};

// Test pushes are never gated by per-type preferences -- if a user clicks
// "Send Test" they must receive it, otherwise the button lies about the state
// of their subscription.
const UNGATED_EVENTS = new Set(['admin_test', 'self_test', 'diagnostic']);

/**
 * True for the diagnostic sends behind the "Send Test" button.
 *
 * These must pierce quiet hours and the daily cap as well as the per-type gate.
 * A test that is silently swallowed because it is 11pm tells the user their
 * subscription is broken when it is perfectly healthy -- which is the exact
 * failure this whole stack exists to eliminate.
 */
export function isDiagnosticEvent(event) {
    return Boolean(event) && UNGATED_EVENTS.has(String(event).trim());
}

export function eventToTypeKey(event) {
    if (!event) return null;
    const e = String(event).trim();
    if (UNGATED_EVENTS.has(e)) return null;
    if (PUSH_TYPE_KEYS.has(e)) return e;
    if (EVENT_ALIASES[e]) return EVENT_ALIASES[e];
    return null;
}

/**
 * THE GATE. Returns true unless prefs explicitly stores `false` for this key.
 * @param {Record<string, boolean>|null|undefined} prefs push_type_prefs jsonb
 * @param {string|null} key canonical PushTypeKey
 */
export function pushTypeAllowed(prefs, key) {
    if (!key) return true; // ungated / unknown type
    if (!prefs || typeof prefs !== 'object') return true;
    return prefs[key] !== false;
}

/** Group PUSH_TYPES for rendering. Returns [{ group, types: [...] }]. */

/**
 * LEGACY PREFERENCE BRIDGE.
 *
 * smarter.poker already had a notification settings UI (/hub/settings ->
 * Notifications) writing boolean columns on `user_notification_preferences`,
 * years before push_type_prefs existed. Those switches were invisible to the
 * push gate, so a user who turned "Tournament reminders" off in the UI they can
 * actually reach would still have been pushed. That is a silent broken promise,
 * and it is exactly the class of bug this stack exists to remove.
 *
 * This maps each push type onto the legacy column that governs it. The gate
 * honours BOTH tables and suppresses if EITHER says no.
 */
export const LEGACY_PREF_COLUMN = {
    new_message: 'messenger_alerts',
    incoming_call: 'messenger_alerts',
    missed_call: 'messenger_alerts',

    friend_request: 'friend_activity',
    friend_accept: 'friend_activity',
    new_follow: 'friend_activity',
    mention: 'social_mentions',
    like: 'home_game_post_likes',
    comment: 'home_game_post_comments',

    live: 'live_notifications',
    live_invite: 'live_notifications',
    live_gift: 'live_notifications',

    home_game_new: 'home_game_new_game_posted',
    home_game_rsvp: 'home_game_rsvp_confirmations',
    home_game_reminder: 'home_game_reminders',
    home_game_cancelled: 'home_game_cancellations',
    home_group_announcement: 'home_game_announcements',
    home_group_request: 'home_game_host_requests',

    tournament_starting: 'tournament_reminders',
    late_reg_closing: 'tournament_reminders',
    venue_alert: 'venue_alerts',
    club_announcement: 'club_updates',

    diamond_received: 'diamond_rewards',
    bonus: 'diamond_rewards',
    daily_challenge: 'daily_mission_reminders',
};

/** Every legacy column the gate may need to read. */
export const LEGACY_PREF_COLUMNS = Array.from(new Set(Object.values(LEGACY_PREF_COLUMN)));

/**
 * Legacy gate. Same default-on semantics: only an explicit `false` suppresses.
 */
export function legacyPrefAllowed(legacyRow, key) {
    if (!key || !legacyRow) return true;
    const col = LEGACY_PREF_COLUMN[key];
    if (!col) return true;
    return legacyRow[col] !== false;
}

/**
 * QUIET HOURS.
 *
 * Returns true when `now` falls inside the user's do-not-disturb window.
 * Windows wrap midnight (start 22, end 7 means 22:00 -> 07:00), which is the
 * normal case and the reason this is not a naive `start <= h && h < end`.
 *
 * Evaluated in the USER'S timezone, not the server's. A poker product pushes
 * around the clock; getting this wrong means waking people at 4am.
 */
export function isWithinQuietHours(prefs, now = new Date()) {
    if (!prefs) return false;
    const start = prefs.quiet_hours_start;
    const end = prefs.quiet_hours_end;
    if (start == null || end == null) return false;
    if (start === end) return false; // zero-length window = disabled

    // A WINDOW WITHOUT A TIMEZONE IS NOT A WINDOW (fixed 2026-08-28).
    //
    // This used to fall back to `|| 'UTC'`. That reads like a harmless default
    // and is not one: the comment above this function says the whole point is
    // to evaluate in the USER'S timezone, and UTC is the one timezone we know
    // is not theirs -- it is the absence of an answer. A player in Los Angeles
    // who set 22:00-07:00 without a tz was judged eight hours ahead, so the
    // window landed on 14:00-23:00 their time. They got silence through the
    // afternoon and pushes at 3am: exactly backwards, and exactly the failure
    // this function exists to prevent.
    //
    // Unconfigured now means unenforced. Silencing somebody on a guess is
    // worse than not silencing them, because a missed notification is visible
    // to them and a wrongly-applied quiet hour is not. Every writer of these
    // columns should send a tz -- pages/api/notifications/push-types.js
    // validates one against ICU -- and rows predating that requirement simply
    // do not get a window until one is set.
    if (!prefs.quiet_hours_tz) return false;

    let hour;
    try {
        hour = Number(new Intl.DateTimeFormat('en-US', {
            hour: 'numeric', hour12: false, timeZone: prefs.quiet_hours_tz,
        }).format(now));
        if (Number.isNaN(hour)) return false;
        if (hour === 24) hour = 0; // some ICU builds emit 24 for midnight
    } catch {
        return false; // an invalid timezone must never block a notification
    }

    // Wrapping window (e.g. 22 -> 7) vs simple window (e.g. 1 -> 6).
    return start > end ? (hour >= start || hour < end) : (hour >= start && hour < end);
}

/**
 * Types urgent enough to pierce quiet hours and the daily cap. A ringing call
 * or a seat that is about to be forfeited is time-critical; a post like is not.
 */
export const URGENT_TYPES = new Set(['incoming_call', 'seat_open', 'tournament_starting']);

export function isUrgentType(key) {
    return URGENT_TYPES.has(key);
}

export function groupedPushTypes() {
    return PUSH_GROUPS.map((group) => ({
        group,
        types: PUSH_TYPES.filter((t) => t.group === group),
    })).filter((g) => g.types.length > 0);
}

export default {
    PUSH_GROUPS,
    PUSH_TYPES,
    PUSH_TYPE_KEYS,
    eventToTypeKey,
    pushTypeAllowed,
    groupedPushTypes,
};

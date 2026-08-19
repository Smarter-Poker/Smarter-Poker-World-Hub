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
    { key: 'vip', group: 'Rewards and Account', label: 'VIP Status', desc: 'VIP renewals, stipends and expiry warnings' },
    { key: 'venue_claim', group: 'Rewards and Account', label: 'Venue Claims', desc: 'Updates on a venue you claimed' },
    { key: 'system', group: 'Rewards and Account', label: 'System and Security', desc: 'Account, security and platform notices' },
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
};

// Test pushes are never gated by per-type preferences -- if a user clicks
// "Send Test" they must receive it, otherwise the button lies about the state
// of their subscription.
const UNGATED_EVENTS = new Set(['admin_test', 'self_test', 'diagnostic']);

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

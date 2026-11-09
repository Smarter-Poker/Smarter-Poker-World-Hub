/*
 * ONE READER FOR A LIVE CO-HOST INVITE (2026-11-09).
 *
 * A live invite is stored as `[LIVE_INVITE]room=<id>&invite=<code>`, written
 * in three places and unpacked in four more, each with its own copy of the
 * same two lines. They had already drifted: MessageBubble and the
 * notifications feed trimmed the querystring, the unread-count toast did not,
 * so a single stray space would have produced `/hub/live/guest? room=…` in
 * the toast and a working link everywhere else.
 *
 * That is the shape that printed a photo as its own markup: one writer, several
 * readers, nothing tying them together. Same remedy — encode and decode in one
 * place, so the next person who changes the format changes it once.
 */

const MARKER = '[LIVE_INVITE]';
const JOIN_PATH = '/hub/live/guest';
export const LIVE_INVITE_MARKER = MARKER;
export const LIVE_INVITE_FALLBACK = '/hub/lives';

/** The single writer. */
export function encodeLiveInvite({ roomId, inviteCode } = {}) {
    if (!roomId || !inviteCode) return null;
    const query = `room=${encodeURIComponent(roomId)}&invite=${encodeURIComponent(inviteCode)}`;
    return `${MARKER}${query}`;
}

/** True for a stored live invite, however the surface found it. */
export const isLiveInvite = content => typeof content === 'string' && content.startsWith(MARKER);

/**
 * The single reader. Returns { query, joinHref } for an invite, or null.
 * An invite whose querystring is missing or unusable returns a join link to
 * the lives index rather than a broken guest URL.
 */
export function parseLiveInvite(content) {
    if (!isLiveInvite(content)) return null;
    const query = content.slice(MARKER.length).trim();
    // A querystring is a flat key=value set. Anything with whitespace inside,
    // a fragment, or an attempt at another path is not one.
    if (!query || /[\s#?]/.test(query) || query.startsWith('/')) {
        return { query: '', joinHref: LIVE_INVITE_FALLBACK };
    }
    return { query, joinHref: `${JOIN_PATH}?${query}` };
}

/** Where tapping this invite should go, with a safe fallback. */
export const liveInviteHref = content => parseLiveInvite(content)?.joinHref || LIVE_INVITE_FALLBACK;

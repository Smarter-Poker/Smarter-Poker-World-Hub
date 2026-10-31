/*
 * MESSENGER CALL ROOMS (2026-10-31).
 *
 * A 1:1 call room is named after the conversation it belongs to:
 *
 *     sp-call-<conversation uuid>-<base36 time><base36 random>
 *
 * The LiveKit token route authorises a room by reading the conversation out
 * of its name and checking that the caller is one of its two participants.
 * Before this, authorisation looked up a pending_calls row by room name, and
 * the person answering deleted that same row while their own token request was
 * in flight - so the answering side was routinely refused with "You are not
 * authorized to join this room" and the call never connected. A conversation
 * does not disappear when a call is answered, so the check cannot race.
 *
 * Shared by the browser (room creation) and API routes (room parsing). Pure.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROOM = /^sp-call-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-([a-z0-9]{6,40})$/i;

export const CALL_ROOM_PREFIX = 'sp-call-';

// How long an unanswered call rings before the caller records it as missed.
export const CALL_RING_TIMEOUT_MS = 45000;

export const CALL_TYPES = new Set(['audio', 'video']);

export function isConversationId(value) {
    return typeof value === 'string' && UUID.test(value);
}

export function makeCallRoomName(conversationId, now = Date.now(), random = Math.random) {
    if (!isConversationId(conversationId)) throw new Error('A call needs a conversation');
    const suffix = Math.floor(random() * 36 ** 6).toString(36).padStart(6, '0');
    return `${CALL_ROOM_PREFIX}${conversationId.toLowerCase()}-${now.toString(36)}${suffix}`;
}

export function parseCallRoomConversation(roomName) {
    if (typeof roomName !== 'string' || roomName.length > 120) return null;
    const match = ROOM.exec(roomName);
    return match ? match[1].toLowerCase() : null;
}

export function normalizeCallType(value) {
    return value === 'video' ? 'video' : 'audio';
}

// A receipt is one chat line per call, written once by the caller.
export function callReceiptContent({ callType, status, durationSeconds = 0 }) {
    const allowed = new Set(['completed', 'missed', 'declined', 'cancelled']);
    return `[CALL_RECEIPT]${JSON.stringify({
        type: normalizeCallType(callType),
        duration: Math.max(0, Math.floor(Number(durationSeconds) || 0)),
        status: allowed.has(status) ? status : 'completed',
    })}`;
}

export function formatCallDuration(totalSeconds) {
    const seconds = Math.max(0, Math.floor(totalSeconds || 0));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const rest = seconds % 60;
    const two = value => String(value).padStart(2, '0');
    return hours > 0 ? `${hours}:${two(minutes)}:${two(rest)}` : `${minutes}:${two(rest)}`;
}

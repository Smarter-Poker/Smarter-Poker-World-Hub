/*
 * ONE READER FOR A CALL RECEIPT (2026-11-09).
 *
 * A finished call is stored as `[CALL_RECEIPT]{"type":…,"status":…}`, detected
 * in four places and unpacked in two, each with its own JSON parse, its own
 * legacy-string fallback and its own wording. Same shape as the live invite
 * and the photo markup before it: one writer, several readers, nothing tying
 * them together.
 */

const MARKER = '[CALL_RECEIPT]';
export const CALL_RECEIPT_MARKER = MARKER;

/** True for a stored call receipt. */
export const isCallReceipt = content => typeof content === 'string' && content.startsWith(MARKER);

/**
 * The single reader. Returns { type, status, duration, legacy } or null.
 * `legacy` carries the pre-JSON wording for the receipts written before the
 * payload existed, which are still in the thread and must still read sensibly.
 */
export function parseCallReceipt(content) {
    if (!isCallReceipt(content)) return null;
    const raw = content.slice(MARKER.length);
    try {
        const data = JSON.parse(raw);
        const duration = Number(data?.duration);
        return {
            type: data?.type === 'video' ? 'video' : 'voice',
            status: ['completed', 'missed', 'declined', 'cancelled'].includes(data?.status) ? data.status : 'completed',
            duration: Number.isFinite(duration) && duration > 0 ? duration : 0,
            legacy: null,
        };
    } catch {
        return { type: /video/i.test(raw) ? 'video' : 'voice', status: 'completed', duration: 0,
            legacy: raw.replace(/Video call/i, 'Video Call').replace(/Voice call/i, 'Voice Call') };
    }
}

/** How long the call ran, in the wording both surfaces already used. */
export function callDurationText(duration) {
    if (!(duration > 0)) return '';
    return duration >= 60 ? `${Math.floor(duration / 60)}m ${duration % 60}s` : `${duration}s`;
}

/** One line naming the call, for a conversation list or a lock screen. */
export function describeCallReceipt(content) {
    const receipt = parseCallReceipt(content);
    if (!receipt) return null;
    if (receipt.legacy) return receipt.legacy;
    const kind = receipt.type === 'video' ? 'Video Call' : 'Voice Call';
    const status = receipt.status === 'completed' ? ''
        : receipt.status === 'missed' ? 'Missed '
            : receipt.status === 'declined' ? 'Declined ' : 'Cancelled ';
    const time = callDurationText(receipt.duration);
    return `${status}${kind}${time ? `, ${time}` : ''}`;
}

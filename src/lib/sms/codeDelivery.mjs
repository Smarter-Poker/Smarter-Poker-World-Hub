/**
 * The words a player sees when their verification code did not reach the
 * phone (2026-11-07). Every word starts with a capital (World Hub title-case
 * rule); the carrier's reason comes from the same labels the digest uses.
 */
import { SMS_ERROR_LABELS } from '../dailyDigest/assemble.mjs';

const titleCase = (text) => String(text || '').replace(/\b([a-z])/g, (m) => m.toUpperCase());

export function codeNotDeliveredMessage(reason) {
    const why = reason ? ` (${titleCase(reason)})` : '';
    return `Your Code Did Not Reach Your Phone${why}. Check The Number Or Send A New Code.`;
}

/** The delivery state of one code's receipt, and nothing else about it. */
export function otpDeliveryAnswer(receipt) {
    if (!receipt) return { state: 'pending' };
    if (receipt.status === 'delivered') return { state: 'delivered' };
    if (receipt.status === 'undelivered' || receipt.status === 'failed') {
        return { state: 'not_delivered', reason: SMS_ERROR_LABELS[receipt.error_code] || 'carrier did not deliver it' };
    }
    return { state: 'pending' };
}

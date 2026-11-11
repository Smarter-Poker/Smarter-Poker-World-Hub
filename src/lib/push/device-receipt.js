/**
 * device-receipt.js -- SERVER ONLY. Per-push, per-device delivery receipts.
 *
 * WHY: push_outbox.status = 'sent' means FCM or Apple answered 2xx. Both do
 * that for a phone that is asleep, offline or long gone, so the reliability
 * controller's push_state 'provider_accepted' is NOT device delivery.
 * push_subscriptions.last_receipt_at is per endpoint, not per push.
 *
 * HOW: at send time the dispatcher mints a random 256-bit token for one
 * (outbox row, subscription) pair, stores only its SHA-256 through
 * public.fn_mint_push_receipt (Club Arena migration 20261111132958), and puts
 * the token in that device's encrypted Web Push payload. The service worker
 * posts { id, token, stage } to /api/push/delivery-receipt, which hashes the
 * token and calls public.fn_record_push_receipt. Nobody but the receiving
 * device ever holds the token, so another user cannot forge the receipt.
 *
 * Best-effort by construction: a mint failure returns null and the push is
 * sent without a token, exactly as before.
 */
import { createHash, randomBytes } from 'node:crypto';

// Only the reliability controller's escalations carry a receipt for now;
// fn_mint_push_receipt refuses anything else as well.
export const isReceiptEvent = (event) => typeof event === 'string' && event.startsWith('reliability_');

export const RECEIPT_TOKEN = /^[0-9a-f]{64}$/;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function hashReceiptToken(token) {
    return createHash('sha256').update(String(token), 'utf8').digest('hex');
}

/**
 * Mint a receipt token for one device. Returns the token, or null when this
 * row/subscription gets no receipt (wrong event, non-webpush transport, the
 * database refused, or the RPC failed). Never throws.
 */
export async function mintDeviceReceipt(supabase, row, sub, { random = randomBytes } = {}) {
    try {
        if (!isReceiptEvent(row?.event) || !UUID.test(row?.id || '') || !UUID.test(sub?.id || '')) return null;
        // The Club Arena app's FCM transport stringifies data fields and has no
        // receipt handler; only a Web Push worker can acknowledge.
        if ((sub.transport || 'webpush') !== 'webpush') return null;
        const token = random(32).toString('hex');
        const { data, error } = await supabase.rpc('fn_mint_push_receipt', {
            p_outbox_id: row.id,
            p_subscription_id: sub.id,
            p_token_sha256: hashReceiptToken(token),
        });
        if (error || data !== true) return null;
        return token;
    } catch {
        return null;
    }
}

/** The payload for one device: the shared payload plus that device's receipt. */
export function withDeviceReceipt(payload, outboxId, token) {
    if (!token) return payload;
    return { ...payload, data: { ...(payload.data || {}), receipt: { id: outboxId, token } } };
}

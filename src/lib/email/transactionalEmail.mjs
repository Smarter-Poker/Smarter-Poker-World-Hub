/**
 * One-shot transactional email through the platform's Resend account.
 *
 * Built for callers that sit on a payment path (the Stripe webhook): it makes
 * exactly ONE attempt with a short timeout, never throws, and always passes
 * the caller's Idempotency-Key so a redelivered event cannot mail the same
 * member twice. The account and sender domain come from resendAccount.mjs,
 * the same helper every other sender uses.
 */
import { resendApiKey, resendFrom } from './resendAccount.mjs';

export const TRANSACTIONAL_FROM = 'Smarter.Poker <noreply@smarter.poker>';
const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const EMAIL_PATTERN = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/;

export function isDeliverableAddress(value) {
    return typeof value === 'string' && value.length <= 254 && EMAIL_PATTERN.test(value.trim());
}

export async function sendTransactionalEmail({
    to,
    subject,
    html,
    text,
    idempotencyKey,
    from = TRANSACTIONAL_FROM,
    fetchImpl = globalThis.fetch,
    timeoutMs = 8000,
    env = process.env,
} = {}) {
    try {
        const apiKey = resendApiKey(env);
        if (!apiKey) return { ok: false, error: 'email_not_configured' };
        if (!isDeliverableAddress(to)) return { ok: false, error: 'invalid_recipient' };
        if (!subject || !html || !text) return { ok: false, error: 'incomplete_message' };
        if (typeof idempotencyKey !== 'string' || !idempotencyKey || idempotencyKey.length > 256) {
            return { ok: false, error: 'missing_idempotency_key' };
        }
        const response = await fetchImpl(RESEND_ENDPOINT, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'Idempotency-Key': idempotencyKey,
            },
            signal: AbortSignal.timeout(timeoutMs),
            body: JSON.stringify({
                from: resendFrom(from, env),
                to: [to.trim()],
                subject,
                html,
                text,
            }),
        });
        const body = await response.json().catch(() => ({}));
        if (response.ok && body?.id) return { ok: true, id: String(body.id) };
        return { ok: false, error: `resend_${response.status}` };
    } catch (error) {
        return { ok: false, error: `resend_threw:${String(error?.name || 'Error')}` };
    }
}

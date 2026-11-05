/**
 * Twilio request signing (X-Twilio-Signature): base64 HMAC-SHA1, keyed with
 * the account auth token, over the exact callback URL followed by every form
 * field name+value in alphabetical order. Used by the delivery-receipt
 * webhook (pages/api/webhooks/twilio-status.js).
 */
import crypto from 'crypto';

export function twilioSignature(authToken, url, params) {
    const data = Object.keys(params || {}).sort().reduce((acc, k) => acc + k + String(params[k] ?? ''), url);
    return crypto.createHmac('sha1', authToken).update(Buffer.from(data, 'utf-8')).digest('base64');
}

export function signatureValid(authToken, url, params, header) {
    if (!authToken || !header) return false;
    const expected = Buffer.from(twilioSignature(authToken, url, params));
    const got = Buffer.from(String(header));
    return expected.length === got.length && crypto.timingSafeEqual(expected, got);
}

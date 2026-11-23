/**
 * Pure Svix / Resend webhook HMAC-SHA256 verifier (zero external dependencies).
 */
import crypto from 'crypto';

const MAX_SKEW_SECONDS = 300;

export function verifySvixSignature(rawBody, headers, secret, nowMs = Date.now()) {
    const cleanSecret = String(secret || '').trim();
    if (!cleanSecret) return false;
    const msgId = String(headers?.['svix-id'] || '').trim();
    const msgTimestamp = String(headers?.['svix-timestamp'] || '').trim();
    const msgSignature = String(headers?.['svix-signature'] || '').trim();
    if (!msgId || !msgTimestamp || !msgSignature) return false;

    const tsSeconds = Number.parseInt(msgTimestamp, 10);
    if (!Number.isFinite(tsSeconds)) return false;
    if (Math.abs(Math.floor(nowMs / 1000) - tsSeconds) > MAX_SKEW_SECONDS) return false;

    const rawKey = cleanSecret.startsWith('whsec_') ? cleanSecret.slice(6) : cleanSecret;
    let keyBytes;
    try {
        keyBytes = Buffer.from(rawKey, 'base64');
    } catch {
        return false;
    }
    if (!keyBytes.length) return false;

    const signedContent = `${msgId}.${msgTimestamp}.${rawBody}`;
    const expected = crypto.createHmac('sha256', keyBytes).update(signedContent, 'utf8').digest('base64');
    const expectedBuf = Buffer.from(expected, 'utf8');

    const candidates = msgSignature
        .split(/\s+/)
        .map((part) => (part.startsWith('v1,') ? part.slice(3) : ''))
        .filter(Boolean);

    return candidates.some((sig) => {
        const sigBuf = Buffer.from(sig, 'utf8');
        return sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf);
    });
}

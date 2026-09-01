import { createHmac, timingSafeEqual } from 'node:crypto';

const AUDIT_CURSOR_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function cursorSecret() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXTAUTH_SECRET || '';
}

export function sealAuditCursor(state, userId, now = Date.now()) {
  const secret = cursorSecret();
  if (!secret || !state) return null;
  const payload = Buffer.from(JSON.stringify({
    ...state,
    userId,
    expiresAt: now + AUDIT_CURSOR_MAX_AGE_MS,
  })).toString('base64url');
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function fingerprintAuditCursor(state, userId) {
  const secret = cursorSecret();
  if (!secret || !state) return null;
  const stableState = {
    snapshotAt: state.snapshotAt || null,
    modern: state.modern || null,
    legacy: state.legacy || null,
    modernDone: state.modernDone === true,
    legacyDone: state.legacyDone === true,
    cumulativeHandsFound: Math.max(0, Number(state.cumulativeHandsFound) || 0),
  };
  return createHmac('sha256', secret)
    .update(`${userId}:${JSON.stringify(stableState)}`)
    .digest('base64url');
}

export function openAuditCursor(token, userId, now = Date.now()) {
  if (!token) return null;
  if (typeof token !== 'string' || token.length > 4096) throw new Error('invalid_cursor');
  const [payload, suppliedSignature, extra] = token.split('.');
  const secret = cursorSecret();
  if (!payload || !suppliedSignature || extra || !secret) throw new Error('invalid_cursor');
  const expectedSignature = createHmac('sha256', secret).update(payload).digest('base64url');
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw new Error('invalid_cursor');
  let decoded;
  try { decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); }
  catch (_) { throw new Error('invalid_cursor'); }
  if (decoded?.userId !== userId || !Number.isFinite(decoded?.expiresAt) || decoded.expiresAt < now) {
    throw new Error('invalid_cursor');
  }
  const snapshotMs = new Date(decoded.snapshotAt).getTime();
  if (!Number.isFinite(snapshotMs) || snapshotMs > now + 60_000) throw new Error('invalid_cursor');
  return decoded;
}

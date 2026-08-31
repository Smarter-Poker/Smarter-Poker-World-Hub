import { createHmac, timingSafeEqual } from 'node:crypto';

const MAX_TOKEN_LENGTH = 2048;

function secret() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXTAUTH_SECRET || '';
}

export function sealAuditJobToken({ jobId, userId, purpose = 'kick', ttlMs = 5 * 60_000 }) {
  const key = secret();
  if (!key || !jobId || !userId) return null;
  const payload = Buffer.from(JSON.stringify({
    jobId: String(jobId),
    userId: String(userId),
    purpose,
    expiresAt: Date.now() + Math.max(30_000, Number(ttlMs) || 0),
  })).toString('base64url');
  const signature = createHmac('sha256', key).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function openAuditJobToken(token, expectedPurpose) {
  if (typeof token !== 'string' || token.length < 10 || token.length > MAX_TOKEN_LENGTH) return null;
  const [payload, suppliedSignature, extra] = token.split('.');
  const key = secret();
  if (!payload || !suppliedSignature || extra || !key) return null;
  const expectedSignature = createHmac('sha256', key).update(payload).digest('base64url');
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
  let decoded;
  try { decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); }
  catch (_) { return null; }
  if (!decoded?.jobId || !decoded?.userId || decoded?.purpose !== expectedPurpose) return null;
  if (!Number.isFinite(decoded?.expiresAt) || decoded.expiresAt < Date.now()) return null;
  return decoded;
}

export function getAuditWorkerOrigin() {
  if (process.env.PA_INTERNAL_BASE_URL) return process.env.PA_INTERNAL_BASE_URL.replace(/\/$/, '');
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  if (process.env.NODE_ENV !== 'production') return `http://127.0.0.1:${process.env.PORT || 3000}`;
  return 'https://smarter.poker';
}

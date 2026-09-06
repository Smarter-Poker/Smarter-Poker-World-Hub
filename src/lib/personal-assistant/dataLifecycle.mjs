import { createHmac, timingSafeEqual } from 'node:crypto';

const DELETE_SCOPES = new Set(['coaching', 'analysis', 'sandbox', 'all']);
const CHALLENGE_TTL_MS = 10 * 60 * 1000;

function signingSecret(explicit) {
  const value = String(explicit || process.env.PA_DATA_LIFECYCLE_SECRET || process.env.NEXTAUTH_SECRET || '').trim();
  if (value.length < 24) throw new Error('Data Lifecycle Signing Is Not Configured.');
  return value;
}

function signature(payload, secret) {
  return createHmac('sha256', signingSecret(secret)).update(payload).digest('base64url');
}

function assertScope(scope) {
  const normalized = String(scope || '').toLowerCase();
  if (!DELETE_SCOPES.has(normalized)) throw new TypeError('Deletion Scope Is Invalid.');
  return normalized;
}

export function sealDeletionChallenge({ userId, scope, now = Date.now(), secret } = {}) {
  const owner = String(userId || '').trim();
  if (!owner) throw new TypeError('Deletion Owner Is Required.');
  const normalizedScope = assertScope(scope);
  const payload = Buffer.from(JSON.stringify({ u: owner, s: normalizedScope, e: now + CHALLENGE_TTL_MS })).toString('base64url');
  return `${payload}.${signature(payload, secret)}`;
}

export function openDeletionChallenge(token, { userId, scope, now = Date.now(), secret } = {}) {
  try {
    const [payload, suppliedSignature, extra] = String(token || '').split('.');
    if (!payload || !suppliedSignature || extra) throw new Error('shape');
    const expected = signature(payload, secret);
    const supplied = Buffer.from(suppliedSignature);
    const trusted = Buffer.from(expected);
    if (supplied.length !== trusted.length || !timingSafeEqual(supplied, trusted)) throw new Error('signature');
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    const expectedScope = assertScope(scope);
    if (decoded.u !== String(userId || '') || decoded.s !== expectedScope) throw new Error('owner');
    if (!Number.isFinite(decoded.e) || decoded.e < now) throw new RangeError('Expired Deletion Challenge.');
    return { userId: decoded.u, scope: decoded.s, expiresAt: decoded.e };
  } catch (error) {
    if (error instanceof RangeError) throw error;
    throw new TypeError('Invalid Deletion Challenge.');
  }
}

export function retentionDays(value) {
  if (value === null || value === undefined || value === '' || value === 'forever') return null;
  const days = Number(value);
  if (![30, 90, 180, 365].includes(days)) throw new TypeError('Retention Period Is Invalid.');
  return days;
}

export default { sealDeletionChallenge, openDeletionChallenge, retentionDays };

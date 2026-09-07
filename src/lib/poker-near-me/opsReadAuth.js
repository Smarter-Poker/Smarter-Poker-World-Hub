import crypto from 'crypto';
import { getServerUserWithFallback } from '../serverAuth.js';

const ADMIN_ROLES = new Set(['admin', 'superadmin', 'god']);

function safeEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');
  if (leftBuffer.length !== rightBuffer.length) {
    crypto.timingSafeEqual(leftBuffer, leftBuffer);
    return false;
  }
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function configuredSecret(value) {
  return typeof value === 'string' && value.trim().length >= 8
    ? value.trim()
    : null;
}

function bearerToken(req) {
  const authorization = req?.headers?.authorization;
  if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) return '';
  return authorization.slice(7).trim();
}

/**
 * Match a configured machine credential without ever treating a missing or
 * blank environment variable as authorization.
 */
export function requestHasPokerOpsSecret(req, env = process.env) {
  const cronSecret = configuredSecret(env?.CRON_SECRET);
  const adminSecret = configuredSecret(env?.ADMIN_ROUTE_SECRET);
  const bearer = bearerToken(req);
  const cronHeader = typeof req?.headers?.['x-cron-secret'] === 'string'
    ? req.headers['x-cron-secret'].trim()
    : '';
  const adminHeader = typeof req?.headers?.['x-admin-secret'] === 'string'
    ? req.headers['x-admin-secret'].trim()
    : '';

  return Boolean(
    (cronSecret && (safeEqual(bearer, cronSecret) || safeEqual(cronHeader, cronSecret)))
    || (adminSecret && (safeEqual(bearer, adminSecret) || safeEqual(adminHeader, adminSecret)))
  );
}

/**
 * Authorize an internal Poker Near Me read. Human callers must present a
 * valid Supabase JWT and be marked as an administrator; machine callers may
 * use one of the configured header-only operations secrets.
 */
export async function authorizePokerOpsRead(req, supabase, env = process.env) {
  if (requestHasPokerOpsSecret(req, env)) {
    return { authorized: true, kind: 'secret' };
  }

  if (!bearerToken(req)) {
    return { authorized: false, kind: null };
  }

  try {
    const { user, error: userError } = await getServerUserWithFallback(req, supabase);
    const userId = user?.id;
    if (userError || !userId) return { authorized: false, kind: null };

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('is_admin, role')
      .eq('id', userId)
      .maybeSingle();
    const role = String(profile?.role || '').trim().toLowerCase();
    const isAdmin = profile?.is_admin === true || ADMIN_ROLES.has(role);
    return profileError || !isAdmin
      ? { authorized: false, kind: null }
      : { authorized: true, kind: 'admin', userId };
  } catch (_) {
    return { authorized: false, kind: null };
  }
}

/** Only the coarse status/freshness contract is safe for public monitors. */
export function sanitizePublicScraperHealth(payload) {
  const scrapers = {};
  Object.entries(payload?.scrapers || {}).forEach(([key, value]) => {
    scrapers[key] = {
      status: value?.status || 'unknown',
      // A valid-empty checkpoint has no data row by design. In that state the
      // cycle timestamp is the source's meaningful freshness signal.
      minutes_ago: Number.isFinite(value?.cycle_minutes_ago)
        ? value.cycle_minutes_ago
        : Number.isFinite(value?.minutes_ago) ? value.minutes_ago : null,
    };
  });
  return {
    status: payload?.status || 'unknown',
    checked_at: payload?.checked_at || null,
    scrapers,
  };
}

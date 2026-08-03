import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * VIP Status Check API
 * GET /api/vip/check-status
 * Server-side bridge for VIP verification using service role
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DIAMOND REWARDS STANDARD v2 — EXPIRY ENFORCEMENT (July 26, 2026)
 * ───────────────────────────────────────────────────────────────────────────
 * This route used to `select('is_vip')` and return `is_vip === true`. Nothing
 * anywhere enforced vip_expires_at, so EVERY trial ever granted (including the
 * 90-day phone-verification trial from /api/sms/verify-otp) stayed active
 * forever — free 150/day + 4,500/month diamond ceilings and the 500 💎 monthly
 * stipend, permanently, for people who never paid.
 *
 * Truth definition (must match public.award_diamonds_v2 and
 * public.expire_lapsed_vip in migration 20260726120000):
 *
 *   isVip = is_vip === true
 *           AND (vip_tier === 'lifetime'
 *                ? true
 *                : vip_expires_at != null && new Date(vip_expires_at) > now)
 *
 * DELIBERATE SEMANTIC DECISION — NULL EXPIRY ON A NON-LIFETIME TIER = EXPIRED.
 * "No end date" is not the same as "never ends". The only tier that legitimately
 * has no end date is 'lifetime'. Legacy rows written by
 * pages/api/store/webhooks/stripe.js (which sets is_vip = true but never writes
 * vip_tier / vip_expires_at) will therefore read as NOT VIP until that webhook
 * backfills the Stripe period. See the REQUIRED FOLLOW-UPS block in the
 * migration (item F2) — a backfill from vip_subscriptions.current_period_end is
 * required before/with this deploy.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../src/lib/sentryWrap';
import { MIGRATION_MISSING, MIGRATION_FILE } from '../../../src/lib/rewards/awardGuard';

/**
 * True when Postgres/PostgREST says vip_tier / vip_expires_at do not exist.
 * Those two columns are ADDed by migration 20260726120000 (lines 80-81). Until
 * it is applied, selecting them errors — and the expiry logic below would then
 * answer isVip:false for EVERY paying subscriber. Detected here so we can fall
 * back to the pre-v2 columns instead of silently revoking VIP platform-wide.
 */
function isMissingVipExpiryColumns(error) {
    if (!error) return false;
    try {
        const code = error.code === undefined || error.code === null ? '' : String(error.code).trim().toUpperCase();
        if (code === '42703' || code === 'PGRST204') return true;
        const text = [error.message, error.details, error.hint].filter((v) => typeof v === 'string').join(' | ');
        if (!text) return false;
        if (!/vip_tier|vip_expires_at/i.test(text)) return false;
        return /does not exist|could not find|unknown column|schema cache/i.test(text);
    } catch (_e) {
        return false;
    }
}

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

export default async function handler(req, res) {
  if (!applyRateLimit(req, res, LIMITS.read)) return;
  try {
      if (req.method !== 'GET') {
          return res.status(405).json({ error: 'Method not allowed' });
      }

      try {
          // ═══════════════════════════════════════════════════════════════════
          // HARDENED: March 7, 2026 — JWT ONLY. Query param fallback REMOVED
          // to prevent IDOR (any user could check any other user's VIP status).
          // The global fetch interceptor in _app.js auto-injects JWT on all
          // /api/ calls, so the "auth race condition" fallback is no longer needed.
          // ═══════════════════════════════════════════════════════════════════
          const token = req.headers.authorization?.replace('Bearer ', '');
          if (!token) {
              return res.status(401).json({ isVip: false, error: 'Authentication required' });
          }
          const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
          const user = authData?.user;
          if (authErr || !user) {
              return res.status(401).json({ isVip: false, error: 'Invalid token' });
          }
          const userId = user.id;

          // Query profiles for VIP status
          let { data: profile, error } = await getSupabase()
              .from('profiles')
              .select('is_vip, diamonds, vip_tier, vip_expires_at')
              .eq('id', userId)
              .maybeSingle();

          // ── FAILSAFE: migration 20260726120000 not applied ──────────────
          // Read path — it must keep working. If the v2 expiry columns are not
          // there yet, re-read the columns that ARE and fall back to pre-v2
          // semantics (is_vip alone) rather than telling every subscriber their
          // VIP has lapsed. Expiry enforcement resumes the moment the migration
          // lands, with no code change.
          let expiryColumnsMissing = false;
          if (error && isMissingVipExpiryColumns(error)) {
              expiryColumnsMissing = true;
              console.error(
                  `🚨 [${MIGRATION_MISSING}] profiles.vip_tier / profiles.vip_expires_at do not exist — ` +
                  `VIP expiry cannot be enforced. Apply the migration: ${MIGRATION_FILE}. ` +
                  `Falling back to legacy is_vip-only VIP status.`
              );
              ({ data: profile, error } = await getSupabase()
                  .from('profiles')
                  .select('is_vip, diamonds')
                  .eq('id', userId)
                  .maybeSingle());
          }

          if (error || !profile) {
              return res.status(200).json({
                  isVip: false,
                  diamonds: 0,
                  vipTier: null,
                  vipExpiresAt: null
              });
          }

          // ═══════════════════════════════════════════════════════════════
          // VIP truth. is_vip alone is NOT enough — it is a sticky flag that
          // nothing ever cleared. Expiry is what makes VIP a subscription
          // rather than a permanent gift.
          // ═══════════════════════════════════════════════════════════════
          const vipTier      = profile.vip_tier || null;
          const vipExpiresAt = profile.vip_expires_at || null;

          let isVip = false;
          if (profile.is_vip === true) {
              if (expiryColumnsMissing) {
                  // Pre-v2 database: there is no expiry to check yet.
                  isVip = true;
              } else if (vipTier === 'lifetime') {
                  isVip = true;
              } else if (vipExpiresAt) {
                  const expiry = new Date(vipExpiresAt);
                  // Invalid dates produce NaN, and NaN > now is false → expired.
                  isVip = expiry.getTime() > Date.now();
              }
              // else: NULL expiry on a non-lifetime tier → EXPIRED (see header).
          }

          return res.status(200).json({
              isVip,
              diamonds: profile.diamonds || 0,
              vipTier,
              vipExpiresAt
          });

      } catch (err) {
          console.warn('[VIP Check] Error:', err);
          return res.status(500).json({ isVip: false, error: 'Internal server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

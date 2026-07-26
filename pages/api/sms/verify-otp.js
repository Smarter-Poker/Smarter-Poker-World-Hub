/* ═══════════════════════════════════════════════════════════════════════════
   TWILIO SMS — VERIFY OTP CODE
   POST /api/sms/verify-otp

   HARDENED v2 — Feb 2026
   ─────────────────────────────────────────────────────────────────────────
   • Supabase-backed OTP store (survives serverless cold starts)
   • Shared phone normalisation logic (identical to send-otp.js)
   • Strict 4-digit code validation
   • Auto-cleanup of expired rows before lookup
   • Atomic attempt tracking + remaining-attempt feedback
   • Defensive error handling at every Supabase call

   HARDENED v3 — July 26, 2026 (Diamond Rewards Standard v2)
   ─────────────────────────────────────────────────────────────────────────
   THE HOLE: this route read `userId` straight out of the REQUEST BODY with no
   JWT check whatsoever, then stamped `phone_verified = true`, `is_vip = true`
   and a 90-day `vip_expires_at` onto that account — running under the SERVICE
   ROLE, so RLS and the profiles guard trigger waved it through. Anyone who
   could receive an SMS on any phone could hand themselves (or overwrite) VIP
   on ANY account id they could guess or scrape. Free money, no login required.

   THE FIX
     1. The body-supplied `userId` is now IGNORED, always. The only identity
        this route will act on comes from a verified `Authorization: Bearer
        <jwt>` resolved through supabase.auth.getUser().
     2. A token that is present but invalid/expired is a hard 401 — no silent
        downgrade to the anonymous path.
     3. NO token at all is still allowed, but ONLY for pure code verification.
        pages/auth/signup.js verifies the phone BEFORE supabase.auth.signUp()
        runs, so there is genuinely no session to present at that point. That
        path now performs ZERO profile writes — it answers "is this code
        correct for this phone", nothing more. Signup itself persists
        phone_verified on the row it creates.
     4. Free VIP grant cut 90 days → 30 days, matching the standard signup
        trial (supabase/migrations/20260330120000_vip_paywall_30day_trial.sql).
        VIP is a subscription; a 90-day giveaway for owning a phone was three
        months of 150/day + 4,500/month diamond ceilings ($45/mo of headroom)
        for $0.
     5. Phone verification now pays the catalog's `phone_verified` action
        (25 💎) through award_diamonds_v2 — the single capped, idempotent,
        service-role-only award path — instead of writing a cosmetic
        zero-amount diamond_transactions row that credited nothing.
     6. The duplicate-phone guard now runs on BOTH paths (authenticated and
        anonymous signup). It is the single strongest anti-multi-account
        control in the codebase and the signup path had no equivalent. It
        cannot be used to enumerate accounts: it only fires AFTER a correct
        OTP, which means the caller physically controls that handset.
   ═══════════════════════════════════════════════════════════════════════════ */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

/* ── Shared utility: normalise any phone input to E.164 ────────────────── */
function normalizePhone(raw) {
    const digits = raw.replace(/\D/g, '');
    if (digits.length === 10) return '+1' + digits;   // US 10-digit
    if (digits.length === 11 && digits.startsWith('1')) return '+' + digits; // US with leading 1
    return '+' + digits;                               // passthrough
}

const MAX_ATTEMPTS = 5;

/* ── Free VIP granted for verifying a phone.
      30 days — same length as the standard signup trial. Was 90. ────────── */
const PHONE_VIP_TRIAL_DAYS = 30;

/**
 * Resolve the caller's identity from the Authorization header ONLY.
 *
 * Returns { userId, error }.
 *   • no header            → { userId: null }          (anonymous signup path)
 *   • header + valid jwt   → { userId: '<uuid>' }
 *   • header + bad jwt     → { userId: null, error: 'Invalid or expired session' }
 *
 * The request body is never consulted. That was the whole vulnerability.
 */
async function resolveAuthedUser(req, supabase) {
    const raw = req.headers.authorization || '';
    if (!raw.startsWith('Bearer ')) return { userId: null };

    const token = raw.slice(7).trim();
    if (!token) return { userId: null };

    try {
        const { data, error } = await supabase.auth.getUser(token);
        if (error || !data?.user?.id) {
            return { userId: null, error: 'Invalid or expired session' };
        }
        return { userId: data.user.id };
    } catch (err) {
        console.warn('[verify-otp] auth.getUser threw:', err?.message || err);
        return { userId: null, error: 'Invalid or expired session' };
    }
}

export default async function handler(req, res) {
  try {
    if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
      if (!applyRateLimit(req, res, LIMITS.write)) return;
    }

      if (req.method !== 'POST') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      const supabase = getSupabase();

      // ═══════════════════════════════════════════════════════════════════
      // IDENTITY — from the JWT, never from the body.
      // A present-but-invalid token is rejected outright so a stale session
      // can never quietly fall through to the anonymous (no-write) path and
      // leave the user wondering why nothing was granted.
      // ═══════════════════════════════════════════════════════════════════
      const { userId: authedUserId, error: authError } = await resolveAuthedUser(req, supabase);
      if (authError) {
          return res.status(401).json({ success: false, error: authError });
      }

      try {
          const { phone, code } = req.body;

          // Loud breadcrumb if a client still ships userId in the body — it is
          // inert now, but it tells us which callers still need updating.
          if (req.body?.userId && req.body.userId !== authedUserId) {
              console.warn(
                  '[verify-otp] Ignoring body-supplied userId',
                  req.body.userId,
                  '— identity comes from the bearer token only (authed:', authedUserId || 'none', ')'
              );
          }

          // ── Guard: inputs required ───────────────────────────────────────
          if (!phone || !code) {
              return res.status(400).json({ success: false, error: 'Phone number and code are required' });
          }

          // ── Guard: code must be exactly 4 digits ─────────────────────
          const trimmedCode = String(code).trim();
          if (!/^\d{4}$/.test(trimmedCode)) {
              return res.status(400).json({ success: false, error: 'Verification Code Must Be 4 Digits' });
          }

          const cleanPhone = normalizePhone(phone);

          // ── Guard: must look like a valid US phone ───────────────────────
          if (!/^\+1\d{10}$/.test(cleanPhone)) {
              return res.status(400).json({ success: false, error: 'Invalid phone number format' });
          }

          // ── Housekeeping: purge expired OTP rows (any phone) ─────────────
          const { error: err_sms_otp_codes_3z13v } = await supabase
            .from('sms_otp_codes')
            .delete()
              .lt('expires_at', new Date().toISOString());
          if (err_sms_otp_codes_3z13v) console.warn('[Supabase] Silent mutation failed in sms_otp_codes:', err_sms_otp_codes_3z13v.message);

          // ── Look up stored OTP ───────────────────────────────────────────
          const { data: storedOtp, error: fetchError } = await supabase
              .from('sms_otp_codes')
              .select('*')
              .eq('phone', cleanPhone)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();

          if (fetchError) {
              console.warn('[verify-otp] DB fetch error:', fetchError);
              return res.status(500).json({ success: false, error: 'Failed to verify code' });
          }

          if (!storedOtp) {
              return res.status(400).json({
                  success: false, error: 'No verification code found. Please request a new code.',
                  expired: true
              });
          }

          // ── Check if expired (belt-and-suspenders after cleanup) ─────────
          if (new Date() > new Date(storedOtp.expires_at)) {
              const { error: err_sms_otp_codes_swatr } = await supabase.from('sms_otp_codes').delete().eq('id', storedOtp.id);
              if (err_sms_otp_codes_swatr) console.warn('[Supabase] Silent mutation failed in sms_otp_codes:', err_sms_otp_codes_swatr.message);
              return res.status(400).json({
                  success: false, error: 'Verification code has expired. Please request a new code.',
                  expired: true
              });
          }

          // ── Check attempt limit ──────────────────────────────────────────
          if (storedOtp.attempts >= MAX_ATTEMPTS) {
              const { error: err_sms_otp_codes_h0fuc } = await supabase.from('sms_otp_codes').delete().eq('id', storedOtp.id);
              if (err_sms_otp_codes_h0fuc) console.warn('[Supabase] Silent mutation failed in sms_otp_codes:', err_sms_otp_codes_h0fuc.message);
              return res.status(429).json({
                  success: false, error: 'Too many attempts. Please request a new code.',
                  tooManyAttempts: true
              });
          }

          // ── Increment attempts BEFORE comparing ──────────────────────────
          const newAttempts = storedOtp.attempts + 1;
          const { error: err_sms_otp_codes_e62kk } = await supabase
            .from('sms_otp_codes')
            .update({ attempts: newAttempts })
              .eq('id', storedOtp.id);
          if (err_sms_otp_codes_e62kk) console.warn('[Supabase] Silent mutation failed in sms_otp_codes:', err_sms_otp_codes_e62kk.message);

          // ── Compare code ─────────────────────────────────────────────────
          if (storedOtp.code !== trimmedCode) {
              const remaining = MAX_ATTEMPTS - newAttempts;
              return res.status(400).json({
                  success: false, error: `Invalid verification code. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`,
                  invalid: true,
                  remainingAttempts: remaining
              });
          }

          // ── ✅ Success — delete the OTP row ──────────────────────────────
          const { error: err_sms_otp_codes_kisnd } = await supabase.from('sms_otp_codes').delete().eq('id', storedOtp.id);
          if (err_sms_otp_codes_kisnd) console.warn('[Supabase] Silent mutation failed in sms_otp_codes:', err_sms_otp_codes_kisnd.message);


          // ═══════════════════════════════════════════════════════════════
          // GUARD: PHONE UNIQUENESS — runs on BOTH paths.
          // ───────────────────────────────────────────────────────────────
          // One verified handset, one account. This is the single strongest
          // anti-multi-account / anti-farming control we have: every free
          // diamond in the catalog is real money, and the cheapest attack on
          // the whole economy is 50 throwaway accounts.
          //
          // It runs AFTER the code matched, so reaching this branch means the
          // caller physically controls the handset — it is not an account
          // enumeration oracle (which is exactly why send-otp deliberately
          // defers the check to here).
          //
          // On the anonymous signup path there is no user id to exclude, so
          // ANY existing verified owner of this number blocks the signup.
          // ═══════════════════════════════════════════════════════════════
          let dupQuery = supabase
              .from('profiles')
              .select('id')
              .eq('phone', cleanPhone)
              .eq('phone_verified', true)
              .limit(1);

          if (authedUserId) {
              dupQuery = dupQuery.neq('id', authedUserId); // allow re-verifying your own number
          }

          const { data: duplicateProfiles, error: dupError } = await dupQuery;

          if (dupError) {
              // Fail CLOSED. A DB hiccup must not become a free pass around the
              // one control standing between us and mass account farming.
              console.warn('[verify-otp] Duplicate-phone check failed:', dupError.message);
              return res.status(503).json({
                  success: false,
                  error: 'Unable to verify phone number right now. Please try again.'
              });
          }

          if (duplicateProfiles && duplicateProfiles.length > 0) {
              console.warn(
                  `[verify-otp] Security block: ${authedUserId || 'anonymous signup'} tried to verify phone ${cleanPhone} already in use by another verified account.`
              );
              return res.status(409).json({
                  success: false,
                  error: 'This phone number is already registered to another verified account.'
              });
          }

          // ═══════════════════════════════════════════════════════════════
          // ANONYMOUS PATH — code verification ONLY, zero profile writes.
          // pages/auth/signup.js calls this before supabase.auth.signUp(), so
          // there is no session yet and no row to write to. Signup persists
          // phone / phone_verified itself on the profile it creates.
          // ═══════════════════════════════════════════════════════════════
          if (!authedUserId) {
              return res.status(200).json({
                  success: true,
                  message: 'Phone number verified successfully',
                  verified: true,
                  vipGranted: false,
                  diamondsAwarded: 0,
              });
          }

          // ═══════════════════════════════════════════════════════════════
          // AUTHENTICATED PATH — persist verification, grant the 30-day VIP
          // trial, pay the catalog's phone_verified action.
          // ═══════════════════════════════════════════════════════════════
          let vipGranted      = false;
          let diamondsAwarded = 0;

          try {
              const now        = new Date();
              const vipExpires = new Date(now.getTime() + PHONE_VIP_TRIAL_DAYS * 24 * 60 * 60 * 1000);

              // ── SAFETY: never shorten an existing longer/paid VIP ────────
              const { data: profile } = await supabase
                  .from('profiles')
                  .select('is_vip, vip_tier, vip_expires_at, phone_verified')
                  .eq('id', authedUserId)
                  .maybeSingle();

              // Lifetime VIP is never touched. Otherwise only extend, never shorten.
              const existingExpiry = profile?.vip_expires_at ? new Date(profile.vip_expires_at) : null;
              const isLifetime     = profile?.vip_tier === 'lifetime';
              const shouldGrantVip = !isLifetime
                  && (!profile?.is_vip || !existingExpiry || existingExpiry < vipExpires);

              // Always update phone + phone_verified
              const updateFields = {
                  phone: cleanPhone,
                  phone_verified: true,
              };

              if (shouldGrantVip) {
                  updateFields.is_vip         = true;
                  updateFields.vip_expires_at = vipExpires.toISOString();
              }

              const { error: updateError } = await supabase
                  .from('profiles')
                  .update(updateFields)
                  .eq('id', authedUserId);

              if (updateError) {
                  console.warn('[verify-otp] Profile update error:', updateError);
              } else {
                  vipGranted = shouldGrantVip;

                  // ── Diamond award: catalog action `phone_verified` (25 💎) ──
                  // Lifetime-once, exempt from the daily cap, amount resolved
                  // server-side from diamond_reward_catalog. award_diamonds_v2 is
                  // idempotent on the reference id, so a re-verify pays nothing.
                  // The reference id is USER-SCOPED: diamond_transactions.reference_id
                  // is globally unique, so an unscoped id would let the first
                  // claimer permanently block everyone else.
                  try {
                      const { data: award, error: awardError } = await supabase.rpc('award_diamonds_v2', {
                          p_user_id:      authedUserId,
                          p_action_key:   'phone_verified',
                          p_reference_id: `phone_verified_${authedUserId}`,
                          p_target_id:    null,
                          p_metadata:     { source: 'sms_verify_otp' },
                      });

                      if (awardError) {
                          // 42501 here means the route is holding the ANON key, not
                          // the service role — award_diamonds_v2 is service_role only.
                          console.warn('[verify-otp] award_diamonds_v2 failed:', awardError.message);
                      } else if (award?.success) {
                          diamondsAwarded = award.awarded || 0;
                      } else if (award?.reason && award.reason !== 'duplicate') {
                          console.warn('[verify-otp] phone_verified not awarded:', award.reason);
                      }
                  } catch (awardErr) {
                      console.warn('[verify-otp] Diamond award error (non-blocking):', awardErr?.message || awardErr);
                  }

                  // ── Audit trail for the VIP grant itself (no diamond value) ──
                  // Kept as a ledger note only; the actual 25 💎 credit is the
                  // award_diamonds_v2 row above, not this one.
                  if (shouldGrantVip) {
                      const { error: err_diamond_transactions_tcij9 } = await supabase
                        .from('diamond_transactions')
                        .insert({
                              user_id: authedUserId,
                              amount: 0,
                              transaction_type: 'bonus',
                              description: `VIP Card Activated — ${PHONE_VIP_TRIAL_DAYS}-Day FREE VIP For Phone Verification! 📱`,
                              metadata: {
                                  source: 'phone_verification_vip',
                                  phone: cleanPhone,
                                  vip_expires_at: vipExpires.toISOString(),
                                  trial_days: PHONE_VIP_TRIAL_DAYS,
                              },
                              balance_after: 0,
                          });
                      if (err_diamond_transactions_tcij9) console.warn('[Supabase] Silent mutation failed in diamond_transactions:', err_diamond_transactions_tcij9.message);
                  }
              }
          } catch (profileErr) {
              console.warn('[verify-otp] Profile/VIP update error (non-blocking):', profileErr);
          }

          return res.status(200).json({
              success: true,
              message: 'Phone number verified successfully',
              verified: true,
              vipGranted,
              diamondsAwarded,
          });

      } catch (error) {
          console.warn('[verify-otp] Error:', error);
          return res.status(500).json({
              success: false, error: 'Failed to verify code',
              details: process.env.NODE_ENV === 'development' ? error.message : undefined
          });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

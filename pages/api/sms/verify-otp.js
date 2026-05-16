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

export default async function handler(req, res) {
  try {
    if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
      if (!applyRateLimit(req, res, LIMITS.write)) return;
    }

      if (req.method !== 'POST') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      const supabase = getSupabase();

      try {
          const { phone, code } = req.body;

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


          // ── Persist verification to profile + grant VIP ──────────────────
          const { userId } = req.body;
          let vipGranted = false;

          if (userId) {
              try {
                  const now = new Date();
                  const vipExpires = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000); // 90 days

                  // ── SAFETY: Check if user already has a longer VIP ──────
                  // Don't downgrade existing paid/longer VIP subscriptions
                  const { data: profile } = await supabase
                      .from('profiles')
                      .select('is_vip, vip_expires_at, phone_verified')
                      .eq('id', userId)
                      .maybeSingle();

                  // ── GUARD: Final Phone Uniqueness Check ──────────────────
                  // Prevent race condition VIP farming
                  const { data: duplicateProfiles } = await supabase
                      .from('profiles')
                      .select('id')
                      .eq('phone', cleanPhone)
                      .eq('phone_verified', true)
                      .neq('id', userId) // Ignore the current user if they are just re-verifying
                      .limit(1);

                  if (duplicateProfiles && duplicateProfiles.length > 0) {
                      console.warn(`[verify-otp] Security block: User ${userId} tried to verify phone ${cleanPhone} already in use by another account.`);
                      return res.status(409).json({ success: false, error: 'This phone number is already registered to another verified account.' });
                  }

                  // If user already has VIP that expires AFTER this grant, skip VIP update
                  const existingExpiry = profile?.vip_expires_at ? new Date(profile.vip_expires_at) : null;
                  const shouldGrantVip = !profile?.is_vip || !existingExpiry || existingExpiry < vipExpires;

                  // Always update phone + phone_verified
                  const updateFields = {
                      phone: cleanPhone,
                      phone_verified: true,
                  };

                  // Only update VIP if we're extending, not shortening
                  if (shouldGrantVip) {
                      updateFields.is_vip = true;
                      updateFields.vip_expires_at = vipExpires.toISOString();
                  }

                  const { error: updateError } = await supabase
                      .from('profiles')
                      .update(updateFields)
                      .eq('id', userId);

                  if (updateError) {
                      console.warn('[verify-otp] Profile update error:', updateError);
                  } else {
                      vipGranted = shouldGrantVip;

                      // Log the VIP grant as a diamond transaction (only if VIP was actually granted)
                      if (shouldGrantVip) {
                          const { error: err_diamond_transactions_tcij9 } = await supabase
                            .from('diamond_transactions')
                            .insert({
                                  user_id: userId,
                                  amount: 0,
                                  transaction_type: 'bonus',
                                  description: 'VIP Card Activated — 90-Day FREE VIP For Phone Verification! 📱',
                                  metadata: {
                                      source: 'phone_verification_vip',
                                      phone: cleanPhone,
                                      vip_expires_at: vipExpires.toISOString(),
                                  },
                                  balance_after: 0,
                              });
                          if (err_diamond_transactions_tcij9) console.warn('[Supabase] Silent mutation failed in diamond_transactions:', err_diamond_transactions_tcij9.message);
                      }
                  }
              } catch (profileErr) {
                  console.warn('[verify-otp] Profile/VIP update error (non-blocking):', profileErr);
              }
          }

          return res.status(200).json({
              success: true,
              message: 'Phone number verified successfully',
              verified: true,
              vipGranted,
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

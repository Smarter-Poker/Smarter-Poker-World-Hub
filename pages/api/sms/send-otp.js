/* ═══════════════════════════════════════════════════════════════════════════
   TWILIO SMS — SEND OTP VERIFICATION CODE
   POST /api/sms/send-otp

   HARDENED v2 — Feb 2026
   ─────────────────────────────────────────────────────────────────────────
   • Supabase-backed OTP store (survives serverless cold starts)
   • Per-phone rate limiting (max 5 codes per hour)
   • Auto-cleanup of expired OTP rows on every request
   • Shared phone normalisation logic (identical to verify-otp.js)
   • Defensive error handling at every Supabase + Twilio call
   ═══════════════════════════════════════════════════════════════════════════ */

import twilio from 'twilio';
import crypto from 'crypto';
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


// [2026-07-25] .trim() is load-bearing, not cosmetic: the prod Vercel values
// for all three TWILIO_* vars end with a literal trailing "\n". Untrimmed, the
// account SID lands in the Twilio REST URL path (→ ERR_UNESCAPED_CHARACTERS),
// the auth token corrupts the Basic-auth header (→ 401), and the "from" number
// is rejected as non-E.164. Net effect before this fix: send-otp 500'd on every
// call in prod, and because signup REQUIRES phone verification, NOBODY could
// complete the full signup form.
const accountSid = (process.env.TWILIO_ACCOUNT_SID || '').trim();
const authToken = (process.env.TWILIO_AUTH_TOKEN || '').trim();
const twilioPhone = (process.env.TWILIO_PHONE_NUMBER || '').trim();

let _twilioClient = null;
function getTwilioClient() {
    if (!_twilioClient) {
        _twilioClient = twilio(accountSid, authToken);
    }
    return _twilioClient;
}




/* ── Shared utility: normalise any phone input to E.164 ────────────────── */
function normalizePhone(raw) {
    const digits = raw.replace(/\D/g, '');
    if (digits.length === 10) return '+1' + digits;   // US 10-digit
    if (digits.length === 11 && digits.startsWith('1')) return '+' + digits; // US with leading 1
    return '+' + digits;                               // passthrough
}

/* ── Rate limit: max OTP requests per phone per hour ───────────────────── */
const MAX_CODES_PER_HOUR = 5;

export default async function handler(req, res) {
  try {
    if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
      if (!applyRateLimit(req, res, LIMITS.write)) return;
    }

      if (req.method !== 'POST') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      // ── Guard: environment variables ──────────────────────────────────────
      if (!accountSid || !authToken || !twilioPhone) {
          console.warn('[send-otp] Twilio credentials not configured');
          return res.status(500).json({ success: false, error: 'SMS service not configured' });
      }

      const supabase = getSupabase();

      try {
          const { phone } = req.body;

          // ── Guard: phone required ────────────────────────────────────────
          if (!phone) {
              return res.status(400).json({ success: false, error: 'Phone number is required' });
          }

          const cleanPhone = normalizePhone(phone);

          // ── Guard: must look like a valid US phone (+1 + 10 digits) ──────
          if (!/^\+1\d{10}$/.test(cleanPhone)) {
              return res.status(400).json({ success: false, error: 'Please enter a valid 10-digit US phone number' });
          }

          // ── [Phase 6.1.19] Phone Uniqueness — MOVED downstream ──────────
          // Previously: we queried `profiles` here for an existing phone and
          // returned a 409 "already registered" error before sending an OTP.
          // That turned this endpoint into an account-enumeration oracle:
          // anyone could probe arbitrary phone numbers and learn which were
          // linked to real accounts. The duplicate-phone guard still exists
          // at verify-otp (line ~165) — it catches the abuse at the step
          // that actually writes to `profiles`, inside an authenticated
          // context, which is where business logic belongs anyway.
          //
          // Net effect: legitimate users see identical behavior; enumeration
          // attackers now just waste SMS quota with no signal. Rate limiting
          // (below) caps the quota drain at 5 codes / hour / phone.

          // ── Housekeeping: purge ALL expired OTP rows (any phone) ─────────
          // Keeps the table lean — runs on every send request
          const { error: err_sms_otp_codes_168ck } = await supabase
            .from('sms_otp_codes')
            .delete()
              .lt('expires_at', new Date().toISOString());
          if (err_sms_otp_codes_168ck) console.warn('[Supabase] Silent mutation failed in sms_otp_codes:', err_sms_otp_codes_168ck.message);

          // ── Rate limit: count codes sent to this phone in the last hour ──
          const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
          const { count, error: countError } = await supabase
              .from('sms_otp_codes')
              .select('id', { count: 'exact', head: true })
              .eq('phone', cleanPhone)
              .gte('created_at', oneHourAgo);

          if (countError) {
              console.warn('[send-otp] Rate limit check error:', countError);
              // Non-blocking: continue even if count fails
          } else if (count >= MAX_CODES_PER_HOUR) {
              return res.status(429).json({
                  success: false, error: 'Too many verification requests. Please try again later.',
                  retryAfter: 3600
              });
          }

          // [2026-07-25] REMOVED the per-phone delete-all that used to run here.
          // It wiped the rows the rate-limit count (above) depends on, so the
          // MAX_CODES_PER_HOUR cap was dead code — a phone could be SMS-pumped
          // without limit. verify-otp only ever checks the NEWEST row and
          // enforces expires_at, so leaving prior (soon-expiring) rows in place
          // is safe: they can't be verified, they just make the cap functional.

          // ── Generate & store new 4-digit OTP (crypto-strong, not Math.random) ──
          const otpCode = crypto.randomInt(1000, 10000).toString();

          const { error: insertError } = await supabase
              .from('sms_otp_codes')
              .insert({
                  phone: cleanPhone,
                  code: otpCode,
                  expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
                  attempts: 0,
              });

          if (insertError) {
              console.warn('[send-otp] DB insert error:', insertError);
              return res.status(500).json({ success: false, error: 'Failed to store verification code' });
          }

          // ── Send SMS via Twilio ──────────────────────────────────────────
          const client = getTwilioClient();

          const message = await client.messages.create({
              body: `Your Smarter.Poker code is: ${otpCode}. Expires in 10 min.`,
              from: twilioPhone,
              to: cleanPhone
          });


          return res.status(200).json({
              success: true,
              message: 'Verification code sent',
          });

      } catch (error) {
          console.warn('[send-otp] Error:', error);

          // ── Twilio-specific error codes ──────────────────────────────────
          if (error.code === 21211) return res.status(400).json({ success: false, error: 'Invalid phone number format' });
          if (error.code === 21614) return res.status(400).json({ success: false, error: 'Phone number is not a valid mobile number' });
          if (error.code === 21608) return res.status(400).json({ success: false, error: 'Cannot send SMS to this phone number' });

          return res.status(500).json({
              success: false, error: 'Failed to send verification code',
              details: process.env.NODE_ENV === 'development' ? error.message : undefined
          });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

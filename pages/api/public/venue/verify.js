import { getServerUserWithFallback } from '../../../../src/lib/serverAuth';
/**
 * Venue Claim Verification API
 *
 * POST: Verify a claim with code
 *
 * ── SECURITY NOTE ──────────────────────────────────────────────────────────
 * This endpoint used to SELF-APPROVE a claim: a correct code granted the
 * caller venue_managers role 'owner' with every can_* permission and flipped
 * poker_venues.is_claimed. That was a privilege-escalation hole, because
 * claim.js never delivers the code anywhere (see its "TODO: Send verification
 * code via email/phone" — the code is generated, stored, and dropped). Nobody
 * legitimate can receive it, and it is only 4 digits, so the only party the
 * self-approval path actually served was someone guessing.
 *
 * Until real code delivery exists, a correct code moves the claim to
 * 'under_review' — a valid venue_claims.status — and an admin performs the
 * actual approval (venue_managers grant + poker_venues.is_claimed). The code
 * check is retained as a first factor and is now bounded by an expiry window.
 * ───────────────────────────────────────────────────────────────────────────
 */

import { supabase } from '../../../../src/lib/supabase';
import { createClient } from '../../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../../src/lib/sentryWrap';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

const MAX_VERIFICATION_ATTEMPTS = 5;

// A stored verification code stops being usable after this window. Bounds how
// long a guessable code stays live on an abandoned claim.
const VERIFICATION_CODE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Length-independent comparison so response timing doesn't leak the code.
function codesMatch(a, b) {
    const sa = String(a == null ? '' : a);
    const sb = String(b == null ? '' : b);
    let diff = sa.length ^ sb.length;
    const len = Math.max(sa.length, sb.length);
    for (let i = 0; i < len; i++) {
        diff |= (sa.charCodeAt(i) || 0) ^ (sb.charCodeAt(i) || 0);
    }
    return diff === 0 && sa.length > 0;
}

export default async function handler(req, res) {
  try {
    // Authenticated, per-user verification endpoint — never shared-cache it.
    res.setHeader('Cache-Control', 'private, no-store');

    if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
      if (!applyRateLimit(req, res, LIMITS.write)) return;
    }

      if (req.method !== 'POST') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      try {
          // Get auth user
          const authHeader = req.headers.authorization;
          if (!authHeader || !authHeader.startsWith('Bearer ')) {
              return res.status(401).json({ success: false, error: 'Authentication required' });
          }

          const token = authHeader.replace('Bearer ', '');
          const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
          const user = authData?.user;

          if (authErr || !user) {
              return res.status(401).json({ success: false, error: 'Invalid or expired token' });
          }

          const claim_id = Array.isArray(req.body.claim_id) ? req.body.claim_id[0] : req.body.claim_id;
          const verification_code = Array.isArray(req.body.verification_code) ? req.body.verification_code[0] : req.body.verification_code;

          if (!claim_id || typeof verification_code !== 'string') {
              return res.status(400).json({
                  success: false, error: 'Missing req fields',
                  required: ['claim_id', 'verification_code']
              });
          }

          // Get the claim
          const { data: claim, error: claimError } = await getSupabase()
              .from('venue_claims')
              .select('*')
              .eq('id', claim_id)
              .eq('user_id', user.id)
              .maybeSingle();

          if (claimError || !claim) {
              return res.status(404).json({ success: false, error: 'Claim not found' });
          }

          // Check claim status
          if (claim.status === 'approved') {
              return res.status(400).json({
                  success: false, error: 'Claim already approved',
                  message: 'This claim has already been verified and approved.'
              });
          }

          if (claim.status === 'rejected' || claim.status === 'revoked') {
              return res.status(400).json({
                  success: false, error: 'Claim was rejected',
                  message: claim.rejection_reason || 'This claim was rejected. Please submit a new claim if you believe this is an error.'
              });
          }

          if (claim.status === 'under_review') {
              return res.status(400).json({
                  success: false, error: 'Claim already verified',
                  status: 'under_review',
                  message: 'This claim has already been verified and is awaiting admin review.'
              });
          }

          // Check max attempts
          if (claim.verification_attempts >= MAX_VERIFICATION_ATTEMPTS) {
              // Update claim status to rejected
              const { error: err_venue_claims_fluue } = await getSupabase()
                .from('venue_claims')
                .update({
                      status: 'rejected',
                      rejection_reason: 'Maximum verification attempts exceeded',
                      updated_at: new Date().toISOString()
                  })
                  .eq('id', claim_id);
              if (err_venue_claims_fluue) console.warn('[Supabase] Silent mutation failed in venue_claims:', err_venue_claims_fluue.message);

              return res.status(400).json({
                  success: false, error: 'Maximum attempts exceeded',
                  message: 'You have exceeded the maximum number of verification attempts. Please submit a new claim.'
              });
          }

          // Expire stale codes. A never-delivered 4-digit code sitting on an
          // abandoned claim forever is a standing brute-force target.
          const claimIssuedAt = claim.created_at ? new Date(claim.created_at).getTime() : NaN;
          if (Number.isFinite(claimIssuedAt) && Date.now() - claimIssuedAt > VERIFICATION_CODE_TTL_MS) {
              return res.status(400).json({
                  success: false, error: 'Verification code expired',
                  message: 'This verification code has expired. Please submit a new claim.'
              });
          }

          // Increment attempt counter
          const { error: err_venue_claims_gil0t } = await getSupabase()
            .from('venue_claims')
            .update({
                  verification_attempts: claim.verification_attempts + 1,
                  updated_at: new Date().toISOString()
              })
              .eq('id', claim_id);
          if (err_venue_claims_gil0t) console.warn('[Supabase] Silent mutation failed in venue_claims:', err_venue_claims_gil0t.message);

          // Verify the code
          if (!codesMatch(claim.verification_code, verification_code.trim())) {
              // Log failed attempt
              const { error: err_venue_verification_log_fgqda } = await getSupabase()
                .from('venue_verification_log')
                .insert({
                      claim_id,
                      venue_id: claim.venue_id,
                      action: 'code_failed',
                      performed_by: user.id,
                      details: {
                          attempts: claim.verification_attempts + 1
                      },
                      ip_address: req.headers['x-forwarded-for'] || req.socket?.remoteAddress,
                      user_agent: req.headers['user-agent']
                  });
              if (err_venue_verification_log_fgqda) console.warn('[Supabase] Silent mutation failed in venue_verification_log:', err_venue_verification_log_fgqda.message);

              return res.status(400).json({
                  success: false, error: 'Invalid code',
                  attempts_remaining: MAX_VERIFICATION_ATTEMPTS - claim.verification_attempts - 1
              });
          }

          // Code is correct — move the claim to 'under_review'.
          //
          // We deliberately do NOT self-approve here: no venue_managers grant,
          // no poker_venues.is_claimed flip. A 4-digit code that is never
          // delivered to anyone (claim.js has a TODO where the send should be)
          // cannot be treated as proof of venue ownership, and approving on it
          // handed full venue management to whoever guessed 1 of 9,000 values.
          // An admin performs the actual approval + manager grant.
          const { error: err_venue_claims_92l5n } = await getSupabase()
            .from('venue_claims')
            .update({
                  status: 'under_review',
                  verified_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
              })
              .eq('id', claim_id);
          if (err_venue_claims_92l5n) {
              console.warn('[Supabase] Silent mutation failed in venue_claims:', err_venue_claims_92l5n.message);
              return res.status(500).json({ success: false, error: 'Failed to update claim status' });
          }

          // Log successful code verification
          const { error: err_venue_verification_log_ifam7 } = await getSupabase()
            .from('venue_verification_log')
            .insert({
                  claim_id,
                  venue_id: claim.venue_id,
                  action: 'code_verified',
                  performed_by: user.id,
                  details: { moved_to: 'under_review' },
                  ip_address: req.headers['x-forwarded-for'] || req.socket?.remoteAddress,
                  user_agent: req.headers['user-agent']
              });
          if (err_venue_verification_log_ifam7) console.warn('[Supabase] Silent mutation failed in venue_verification_log:', err_venue_verification_log_ifam7.message);

          return res.status(200).json({
              success: true,
              status: 'under_review',
              message: 'Code verified. Your claim is now under review — our team will confirm your connection to this venue and finish activating management access.',
              venue_id: claim.venue_id
          });

      } catch (error) {
          console.warn('Venue verify error:', error);
          return res.status(500).json({ success: false, error: 'Internal server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

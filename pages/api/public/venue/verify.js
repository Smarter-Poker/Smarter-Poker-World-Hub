/**
 * Venue Claim Verification API
 *
 * POST: Verify a claim with code
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

export default async function handler(req, res) {
  try {
    // CDN cache: fresh for 60s, serve stale up to 300s
    if (req.method === 'GET') {
      res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    }

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
          const { data: authData, error: authError } = await getSupabase().auth.getUser(token);
          const user = authData?.user;

          if (authError || !user) {
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

          if (claim.status === 'rejected') {
              return res.status(400).json({
                  success: false, error: 'Claim was rejected',
                  message: claim.rejection_reason || 'This claim was rejected. Please submit a new claim if you believe this is an error.'
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
          if (claim.verification_code !== verification_code.trim()) {
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

          // Code is correct - approve the claim
          // Update claim status
          const { error: err_venue_claims_92l5n } = await getSupabase()
            .from('venue_claims')
            .update({
                  status: 'approved',
                  verified_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
              })
              .eq('id', claim_id);
          if (err_venue_claims_92l5n) console.warn('[Supabase] Silent mutation failed in venue_claims:', err_venue_claims_92l5n.message);

          // Add user as venue manager
          const { error: err_venue_managers_taktp } = await getSupabase()
            .from('venue_managers')
            .upsert({
                  venue_id: claim.venue_id,
                  user_id: user.id,
                  role: 'owner',
                  can_edit_info: true,
                  can_edit_hours: true,
                  can_edit_games: true,
                  can_post_updates: true,
                  can_respond_reviews: true,
                  can_manage_promotions: true,
                  can_view_analytics: true,
                  can_invite_staff: true,
                  is_active: true,
                  approved_via: claim_id
              }, {
                  onConflict: 'venue_id,user_id'
              });
          if (err_venue_managers_taktp) console.warn('[Supabase] Silent mutation failed in venue_managers:', err_venue_managers_taktp.message);

          // Update venue as claimed
          const { error: err_poker_venues_4gted } = await getSupabase()
            .from('poker_venues')
            .update({
                  is_claimed: true,
                  claimed_by: user.id,
                  claimed_at: new Date().toISOString()
              })
              .eq('id', claim.venue_id);
          if (err_poker_venues_4gted) console.warn('[Supabase] Silent mutation failed in poker_venues:', err_poker_venues_4gted.message);

          // Log successful verification
          const { error: err_venue_verification_log_ifam7 } = await getSupabase()
            .from('venue_verification_log')
            .insert({
                  claim_id,
                  venue_id: claim.venue_id,
                  action: 'code_verified',
                  performed_by: user.id,
                  ip_address: req.headers['x-forwarded-for'] || req.socket?.remoteAddress,
                  user_agent: req.headers['user-agent']
              });
          if (err_venue_verification_log_ifam7) console.warn('[Supabase] Silent mutation failed in venue_verification_log:', err_venue_verification_log_ifam7.message);

          const { error: err_venue_verification_log_mz5zc } = await getSupabase()

            .from('venue_verification_log')

            .insert({
                  claim_id,
                  venue_id: claim.venue_id,
                  action: 'approved',
                  performed_by: user.id,
                  details: { method: 'self_verified' }
              });

          if (err_venue_verification_log_mz5zc) console.warn('[Supabase] Silent mutation failed in venue_verification_log:', err_venue_verification_log_mz5zc.message);

          return res.status(200).json({
              success: true,
              message: 'Venue claim verified successfully! You now have full access to manage this venue.',
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

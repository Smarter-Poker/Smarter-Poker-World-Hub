/**
 * Venue Claim Verification API
 *
 * POST: Verify a claim with code
 */

import { supabase } from '../../../../src/lib/supabase';
import { createClient } from '../../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../../src/lib/apiRateLimit';
import { getServerUser } from '../../../../src/lib/serverAuth';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const MAX_VERIFICATION_ATTEMPTS = 5;

export default async function handler(req, res) {
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
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);

        if (authError || !user) {
            return res.status(401).json({ success: false, error: 'Invalid or expired token' });
        }

        const { claim_id, verification_code } = req.body;

        if (!claim_id || !verification_code) {
            return res.status(400).json({
                success: false, error: 'Missing required fields',
                required: ['claim_id', 'verification_code']
            });
        }

        // Get the claim
        const { data: claim, error: claimError } = await supabaseAdmin
            .from('venue_claims')
            .select('*')
            .eq('id', claim_id)
            .eq('user_id', user.id)
            .single();

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
            await supabaseAdmin
                .from('venue_claims')
                .update({
                    status: 'rejected',
                    rejection_reason: 'Maximum verification attempts exceeded',
                    updated_at: new Date().toISOString()
                })
                .eq('id', claim_id);

            return res.status(400).json({
                success: false, error: 'Maximum attempts exceeded',
                message: 'You have exceeded the maximum number of verification attempts. Please submit a new claim.'
            });
        }

        // Increment attempt counter
        await supabaseAdmin
            .from('venue_claims')
            .update({
                verification_attempts: claim.verification_attempts + 1,
                updated_at: new Date().toISOString()
            })
            .eq('id', claim_id);

        // Verify the code
        if (claim.verification_code !== verification_code.trim()) {
            // Log failed attempt
            await supabaseAdmin
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

            return res.status(400).json({
                success: false, error: 'Invalid code',
                attempts_remaining: MAX_VERIFICATION_ATTEMPTS - claim.verification_attempts - 1
            });
        }

        // Code is correct - approve the claim
        // Update claim status
        await supabaseAdmin
            .from('venue_claims')
            .update({
                status: 'approved',
                verified_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .eq('id', claim_id);

        // Add user as venue manager
        await supabaseAdmin
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

        // Update venue as claimed
        await supabaseAdmin
            .from('poker_venues')
            .update({
                is_claimed: true,
                claimed_by: user.id,
                claimed_at: new Date().toISOString()
            })
            .eq('id', claim.venue_id);

        // Log successful verification
        await supabaseAdmin
            .from('venue_verification_log')
            .insert({
                claim_id,
                venue_id: claim.venue_id,
                action: 'code_verified',
                performed_by: user.id,
                ip_address: req.headers['x-forwarded-for'] || req.socket?.remoteAddress,
                user_agent: req.headers['user-agent']
            });

        await supabaseAdmin
            .from('venue_verification_log')
            .insert({
                claim_id,
                venue_id: claim.venue_id,
                action: 'approved',
                performed_by: user.id,
                details: { method: 'self_verified' }
            });

        return res.status(200).json({
            success: true,
            message: 'Venue claim verified successfully! You now have full access to manage this venue.',
            venue_id: claim.venue_id
        });

    } catch (error) {
        console.error('Venue verify error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

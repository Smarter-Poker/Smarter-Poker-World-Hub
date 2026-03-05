/**
 * Venue Claim API
 *
 * POST: Submit a venue ownership claim
 * GET: Check claim status for a venue
 */

import { supabase } from '../../../../src/lib/supabase';
import { createClient } from '@supabase/supabase-js';
import { applyRateLimit, LIMITS } from '../../../../src/lib/apiRateLimit';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Generate a 4-digit verification code
function generateVerificationCode() {
    return Math.floor(1000 + Math.random() * 9000).toString();
}

export default async function handler(req, res) {
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }

    if (req.method === 'GET') {
        return handleGet(req, res);
    } else if (req.method === 'POST') {
        return handlePost(req, res);
    }

    return res.status(405).json({ error: 'Method not allowed' });
}

async function handleGet(req, res) {
    try {
        const { venue_id } = req.query;

        if (!venue_id) {
            return res.status(400).json({ error: 'venue_id required' });
        }

        // Get auth user
        const authHeader = req.headers.authorization;
        let userId = null;

        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.replace('Bearer ', '');
            const { data: { user } } = await supabase.auth.getUser(token);
            userId = user?.id;
        }

        // Check if venue is claimed
        const { data: venue, error: venueError } = await supabaseAdmin
            .from('poker_venues')
            .select('id, name, is_claimed, claimed_at')
            .eq('id', parseInt(venue_id))
            .single();

        if (venueError || !venue) {
            return res.status(404).json({ error: 'Venue not found' });
        }

        // Get user's claim status if logged in
        let userClaim = null;
        if (userId) {
            const { data: claim } = await supabaseAdmin
                .from('venue_claims')
                .select('id, status, created_at, updated_at')
                .eq('venue_id', parseInt(venue_id))
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            userClaim = claim;
        }

        // Check if user is a manager
        let isManager = false;
        if (userId) {
            const { data: manager } = await supabaseAdmin
                .from('venue_managers')
                .select('id, role')
                .eq('venue_id', parseInt(venue_id))
                .eq('user_id', userId)
                .eq('is_active', true)
                .single();

            isManager = !!manager;
        }

        return res.status(200).json({
            venue_id: venue.id,
            venue_name: venue.name,
            is_claimed: venue.is_claimed,
            claimed_at: venue.claimed_at,
            user_claim: userClaim,
            is_manager: isManager
        });

    } catch (error) {
        console.error('Venue claim GET error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}

async function handlePost(req, res) {
    try {
        // Get auth user
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);

        if (authError || !user) {
            return res.status(401).json({ error: 'Invalid or expired token' });
        }

        const {
            venue_id,
            claimant_name,
            claimant_title,
            claimant_email,
            claimant_phone,
            verification_method = 'email',
            notes
        } = req.body;

        // Validate required fields
        if (!venue_id || !claimant_name || !claimant_email) {
            return res.status(400).json({
                error: 'Missing required fields',
                required: ['venue_id', 'claimant_name', 'claimant_email']
            });
        }

        // Check venue exists
        const { data: venue, error: venueError } = await supabaseAdmin
            .from('poker_venues')
            .select('id, name, is_claimed, phone')
            .eq('id', parseInt(venue_id))
            .single();

        if (venueError || !venue) {
            return res.status(404).json({ error: 'Venue not found' });
        }

        // Check if venue is already claimed
        if (venue.is_claimed) {
            return res.status(400).json({
                error: 'Venue already claimed',
                message: 'This venue has already been claimed by another user. Contact support if you believe this is an error.'
            });
        }

        // Check for existing pending claim by this user
        const { data: existingClaim } = await supabaseAdmin
            .from('venue_claims')
            .select('id, status')
            .eq('venue_id', parseInt(venue_id))
            .eq('user_id', user.id)
            .in('status', ['pending', 'under_review'])
            .single();

        if (existingClaim) {
            return res.status(400).json({
                error: 'Claim already submitted',
                claim_id: existingClaim.id,
                status: existingClaim.status
            });
        }

        // Generate verification code
        const verificationCode = generateVerificationCode();

        // Create the claim
        const { data: claim, error: claimError } = await supabaseAdmin
            .from('venue_claims')
            .insert({
                venue_id: parseInt(venue_id),
                user_id: user.id,
                status: 'pending',
                verification_method,
                claimant_name,
                claimant_title,
                claimant_email,
                claimant_phone,
                verification_code: verificationCode,
                claimant_notes: notes
            })
            .select()
            .single();

        if (claimError) {
            console.error('Error creating claim:', claimError);
            return res.status(500).json({ error: 'Failed to create claim' });
        }

        // Log the claim submission
        await supabaseAdmin
            .from('venue_verification_log')
            .insert({
                claim_id: claim.id,
                venue_id: parseInt(venue_id),
                action: 'claim_submitted',
                performed_by: user.id,
                details: {
                    verification_method,
                    claimant_email
                },
                ip_address: req.headers['x-forwarded-for'] || req.socket?.remoteAddress,
                user_agent: req.headers['user-agent']
            });

        // TODO: Send verification code via email/phone based on method
        // For now, we'll return success and let admin handle verification
        // In production:
        // - If method is 'email': Send email with code
        // - If method is 'phone': Send SMS with code
        // - If method is 'document': Direct to document upload

        return res.status(201).json({
            success: true,
            claim_id: claim.id,
            status: claim.status,
            verification_method,
            message: `Claim submitted successfully. ${verification_method === 'email'
                ? 'Check your email for verification instructions.'
                : verification_method === 'phone'
                    ? 'You will receive an SMS with a verification code.'
                    : 'Our team will review your claim within 1-2 business days.'
                }`,
            // In development, include the code for testing
            ...(process.env.NODE_ENV === 'development' ? { verification_code: verificationCode } : {})
        });

    } catch (error) {
        console.error('Venue claim POST error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}

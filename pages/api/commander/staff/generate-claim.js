/**
 * Generate Claim Code API — POST /api/commander/staff/generate-claim
 * Owner/manager generates a claim code for a staff member
 * Employee uses this code to link their Smarter.Poker account
 */
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { verifyManagerSession } from '../../../../src/lib/commander/auth';
import { applyRateLimit, LIMITS } from '../../../../src/lib/apiRateLimit';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    try {
        const { venue_id, staff_id } = req.body;

        if (!venue_id || !staff_id) {
            return res.status(400).json({ success: false, error: 'venue_id and staff_id required' });
        }

        // Require owner or manager auth
        const authResult = await verifyManagerSession(req, venue_id);
        if (authResult.error) {
            return res.status(authResult.error.status).json({
                success: false,
                error: authResult.error.message,
            });
        }

        // Verify staff exists at this venue
        const { data: staff, error: staffErr } = await supabase
            .from('commander_staff')
            .select('id, display_name, role, linked_user_id, email')
            .eq('id', staff_id)
            .eq('venue_id', venue_id)
            .eq('is_active', true)
            .single();

        if (staffErr || !staff) {
            return res.status(404).json({ success: false, error: 'Staff member not found' });
        }

        if (staff.linked_user_id) {
            return res.status(400).json({
                success: false,
                error: 'This staff member is already linked to a Smarter.Poker account',
            });
        }

        // Invalidate any existing unclaimed tokens for this staff member
        await supabase
            .from('staff_claim_tokens')
            .update({ expires_at: new Date().toISOString() })
            .eq('staff_id', staff_id)
            .is('claimed_by', null);

        // Generate a unique 6-character alphanumeric code
        const token = crypto.randomBytes(4).toString('hex').substring(0, 6).toUpperCase();

        const { data: claim, error: insertErr } = await supabase
            .from('staff_claim_tokens')
            .insert({
                venue_id,
                staff_id,
                token,
                expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            })
            .select()
            .single();

        if (insertErr) {
            console.error('Generate claim error:', insertErr);
            return res.status(500).json({ success: false, error: 'Failed to generate claim code' });
        }

        // Get venue name for the claim URL display
        const { data: venue } = await supabase
            .from('poker_venues')
            .select('name')
            .eq('id', venue_id)
            .single();

        return res.status(201).json({
            success: true,
            data: {
                token: claim.token,
                expires_at: claim.expires_at,
                claim_url: `https://smarter.poker/claim/${claim.token}`,
                staff_name: staff.display_name,
                venue_name: venue?.name || 'Unknown Venue',
            },
        });
    } catch (err) {
        console.error('Generate claim code error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

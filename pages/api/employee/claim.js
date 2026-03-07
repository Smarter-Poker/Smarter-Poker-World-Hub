/**
 * Employee Claim API — POST /api/employee/claim
 * Authenticated hub user claims a code to link their account to a venue staff record
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { getServerUser } from '../../../src/lib/serverAuth';

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
        // Authenticate the hub user
        const token = (req.headers.authorization || '').replace('Bearer ', '');
        if (!token) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
        if (authErr || !user) {
            return res.status(401).json({ success: false, error: 'Invalid session' });
        }

        const { code } = req.body;
        if (!code || code.length < 4) {
            return res.status(400).json({ success: false, error: 'Valid claim code required' });
        }

        // Find the claim token
        const { data: claim, error: claimErr } = await supabase
            .from('staff_claim_tokens')
            .select('*')
            .eq('token', code.toUpperCase().trim())
            .single();

        if (claimErr || !claim) {
            return res.status(404).json({ success: false, error: 'Invalid claim code' });
        }

        // Check if already claimed
        if (claim.claimed_by) {
            return res.status(400).json({ success: false, error: 'This code has already been used' });
        }

        // Check expiry
        if (new Date(claim.expires_at) < new Date()) {
            return res.status(400).json({ success: false, error: 'This code has expired. Ask your manager for a new one.' });
        }

        // Check if staff is already linked to someone else
        const { data: staff } = await supabase
            .from('commander_staff')
            .select('id, display_name, role, linked_user_id, venue_id')
            .eq('id', claim.staff_id)
            .maybeSingle();

        if (!staff) {
            return res.status(404).json({ success: false, error: 'Staff record not found' });
        }

        if (staff.linked_user_id && staff.linked_user_id !== user.id) {
            return res.status(400).json({ success: false, error: 'This staff position is already linked to another account' });
        }

        // Check if this user is already linked as staff at this venue
        const { data: existingLink } = await supabase
            .from('commander_staff')
            .select('id')
            .eq('venue_id', staff.venue_id)
            .eq('linked_user_id', user.id)
            .eq('is_active', true)
            .limit(1);

        if (existingLink?.length > 0) {
            return res.status(400).json({ success: false, error: 'You are already linked to this venue' });
        }

        // Link the account
        const { error: updateErr } = await supabase
            .from('commander_staff')
            .update({ linked_user_id: user.id })
            .eq('id', claim.staff_id);

        if (updateErr) {
            console.error('Link staff error:', updateErr);
            return res.status(500).json({ success: false, error: 'Failed to link account' });
        }

        // Mark token as claimed
        await supabase
            .from('staff_claim_tokens')
            .update({ claimed_by: user.id, claimed_at: new Date().toISOString() })
            .eq('id', claim.id);

        // Get venue name
        const { data: venue } = await supabase
            .from('poker_venues')
            .select('name')
            .eq('id', staff.venue_id)
            .maybeSingle();

        return res.status(200).json({
            success: true,
            data: {
                staff_name: staff.display_name,
                venue_name: venue?.name || 'Unknown Venue',
                role: staff.role,
                message: `Account linked! You are now connected as ${staff.display_name} (${staff.role}) at ${venue?.name || 'this venue'}.`,
            },
        });
    } catch (err) {
        console.error('Employee claim error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

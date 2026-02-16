/**
 * Dealer Scan-In API
 * POST /api/commander/dealer/scan-in
 * 
 * When a dealer scans their member card QR at a table tablet,
 * this endpoint assigns them to that table.
 * 
 * - Looks up the member by qr_code
 * - Verifies member_type = 'employee'
 * - Ends any current dealer rotation for this table
 * - Creates a new commander_dealer_rotations row
 * 
 * Body: { qr_code, table_number, venue_id }
 * 
 * No auth guard — tablet is unauthenticated (same as player view).
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    const { qr_code, table_number, venue_id } = req.body;

    if (!qr_code || !table_number) {
        return res.status(400).json({
            success: false,
            error: 'qr_code and table_number are required'
        });
    }

    try {
        // Extract QR code if it's a URL
        let lookupCode = qr_code;
        if (qr_code.includes('/check-in/')) {
            const parts = qr_code.split('/');
            lookupCode = parts[parts.length - 1];
        }

        // Look up member by QR code
        let query = supabase
            .from('commander_members')
            .select('*')
            .or(`qr_code.eq.${lookupCode},member_number.eq.${lookupCode}`);

        if (venue_id) {
            query = query.eq('venue_id', venue_id);
        }

        const { data: members, error: memberError } = await query.limit(1);

        if (memberError) throw memberError;

        const member = members?.[0];
        if (!member) {
            return res.status(404).json({
                success: false,
                error: 'Employee not found. QR code not recognized.'
            });
        }

        // Verify this is an employee (dealer/staff), not a player
        if (member.member_type !== 'employee' && member.member_type !== 'admin') {
            return res.status(403).json({
                success: false,
                error: 'This card belongs to a player, not an employee. Only employees can scan in as dealer.'
            });
        }

        // Check membership is active
        if (member.membership_status === 'suspended' || member.membership_status === 'banned') {
            return res.status(403).json({
                success: false,
                error: 'Employee account is suspended or banned.'
            });
        }

        const dealerName = `${member.first_name} ${member.last_name}`.trim();
        const tableNum = parseInt(table_number);
        const venueId = venue_id || member.venue_id;

        // End any current dealer rotation for this table
        await supabase
            .from('commander_dealer_rotations')
            .update({ ended_at: new Date().toISOString() })
            .eq('venue_id', venueId)
            .eq('table_number', tableNum)
            .is('ended_at', null);

        // Also end any current rotation for this dealer (if they were at another table)
        await supabase
            .from('commander_dealer_rotations')
            .update({ ended_at: new Date().toISOString() })
            .eq('dealer_id', member.id)
            .is('ended_at', null);

        // Create new rotation assignment
        const { data: rotation, error: rotationError } = await supabase
            .from('commander_dealer_rotations')
            .insert({
                venue_id: venueId,
                dealer_id: member.id,
                dealer_name: dealerName,
                table_number: tableNum,
                rotation_date: new Date().toISOString().split('T')[0],
                started_at: new Date().toISOString()
            })
            .select()
            .single();

        if (rotationError) throw rotationError;

        // Update member's last visit
        await supabase
            .from('commander_members')
            .update({
                last_visit: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .eq('id', member.id);

        return res.status(200).json({
            success: true,
            data: {
                dealer: {
                    id: member.id,
                    first_name: member.first_name,
                    last_name: member.last_name,
                    name: dealerName,
                    member_number: member.member_number,
                    photo_url: member.photo_url,
                    member_type: member.member_type
                },
                rotation_id: rotation.id,
                table_number: tableNum,
                started_at: rotation.started_at,
                message: `${dealerName} is now dealing at Table ${tableNum}`
            }
        });
    } catch (err) {
        console.error('Dealer scan-in error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
}

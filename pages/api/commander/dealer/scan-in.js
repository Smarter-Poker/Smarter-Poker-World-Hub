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

        // Look up member by QR code first, then by member number
        let member = null;

        const { data: byQr, error: qrError } = await supabase
            .from('commander_members')
            .select('*')
            .eq('qr_code', lookupCode)
            .limit(1);

        if (qrError) throw qrError;
        member = byQr?.[0];

        // If not found by QR code, try member number
        if (!member) {
            let mnQuery = supabase
                .from('commander_members')
                .select('*')
                .eq('member_number', lookupCode);
            if (venue_id) mnQuery = mnQuery.eq('venue_id', venue_id);
            const { data: byMn, error: mnError } = await mnQuery.limit(1);
            if (mnError) throw mnError;
            member = byMn?.[0];
        }

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

        // Resolve the dealer record in commander_dealers (FK target)
        // Try to find by name match or staff linkage
        let dealerId = null;
        const { data: existingDealer } = await supabase
            .from('commander_dealers')
            .select('id')
            .eq('venue_id', venueId)
            .ilike('name', `%${member.first_name}%${member.last_name}%`)
            .limit(1);

        if (existingDealer?.[0]) {
            dealerId = existingDealer[0].id;
        } else {
            // Also try matching by first + last name parts
            const { data: nameMatch } = await supabase
                .from('commander_dealers')
                .select('id, name')
                .eq('venue_id', venueId);

            const matched = (nameMatch || []).find(d => {
                const dName = (d.name || '').toLowerCase();
                return dName.includes(member.first_name.toLowerCase()) &&
                    dName.includes(member.last_name.toLowerCase());
            });

            if (matched) {
                dealerId = matched.id;
            } else {
                // Create a new commander_dealers record
                const { data: newDealer, error: createErr } = await supabase
                    .from('commander_dealers')
                    .insert({
                        venue_id: venueId,
                        name: dealerName,
                        employee_id: member.member_number || `DLR-${Date.now()}`,
                        is_active: true,
                    })
                    .select('id')
                    .single();

                if (createErr) {
                    console.error('Failed to create dealer record:', createErr.message);
                    // Try without employee_id
                    const { data: nd2 } = await supabase
                        .from('commander_dealers')
                        .insert({
                            venue_id: venueId,
                            name: dealerName,
                            is_active: true,
                        })
                        .select('id')
                        .single();
                    dealerId = nd2?.id;
                } else {
                    dealerId = newDealer.id;
                }
            }
        }

        if (!dealerId) {
            return res.status(500).json({ success: false, error: 'Could not resolve dealer record' });
        }

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
            .eq('dealer_id', dealerId)
            .is('ended_at', null);

        // Create new rotation assignment
        const { data: rotation, error: rotationError } = await supabase
            .from('commander_dealer_rotations')
            .insert({
                venue_id: venueId,
                dealer_id: dealerId,
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
                    member_type: member.member_type,
                    started_at: rotation.started_at
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

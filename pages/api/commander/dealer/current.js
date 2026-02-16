/**
 * Current Table Dealer API
 * GET /api/commander/dealer/current?table=X&venue_id=Y
 * 
 * Returns the current dealer assigned to a specific table.
 * Used by the table tablet display to show the active dealer.
 * 
 * No auth required — tablet is unauthenticated.
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    const { table, venue_id } = req.query;

    if (!table) {
        return res.status(400).json({ success: false, error: 'table is required' });
    }

    try {
        let query = supabase
            .from('commander_dealer_rotations')
            .select('id, dealer_id, dealer_name, table_number, started_at')
            .eq('table_number', parseInt(table))
            .is('ended_at', null)
            .order('started_at', { ascending: false })
            .limit(1);

        if (venue_id) {
            query = query.eq('venue_id', venue_id);
        }

        const { data, error } = await query;

        if (error) throw error;

        const rotation = data?.[0] || null;

        if (!rotation) {
            return res.status(200).json({
                success: true,
                data: { dealer: null, message: 'No dealer assigned' }
            });
        }

        // Get dealer member details if available
        let dealerDetails = null;
        if (rotation.dealer_id) {
            const { data: member } = await supabase
                .from('commander_members')
                .select('id, first_name, last_name, photo_url, member_number')
                .eq('id', rotation.dealer_id)
                .single();
            dealerDetails = member;
        }

        return res.status(200).json({
            success: true,
            data: {
                dealer: {
                    id: rotation.dealer_id,
                    name: rotation.dealer_name,
                    photo_url: dealerDetails?.photo_url || null,
                    member_number: dealerDetails?.member_number || null,
                    started_at: rotation.started_at,
                    rotation_id: rotation.id
                }
            }
        });
    } catch (err) {
        console.error('Get current dealer error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
}

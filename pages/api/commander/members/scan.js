/**
 * Commander Member QR Scan API
 * POST: Look up a member by their QR code
 * Used when scanning a player's club card at tables, tournaments, etc.
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { qr_code, venue_id } = req.body;

    if (!qr_code) {
        return res.status(400).json({ success: false, error: 'qr_code is required' });
    }

    let query = supabase
        .from('commander_members')
        .select('*')
        .eq('qr_code', qr_code);

    if (venue_id) {
        query = query.eq('venue_id', venue_id);
    }

    const { data: members, error } = await query.limit(1);

    if (error) {
        console.error('QR scan error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }

    const member = members?.[0];

    if (!member) {
        return res.status(404).json({ success: false, error: 'Member not found' });
    }

    // Update last visit and increment visit count
    await supabase
        .from('commander_members')
        .update({
            last_visit: new Date().toISOString(),
            total_visits: (member.total_visits || 0) + 1,
            updated_at: new Date().toISOString(),
        })
        .eq('id', member.id);

    return res.status(200).json({
        success: true,
        data: {
            member: {
                ...member,
                last_visit: new Date().toISOString(),
                total_visits: (member.total_visits || 0) + 1,
            },
        },
    });
}

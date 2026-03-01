/**
 * Commander Floor Call API - POST /api/commander/floor-call
 * Creates a floor call alert that broadcasts to all Commander screens in real-time
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    try {
        const { venue_id, table_number, table_name } = req.body;

        if (!venue_id || !table_number) {
            return res.status(400).json({ success: false, error: 'venue_id and table_number are required' });
        }

        // Check for existing active call from same table (prevent spam)
        const { data: existing } = await supabase
            .from('commander_floor_calls')
            .select('id, created_at')
            .eq('venue_id', venue_id)
            .eq('table_number', table_number)
            .eq('status', 'active')
            .limit(1);

        if (existing && existing.length > 0) {
            const age = (Date.now() - new Date(existing[0].created_at).getTime()) / 1000;
            if (age < 60) {
                return res.status(200).json({
                    success: true,
                    data: { id: existing[0].id, already_active: true, message: 'Floor call already active' }
                });
            }
            // Resolve old call
            await supabase
                .from('commander_floor_calls')
                .update({ status: 'resolved', resolved_at: new Date().toISOString() })
                .eq('id', existing[0].id);
        }

        // Create new floor call
        const { data: call, error } = await supabase
            .from('commander_floor_calls')
            .insert({
                venue_id,
                table_number,
                table_name: table_name || `Table ${table_number}`,
                status: 'active',
            })
            .select()
            .single();

        if (error) {
            console.error('Floor call create error:', error);
            return res.status(500).json({ success: false, error: 'Failed to create floor call' });
        }

        return res.status(200).json({
            success: true,
            data: { id: call.id, table_number, table_name: call.table_name }
        });
    } catch (error) {
        console.error('Floor call error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

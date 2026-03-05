/**
 * Tablet Heartbeat API
 * POST /api/commander/displays/heartbeat
 *
 * Tablets ping this every 30s so the admin knows which are online.
 * Auto-registers the device in commander_table_displays on first heartbeat.
 */
import { createClient } from '@supabase/supabase-js';
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

    const { table_number, venue_id, device_type = 'tablet' } = req.body;

    if (!table_number || !venue_id) {
        return res.status(400).json({ success: false, error: 'table_number and venue_id required' });
    }

    try {
        // Generate a deterministic device_id from venue + table
        const deviceId = `tablet-${venue_id}-table-${table_number}`;
        const now = new Date().toISOString();

        // Upsert: create if not exists, update heartbeat if it does
        const { error } = await supabase
            .from('commander_table_displays')
            .upsert({
                device_id: deviceId,
                venue_id,
                device_name: `Table ${table_number} Tablet`,
                device_type,
                is_online: true,
                last_heartbeat: now,
                updated_at: now,
            }, {
                onConflict: 'device_id',
                ignoreDuplicates: false,
            });

        if (error) {
            // If upsert fails (e.g. table doesn't exist), try plain insert
        }

        return res.status(200).json({ success: true, timestamp: now });

    } catch (err) {
        console.error('Heartbeat error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
}

/**
 * QR Code Scan Tracking API
 * Records when a player scans a venue QR code for check-in
 */
import { createClient } from '@supabase/supabase-js';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }

    if (req.method === 'POST') {
        const { venue_id, user_id, scan_type } = req.body;

        if (!venue_id) {
            return res.status(400).json({ success: false, error: 'venue_id is required' });
        }

        const { data, error } = await supabase
            .from('qr_code_scans')
            .insert({
                venue_id: venue_id,
                scanned_by: user_id || null,
                scan_type: scan_type || 'check-in',
                ip_address: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || null,
                user_agent: req.headers['user-agent'] || null,
            })
            .select()
            .single();

        if (error) {
            return res.status(500).json({ success: false, error: error.message });
        }

        return res.status(200).json({ success: true, scan: data });
    }

    if (req.method === 'GET') {
        const { venue_id, days } = req.query;

        if (!venue_id) {
            return res.status(400).json({ success: false, error: 'venue_id is required' });
        }

        const since = new Date();
        since.setDate(since.getDate() - (parseInt(days) || 30));

        const { data, error, count } = await supabase
            .from('qr_code_scans')
            .select('*', { count: 'exact' })
            .eq('venue_id', venue_id)
            .gte('scanned_at', since.toISOString())
            .order('scanned_at', { ascending: false })
            .limit(100);

        if (error) {
            return res.status(500).json({ success: false, error: error.message });
        }

        return res.status(200).json({ success: true, scans: data, total: count });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
}

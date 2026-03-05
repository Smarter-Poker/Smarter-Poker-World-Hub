/**
 * Employee Time Entries API — GET /api/employee/time-entries
 * Returns clock in/out history from commander_time_clock
 * Query: ?staff_id=X&venue_id=Y&date_from=&date_to=
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

    try {
        const token = (req.headers.authorization || '').replace('Bearer ', '');
        if (!token) return res.status(401).json({ success: false, error: 'Auth required' });

        const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
        if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid session' });

        const { staff_id, venue_id, date_from, date_to } = req.query;
        if (!staff_id || !venue_id) {
            return res.status(400).json({ success: false, error: 'staff_id and venue_id required' });
        }

        // Verify ownership
        const { data: staff } = await supabase
            .from('commander_staff')
            .select('id, display_name, role')
            .eq('id', staff_id)
            .eq('venue_id', venue_id)
            .eq('linked_user_id', user.id)
            .single();

        if (!staff) {
            return res.status(403).json({ success: false, error: 'Access denied' });
        }

        // Default: last 30 days
        const from = date_from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const to = date_to ? `${date_to}T23:59:59.999Z` : new Date().toISOString();

        const { data: entries, error } = await supabase
            .from('commander_time_clock')
            .select('*')
            .eq('staff_id', staff_id)
            .eq('venue_id', venue_id)
            .gte('clock_in', from)
            .lte('clock_in', to)
            .order('clock_in', { ascending: false })
                .limit(100);

        if (error) throw error;

        // Calculate stats
        const records = entries || [];
        let totalHours = 0;
        let daysWorked = new Set();
        let currentlyOnShift = false;

        records.forEach(e => {
            if (e.hours_worked) {
                totalHours += parseFloat(e.hours_worked);
            }
            if (e.clock_in) {
                daysWorked.add(new Date(e.clock_in).toISOString().split('T')[0]);
            }
            if (!e.clock_out) {
                currentlyOnShift = true;
            }
        });

        return res.status(200).json({
            success: true,
            data: {
                entries: records,
                stats: {
                    total_entries: records.length,
                    total_hours: Math.round(totalHours * 100) / 100,
                    days_worked: daysWorked.size,
                    currently_on_shift: currentlyOnShift,
                    avg_hours_per_shift: records.length > 0
                        ? Math.round((totalHours / records.length) * 100) / 100
                        : 0,
                },
            },
        });
    } catch (err) {
        console.error('Employee time entries error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

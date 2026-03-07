/**
 * Employee Downs API — GET /api/employee/downs
 * Returns dealing history (cash game + tournament table assignments)
 * Query: ?staff_id=X&venue_id=Y&date_from=&date_to=
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { getServerUser } from '../../../src/lib/serverAuth';

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

        // Default date range: last 30 days
        const from = date_from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const to = date_to || new Date().toISOString().split('T')[0];

        // Fetch dealer rotations (downs)
        let query = supabase
            .from('commander_dealer_rotations')
            .select('*')
            .eq('venue_id', venue_id)
            .eq('dealer_id', staff_id)
            .gte('started_at', `${from}T00:00:00`)
            .lte('started_at', `${to}T23:59:59`)
            .order('started_at', { ascending: false })
                .limit(100);

        const { data: rotations, error: rotErr } = await query;
        if (rotErr) throw rotErr;

        // Check for currently active dealing assignments (open rotations)
        const { data: activeRotations } = await supabase
            .from('commander_dealer_rotations')
            .select('id, table_number, started_at')
            .eq('venue_id', venue_id)
            .eq('dealer_id', staff_id)
            .is('ended_at', null);

        const activeTables = (activeRotations || []).map(r => ({
            id: r.id,
            table_number: r.table_number,
            game_type: null,
        }));

        // Calculate stats
        const downs = rotations || [];
        let totalMinutes = 0;
        let cashDowns = 0;
        let tournamentDowns = 0;

        downs.forEach(d => {
            if (d.started_at && d.ended_at) {
                const start = new Date(d.started_at);
                const end = new Date(d.ended_at);
                totalMinutes += (end - start) / 60000;
            }
            // Classify by table type if available
            if (d.table_number && d.table_number.toString().startsWith('T')) {
                tournamentDowns++;
            } else {
                cashDowns++;
            }
        });

        return res.status(200).json({
            success: true,
            data: {
                downs,
                active_tables: activeTables || [],
                stats: {
                    total_downs: downs.length,
                    cash_downs: cashDowns,
                    tournament_downs: tournamentDowns,
                    total_hours_on_table: Math.round((totalMinutes / 60) * 100) / 100,
                    date_range: { from, to },
                },
            },
        });
    } catch (err) {
        console.error('Employee downs error:', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

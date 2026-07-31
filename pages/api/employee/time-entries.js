import { getServerUserWithFallback } from '../../src/lib/serverAuth';
/**
 * Employee Time Entries API — GET /api/employee/time-entries
 * Returns clock in/out history from commander_time_clock
 * Query: ?staff_id=X&venue_id=Y&date_from=&date_to=
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../src/lib/sentryWrap';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

export default async function handler(req, res) {
  try {
      if (req.method !== 'GET') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      try {
          const token = (req.headers.authorization || '').replace('Bearer ', '');
          if (!token) return res.status(401).json({ success: false, error: 'Auth required' });

          const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
          const user = authData?.user;
          if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid session' });

          const { staff_id, venue_id, date_from, date_to } = req.query;
          if (!staff_id || !venue_id) {
              return res.status(400).json({ success: false, error: 'staff_id and venue_id required' });
          }

          // Verify ownership
          const { data: staff } = await getSupabase()
              .from('commander_staff')
              .select('id, display_name, role')
              .eq('id', staff_id)
              .eq('venue_id', venue_id)
              .eq('linked_user_id', user.id)
              .maybeSingle();

          if (!staff) {
              return res.status(403).json({ success: false, error: 'Access denied' });
          }

          // Default: last 30 days
          const from = date_from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
          const to = date_to ? `${date_to}T23:59:59.999Z` : new Date().toISOString();

          const { data: entries, error } = await getSupabase()
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
          console.warn('Employee time entries error:', err);
          return res.status(500).json({ success: false, error: 'Internal server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

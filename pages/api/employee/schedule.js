import { getServerUserWithFallback } from '../../src/lib/serverAuth';
/**
 * Employee Schedule API — GET /api/employee/schedule
 * Returns the published shift schedule for a linked staff member
 * Query: ?staff_id=X&venue_id=Y&week=2026-03-02
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

function getWeekBounds(dateStr) {
    const d = dateStr ? new Date(dateStr) : new Date();
    const day = d.getDay();
    const start = new Date(d);
    start.setDate(d.getDate() - day);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return { start, end };
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

          const { staff_id, venue_id, week } = req.query;
          if (!staff_id || !venue_id) {
              return res.status(400).json({ success: false, error: 'staff_id and venue_id required' });
          }

          // Verify this staff record belongs to the authenticated user
          const { data: staff } = await getSupabase()
              .from('commander_staff')
              .select('id, display_name, role')
              .eq('id', staff_id)
              .eq('venue_id', venue_id)
              .eq('linked_user_id', user.id)
              .maybeSingle();

          if (!staff) {
              return res.status(403).json({ success: false, error: 'Access denied — not your staff record' });
          }

          const { start, end } = getWeekBounds(week);

          // Fetch shifts for this staff member in the date range
          const { data: shifts, error: shiftErr } = await getSupabase()
              .from('commander_staff_shifts')
              .select('*')
              .eq('staff_id', staff_id)
              .eq('venue_id', venue_id)
              .gte('shift_date', start.toISOString().split('T')[0])
              .lte('shift_date', end.toISOString().split('T')[0])
              .order('shift_date', { ascending: true })
                  .limit(100);

          if (shiftErr) throw shiftErr;

          // Calculate total hours for the week
          const totalHours = (shifts || []).reduce((sum, s) => {
              if (s.start_time && s.end_time) {
                  const [sh, sm] = s.start_time.split(':').map(Number);
                  const [eh, em] = s.end_time.split(':').map(Number);
                  let hours = (eh * 60 + em - sh * 60 - sm) / 60;
                  if (hours < 0) hours += 24; // overnight shift
                  return sum + hours;
              }
              return sum;
          }, 0);

          return res.status(200).json({
              success: true,
              data: {
                  shifts: shifts || [],
                  week_start: start.toISOString().split('T')[0],
                  week_end: end.toISOString().split('T')[0],
                  total_shifts: (shifts || []).length,
                  total_hours: Math.round(totalHours * 100) / 100,
              },
          });
      } catch (err) {
          console.warn('Employee schedule error:', err);
          return res.status(500).json({ success: false, error: 'Internal server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

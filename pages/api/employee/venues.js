/**
 * Employee Venues API — GET /api/employee/venues
 * Returns all venues where the authenticated user is linked as staff
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

          // Find all staff records linked to this user
          const { data: staffRecords, error } = await getSupabase()
              .from('commander_staff')
              .select('id, venue_id, display_name, role, is_active, email, phone, created_at')
              .eq('linked_user_id', user.id)
              .order('created_at', { ascending: false })
                  .limit(100);

          if (error) throw error;

          if (!staffRecords?.length) {
              return res.status(200).json({ success: true, data: { venues: [] } });
          }

          // Enrich with venue names and logos
          const venueIds = [...new Set(staffRecords.map(s => s.venue_id))];
          const { data: venues } = await getSupabase()
              .from('poker_venues')
              .select('id, name, logo_url, city, state')
              .in('id', venueIds)
                  .limit(100);

          const venueMap = Object.fromEntries((venues || []).map(v => [v.id, v]));

          const enriched = staffRecords.map(s => ({
              staff_id: s.id,
              venue_id: s.venue_id,
              venue_name: venueMap[s.venue_id]?.name || 'Unknown Venue',
              venue_logo: venueMap[s.venue_id]?.logo_url || null,
              venue_city: venueMap[s.venue_id]?.city || null,
              venue_state: venueMap[s.venue_id]?.state || null,
              display_name: s.display_name,
              role: s.role,
              is_active: s.is_active,
              joined_at: s.created_at,
          }));

          return res.status(200).json({ success: true, data: { venues: enriched } });
      } catch (err) {
          console.warn('Employee venues error:', err);
          return res.status(500).json({ success: false, error: 'Internal server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

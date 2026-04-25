/**
 * Upcoming Events API (Poker Near Me preview)
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../src/lib/sentryWrap';

export const runtime = 'edge';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

// Fallback data when DB unavailable
const FALLBACK_EVENTS = [
    { id: 1, name: "WSOP Main Event", event_date: "2026-06-27", location: "Las Vegas" },
    { id: 2, name: "EPT Barcelona", event_date: "2026-08-14", location: "Barcelona" },
    { id: 3, name: "WPT Championship", event_date: "2026-12-01", location: "Las Vegas" }
];

export default async function handler(req, res) {
  try {
      if (req.method !== 'GET') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      try {
          const { limit = 5, featured } = req.query;

          let query = getSupabase()
              .from('poker_events')
              .select('*')
              .gte('event_date', new Date().toISOString().split('T')[0])
              .order('event_date', { ascending: true })
              .limit(parseInt(limit));

          if (featured === 'true') {
              query = query.eq('is_featured', true);
          }

          const { data, error } = await query;

          if (error || !data?.length) {
              return res.status(200).json({ success: true, data: FALLBACK_EVENTS.slice(0, parseInt(limit)) });
          }

          return res.status(200).json({ success: true, data });
      } catch (error) {
          return res.status(200).json({ success: true, data: FALLBACK_EVENTS });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

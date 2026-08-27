/**
 * Upcoming Events API (Poker Near Me preview)
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../src/lib/sentryWrap';

// NOTE: Removed edge runtime — this handler uses Node.js Pages Router API (req.query/res.status/etc)
// and cannot run on Vercel Edge Runtime. Keep as Node.js runtime.

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

function clampInt(value, fallback, min, max) {
    const n = parseInt(value, 10);
    if (Number.isNaN(n)) return fallback;
    return Math.min(Math.max(n, min), max);
}

export default async function handler(req, res) {
  try {
      if (req.method !== 'GET') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      try {
          const limit = clampInt(req.query.limit, 5, 1, 50);
          const featured = Array.isArray(req.query.featured) ? req.query.featured[0] : req.query.featured;

          let query = getSupabase()
              .from('poker_events')
              // Only expose the display contract. The table also contains scrape
              // confidence, HTML hashes, batch ids and other internal diagnostics.
              .select('id, event_name, start_date, start_time, venue_name, city, state, buy_in, guarantee, online_registration_url, is_special_event')
              // poker_events stores the calendar date as start_date.
              .gte('start_date', new Date().toISOString().split('T')[0])
              .order('start_date', { ascending: true })
              .limit(limit);

          if (featured === 'true') {
              // poker_events has is_special_event, not is_featured.
              query = query.eq('is_special_event', true);
          }

          const { data, error } = await query;

          if (error) {
              throw error;
          }
          res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
          if (!data?.length) {
              return res.status(200).json({ success: true, data: [] });
          }

          // Normalize the database names into the UI contract instead of making
          // real events render as the generic "Event / TBA" fallback.
          const mapped = data.map((e) => ({
              id: e.id,
              name: e.event_name || 'Poker Event',
              event_date: e.start_date,
              start_time: e.start_time || null,
              location: [e.venue_name, [e.city, e.state].filter(Boolean).join(', ')]
                  .filter(Boolean)
                  .join(' · '),
              buy_in: e.buy_in || null,
              guarantee: e.guarantee || null,
              registration_url: e.online_registration_url || null,
              is_featured: e.is_special_event === true
          }));
          return res.status(200).json({ success: true, data: mapped });
      } catch (error) {
          try { reportApiError(error, req); } catch (_e) { /* noop */ }
          console.warn('[Events API] Exception:', error?.message || error);
          return res.status(500).json({ success: false, error: 'Events feed unavailable' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-user-id, Authorization',
};

export default async function handler(req, res) {
  try {
    if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
      if (!applyRateLimit(req, res, LIMITS.write)) return;
    }

    Object.entries(CORS_HEADERS).forEach(([key, value]) => {
      res.setHeader(key, value);
    });

    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    try {
      if (req.method === 'POST') {
        // Require JWT for writes
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) return res.status(401).json({ success: false, error: 'Auth required for check-ins' });
        const { data: { user: authUser }, error: authErr } = await getSupabase().auth.getUser(token);
        if (authErr || !authUser) return res.status(401).json({ success: false, error: 'Invalid token' });

        const { venue_id, user_name, message } = req.body;
        const user_id = authUser.id;

        if (!venue_id || !user_name) {
          return res.status(400).json({ success: false, error: 'Missing required fields: venue_id, user_name' });
        }

        const venueIdNum = parseInt(venue_id, 10);
        if (isNaN(venueIdNum) || venueIdNum < 1) {
          return res.status(400).json({ success: false, error: 'venue_id must be a valid positive integer' });
        }

        // Check for recent check-in at same venue within 4 hours
        const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();

        const { data: recentCheckin, error: checkError } = await getSupabase()
          .from('venue_checkins')
          .select('id')
          .eq('user_id', user_id)
          .eq('venue_id', String(venueIdNum))
          .gte('created_at', fourHoursAgo)
          .limit(1);

        if (checkError) {
          console.error('Error checking recent checkins:', checkError);
          return res.status(500).json({ success: false, error: checkError.message });
        }

        if (recentCheckin && recentCheckin.length > 0) {
          return res.status(429).json({ success: false, error: 'You already checked in at this venue within the last 4 hours' });
        }

        const insertData = {
          venue_id: String(venueIdNum),
          user_id,
          user_name,
          created_at: new Date().toISOString(),
        };
        if (message !== undefined && message !== null) {
          insertData.message = message;
        }

        const { data, error } = await getSupabase()
          .from('venue_checkins')
          .insert(insertData)
          .select()
          .maybeSingle();

        if (error) {
          console.error('Error creating checkin:', error);
          return res.status(500).json({ success: false, error: error.message });
        }

        // Auto-create social post for check-in
        try {
          // Look up venue name
          let venueName = 'a poker venue';
          const venueIdInt = parseInt(venue_id, 10);
          if (!isNaN(venueIdInt) && venueIdInt > 0) {
            const { data: venueRow } = await getSupabase()
              .from('poker_venues')
              .select('name, city, state')
              .eq('id', venueIdInt)
              .maybeSingle();
            if (venueRow && venueRow.name) {
              venueName = venueRow.name;
              if (venueRow.city) venueName += ' in ' + venueRow.city;
            }
          }
          const postContent = 'Just checked in at ' + venueName + '! #PokerLife';
          await getSupabase()
            .from('user_posts')
            .insert({
              user_id: authUser.id,
              content: postContent,
              type: 'checkin',
              venue_id: String(venueIdNum),
              created_at: new Date().toISOString(),
            });
        } catch (postErr) {
          // Non-blocking — don't fail the check-in if post creation fails
          console.warn('[Checkin] Auto-post failed:', postErr.message);
        }

        return res.status(201).json({ success: true, checkin: data });
      }

      if (req.method === 'GET') {
        const { venue_id, user_id, count_only } = req.query;

        // Venue check-ins (last 24 hours)
        if (venue_id) {
          const venueIdNum = parseInt(venue_id, 10);
          if (isNaN(venueIdNum) || venueIdNum < 1) {
            return res.status(400).json({ success: false, error: 'venue_id must be a valid positive integer' });
          }

          const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

          if (count_only === 'true') {
            const { count, error } = await getSupabase()
              .from('venue_checkins')
              .select('*', { count: 'exact', head: true })
              .eq('venue_id', String(venueIdNum))
              .gte('created_at', twentyFourHoursAgo)
                  .limit(100);

            if (error) {
              console.error('Error counting checkins:', error);
              return res.status(500).json({ success: false, error: error.message });
            }

            return res.status(200).json({ success: true, venue_id: venueIdNum, count: count || 0 });
          }

          const { data, error } = await getSupabase()
            .from('venue_checkins')
            .select('*')
            .eq('venue_id', String(venueIdNum))
            .gte('created_at', twentyFourHoursAgo)
            .order('created_at', { ascending: false })
                .limit(100);

          if (error) {
            console.error('Error fetching checkins:', error);
            return res.status(500).json({ success: false, error: error.message });
          }

          return res.status(200).json({
            success: true,
            checkins: data || [],
            count: data ? data.length : 0,
          });
        }

        // User check-in history (enriched with venue names)
        if (user_id) {
          const { data, error } = await getSupabase()
            .from('venue_checkins')
            .select('*')
            .eq('user_id', user_id)
            .order('created_at', { ascending: false })
                .limit(100);

          if (error) {
            console.error('Error fetching user checkins:', error);
            return res.status(500).json({ success: false, error: error.message });
          }

          // Enrich with venue names from poker_venues
          let enriched = data || [];
          if (enriched.length > 0) {
            const venueIds = [...new Set(enriched.map(c => parseInt(c.venue_id, 10)).filter(n => !isNaN(n) && n > 0))];
            if (venueIds.length > 0) {
              const { data: venues } = await getSupabase()
                .from('poker_venues')
                .select('id, name, city, state')
                .in('id', venueIds);
              if (venues) {
                const venueMap = {};
                for (const v of venues) { venueMap[String(v.id)] = v; }
                enriched = enriched.map(c => {
                  const venue = venueMap[String(c.venue_id)] || {};
                  return { ...c, venue_name: venue.name || null, venue_city: venue.city || null, venue_state: venue.state || null };
                });
              }
            }
          }

          return res.status(200).json({ success: true, checkins: enriched });
        }

        return res.status(400).json({ success: false, error: 'venue_id or user_id is required' });
      }

      return res.status(405).json({ success: false, error: `Method ${req.method} not allowed` });
    } catch (err) {
      console.error('Checkins API error:', err);
      return res.status(500).json({ success: false, error: 'Internal server error' });
    }

  } catch (err) {
    console.error('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
  }
}

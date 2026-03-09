import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-user-id, Authorization',
};

export default async function handler(req, res) {
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
      const { data: { user: authUser }, error: authErr } = await supabase.auth.getUser(token);
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

      const { data: recentCheckin, error: checkError } = await supabase
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

      const { data, error } = await supabase
        .from('venue_checkins')
        .insert(insertData)
        .select()
        .maybeSingle();

      if (error) {
        console.error('Error creating checkin:', error);
        return res.status(500).json({ success: false, error: error.message });
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
          const { count, error } = await supabase
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

        const { data, error } = await supabase
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

      // User check-in history
      if (user_id) {
        const { data, error } = await supabase
          .from('venue_checkins')
          .select('*')
          .eq('user_id', user_id)
          .order('created_at', { ascending: false })
              .limit(100);

        if (error) {
          console.error('Error fetching user checkins:', error);
          return res.status(500).json({ success: false, error: error.message });
        }

        return res.status(200).json({ success: true, checkins: data || [] });
      }

      return res.status(400).json({ success: false, error: 'venue_id or user_id is required' });
    }

    return res.status(405).json({ success: false, error: `Method ${req.method} not allowed` });
  } catch (err) {
    console.error('Checkins API error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

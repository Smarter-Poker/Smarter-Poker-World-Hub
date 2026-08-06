import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
const { applyCors } = require('../../../src/lib/cors');
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
    if (!applyCors(req, res, { methods: 'GET, POST, PUT, DELETE, OPTIONS', headers: 'Content-Type, x-user-id, Authorization' })) return;
try {
    if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
      if (!applyRateLimit(req, res, LIMITS.write)) return;
    }

    try {
      if (req.method === 'POST') {
        // Require JWT for writes
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) return res.status(401).json({ success: false, error: 'Auth required for check-ins' });
        const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
        /* removed duplicate authUser */
        if (authErr || !authUser) return res.status(401).json({ success: false, error: 'Invalid token' });

        const { venue_id, message } = req.body;
        const user_id = authUser.id;

        if (!venue_id) {
          return res.status(400).json({ success: false, error: 'Missing required field: venue_id' });
        }

        const venueIdNum = parseInt(venue_id, 10);
        if (isNaN(venueIdNum) || venueIdNum < 1) {
          return res.status(400).json({ success: false, error: 'venue_id must be a valid positive integer' });
        }

        // IDENTITY: the display name is derived server-side from the caller's
        // profile, the same way pages/api/venues/[...slug].js does for reviews.
        // It used to be taken verbatim from the request body, so a user could
        // check in under any name they liked — and that string is what
        // whos-here, the venue leaderboards and the Near Me Now feed render.
        // Falls back to the account's own metadata (which is what the client used
        // to read before sending it) so a user whose profiles row has no name yet
        // is not rendered as "Anonymous" in every public feed. Both sources are
        // account-scoped, so neither can be varied per request the way the old
        // body field could.
        const meta = authUser.user_metadata || {};
        let resolvedUserName =
          meta.display_name
          || meta.full_name
          || meta.username
          || (authUser.email ? String(authUser.email).split('@')[0] : null)
          || 'Anonymous';
        try {
          const { data: profileRow } = await getSupabase()
            .from('profiles')
            .select('username, full_name')
            .eq('id', user_id)
            .maybeSingle();
          resolvedUserName = profileRow?.full_name || profileRow?.username || resolvedUserName;
        } catch (_profileErr) { /* keep the metadata-derived name */ }

        // Cap the free-text message. It had no length bound at all and is
        // rendered in public feeds.
        const MESSAGE_MAX = 280;
        let safeMessage = null;
        if (message !== undefined && message !== null) {
          if (typeof message !== 'string' && typeof message !== 'number') {
            return res.status(400).json({ success: false, error: 'message must be a string' });
          }
          const trimmed = String(message).trim();
          if (trimmed.length > MESSAGE_MAX) {
            return res.status(400).json({ success: false, error: `message must be ${MESSAGE_MAX} characters or fewer` });
          }
          safeMessage = trimmed || null;
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
          console.warn('Error checking recent checkins:', checkError);
          return res.status(500).json({ success: false, error: checkError.message });
        }

        if (recentCheckin && recentCheckin.length > 0) {
          return res.status(429).json({ success: false, error: 'You already checked in at this venue within the last 4 hours' });
        }

        const insertData = {
          venue_id: String(venueIdNum),
          user_id,
          user_name: resolvedUserName,
          created_at: new Date().toISOString(),
        };
        if (safeMessage !== null) {
          insertData.message = safeMessage;
        }

        const { data, error } = await getSupabase()
          .from('venue_checkins')
          .insert(insertData)
          .select()
          .maybeSingle();

        if (error) {
          console.warn('Error creating checkin:', error);
          return res.status(500).json({ success: false, error: 'Internal server error' });
        }

        // Auto-create social post for check-in
        if (!req.body.skip_post) {
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
            const { error: err_social_posts_qhn9i } = await getSupabase()
              .from('social_posts')
              .insert({
                author_id: authUser.id,
                content: postContent,
                content_type: 'text',
                visibility: 'public',
                metadata: { type: 'checkin', venue_id: venueIdNum },
                created_at: new Date().toISOString(),
              });
            if (err_social_posts_qhn9i) console.warn('[Supabase] Silent mutation failed in social_posts:', err_social_posts_qhn9i.message);
          } catch (postErr) { console.warn('[App] Handled exception:', postErr?.message || postErr); }
        }

        return res.status(201).json({ success: true, checkin: data });
      }

      if (req.method === 'GET') {
        const safeQ = (v) => v ? (Array.isArray(v) ? String(v[0]) : typeof v === 'object' ? null : String(v)) : v;
        const venue_id = safeQ(req.query.venue_id);
        const user_id = safeQ(req.query.user_id);
        const count_only = safeQ(req.query.count_only);
        const today = safeQ(req.query.today);
        const since = safeQ(req.query.since);

        // Global check-ins (last 24 hours) for map count aggregation
        if (today === 'true') {
          const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

          // This had no .limit() and no aggregation, so PostgREST silently
          // truncated it at the project row cap (1000). Once nationwide volume
          // passed 1000/24h every venue card's badge under-reported with no
          // error surfaced. Page deterministically with .range() (same pattern
          // as checkins/global-leaderboard.js) and expose `truncated`.
          const PAGE = 1000;
          const MAX_PAGES = 20; // 20,000 check-ins / 24h ceiling
          let rows = [];
          let truncated = false;
          for (let page = 0; page < MAX_PAGES; page++) {
            const { data: pageRows, error } = await getSupabase()
              .from('venue_checkins')
              .select('venue_id, id')
              .gte('created_at', twentyFourHoursAgo)
              .order('created_at', { ascending: false })
              .range(page * PAGE, (page + 1) * PAGE - 1);
            if (error) {
              console.warn('Error fetching global today checkins:', error);
              return res.status(500).json({ success: false, error: 'Internal server error' });
            }
            if (!pageRows || pageRows.length === 0) break;
            rows = rows.concat(pageRows);
            if (pageRows.length < PAGE) break;
            if (page === MAX_PAGES - 1) truncated = true;
          }

          // Pre-aggregated counts so callers do not have to tally rows themselves.
          const counts = {};
          for (const r of rows) {
            const key = String(r.venue_id);
            counts[key] = (counts[key] || 0) + 1;
          }

          res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');
          return res.status(200).json({ success: true, data: rows, counts, total: rows.length, truncated });
        }

        // Venue check-ins (last 24 hours)
        if (venue_id) {
          const venueIdNum = parseInt(venue_id, 10);
          if (isNaN(venueIdNum) || venueIdNum < 1) {
            return res.status(400).json({ success: false, error: 'venue_id must be a valid positive integer' });
          }

          // `since` was only honoured on the user_id branch. The Near Me Now feed
          // asks each nearby venue for check-ins since ~2h ago and then renders
          // them as current activity — with the window hardcoded at 24h it was
          // showing day-old check-ins as "now". Honour it here, clamped to the
          // 24h ceiling this branch has always enforced.
          const twentyFourHoursAgoMs = Date.now() - 24 * 60 * 60 * 1000;
          let windowStartMs = twentyFourHoursAgoMs;
          if (since) {
            const sinceMs = new Date(since).getTime();
            if (!isNaN(sinceMs)) {
              windowStartMs = Math.min(Math.max(sinceMs, twentyFourHoursAgoMs), Date.now());
            }
          }
          const twentyFourHoursAgo = new Date(windowStartMs).toISOString();

          if (count_only === 'true') {
            const { count, error } = await getSupabase()
              .from('venue_checkins')
              .select('*', { count: 'exact', head: true })
              .eq('venue_id', String(venueIdNum))
              .gte('created_at', twentyFourHoursAgo)
                  .limit(100);

            if (error) {
              console.warn('Error counting checkins:', error);
              return res.status(500).json({ success: false, error: 'Internal server error' });
            }

            res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');
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
            console.warn('Error fetching checkins:', error);
            return res.status(500).json({ success: false, error: 'Internal server error' });
          }

          return res.status(200).json({
            success: true,
            checkins: data || [],
            count: data ? data.length : 0,
          });
        }

        // User check-in history (enriched with venue names)
        if (user_id) {
          // SECURITY: a user's check-in history is a physical location log.
          // Require a JWT and only serve it to the user themselves or to an
          // accepted friend (same friendships pattern as checkins/whos-here.js).
          const token = req.headers.authorization?.replace('Bearer ', '');
          if (!token) return res.status(401).json({ success: false, error: 'Auth required to view check-in history' });
          const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
          /* removed duplicate authUser */
          if (authErr || !authUser) return res.status(401).json({ success: false, error: 'Invalid token' });

          if (authUser.id !== user_id) {
            // user_id is interpolated into the PostgREST .or() filter below, so it
            // must be a plain UUID — anything else could reshape the filter.
            if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(user_id)) {
              return res.status(400).json({ success: false, error: 'user_id must be a valid UUID' });
            }
            const { data: friendships } = await getSupabase()
              .from('friendships')
              .select('user_id, friend_id')
              .eq('status', 'accepted')
              .or(`and(user_id.eq.${authUser.id},friend_id.eq.${user_id}),and(user_id.eq.${user_id},friend_id.eq.${authUser.id})`)
              .limit(1);
            if (!friendships || friendships.length === 0) {
              return res.status(403).json({ success: false, error: 'Not authorized to view this user\'s check-ins' });
            }
          }

          let userQuery = getSupabase()
            .from('venue_checkins')
            .select('*')
            .eq('user_id', user_id);

          // `since` was documented/sent by callers but never applied — honor it.
          if (since) {
            const sinceDate = new Date(since);
            if (!isNaN(sinceDate.getTime())) {
              userQuery = userQuery.gte('created_at', sinceDate.toISOString());
            }
          }

          const { data, error } = await userQuery
            .order('created_at', { ascending: false })
            .limit(100);

          if (error) {
            console.warn('Error fetching user checkins:', error);
            return res.status(500).json({ success: false, error: 'Internal server error' });
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
      console.warn('Checkins API error:', err);
      return res.status(500).json({ success: false, error: 'Internal server error' });
    }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

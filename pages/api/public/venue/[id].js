/**
 * Public Venue API
 * GET /api/public/venue/[id] - Get public venue information
 * No authentication required - returns only public data
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Only GET allowed' }
    });
  }

  try {
    const { id } = req.query;

    if (!id) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_ID', message: 'Venue ID required' }
      });
    }

    // Fetch venue with public fields only
    const { data: venue, error: venueError } = await supabase
      .from('poker_venues')
      .select(`
        id,
        name,
        venue_type,
        address,
        city,
        state,
        country,
        zip_code,
        latitude,
        longitude,
        phone,
        website,
        email,
        poker_room_phone,
        games_offered,
        stakes_cash,
        stakes_tournament,
        poker_tables,
        hours_weekday,
        hours_weekend,
        has_bad_beat_jackpot,
        has_food_service,
        has_hotel,
        has_valet,
        has_comps,
        trust_score,
        google_rating,
        review_count,
        is_featured,
        commander_enabled
      `)
      .eq('id', id)
      .eq('is_active', true)
      .single();

    if (venueError || !venue) {
      // Fallback: check social_pages (clubs, charities, home games)
      const { data: socialPage, error: spError } = await supabase
        .from('social_pages')
        .select('id, name, description, avatar_url, cover_url, category, page_type, location_city, location_state, website, phone, follower_count, metadata, created_at')
        .eq('id', id)
        .single();

      if (spError || !socialPage) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Page not found' }
        });
      }

      // Return social page data in venue-compatible format
      return res.status(200).json({
        success: true,
        data: {
          venue: {
            id: socialPage.id,
            name: socialPage.name,
            venue_type: socialPage.page_type === 'club' ? 'poker_club' : socialPage.page_type === 'charity' ? 'charity' : 'home_game',
            city: socialPage.location_city,
            state: socialPage.location_state,
            phone: socialPage.phone,
            website: socialPage.website,
            profile_photo_url: socialPage.avatar_url,
            cover_photo_url: socialPage.cover_url,
            about: socialPage.description,
            tagline: socialPage.description?.substring(0, 120),
            follower_count: socialPage.follower_count || 0,
            is_social_page: true,
            commander_enabled: false,
          },
          live_games: [],
          upcoming_tournaments: [],
          daily_schedule: [],
          promotions: [],
          waitlist_stats: null,
          links: {
            smarter_poker: `https://smarter.poker/club/${id}`,
          }
        }
      });
    }

    // Fetch active games if Commander is enabled
    let liveGames = [];
    if (venue.commander_enabled) {
      const { data: games } = await supabase
        .from('commander_games')
        .select(`
          id,
          game_type,
          stakes,
          current_players,
          max_players,
          status,
          started_at
        `)
        .eq('venue_id', id)
        .in('status', ['running', 'waiting'])
        .order('started_at', { ascending: false });

      liveGames = games || [];
    }

    // Fetch upcoming tournaments
    const { data: tournaments } = await supabase
      .from('commander_tournaments')
      .select(`
        id,
        name,
        tournament_type,
        buyin_amount,
        scheduled_start,
        status,
        total_entries,
        max_entries,
        guaranteed_prize
      `)
      .eq('venue_id', id)
      .in('status', ['scheduled', 'registering'])
      .gte('scheduled_start', new Date().toISOString())
      .order('scheduled_start', { ascending: true })
      .limit(10);

    // Fetch daily tournament schedule
    const { data: dailyTournaments } = await supabase
      .from('venue_daily_tournaments')
      .select('*')
      .eq('venue_id', id)
      .eq('is_active', true)
      .order('day_of_week');

    // Fetch active promotions
    const { data: promotions } = await supabase
      .from('commander_promotions')
      .select(`
        id,
        name,
        description,
        promo_type,
        start_time,
        end_time,
        days_active
      `)
      .eq('venue_id', id)
      .eq('is_active', true)
      .limit(5);

    // Calculate waitlist stats if Commander enabled
    let waitlistStats = null;
    if (venue.commander_enabled) {
      const { count: waitingCount } = await supabase
        .from('commander_waitlist')
        .select('*', { count: 'exact', head: true })
        .eq('venue_id', id)
        .eq('status', 'waiting');

      waitlistStats = {
        total_waiting: waitingCount || 0,
        games_running: liveGames.filter(g => g.status === 'running').length,
        tables_available: liveGames.filter(g => g.status === 'waiting').length
      };
    }

    return res.status(200).json({
      success: true,
      data: {
        venue,
        live_games: liveGames,
        upcoming_tournaments: tournaments || [],
        daily_schedule: dailyTournaments || [],
        promotions: promotions || [],
        waitlist_stats: waitlistStats,
        links: {
          smarter_poker: `https://smarter.poker/club/${id}`,
          poker_near_me: `https://pokernear.me/venue/${id}`,
          waitlist_join: venue.commander_enabled ? `/hub/commander/waitlist?venue=${id}` : null
        }
      }
    });
  } catch (error) {
    console.error('Public venue API error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to fetch venue' }
    });
  }
}

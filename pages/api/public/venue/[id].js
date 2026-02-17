/**
 * Public Venue API
 * GET /api/public/venue/[id] - Get public venue information
 * No authentication required - returns only public data
 */
import { createClient } from '@supabase/supabase-js';
import { captureError, addBreadcrumb } from '../../../../src/lib/sentry';

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
      // Fallback: check social_pages by UUID (clubs, charities, home games)
      let socialPage = null;
      const { data: spById, error: spError } = await supabase
        .from('social_pages')
        .select('id, name, slug, description, avatar_url, cover_url, category, page_type, location_city, location_state, website, phone, follower_count, metadata, owner_id, linked_venue_id, created_at')
        .eq('id', id)
        .single();

      if (!spError && spById) {
        socialPage = spById;
      } else {
        // Final fallback: try slug-based lookup
        const { data: spBySlug, error: slugError } = await supabase
          .from('social_pages')
          .select('id, name, slug, description, avatar_url, cover_url, category, page_type, location_city, location_state, website, phone, follower_count, metadata, owner_id, linked_venue_id, created_at')
          .eq('slug', id)
          .single();

        if (!slugError && spBySlug) {
          socialPage = spBySlug;
        }
      }

      if (!socialPage) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Page not found' }
        });
      }

      // Bridge: look up linked poker_venue to get Commander data
      const meta = socialPage.metadata || {};
      let linkedVenue = null;
      let linkedVenueId = socialPage.linked_venue_id || meta.linked_venue_id || null;

      addBreadcrumb({
        category: 'venue-detail',
        message: `Social page lookup: ${socialPage.name} (${socialPage.page_type}), linked_venue_id=${linkedVenueId}`,
        data: { page_id: socialPage.id, linked_venue_id: linkedVenueId },
      });

      // Try metadata.linked_venue_id first, then name match
      if (linkedVenueId) {
        const { data: lv } = await supabase
          .from('poker_venues')
          .select('id, commander_enabled, games_offered, stakes_cash, poker_tables, hours_weekday, hours_weekend, trust_score, is_featured, cover_photo_url, profile_photo_url, tagline, about, follower_count, social_links, slug, has_tournaments')
          .eq('id', linkedVenueId)
          .eq('is_active', true)
          .single();
        if (lv) linkedVenue = lv;
      }

      if (!linkedVenue) {
        // Fallback: find poker_venue by name match
        const { data: lv } = await supabase
          .from('poker_venues')
          .select('id, commander_enabled, games_offered, stakes_cash, poker_tables, hours_weekday, hours_weekend, trust_score, is_featured, cover_photo_url, profile_photo_url, tagline, about, follower_count, social_links, slug, has_tournaments')
          .ilike('name', socialPage.name)
          .eq('is_active', true)
          .limit(1)
          .single();
        if (lv) {
          linkedVenue = lv;
          linkedVenueId = lv.id;
        }
      }

      const commanderEnabled = linkedVenue?.commander_enabled || false;
      const venueIdForCommander = linkedVenueId;

      // Fetch Commander live games if linked venue has Commander enabled
      let liveGames = [];
      if (commanderEnabled && venueIdForCommander) {
        try {
          const { data: games } = await supabase
            .from('commander_games')
            .select('id, game_type, stakes, current_players, max_players, status, started_at')
            .eq('venue_id', venueIdForCommander)
            .in('status', ['running', 'waiting'])
            .order('started_at', { ascending: false });
          liveGames = games || [];
        } catch (cmdErr) {
          console.warn('[venue-detail] Commander live games query failed:', cmdErr.message);
          captureError(cmdErr, { tags: { api: 'venue-detail', stage: 'commander-live-games', venue_id: String(venueIdForCommander) } });
        }
      }

      // Fetch Commander tournaments if linked venue exists
      let upcomingTournaments = [];
      if (commanderEnabled && venueIdForCommander) {
        try {
          const { data: tourneys } = await supabase
            .from('commander_tournaments')
            .select('id, name, tournament_type, buyin_amount, scheduled_start, status, current_entries, max_entries, guaranteed_pool')
            .eq('venue_id', venueIdForCommander)
            .in('status', ['scheduled', 'registering', 'registration'])
            .gte('scheduled_start', new Date().toISOString())
            .order('scheduled_start', { ascending: true })
            .limit(10);
          upcomingTournaments = tourneys || [];
        } catch (cmdErr) {
          console.warn('[venue-detail] Commander tournaments query failed:', cmdErr.message);
          captureError(cmdErr, { tags: { api: 'venue-detail', stage: 'commander-tournaments', venue_id: String(venueIdForCommander) } });
        }
      }

      // Fallback: look up Club Arena tournaments via owner_id
      if (upcomingTournaments.length === 0 && socialPage.owner_id) {
        try {
          let { data: club } = await supabase
            .from('clubs')
            .select('id')
            .eq('owner_id', socialPage.owner_id)
            .ilike('name', socialPage.name)
            .limit(1)
            .single();

          if (!club) {
            const { data: fallbackClub } = await supabase
              .from('clubs')
              .select('id')
              .eq('owner_id', socialPage.owner_id)
              .limit(1)
              .single();
            club = fallbackClub;
          }

          if (club) {
            const { data: tourneys } = await supabase
              .from('tournaments')
              .select('id, name, game_type, buy_in_amount, buy_in_fee, guaranteed_prize, start_time, status, max_players, current_players')
              .eq('club_id', club.id)
              .in('status', ['ANNOUNCED', 'RUNNING', 'SCHEDULED'])
              .gte('start_time', new Date().toISOString())
              .order('start_time', { ascending: true })
              .limit(20);

            upcomingTournaments = (tourneys || []).map(t => ({
              id: t.id,
              name: t.name,
              game_type: t.game_type,
              buyin_amount: t.buy_in_amount,
              buy_in_fee: t.buy_in_fee,
              scheduled_start: t.start_time,
              guaranteed_prize: t.guaranteed_prize,
              status: t.status,
              max_players: t.max_players,
              current_players: t.current_players,
            }));
          }
        } catch (clubErr) {
          console.warn('[venue-detail] Club Arena tournament fallback failed:', clubErr.message);
          captureError(clubErr, { tags: { api: 'venue-detail', stage: 'club-arena-tournament-fallback', page_id: socialPage.id } });
        }
      }

      // Calculate waitlist stats if Commander is enabled
      let waitlistStats = null;
      if (commanderEnabled && venueIdForCommander) {
        try {
          const { count: waitingCount } = await supabase
            .from('commander_waitlist')
            .select('*', { count: 'exact', head: true })
            .eq('venue_id', venueIdForCommander)
            .eq('status', 'waiting');

          waitlistStats = {
            total_waiting: waitingCount || 0,
            games_running: liveGames.filter(g => g.status === 'running').length,
            tables_available: liveGames.filter(g => g.status === 'waiting').length
          };
        } catch (cmdErr) {
          console.warn('[venue-detail] Waitlist query failed (sp path):', cmdErr.message);
          captureError(cmdErr, { tags: { api: 'venue-detail', stage: 'sp-waitlist', venue_id: String(venueIdForCommander) } });
          waitlistStats = {
            total_waiting: 0,
            games_running: liveGames.filter(g => g.status === 'running').length,
            tables_available: liveGames.filter(g => g.status === 'waiting').length
          };
        }
      }

      // Extract coordinates from geocoded_locations metadata
      const geocoded = meta.geocoded_locations || {};
      const primaryLocStr = socialPage.location_city + (socialPage.location_state ? ', ' + socialPage.location_state : '');
      const primaryCoords = geocoded[primaryLocStr] || geocoded[socialPage.location_city] || null;

      // Return social page data in venue-compatible format
      return res.status(200).json({
        success: true,
        data: {
          venue: {
            id: socialPage.id,
            name: socialPage.name,
            slug: socialPage.slug,
            venue_type: socialPage.page_type === 'club' ? 'poker_club' : socialPage.page_type === 'charity' ? 'charity' : 'home_game',
            category: socialPage.category,
            city: socialPage.location_city,
            state: socialPage.location_state,
            address: meta.address || '',
            latitude: primaryCoords ? primaryCoords.lat : null,
            longitude: primaryCoords ? primaryCoords.lng : null,
            phone: socialPage.phone,
            website: socialPage.website,
            profile_photo_url: socialPage.avatar_url || meta.logo_url,
            cover_photo_url: socialPage.cover_url || meta.cover_photo_url,
            about: socialPage.description,
            tagline: socialPage.description?.substring(0, 120),
            follower_count: socialPage.follower_count || 0,
            is_social_page: true,
            social_page_id: socialPage.id,
            commander_enabled: commanderEnabled,
            linked_venue_id: venueIdForCommander,
            amenities: meta.amenities || {},
            games_offered: linkedVenue?.games_offered || [],
            stakes_cash: linkedVenue?.stakes_cash || [],
            poker_tables: linkedVenue?.poker_tables || null,
            hours_weekday: linkedVenue?.hours_weekday || null,
            hours_weekend: linkedVenue?.hours_weekend || null,
            trust_score: linkedVenue?.trust_score || null,
            is_featured: linkedVenue?.is_featured || false,
            has_tournaments: linkedVenue?.has_tournaments || false,
            photos: meta.photos || [],
            run_schedule: meta.run_schedule || null,
            social_links: meta.social_links || {},
          },
          live_games: liveGames,
          upcoming_tournaments: upcomingTournaments,
          daily_schedule: [],
          promotions: [],
          waitlist_stats: waitlistStats,
          links: {
            smarter_poker: socialPage.slug
              ? `https://smarter.poker/club/${socialPage.slug}`
              : `https://smarter.poker/club/${socialPage.id}`,
            waitlist_join: commanderEnabled ? `/hub/commander/waitlist/${venueIdForCommander}` : null
          }
        }
      });
    }

    // Fetch active games if Commander is enabled
    let liveGames = [];
    if (venue.commander_enabled) {
      try {
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
      } catch (cmdErr) {
        console.warn('[venue-detail] Commander live games query failed (pv path):', cmdErr.message);
        captureError(cmdErr, { tags: { api: 'venue-detail', stage: 'pv-commander-live-games', venue_id: String(id) } });
      }
    }

    // Fetch upcoming tournaments
    let tournaments = [];
    try {
      const { data: tourneysData } = await supabase
        .from('commander_tournaments')
        .select(`
          id,
          name,
          tournament_type,
          buyin_amount,
          scheduled_start,
          status,
          current_entries,
          max_entries,
          guaranteed_pool
        `)
        .eq('venue_id', id)
        .in('status', ['scheduled', 'registering', 'registration'])
        .gte('scheduled_start', new Date().toISOString())
        .order('scheduled_start', { ascending: true })
        .limit(10);
      tournaments = tourneysData || [];
    } catch (cmdErr) {
      console.warn('[venue-detail] Commander tournaments query failed (pv path):', cmdErr.message);
      captureError(cmdErr, { tags: { api: 'venue-detail', stage: 'pv-commander-tournaments', venue_id: String(id) } });
    }

    // Fetch daily tournament schedule
    let dailyTournaments = [];
    try {
      const { data: dtData } = await supabase
        .from('venue_daily_tournaments')
        .select('*')
        .eq('venue_id', id)
        .eq('is_active', true)
        .order('day_of_week');
      dailyTournaments = dtData || [];
    } catch (cmdErr) {
      console.warn('[venue-detail] Daily tournaments query failed (pv path):', cmdErr.message);
      captureError(cmdErr, { tags: { api: 'venue-detail', stage: 'pv-daily-schedule', venue_id: String(id) } });
    }

    // Fetch active promotions
    let promotions = [];
    try {
      const { data: promosData } = await supabase
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
      promotions = promosData || [];
    } catch (cmdErr) {
      console.warn('[venue-detail] Promotions query failed (pv path):', cmdErr.message);
      captureError(cmdErr, { tags: { api: 'venue-detail', stage: 'pv-promotions', venue_id: String(id) } });
    }

    // Calculate waitlist stats if Commander enabled
    let waitlistStats = null;
    if (venue.commander_enabled) {
      try {
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
      } catch (cmdErr) {
        console.warn('[venue-detail] Waitlist stats query failed (pv path):', cmdErr.message);
        captureError(cmdErr, { tags: { api: 'venue-detail', stage: 'pv-waitlist', venue_id: String(id) } });
        // Still return partial stats from the live games we already have
        waitlistStats = {
          total_waiting: 0,
          games_running: liveGames.filter(g => g.status === 'running').length,
          tables_available: liveGames.filter(g => g.status === 'waiting').length
        };
      }
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
          waitlist_join: venue.commander_enabled ? `/hub/commander/waitlist/${id}` : null
        }
      }
    });
  } catch (error) {
    console.error('Public venue API error:', error);
    captureError(error, {
      tags: { api: 'venue-detail' },
      extra: { venue_id: req.query?.id },
    });
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to fetch venue' }
    });
  }
}

/**
 * Public Venue API
 * GET /api/public/venue/[id] - Get public venue information
 * No authentication required - returns only public data
 */
import { createClient } from '../../../../src/lib/supabaseServerClient';
import { captureError, addBreadcrumb } from '../../../../src/lib/sentry';
import { reportApiError } from '../../../../src/lib/sentryWrap';

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

export default async function handler(req, res) {
  try {
    // CDN cache: fresh for 60s, serve stale up to 300s
    if (req.method === 'GET') {
      res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    }

    if (req.method !== 'GET') {
      return res.status(405).json({
        success: false,
        error: { code: 'METHOD_NOT_ALLOWED', message: 'Only GET allowed' }
      });
    }

    try {
      const safeQ = (v) => v ? (Array.isArray(v) ? String(v[0]) : typeof v === 'object' ? null : String(v)) : v;
      const id = safeQ(req.query.id);

      if (!id) {
        return res.status(400).json({
          success: false,
          error: { code: 'MISSING_ID', message: 'Venue ID required' }
        });
      }

      // Fetch venue with public fields only
      const { data: venue, error: venueError } = await getSupabase()
        .from('poker_venues')
        // NOTE: every column below is verified to exist on poker_venues.
        // Ten columns that do NOT exist (zip_code, poker_room_phone,
        // stakes_tournament, has_bad_beat_jackpot, has_food_service,
        // has_hotel, has_valet, has_comps, google_rating, review_count) used
        // to be selected here — PostgREST answered the whole select with
        // 42703, so `venue` was null on EVERY request and the handler always
        // fell through to the social_pages fallback (404 for integer ids).
        // `email` is deliberately NOT selected: it is operator PII and this
        // is an unauthenticated endpoint.
        .select(`
          id,
          name,
          venue_type,
          address,
          city,
          state,
          country,
          latitude,
          longitude,
          phone,
          website,
          games_offered,
          stakes_cash,
          poker_tables,
          hours_weekday,
          hours_weekend,
          hours,
          trust_score,
          is_featured,
          commander_enabled,
          has_tournaments,
          about,
          tagline,
          profile_photo_url,
          cover_photo_url
        `)
        .eq('id', id)
        .eq('is_active', true)
        .maybeSingle();

      if (venueError) {
        // Never let a column drift degrade silently into a 404 again.
        console.warn('[venue-detail] poker_venues lookup failed:', venueError.message);
      }

      if (venueError || !venue) {
        // Fallback: check social_pages by UUID (clubs, charities, home games)
        //
        // Three lookups, run TOGETHER instead of one-after-the-other. They
        // cannot be collapsed into a single `.or(id.eq.X,slug.eq.X,
        // linked_venue_id.eq.X)`: `id` is a uuid column and `linked_venue_id`
        // an integer, so a slug or an integer id makes the whole OR fail with
        // 22P02 (invalid input syntax) and the page 404s. Running them in
        // parallel and tolerating per-query errors keeps that safety while
        // cutting up to two round trips off every social-page request.
        // Priority on a tie is unchanged: id, then linked_venue_id, then slug.
        const SP_COLUMNS = 'id, name, slug, description, avatar_url, cover_url, category, page_type, location_city, location_state, website, phone, follower_count, metadata, owner_id, linked_venue_id, linked_entity_id, linked_entity_type, created_at';
        const spLookup = async (column, value, extra) => {
          try {
            let q = getSupabase().from('social_pages').select(SP_COLUMNS).eq(column, value);
            if (extra === 'limit1') q = q.limit(1);
            const { data, error } = await q.maybeSingle();
            if (error) return null;
            return data || null;
          } catch (_spErr) {
            return null;
          }
        };

        const [spById, spByLinked, spBySlug] = await Promise.all([
          spLookup('id', id),
          spLookup('linked_venue_id', id, 'limit1'),
          spLookup('slug', id),
        ]);

        const socialPage = spById || spByLinked || spBySlug || null;

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

        // Try metadata.linked_venue_id first, then name match.
        // NOTE: keep this column list to columns that actually exist on
        // poker_venues. `slug` used to be selected here and is defined in no
        // migration — the select errored, `lv` stayed null, and because the
        // code only checks `if (lv)` the whole Commander bridge (live games,
        // tournaments, trust score, hours, followers) silently never rendered.
        // Errors are logged now so the next drift is visible.
        //
        // The linked-venue lookup and the home-group lookup are independent —
        // run them in the same wave rather than back to back.
        const [lvById, homeGroupRow] = await Promise.all([
          (async () => {
            if (!linkedVenueId) return null;
            const { data: lv, error: lvErr } = await getSupabase()
              .from('poker_venues')
              .select('id, commander_enabled, games_offered, stakes_cash, poker_tables, hours_weekday, hours_weekend, trust_score, is_featured, cover_photo_url, profile_photo_url, tagline, about, follower_count, social_links, has_tournaments')
              .eq('id', linkedVenueId)
              .eq('is_active', true)
              .maybeSingle();
            if (lvErr) console.warn('[venue-detail] linked venue lookup failed:', lvErr.message);
            return lv || null;
          })(),
          (async () => {
            // Bridge: if it's a home game, grab its home group to extract
            // settings for games/stakes/tournaments.
            if (socialPage.page_type !== 'home_game' || !socialPage.linked_entity_id) return null;
            const { data: hg } = await getSupabase()
              .from('commander_home_groups')
              .select('id, settings, default_game_type, default_stakes')
              .eq('id', socialPage.linked_entity_id)
              .maybeSingle();
            return hg || null;
          })(),
        ]);
        if (lvById) linkedVenue = lvById;

        if (!linkedVenue) {
          // Fallback: find poker_venue by name match
          const { data: lv, error: lvNameErr } = await getSupabase()
            .from('poker_venues')
            .select('id, commander_enabled, games_offered, stakes_cash, poker_tables, hours_weekday, hours_weekend, trust_score, is_featured, cover_photo_url, profile_photo_url, tagline, about, follower_count, social_links, has_tournaments')
            .ilike('name', socialPage.name)
            .eq('is_active', true)
            .limit(1)
            .maybeSingle();
          if (lvNameErr) console.warn('[venue-detail] linked venue name-match lookup failed:', lvNameErr.message);
          if (lv) {
            linkedVenue = lv;
            linkedVenueId = lv.id;
          }
        }

        const homeGroup = homeGroupRow;

        const commanderEnabled = linkedVenue?.commander_enabled || false;
        const venueIdForCommander = linkedVenueId;

        // ── PARALLEL FAN-OUT (social_pages path) ────────────────────────
        // Live games, tournaments and the waitlist head-count all key off the
        // same linked venue id and none depends on the others' results, so
        // they run together instead of as three sequential round trips.
        const [liveGames, commanderTournaments, waitingCount] = await Promise.all([
          (async () => {
            if (!commanderEnabled || !venueIdForCommander) return [];
            try {
              const { data: games } = await getSupabase()
                .from('commander_games')
                .select('id, game_type, stakes, current_players, max_players, status, started_at')
                .eq('venue_id', venueIdForCommander)
                .in('status', ['running', 'waiting'])
                .order('started_at', { ascending: false })
                .limit(100);
              return games || [];
            } catch (cmdErr) {
              console.warn('[venue-detail] Commander live games query failed:', cmdErr.message);
              captureError(cmdErr, { tags: { api: 'venue-detail', stage: 'commander-live-games', venue_id: String(venueIdForCommander) } });
              return [];
            }
          })(),
          (async () => {
            if (!commanderEnabled || !venueIdForCommander) return [];
            try {
              const { data: tourneys } = await getSupabase()
                .from('commander_tournaments')
                .select('id, name, tournament_type, buyin_amount, scheduled_start, status, current_entries, max_entries, guaranteed_pool, players_remaining')
                .eq('venue_id', venueIdForCommander)
                .in('status', ['scheduled', 'registering', 'registration', 'running', 'break', 'final_table'])
                .order('scheduled_start', { ascending: true })
                .limit(20);
              return tourneys || [];
            } catch (cmdErr) {
              console.warn('[venue-detail] Commander tournaments query failed:', cmdErr.message);
              captureError(cmdErr, { tags: { api: 'venue-detail', stage: 'commander-tournaments', venue_id: String(venueIdForCommander) } });
              return [];
            }
          })(),
          (async () => {
            if (!commanderEnabled || !venueIdForCommander) return null;
            try {
              const { count } = await getSupabase()
                .from('commander_waitlist')
                .select('*', { count: 'exact', head: true })
                .eq('venue_id', venueIdForCommander)
                .eq('status', 'waiting')
                .limit(100);
              return count || 0;
            } catch (cmdErr) {
              console.warn('[venue-detail] Waitlist query failed (sp path):', cmdErr.message);
              captureError(cmdErr, { tags: { api: 'venue-detail', stage: 'sp-waitlist', venue_id: String(venueIdForCommander) } });
              return 0;
            }
          })(),
        ]);

        let upcomingTournaments = commanderTournaments;

        // Fallback: look up Club Arena tournaments via owner_id
        if (upcomingTournaments.length === 0 && socialPage.owner_id) {
          try {
            let { data: club } = await getSupabase()
              .from('clubs')
              .select('id')
              .eq('owner_id', socialPage.owner_id)
              .ilike('name', socialPage.name)
              .limit(1)
              .maybeSingle();

            if (!club) {
              const { data: fallbackClub } = await getSupabase()
                .from('clubs')
                .select('id')
                .eq('owner_id', socialPage.owner_id)
                .limit(1)
                .maybeSingle();
              club = fallbackClub;
            }

            if (club) {
              const { data: tourneys } = await getSupabase()
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

        // Waitlist stats derive from the head-count fetched above plus the
        // live games we already have in hand.
        const waitlistStats = (commanderEnabled && venueIdForCommander)
          ? {
              total_waiting: waitingCount || 0,
              games_running: liveGames.filter(g => g.status === 'running').length,
              tables_available: liveGames.filter(g => g.status === 'waiting').length
            }
          : null;

        // Extract home game settings if available
        let hgGames = linkedVenue?.games_offered || [];
        let hgStakes = linkedVenue?.stakes_cash || [];
        let hgTournaments = [];
        
        if (homeGroup && homeGroup.settings) {
          const settings = homeGroup.settings;
          if (Array.isArray(settings.tables)) {
             settings.tables.forEach(t => {
                const gameName = t.game_type ? t.game_type.toUpperCase() : 'POKER';
                if (!hgGames.includes(gameName)) hgGames.push(gameName);
                if (t.stakes && !hgStakes.includes(t.stakes)) hgStakes.push(t.stakes);
             });
          } else if (homeGroup.default_game_type && homeGroup.default_stakes) {
             hgGames = [homeGroup.default_game_type.toUpperCase()];
             hgStakes = [homeGroup.default_stakes];
          }
          if (Array.isArray(settings.tournaments)) {
             settings.tournaments.forEach((t, i) => {
                hgTournaments.push({
                   id: 'hg-t-' + i,
                   name: (t.buy_in ? `$${t.buy_in} ` : '') + (t.name || t.tournament_name || 'Bounty Tournament'),
                   buy_in_amount: t.buy_in || 0,
                   scheduled_start: t.scheduled_date && t.scheduled_time ? `${t.scheduled_date}T${t.scheduled_time}:00` : new Date().toISOString(),
                   status: 'scheduled'
                });
             });
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
              games_offered: hgGames,
              stakes_cash: hgStakes,
              poker_tables: linkedVenue?.poker_tables || (homeGroup?.settings?.tables_count || null),
              hours_weekday: linkedVenue?.hours_weekday || null,
              hours_weekend: linkedVenue?.hours_weekend || null,
              trust_score: linkedVenue?.trust_score || null,
              is_featured: linkedVenue?.is_featured || false,
              has_tournaments: linkedVenue?.has_tournaments || hgTournaments.length > 0,
              photos: meta.photos || [],
              run_schedule: meta.run_schedule || null,
              social_links: meta.social_links || {},
            },
            live_games: liveGames,
            upcoming_tournaments: upcomingTournaments.length > 0 ? upcomingTournaments : hgTournaments,
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

      // ── PARALLEL FAN-OUT (pv path) ────────────────────────────────────
      // None of these six reads depends on any of the others, and this is the
      // most-hit public endpoint on the site. They used to be awaited one
      // after another: six sequential Supabase round trips stacked into the
      // response time of every venue page view. Each keeps its own try/catch
      // so one failing table still degrades to an empty section instead of
      // taking the whole payload down.
      const [
        liveGames,
        tournaments,
        dailyTournaments,
        promotions,
        venueNews,
        waitingCount,
      ] = await Promise.all([
        // Active games, if Commander is enabled
        (async () => {
          if (!venue.commander_enabled) return [];
          try {
            const { data: games, error: gamesError } = await getSupabase()
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
              .order('started_at', { ascending: false })
              .limit(100);
            if (gamesError) console.warn('[venue-detail] Commander live games query error (pv path):', gamesError.message);
            return games || [];
          } catch (cmdErr) {
            console.warn('[venue-detail] Commander live games query failed (pv path):', cmdErr.message);
            captureError(cmdErr, { tags: { api: 'venue-detail', stage: 'pv-commander-live-games', venue_id: String(id) } });
            return [];
          }
        })(),

        // Upcoming + live tournaments
        (async () => {
          try {
            const { data: tourneysData, error: tourneysError } = await getSupabase()
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
                guaranteed_pool,
                players_remaining
              `)
              .eq('venue_id', id)
              .in('status', ['scheduled', 'registering', 'registration', 'running', 'break', 'final_table'])
              .order('scheduled_start', { ascending: true })
              .limit(20);
            if (tourneysError) console.warn('[venue-detail] Commander tournaments query error (pv path):', tourneysError.message);
            return tourneysData || [];
          } catch (cmdErr) {
            console.warn('[venue-detail] Commander tournaments query failed (pv path):', cmdErr.message);
            captureError(cmdErr, { tags: { api: 'venue-detail', stage: 'pv-commander-tournaments', venue_id: String(id) } });
            return [];
          }
        })(),

        // Daily tournament schedule
        (async () => {
          try {
            const { data: dtData, error: dtError } = await getSupabase()
              .from('venue_daily_tournaments')
              .select('*')
              .eq('venue_id', id)
              .eq('is_active', true)
              // Same visibility contract as every other consumer: without this,
              // rows retired via data_quality='stale' (venue-scraper/receive.js)
              // or suppression kept surfacing on the public venue page.
              .in('data_quality', ['scraped_verified', 'scraped_inferred'])
              .or('is_suppressed.is.null,is_suppressed.eq.false')
              .order('day_of_week')
              .limit(100);
            if (dtError) console.warn('[venue-detail] Daily tournaments query error (pv path):', dtError.message);
            return dtData || [];
          } catch (cmdErr) {
            console.warn('[venue-detail] Daily tournaments query failed (pv path):', cmdErr.message);
            captureError(cmdErr, { tags: { api: 'venue-detail', stage: 'pv-daily-schedule', venue_id: String(id) } });
            return [];
          }
        })(),

        // Active promotions
        (async () => {
          try {
            // The real column is `promotion_type` — selecting `promo_type`
            // made PostgREST reject the whole select with 42703, which this
            // lambda swallowed (the error was never destructured) and every
            // venue reported zero promotions. Keep `promo_type` in the
            // response for existing clients by mapping it below.
            const { data: promosData, error: promosError } = await getSupabase()
              .from('commander_promotions')
              .select(`
                id,
                name,
                description,
                promotion_type,
                start_time,
                end_time,
                days_active
              `)
              .eq('venue_id', id)
              .eq('is_active', true)
              .limit(5);
            if (promosError) {
              console.warn('[venue-detail] Promotions query error (pv path):', promosError.message);
              return [];
            }
            return (promosData || []).map((p) => ({ ...p, promo_type: p.promotion_type }));
          } catch (cmdErr) {
            console.warn('[venue-detail] Promotions query failed (pv path):', cmdErr.message);
            captureError(cmdErr, { tags: { api: 'venue-detail', stage: 'pv-promotions', venue_id: String(id) } });
            return [];
          }
        })(),

        // Scraped venue news (from venue scraper pipeline)
        (async () => {
          try {
            const { data: newsData } = await getSupabase()
              .from('venue_news')
              .select('id, title, content, source_url, image_url, published_at, scraped_at')
              .eq('venue_id', id)
              .eq('is_active', true)
              .order('scraped_at', { ascending: false })
              .limit(10);
            return newsData || [];
          } catch (newsErr) {
            console.warn('[venue-detail] Venue news query failed (pv path):', newsErr.message);
            return [];
          }
        })(),

        // Waitlist head-count. Only the DERIVED stats below need liveGames,
        // the count itself does not — so it runs in the same wave.
        (async () => {
          if (!venue.commander_enabled) return null;
          try {
            const { count } = await getSupabase()
              .from('commander_waitlist')
              .select('*', { count: 'exact', head: true })
              .eq('venue_id', id)
              .eq('status', 'waiting')
              .limit(100);
            return count || 0;
          } catch (cmdErr) {
            console.warn('[venue-detail] Waitlist stats query failed (pv path):', cmdErr.message);
            captureError(cmdErr, { tags: { api: 'venue-detail', stage: 'pv-waitlist', venue_id: String(id) } });
            // Still return partial stats from the live games we already have
            return 0;
          }
        })(),
      ]);

      const waitlistStats = venue.commander_enabled
        ? {
            total_waiting: waitingCount || 0,
            games_running: liveGames.filter(g => g.status === 'running').length,
            tables_available: liveGames.filter(g => g.status === 'waiting').length
          }
        : null;

      return res.status(200).json({
        success: true,
        data: {
          venue,
          live_games: liveGames,
          upcoming_tournaments: tournaments || [],
          daily_schedule: dailyTournaments || [],
          promotions: promotions || [],
          venue_news: venueNews || [],
          waitlist_stats: waitlistStats,
          links: {
            smarter_poker: `https://smarter.poker/club/${id}`,
            poker_near_me: `https://pokernear.me/venue/${id}`,
            waitlist_join: venue.commander_enabled ? `/hub/commander/waitlist/${id}` : null
          }
        }
      });
    } catch (error) {
      console.warn('Public venue API error:', error);
      captureError(error, {
        tags: { api: 'venue-detail' },
        extra: { venue_id: req.query?.id },
      });
      return res.status(500).json({
        success: false,
        error: { code: 'SERVER_ERROR', message: 'Failed to fetch venue' }
      });
    }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

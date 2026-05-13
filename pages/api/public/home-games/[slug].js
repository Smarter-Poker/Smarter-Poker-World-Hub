/**
 * ══════════════════════════════════════════════════════════════════════════
 *  PUBLIC HOME GAME — SINGLE GROUP API (by slug)
 *  GET /api/public/home-games/[slug]
 * ══════════════════════════════════════════════════════════════════════════
 *
 *  Resolves social_pages.slug (page_type='home_game') → linked commander_home_group
 *  and returns the full public profile: group, host, upcoming games, posts, counts.
 *
 *  No auth required. Private groups return 404.
 *  CDN-cached 30s / 180s SWR.
 */

import { createClient } from '../../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../../src/lib/sentryWrap';

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
    if (!applyRateLimit(req, res, LIMITS.read)) return;

    if (req.method !== 'GET') {
      res.setHeader('Allow', ['GET']);
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=180');

    const safeQ = (v) => v ? (Array.isArray(v) ? String(v[0]) : typeof v === 'object' ? null : String(v)) : v;
    const slug = safeQ(req.query.slug);
    if (!slug || typeof slug !== 'string') {
      return res.status(400).json({ success: false, error: 'slug required' });
    }

    const supabase = getSupabase();

    // 1. Resolve slug to social_page
    const { data: page, error: pageErr } = await supabase
      .from('social_pages')
      .select(
        'id, slug, name, description, avatar_url, cover_url, location_city, location_state, location_country, is_public, follower_count, post_count, view_count, linked_entity_type, linked_entity_id, metadata, created_at, updated_at'
      )
      .eq('slug', slug)
      .eq('page_type', 'home_game')
      .maybeSingle();

    if (pageErr) throw pageErr;
    if (!page || !page.is_public) {
      return res.status(404).json({ success: false, error: 'Home game not found' });
    }

    // 2. Fetch linked commander_home_group for live data
    const groupId = page.linked_entity_id;
    if (!groupId || page.linked_entity_type !== 'home_group') {
      return res.status(404).json({ success: false, error: 'Home game group link missing' });
    }

    const { data: group, error: groupErr } = await supabase
      .from('commander_home_groups')
      .select(
        `
        id, name, description, tagline, is_private, is_active,
        city, state, zip_code, default_game_type, default_stakes,
        typical_buyin_min, typical_buyin_max, max_players,
        typical_day, typical_time, frequency, member_count, games_hosted,
        cover_photo_url, profile_photo_url, invite_code, club_code, owner_id,
        created_at, updated_at, settings,
        profiles:owner_id (id, display_name, avatar_url)
      `
      )
      .eq('id', groupId)
      .maybeSingle();

    if (groupErr) throw groupErr;
    if (!group || !group.is_active || group.is_private) {
      return res.status(404).json({ success: false, error: 'Home game not available' });
    }

    // 3. Upcoming games (next 10 scheduled)
    const today = new Date().toISOString().slice(0, 10);
    const { data: upcomingGames } = await supabase
      .from('commander_home_games')
      // Dan-fix/tournament-buildout: include format + starting_stack + structure
      // so the client can render tournaments distinctly from cash games.
      .select(
        'id, title, description, game_type, stakes, format, buyin_min, buyin_max, starting_stack, structure, scheduled_date, start_time, end_time, max_players, min_players, rsvp_yes, rsvp_maybe, waitlist_count, status, food_drinks, neighborhood, approximate_lat, approximate_lng'
      )
      .eq('group_id', group.id)
      .gte('scheduled_date', today)
      .neq('status', 'cancelled')
      .order('scheduled_date', { ascending: true })
      .limit(20);

    // 4. Recent public posts on the social page
    const { data: posts } = await supabase
      .from('social_page_posts')
      .select(
        'id, content, content_type, media_urls, like_count, comment_count, share_count, is_pinned, post_type, created_at, author_id'
      )
      .eq('page_id', page.id)
      .eq('visibility', 'public')
      .eq('is_approved', true)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(10);

    // Hydrate post authors in one batch
    let postsOut = [];
    if (posts && posts.length) {
      const authorIds = Array.from(new Set(posts.map((p) => p.author_id).filter(Boolean)));
      let authors = {};
      if (authorIds.length) {
        const { data: profRows } = await supabase
          .from('profiles')
          .select('id, display_name, avatar_url')
          .in('id', authorIds);
        (profRows || []).forEach((p) => {
          authors[p.id] = p;
        });
      }
      postsOut = posts.map((p) => ({
        ...p,
        author: authors[p.author_id] || null,
      }));
    }

    return res.status(200).json({
      success: true,
      data: {
        page: {
          id: page.id,
          slug: page.slug,
          name: page.name,
          description: page.description,
          avatar_url: page.avatar_url || group.profile_photo_url,
          cover_url: page.cover_url || group.cover_photo_url,
          city: page.location_city || group.city,
          state: page.location_state || group.state,
          country: page.location_country || 'US',
          follower_count: page.follower_count || 0,
          post_count: page.post_count || 0,
          view_count: page.view_count || 0,
          created_at: page.created_at,
        },
        group: {
          id: group.id,
          name: group.name,
          description: group.description || group.tagline || '',
          tagline: group.tagline,
          default_game_type: group.default_game_type,
          default_stakes: group.default_stakes,
          typical_buyin_min: group.typical_buyin_min,
          typical_buyin_max: group.typical_buyin_max,
          max_players: group.max_players,
          frequency: group.frequency,
          typical_day: group.typical_day,
          typical_time: group.typical_time,
          member_count: group.member_count || 0,
          games_hosted: group.games_hosted || 0,
          invite_code: group.invite_code,
          club_code: group.club_code,
          // Contact info — only present if host has set them
          ...(group.contact_phone ? { contact_phone: group.contact_phone } : {}),
          ...(group.website_url   ? { website_url:   group.website_url   } : {}),
          settings: group.settings || {},
          created_at: group.created_at,
        },
        host: group.profiles
          ? { id: group.profiles.id, display_name: group.profiles.display_name, avatar_url: group.profiles.avatar_url }
          : null,
        upcoming_games: upcomingGames || [],
        posts: postsOut,
      },
    });
  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    // eslint-disable-next-line no-console
    console.warn('[public/home-games/[slug]]', err);
    if (!res.headersSent) {
      return res.status(500).json({ success: false, error: err?.message || 'Internal server error' });
    }
  }
}

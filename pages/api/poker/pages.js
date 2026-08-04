/**
 * Poker Pages API - Aggregated feed of venue, tour, series, home game, charity, and club pages
 * Returns unified page objects for discovery and follow management
 *
 * GET /api/poker/pages
 *   ?category=venues|tours|series|home_games|charity|clubs|all (default: all)
 *   ?search=text
 *   ?user_id=X (returns follow status for each page)
 *   ?followed_only=true (only return pages user follows)
 *   ?state=XX (filter venues by state)
 *   ?sort=popular|name|newest (default: popular)
 *   ?limit=50
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { getTodayCST } from '../../../src/lib/trivia/getTodayCST';
import allVenuesData from '../../../data/all-venues.json';
import tourRegistry from '../../../data/tour-source-registry.json';
import tourSeriesData from '../../../data/poker-tour-series-2026.json';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
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

// UUID v4 format check — page_followers.user_id is UUID type
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The three JSON-backed builders below map static, per-deploy data. They were
// being re-run on every request — and buildVenuePages, which maps the whole
// 1.7MB all-venues.json, ran TWICE per request (once for the feed, once for the
// summary block). Memoise them at module scope.
let _venuePagesCache = null;
let _tourPagesCache = null;
const _seriesPagesCache = new Map(); // `${today}|${includeExpired}` -> pages

function buildVenuePages() {
    if (_venuePagesCache) return _venuePagesCache;
    _venuePagesCache = buildVenuePagesUncached();
    return _venuePagesCache;
}

function buildVenuePagesUncached() {
    const venues = allVenuesData.venues || [];
    return venues.map(v => ({
        page_type: 'venue',
        page_id: String(v.id),
        name: v.name,
        subtitle: `${v.city}, ${v.state}`,
        category: v.venue_type === 'casino' ? 'Casino' : v.venue_type === 'card_room' ? 'Card Room' : v.venue_type === 'charity' ? 'Charity' : v.venue_type === 'poker_club' ? 'Poker Club' : 'Venue',
        detail_url: `/hub/venues/${v.id}`,
        state: v.state,
        city: v.city,
        has_tournaments: v.has_tournaments,
        trust_score: v.trust_score || 0,
        phone: v.phone,
        website: v.website,
    }));
}

function buildTourPages() {
    if (_tourPagesCache) return _tourPagesCache;
    _tourPagesCache = buildTourPagesUncached();
    return _tourPagesCache;
}

function buildTourPagesUncached() {
    const tours = [];
    for (const [code, tour] of Object.entries(tourRegistry.tours || {})) {
        if (tour.is_active === false) continue;
        tours.push({
            page_type: 'tour',
            page_id: code,
            name: tour.tour_name,
            subtitle: tour.headquarters || '',
            category: tour.tour_type === 'major' ? 'Major Tour' : tour.tour_type === 'circuit' ? 'Circuit' : tour.tour_type === 'high_roller' ? 'High Roller' : tour.tour_type === 'regional' ? 'Regional' : 'Tour',
            detail_url: `/hub/tours/${code}`,
            tour_type: tour.tour_type,
            established: tour.established,
            official_website: tour.official_website,
            priority: tour.priority || 3,
        });
    }
    return tours.sort((a, b) => (a.priority || 3) - (b.priority || 3));
}

function buildSeriesPages(includeExpired = false) {
    // Keyed on the CST date so the cache rolls over with the day.
    const cacheKey = `${getTodayCST()}|${includeExpired ? 1 : 0}`;
    const cached = _seriesPagesCache.get(cacheKey);
    if (cached) return cached;
    if (_seriesPagesCache.size > 8) _seriesPagesCache.clear();
    const built = buildSeriesPagesUncached(includeExpired);
    _seriesPagesCache.set(cacheKey, built);
    return built;
}

function buildSeriesPagesUncached(includeExpired = false) {
    const allSeries = tourSeriesData.series_2026 || [];
    const today = getTodayCST(); // Phase 77 — CST anchor: don't expire today's series at 6pm CST
    return allSeries
        .filter(s => includeExpired || s.end_date >= today)
        .map((s, i) => ({
            page_type: 'series',
            page_id: String(s.id || i + 1),
            name: s.name,
            subtitle: s.venue ? `${s.venue}${s.city ? `, ${s.city}` : ''}` : s.location || '',
            category: s.series_type === 'major' ? 'Major Series' : s.series_type === 'circuit' ? 'Circuit' : 'Series',
            detail_url: `/hub/series/${s.id || i + 1}`,
            tour_code: s.tour || s.short_name,
            start_date: s.start_date,
            end_date: s.end_date,
            total_events: s.total_events,
            main_event_buyin: s.main_event_buyin,
        }))
        .sort((a, b) => new Date(a.start_date) - new Date(b.start_date));
}

// Build social pages (club, home_game, charity) from Supabase social_pages table
async function buildSocialPages(pageType) {
    try {
        // Query by column page_type OR metadata->page_type (dashboard writes to both)
        let query = getSupabase()
            .from('social_pages')
            .select('id, name, description, avatar_url, cover_url, category, page_type, location_city, location_state, follower_count, metadata, is_public, created_at')
            .eq('is_public', true)
                .limit(100);

        // Filter by page_type column
        if (pageType) {
            query = query.eq('page_type', pageType)
                .limit(100);
        }

        const { data, error } = await query.order('follower_count', { ascending: false })
            .limit(100);
        if (error || !data) return [];

        const CATEGORY_LABELS = {
            poker_room: 'Poker Room', casino: 'Casino', card_club: 'Card Club',
            charity: 'Charity Organization', league: 'League / Tour',
            home_game: 'Home Game', other: 'Other'
        };

        return data.map(p => {
            const effectiveType = p.metadata?.page_type || p.page_type || 'club';
            const locationStr = [p.location_city, p.location_state].filter(Boolean).join(', ');
            const categoryLabel = CATEGORY_LABELS[p.category] || p.category || 'Club';
            return {
                page_type: effectiveType,
                page_id: p.id,
                name: p.name,
                subtitle: locationStr,
                category: categoryLabel,
                avatar_url: p.avatar_url || p.metadata?.logo_url || null,
                cover_url: p.cover_url,
                description: p.description,
                follower_count: p.follower_count || 0,
                created_at: p.created_at,
                is_social_page: true,
            };
        });
    } catch (e) {
        console.warn('buildSocialPages error:', e);
        return [];
    }
}

export default async function handler(req, res) {
  try {
    if (!applyRateLimit(req, res, LIMITS.read)) return;

      if (req.method !== 'GET') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      try {
          const safeQ = (v) => v ? (Array.isArray(v) ? String(v[0]) : typeof v === 'object' ? null : String(v)) : v;
          const category = safeQ(req.query.category) || 'all';
          const search = safeQ(req.query.search);
          const user_id = safeQ(req.query.user_id);
          const followed_only = safeQ(req.query.followed_only);
          const state = safeQ(req.query.state);
          const sort = safeQ(req.query.sort) || 'popular';
          const limit = safeQ(req.query.limit) || 60;

          // Build pages from each source
          let pages = [];
          if (category === 'all' || category === 'venues') {
              pages.push(...buildVenuePages());
          }
          if (category === 'all' || category === 'tours') {
              pages.push(...buildTourPages());
          }
          if (category === 'all' || category === 'series') {
              pages.push(...buildSeriesPages(followed_only === 'true'));
          }
          // Social pages: home games, charity, clubs from Supabase
          if (category === 'all' || category === 'home_games') {
              pages.push(...await buildSocialPages('home_game'));
          }
          if (category === 'all' || category === 'charity') {
              pages.push(...await buildSocialPages('charity'));
          }
          if (category === 'all' || category === 'clubs') {
              pages.push(...await buildSocialPages('club'));
          }

          // Filter by state (venues only)
          if (state) {
              pages = pages.filter(p => p.page_type !== 'venue' || p.state === state.toUpperCase());
          }

          // Search filter
          if (search) {
              const searchLower = search.toLowerCase();
              pages = pages.filter(p =>
                  p.name?.toLowerCase().includes(searchLower) ||
                  p.subtitle?.toLowerCase().includes(searchLower) ||
                  p.category?.toLowerCase().includes(searchLower) ||
                  p.page_id?.toLowerCase().includes(searchLower)
              );
          }

          // Get follower counts from Supabase
          let followerCounts = {};
          let userFollows = new Set();

          try {
              // Follower counts. This was a single unfiltered, unpaginated select
              // of the whole page_followers table — PostgREST caps that at 1000
              // rows, so once the table grew past 1000 the counts on every page
              // card were simply wrong. Page through instead.
              const FOLLOWER_PAGE = 1000;
              const FOLLOWER_MAX_PAGES = 20; // 20k follow rows
              for (let page = 0; page < FOLLOWER_MAX_PAGES; page++) {
                  const { data: countData, error: countErr } = await getSupabase()
                      .from('page_followers')
                      .select('page_type, page_id')
                      .order('id', { ascending: true })
                      .range(page * FOLLOWER_PAGE, (page + 1) * FOLLOWER_PAGE - 1);
                  if (countErr) {
                      console.warn('[pages] follower count page', page, 'failed:', countErr.message);
                      break;
                  }
                  if (!countData || countData.length === 0) break;
                  countData.forEach(row => {
                      const key = `${row.page_type}:${row.page_id}`;
                      followerCounts[key] = (followerCounts[key] || 0) + 1;
                  });
                  if (countData.length < FOLLOWER_PAGE) break;
              }

              // Get user's follows if user_id provided (must be valid UUID for Supabase)
              if (user_id && UUID_RE.test(user_id)) {
                  const { data: follows } = await getSupabase()
                      .from('page_followers')
                      .select('page_type, page_id')
                      .eq('user_id', user_id)
                          .limit(100);

                  if (follows) {
                      follows.forEach(f => {
                          userFollows.add(`${f.page_type}:${f.page_id}`);
                      });
                  }
              }
          } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }

          // Attach follow data to pages
          pages = pages.map(p => ({
              ...p,
              follower_count: followerCounts[`${p.page_type}:${p.page_id}`] || 0,
              is_following: userFollows.has(`${p.page_type}:${p.page_id}`),
          }));

          // Filter to followed only
          if (followed_only === 'true') {
              pages = pages.filter(p => p.is_following);
          }

          // Sort
          if (sort === 'popular') {
              pages.sort((a, b) => {
                  // Tours first, then series, then venues, then social pages
                  const typeOrder = { tour: 0, series: 1, venue: 2, club: 3, home_game: 4, charity: 5 };
                  const typeA = typeOrder[a.page_type] ?? 6;
                  const typeB = typeOrder[b.page_type] ?? 6;
                  if (typeA !== typeB) return typeA - typeB;
                  // Then by follower count
                  return (b.follower_count || 0) - (a.follower_count || 0);
              });
          } else if (sort === 'name') {
              pages.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
          } else if (sort === 'newest') {
              // Series by start date, tours by priority, venues by trust
              pages.sort((a, b) => {
                  if (a.start_date && b.start_date) return new Date(a.start_date) - new Date(b.start_date);
                  if (a.start_date) return -1;
                  if (b.start_date) return 1;
                  return (b.follower_count || 0) - (a.follower_count || 0);
              });
          }

          const total = pages.length;

          // Summary reflects the FILTERED set (computed before the slice).
          // The old expression was `total - pages.filter(...).length <= total
          // ? buildVenuePages().length : 0` — the comparison is always true
          // because the subtracted length can never be negative, so the ternary
          // was dead code that always reported the full nationwide venue count
          // regardless of the active category or filters.
          const summary = {
              venues: pages.filter(p => p.page_type === 'venue').length,
              tours: pages.filter(p => p.page_type === 'tour').length,
              series: pages.filter(p => p.page_type === 'series').length,
              user_following: userFollows.size,
          };

          // `?limit=abc` used to yield NaN (empty array, UI shows "no results")
          // and `?limit=999999` dumped all ~3,000 venues in one response.
          const parsedLimit = parseInt(limit, 10);
          const limitNum = Math.min(Math.max(Number.isFinite(parsedLimit) ? parsedLimit : 60, 1), 200);
          const parsedOffset = parseInt(safeQ(req.query.offset), 10);
          const offsetNum = Math.max(Number.isFinite(parsedOffset) ? parsedOffset : 0, 0);

          pages = pages.slice(offsetNum, offsetNum + limitNum);

          return res.status(200).json({
              success: true,
              data: pages,
              total,
              offset: offsetNum,
              limit: limitNum,
              summary,
          });

      } catch (error) {
          console.warn('Pages API error:', error);
          return res.status(500).json({ success: false, error: 'Internal server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

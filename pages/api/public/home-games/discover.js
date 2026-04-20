/**
 * ══════════════════════════════════════════════════════════════════════════
 *  PUBLIC HOME GAMES — DISCOVER API
 *  GET /api/public/home-games/discover
 * ══════════════════════════════════════════════════════════════════════════
 *
 *  No auth required. Returns public home game groups joined with their
 *  social_pages (created in the unify_home_games_with_social_pages migration).
 *
 *  Query params:
 *    state=IL         — filter by state code
 *    city=Chicago     — ilike filter on city
 *    game_type=nlh    — filter by default_game_type
 *    frequency=weekly — filter by frequency
 *    limit=50         — page size (max 100, default 50)
 *
 *  Shape per result:
 *    { id, slug, name, city, state, country,
 *      avatar_url, cover_url, description,
 *      default_game_type, default_stakes, frequency, member_count,
 *      follower_count, post_count, view_count,
 *      home_group_id, invite_code, next_game_date, next_game_title,
 *      host: { display_name, avatar_url } }
 *
 *  CDN-cached 60s fresh / 300s stale-while-revalidate.
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

function escapeIlike(s) {
  return (s || '').replace(/[%_\\]/g, (c) => '\\' + c);
}

// Deterministic per-group jitter for approximate coordinates. We don't want
// to leak the exact host address on a public map, but we also don't want a
// marker to hop around on every page load. Seed the jitter off the group id
// so it's stable for the same group but different for different groups.
//
// Approx bounds: ±0.005° lat ≈ ±0.35 mi, ±0.006° lng ≈ ±0.3 mi at US lats.
function jitterCoord(groupId, lat, lng) {
  if (lat == null || lng == null) return { lat: null, lng: null };
  if (!groupId) return { lat: Number(lat), lng: Number(lng) };
  // Cheap stable hash of the UUID string -> two signed offsets in ±0.005°.
  let a = 0, b = 0;
  const s = String(groupId);
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    a = (a * 31 + c) >>> 0;
    b = (b * 37 + c * 7) >>> 0;
  }
  const dLat = ((a % 10000) / 10000 - 0.5) * 0.01;
  const dLng = ((b % 10000) / 10000 - 0.5) * 0.012;
  return {
    lat: Number(lat) + dLat,
    lng: Number(lng) + dLng,
  };
}

export default async function handler(req, res) {
  try {
    if (!applyRateLimit(req, res, LIMITS.read)) return;

    if (req.method !== 'GET') {
      res.setHeader('Allow', ['GET']);
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');

    const {
      state,
      city,
      game_type,
      frequency,
      search,
      lat: rawLat,
      lng: rawLng,
      radius_miles: rawRadius,
      limit: rawLimit = '50',
    } = req.query;

    const limit = Math.min(Math.max(parseInt(rawLimit, 10) || 50, 1), 100);
    const supabase = getSupabase();

    // ── PHASE 21 — GEO PARAMS ─────────────────────────────────────────
    //
    // Home Games Near Me passes lat/lng/radius_miles. We apply:
    //   • Haversine distance from user → each group (on REAL coords,
    //     computed BEFORE jittering for privacy)
    //   • radius filter (drop groups beyond radius_miles)
    //   • distance sort ascending
    // Distance is exposed on the response as `distance_miles` for UI.
    // If lat/lng aren't provided, behavior is unchanged (member_count sort).
    function parseNum(v, min, max) {
      const n = parseFloat(v);
      if (!isFinite(n)) return null;
      if (n < min || n > max) return null;
      return n;
    }
    const userLat = rawLat != null ? parseNum(rawLat, -90, 90)   : null;
    const userLng = rawLng != null ? parseNum(rawLng, -180, 180) : null;
    const hasGps  = userLat != null && userLng != null;
    const radiusMiles = hasGps
      ? Math.min(Math.max(parseFloat(rawRadius) || 50, 1), 500)
      : null;

    // Haversine on real (unjittered) coordinates.
    function haversineMiles(lat1, lng1, lat2, lng2) {
      const R = 3958.8; // Earth radius in miles
      const toRad = (d) => (d * Math.PI) / 180;
      const dLat = toRad(lat2 - lat1);
      const dLng = toRad(lng2 - lng1);
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
      return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
    }

    // ── 1. Query public+active home groups joined with their social pages.
    //      We go group-first because commander_home_groups holds the live
    //      member_count / frequency / lat-lng / owner_id. social_pages
    //      contributes slug + follower_count + avatar/cover (sync'd by trigger).
    let q = supabase
      .from('commander_home_groups')
      .select(`
        id,
        name,
        description,
        tagline,
        is_private,
        is_active,
        city,
        state,
        latitude,
        longitude,
        default_game_type,
        default_stakes,
        typical_buyin_min,
        typical_buyin_max,
        frequency,
        typical_day,
        typical_time,
        member_count,
        games_hosted,
        cover_photo_url,
        profile_photo_url,
        invite_code,
        club_code,
        owner_id,
        created_at,
        updated_at,
        last_activity_at,
        visibility_override_until,
        profiles:owner_id (id, display_name, avatar_url)
      `)
      .eq('is_active', true)
      .eq('is_private', false);

    // ── PHASE 18 — 45-DAY AUTO-HIDE FILTER ────────────────────────────
    //
    // Per Dan: groups hidden from Poker Near Me if they haven't posted
    // or done anything new in 45 days. The `last_activity_at` column on
    // commander_home_groups is maintained by triggers on 6 source tables
    // representing human engagement (page posts, page reviews, member
    // joins, RSVPs, reviews, host edits). Auto-scheduled tournaments do
    // NOT count as activity (Dan: "Club Commander lets you schedule
    // tournaments a year in advance — a future scheduled game proves
    // nothing about whether the group is actually alive").
    //
    // A group is visible if ANY ONE of:
    //   (a) last_activity_at >= 45 days ago                 (recent engagement)
    //   (b) created_at       >= 45 days ago                 (new-group grace window)
    //   (c) visibility_override_until > NOW()               (future host-paid override)
    //
    // We do NOT flip is_active=false — the host's own Commander dashboard
    // continues to show their group normally. This filter ONLY hides the
    // group from public discovery. One new post → last_activity_at bumps
    // → group instantly reappears, via trigger. Self-healing.
    const HOME_GROUP_INACTIVITY_DAYS = 45;
    const inactivityCutoffIso = new Date(Date.now() - HOME_GROUP_INACTIVITY_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const nowIso              = new Date().toISOString();
    q = q.or(
      `last_activity_at.gte.${inactivityCutoffIso},` +
      `created_at.gte.${inactivityCutoffIso},` +
      `visibility_override_until.gt.${nowIso}`
    );

    q = q.order('member_count', { ascending: false })
         .limit(limit);

    if (state) q = q.eq('state', state);
    if (city) q = q.ilike('city', `%${escapeIlike(city)}%`);
    if (game_type) q = q.eq('default_game_type', game_type);
    if (frequency) q = q.eq('frequency', frequency);
    // Free-text search across name, city, state — used by the PNM lobby tab.
    if (search && typeof search === 'string' && search.trim().length > 0) {
      const s = escapeIlike(search.trim());
      q = q.or(`name.ilike.%${s}%,city.ilike.%${s}%,state.ilike.%${s}%`);
    }

    const { data: groups, error } = await q;
    if (error) throw error;

    const groupIds = (groups || []).map((g) => g.id);
    if (!groupIds.length) {
      return res.status(200).json({ success: true, groups: [], filters: { state, city, game_type, frequency } });
    }

    // ── 2. Pull the matching social_pages for each group (slug, counts, avatar/cover).
    const groupIdStrs = groupIds.map(String);
    const { data: pages } = await supabase
      .from('social_pages')
      .select('id, slug, linked_entity_id, avatar_url, cover_url, follower_count, post_count, view_count, is_public')
      .eq('linked_entity_type', 'home_group')
      .in('linked_entity_id', groupIdStrs);

    const pageByGroupId = {};
    (pages || []).forEach((p) => {
      pageByGroupId[p.linked_entity_id] = p;
    });

    // ── 3. Pull the next upcoming game per group (single query, filter app-side).
    const today = new Date().toISOString().slice(0, 10);
    const { data: upcoming } = await supabase
      .from('commander_home_games')
      .select('id, group_id, title, scheduled_date, start_time, game_type, stakes, rsvp_yes, max_players, status')
      .in('group_id', groupIds)
      .gte('scheduled_date', today)
      .neq('status', 'cancelled')
      .order('scheduled_date', { ascending: true })
      .limit(100);

    const nextByGroupId = {};
    (upcoming || []).forEach((g) => {
      if (!nextByGroupId[g.group_id]) nextByGroupId[g.group_id] = g;
    });

    // ── 4. Shape response. Use social_page slug for canonical URL when present;
    //      fall back to club_code/invite_code so the card never has a null href.
    let out = (groups || []).map((g) => {
      const page = pageByGroupId[String(g.id)] || null;
      const next = nextByGroupId[g.id] || null;
      // ── Distance calc runs BEFORE jittering — use the real DB lat/lng
      // so distance is accurate. The coordinates returned to the client
      // are still jittered for privacy.
      let distance_miles = null;
      if (hasGps && g.latitude != null && g.longitude != null) {
        distance_miles = haversineMiles(
          userLat, userLng,
          parseFloat(g.latitude), parseFloat(g.longitude)
        );
        distance_miles = Math.round(distance_miles * 10) / 10;
      }
      const jittered = jitterCoord(g.id, g.latitude, g.longitude);
      return {
        id: g.id,
        slug: page?.slug || null,
        club_code: g.club_code || null,
        invite_code: g.invite_code || null,
        name: g.name,
        description: g.description || g.tagline || '',
        city: g.city || '',
        state: g.state || '',
        country: 'US',
        // Jittered ~0.3mi so exact host address isn't revealed. Stable per-group.
        approximate_lat: jittered.lat,
        approximate_lng: jittered.lng,
        // Legacy aliases for VenueMap / VenueCard which read 'latitude'/'longitude'.
        latitude: jittered.lat,
        longitude: jittered.lng,
        distance_miles,  // Phase 21 — null if no GPS in request
        avatar_url: page?.avatar_url || g.profile_photo_url || null,
        cover_url: page?.cover_url || g.cover_photo_url || null,
        default_game_type: g.default_game_type || null,
        default_stakes: g.default_stakes || null,
        typical_buyin_min: g.typical_buyin_min || null,
        typical_buyin_max: g.typical_buyin_max || null,
        frequency: g.frequency || null,
        typical_day: g.typical_day || null,
        typical_time: g.typical_time || null,
        member_count: g.member_count || 0,
        games_hosted: g.games_hosted || 0,
        follower_count: page?.follower_count || 0,
        post_count: page?.post_count || 0,
        view_count: page?.view_count || 0,
        next_game_date: next?.scheduled_date || null,
        next_game_time: next?.start_time || null,
        next_game_title: next?.title || null,
        next_game_seats_left:
          next && next.max_players != null ? Math.max(0, (next.max_players || 0) - (next.rsvp_yes || 0)) : null,
        host: g.profiles
          ? { id: g.profiles.id, display_name: g.profiles.display_name, avatar_url: g.profiles.avatar_url }
          : null,
      };
    });

    // ── PHASE 21 — GEO FILTER + SORT ──────────────────────────────────
    // Applied AFTER shape so `distance_miles` is populated.
    if (hasGps) {
      // Filter out groups outside the radius (those without coords are kept;
      // they have distance_miles=null and surface at the end of the list).
      out = out.filter((g) =>
        g.distance_miles == null || g.distance_miles <= radiusMiles
      );
      // Sort: groups with distance first (ascending), groups without
      // coords after, tie-breaking on member_count.
      out.sort((a, b) => {
        if (a.distance_miles == null && b.distance_miles == null) {
          return (b.member_count || 0) - (a.member_count || 0);
        }
        if (a.distance_miles == null) return 1;
        if (b.distance_miles == null) return -1;
        return a.distance_miles - b.distance_miles;
      });
    }

    return res.status(200).json({
      success: true,
      groups: out,
      filters: { state, city, game_type, frequency },
      count: out.length,
    });
  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) {}
    // eslint-disable-next-line no-console
    console.error('[public/home-games/discover]', err);
    if (!res.headersSent) {
      return res.status(500).json({ success: false, error: err?.message || 'Internal server error' });
    }
  }
}

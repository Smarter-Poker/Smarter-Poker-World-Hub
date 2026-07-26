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

// Coarse coordinate for public display. The ORIGINAL design used a hash
// of groupId to jitter the real coord by ±0.005°. That was security-
// through-obscurity: the hash function lives in public source, so any
// attacker could recompute the offset for any visible groupId and
// subtract it out to recover the EXACT host address from a single
// discover response.
//
// Real design (F33): snap the real coord to a 0.005° grid (~0.3 mi
// cell). What we return is the CELL ANCHOR — a single point shared by
// every real location inside that cell. No reverse-engineering recovers
// the sub-cell position, because that information was genuinely thrown
// away when we snapped. Attack surface is bounded at cell size.
//
// A small stable in-cell offset (±0.002°) is added so multiple groups
// inside the same cell don't stack on top of each other on the map. The
// offset is derived from groupId — publicly computable, but it only
// scatters pins within the already-privacy-preserved cell, so knowing
// the offset gives an attacker zero additional information about the
// real location.
//
// Bounds: 0.005° lat ≈ 0.35 mi at US latitudes; 0.005° lng ≈ 0.25 mi at
// 45°N and 0.4 mi at 30°N. Close enough to the original privacy target.
function jitterCoord(groupId, lat, lng) {
  if (lat == null || lng == null) return { lat: null, lng: null };
  const nLat = Number(lat);
  const nLng = Number(lng);
  // Snap to 0.005° grid — the real coord is somewhere inside this cell.
  const cellLat = Math.round(nLat * 200) / 200;
  const cellLng = Math.round(nLng * 200) / 200;
  if (!groupId) return { lat: cellLat, lng: cellLng };
  // Stable in-cell offset for map-pin scatter only. Max ±0.002° so
  // the returned point stays inside the privacy cell.
  let a = 0, b = 0;
  const s = String(groupId);
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    a = (a * 31 + c) >>> 0;
    b = (b * 37 + c * 7) >>> 0;
  }
  const dLat = ((a % 10000) / 10000 - 0.5) * 0.004;
  const dLng = ((b % 10000) / 10000 - 0.5) * 0.004;
  return { lat: cellLat + dLat, lng: cellLng + dLng };
}

export default async function handler(req, res) {
  try {
    if (!applyRateLimit(req, res, LIMITS.read)) return;

    if (req.method !== 'GET') {
      res.setHeader('Allow', ['GET']);
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');

    const safeQ = (v) => v ? (Array.isArray(v) ? String(v[0]) : typeof v === 'object' ? null : String(v)) : v;
    const state = safeQ(req.query.state);
    const city = safeQ(req.query.city);
    const game_type = safeQ(req.query.game_type);
    const frequency = safeQ(req.query.frequency);
    const search = safeQ(req.query.search);
    const userLat = safeQ(req.query.lat);
    const userLng = safeQ(req.query.lng);
    const radiusMiles = safeQ(req.query.radius_miles);
    const rawLimit = safeQ(req.query.limit) || '50';

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
    const parsedLat = userLat != null ? parseNum(userLat, -90, 90)   : null;
    const parsedLng = userLng != null ? parseNum(userLng, -180, 180) : null;
    const hasGps    = parsedLat != null && parsedLng != null;
    const parsedRadius = hasGps
      ? Math.min(Math.max(parseFloat(radiusMiles) || 50, 1), 500)
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

    // ── GEO PRE-FILTER (bounding box) ─────────────────────────────────
    //
    // The radius filter runs app-side (it needs the jittered coordinate),
    // so without a DB-level pre-filter the `.limit()` below truncates to the
    // global top-N by member_count BEFORE the radius test ever runs. Once
    // there are more public groups nationwide than `limit`, a user in a small
    // town sees "No home games found nearby" because the top-N are all in
    // Vegas/LA. Push a cheap lat/lng bounding box into the query so the
    // fetched window is local, and raise the ceiling in GPS mode so the
    // app-side radius filter + distance sort have a real candidate pool.
    // Groups with no coordinates are still included (they surface at the end
    // of the list), matching the pre-existing app-side behavior below.
    let dbLimit = limit;
    if (hasGps) {
      // Pad by 1 mile: the distance we filter on is measured from the
      // privacy-jittered coordinate, which sits up to ~0.35 mi from the real
      // one, so a group right at the radius edge must not fall out of the box.
      const boxRadius = parsedRadius + 1;
      const dLat = boxRadius / 69;
      const cosLat = Math.max(0.05, Math.cos((parsedLat * Math.PI) / 180));
      const dLng = boxRadius / (69 * cosLat);
      const latMin = Math.max(-90, parsedLat - dLat);
      const latMax = Math.min(90, parsedLat + dLat);
      const lngMin = parsedLng - dLng;
      const lngMax = parsedLng + dLng;

      const clauses = ['latitude.is.null', 'longitude.is.null'];
      // Skip the longitude half of the box near the antimeridian rather than
      // emitting an out-of-range window that would match nothing.
      if (lngMin >= -180 && lngMax <= 180) {
        clauses.push(
          `and(latitude.gte.${latMin},latitude.lte.${latMax},longitude.gte.${lngMin},longitude.lte.${lngMax})`
        );
      } else {
        clauses.push(`and(latitude.gte.${latMin},latitude.lte.${latMax})`);
      }
      q = q.or(clauses.join(','));

      // Fetch ceiling for GPS mode. The caller's `limit` is applied AFTER the
      // radius filter + distance sort (see below) so it means "closest N",
      // not "N of the biggest groups that happen to be nearby".
      dbLimit = 500;
    }

    q = q.order('member_count', { ascending: false })
         .limit(dbLimit);

    if (state) q = q.eq('state', state);
    if (city) q = q.ilike('city', `%${escapeIlike(city)}%`);
    if (game_type) q = q.eq('default_game_type', game_type);
    if (frequency) q = q.eq('frequency', frequency);
    // Free-text search across name, city, state — used by the PNM lobby tab.
    // Cap at 200 chars: anything longer is almost certainly a DoS probe
    // (8KB+ URL fails at the edge before reaching this handler anyway, but
    // giving a clean 400 for anything plausibly long is better UX).
    if (search != null) {
      if (typeof search !== 'string' || search.length > 200) {
        return res.status(400).json({ success: false, error: 'search too long (max 200 chars)' });
      }
      if (search.trim().length > 0) {
        const s = escapeIlike(search.trim());
        q = q.or(`name.ilike.%${s}%,city.ilike.%${s}%,state.ilike.%${s}%`);
      }
    }

    const { data: groups, error } = await q;
    if (error) throw error;

    // ── GEO NARROWING ─────────────────────────────────────────────────
    // Apply the radius filter + distance sort + the caller's page size HERE,
    // before the follow-up social_pages / upcoming-games lookups, so those
    // queries only ever run against the groups we're actually returning.
    let groupList = groups || [];
    if (hasGps) {
      groupList = groupList
        .map((g) => {
          const j = jitterCoord(g.id, g.latitude, g.longitude);
          const raw =
            j.lat != null && j.lng != null
              ? haversineMiles(parsedLat, parsedLng, j.lat, j.lng)
              : null;
          return { g, raw };
        })
        // Groups without coords are kept and surface at the end of the list.
        .filter((e) => e.raw == null || e.raw <= parsedRadius)
        .sort((a, b) => {
          if (a.raw == null && b.raw == null) {
            return (b.g.member_count || 0) - (a.g.member_count || 0);
          }
          if (a.raw == null) return 1;
          if (b.raw == null) return -1;
          return a.raw - b.raw;
        })
        .slice(0, limit)
        .map((e) => e.g);
    }

    const groupIds = groupList.map((g) => g.id);
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
    // Timezone safety: toISOString() is UTC, so from ~5pm local onward in US
    // timezones the UTC date is already tomorrow and tonight's game would be
    // excluded — exactly when players are looking for a game. Shift 12h west
    // so the cutoff never runs ahead of any US local date.
    const today = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString().slice(0, 10);
    // Budget the row cap by group count. A flat 100 is shared across up to 100
    // groups, so groups with dense schedules (weekly games booked a year out)
    // eat the whole budget and other groups lose their "Next game" banner.
    const upcomingRowCap = Math.min(1000, Math.max(100, groupIds.length * 5));
    const { data: upcoming, error: upcomingErr } = await supabase
      .from('commander_home_games')
      .select('id, group_id, title, scheduled_date, start_time, game_type, stakes, rsvp_yes, max_players, status')
      .in('group_id', groupIds)
      .gte('scheduled_date', today)
      .neq('status', 'cancelled')
      .order('scheduled_date', { ascending: true })
      .limit(upcomingRowCap);

    if (upcomingErr) {
      // eslint-disable-next-line no-console
      console.warn('[public/home-games/discover] upcoming games query failed:', upcomingErr.message);
    }

    const nextByGroupId = {};
    (upcoming || []).forEach((g) => {
      if (!nextByGroupId[g.group_id]) nextByGroupId[g.group_id] = g;
    });

    // ── 4. Shape response. Use social_page slug for canonical URL when present;
    //      fall back to club_code/invite_code so the card never has a null href.
    let out = groupList.map((g) => {
      const page = pageByGroupId[String(g.id)] || null;
      const next = nextByGroupId[g.id] || null;
      // ── Distance calc
      // F33 (privacy): prior code computed distance from REAL lat/lng and
      // exposed the result rounded to 0.1 mile. Combined with the
      // deterministically-seeded jitter (which anyone can reverse from the
      // public source + group_id), an attacker could query discover from 3+
      // GPS points, trilaterate on the exposed distances, and recover the
      // REAL host address to ~0.05-mile precision — i.e., the exact house.
      //
      // Fix layers:
      //   1. Compute distance from the JITTERED coord. A trilateration now
      //      solves for the jittered point, which is offset from the real
      //      point by up to ±0.3 miles.
      //   2. Round the EXPOSED distance to whole miles. Even if an attacker
      //      reverses the jitter seed, the distance granularity caps the
      //      attack at ≈0.5-mile precision — enough for "this group is in
      //      the Loop" but not "this group is at 123 W Madison #4A."
      //
      // The internal radius filter and sort still use the unrounded value
      // (below) so "within 5 mi" works exactly as before.
      let distance_miles = null;
      let rawDistanceMiles = null;
      const jittered = jitterCoord(g.id, g.latitude, g.longitude);
      if (hasGps && jittered.lat != null && jittered.lng != null) {
        rawDistanceMiles = haversineMiles(
          parsedLat, parsedLng,
          jittered.lat, jittered.lng
        );
        distance_miles = Math.round(rawDistanceMiles);
      }
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
        distance_miles,  // Phase 21 — null if no GPS in request. Whole-mile precision.
        // Internal-only field used by radius filter + sort below. NOT
        // exposed to the client (stripped at the end of the shape block).
        _rawDistanceMiles: rawDistanceMiles,
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
    // Applied AFTER shape so `_rawDistanceMiles` is populated. Filter and
    // sort use the unrounded internal value so "within 5 mi" behaves
    // exactly as the user expects — the rounding only affects what we
    // EXPOSE (see F33 privacy fix in the map block above).
    if (hasGps) {
      // Filter out groups outside the radius (those without coords are kept;
      // they have _rawDistanceMiles=null and surface at the end of the list).
      out = out.filter((g) =>
        g._rawDistanceMiles == null || g._rawDistanceMiles <= parsedRadius
      );
      // Sort: groups with distance first (ascending), groups without
      // coords after, tie-breaking on member_count.
      out.sort((a, b) => {
        if (a._rawDistanceMiles == null && b._rawDistanceMiles == null) {
          return (b.member_count || 0) - (a.member_count || 0);
        }
        if (a._rawDistanceMiles == null) return 1;
        if (b._rawDistanceMiles == null) return -1;
        return a._rawDistanceMiles - b._rawDistanceMiles;
      });
    }

    // Strip the internal field before returning so clients can't recover
    // sub-mile precision. Must run AFTER filter/sort.
    for (const g of out) {
      delete g._rawDistanceMiles;
    }

    return res.status(200).json({
      success: true,
      groups: out,
      filters: { state, city, game_type, frequency },
      count: out.length,
    });
  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    // eslint-disable-next-line no-console
    console.warn('[public/home-games/discover]', err);
    if (!res.headersSent) {
      return res.status(500).json({ success: false, error: err?.message || 'Internal server error' });
    }
  }
}

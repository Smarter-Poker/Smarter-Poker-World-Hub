/**
 * Public Home Game API
 * GET /api/public/home-game/[code] - Get public home game group info
 * No authentication required - returns only public data
 */
import { createClient } from '../../../../src/lib/supabaseServerClient';
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
      const code = safeQ(req.query.code);

      if (!code) {
        return res.status(400).json({
          success: false,
          error: { code: 'MISSING_CODE', message: 'Club code required' }
        });
      }

      // Fetch home game group by club_code
      const { data: group, error: groupError } = await getSupabase()
        .from('commander_home_groups')
        .select(`
          id,
          name,
          description,
          club_code,
          is_private,
          requires_approval,
          city,
          state,
          default_game_type,
          default_stakes,
          typical_buyin_min,
          typical_buyin_max,
          max_players,
          typical_day,
          typical_time,
          frequency,
          member_count,
          games_hosted,
          created_at,
          owner:owner_id (
            id,
            display_name,
            avatar_url
          )
        `)
        .eq('club_code', code)
        .eq('is_active', true)
        .maybeSingle();

      if (groupError || !group) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Home game group not found' }
        });
      }

      // For private groups, only show basic info
      if (group.is_private) {
        return res.status(200).json({
          success: true,
          data: {
            group: {
              id: group.id,
              name: group.name,
              club_code: group.club_code,
              is_private: true,
              requires_approval: group.requires_approval,
              city: group.city,
              state: group.state,
              member_count: group.member_count,
              host: group.owner?.display_name || 'Host'
            },
            upcoming_games: [],
            message: 'This is a private group. Request an invite to see details.',
            links: {
              join_request: `/hub/commander/home-games/join?code=${code}`,
              smarter_poker: `https://smarter.poker/home-game/${code}`,
              poker_near_me: `https://pokernear.me/home-game/${code}`
            }
          }
        });
      }

      // For public groups, fetch upcoming games
      // Dan-fix/tournament-buildout: include format + description so the
      // client can render tournaments separately.
      // Limit raised from 5 → 20 to surface a host's full upcoming schedule.
      // CORRECTED 2026-08-12: the note here previously claimed
      // "commander_home_games has no starting_stack/structure column".
      // That is FALSE — both columns exist in production (verified against
      // information_schema on 2026-08-12). The stale note caused this route
      // to omit them while its sibling
      // pages/api/public/home-games/[slug].js selected them, so the two
      // public endpoints returned different shapes for the same game and
      // tournament cards served from THIS route labelled every event
      // "Standard".
      //
      // The underlying warning is still worth heeding, just not here:
      // selecting a column that does not exist 42703s the WHOLE query and
      // silently empties the list. Confirm a column exists before adding it.
      //
      // Timezone safety: toISOString() is UTC, so from ~5pm local onward in
      // US timezones the UTC date is already tomorrow and tonight's game
      // would vanish. Shift 12h west so the cutoff never runs ahead of any
      // US local date.
      const todayCutoff = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString().split('T')[0];
      const { data: upcomingGames, error: upcomingErr } = await getSupabase()
        .from('commander_home_games')
        .select(`
          id,
          title,
          description,
          game_type,
          stakes,
          format,
          structure,
          starting_stack,
          buyin_min,
          buyin_max,
          scheduled_date,
          start_time,
          max_players,
          rsvp_yes,
          rsvp_maybe,
          status
        `)
        .eq('group_id', group.id)
        .in('status', ['scheduled', 'confirmed'])
        .gte('scheduled_date', todayCutoff)
        .order('scheduled_date', { ascending: true })
        .limit(20);

      // Surface schema drift instead of rendering "no upcoming games".
      if (upcomingErr) {
        console.warn('[public/home-game/[code]] upcoming games query failed:', upcomingErr.message);
      }

      // Get recent game history (count only)
      const { count: recentGamesCount } = await getSupabase()
        .from('commander_home_games')
        .select('*', { count: 'exact', head: true })
        .eq('group_id', group.id)
        .eq('status', 'completed')
        .gte('scheduled_date', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);

      return res.status(200).json({
        success: true,
        data: {
          group: {
            id: group.id,
            name: group.name,
            description: group.description,
            club_code: group.club_code,
            is_private: group.is_private,
            requires_approval: group.requires_approval,
            city: group.city,
            state: group.state,
            default_game_type: group.default_game_type,
            default_stakes: group.default_stakes,
            typical_buyin_min: group.typical_buyin_min,
            typical_buyin_max: group.typical_buyin_max,
            max_players: group.max_players,
            typical_day: group.typical_day,
            typical_time: group.typical_time,
            frequency: group.frequency,
            member_count: group.member_count,
            games_hosted: group.games_hosted,
            host: group.owner?.display_name || 'Host',
            host_avatar: group.owner?.avatar_url
          },
          upcoming_games: upcomingGames || [],
          stats: {
            games_last_90_days: recentGamesCount || 0,
            total_games_hosted: group.games_hosted,
            total_members: group.member_count
          },
          links: {
            join_request: `/hub/commander/home-games/join?code=${code}`,
            smarter_poker: `https://smarter.poker/home-game/${code}`,
            poker_near_me: `https://pokernear.me/home-game/${code}`
          }
        }
      });
    } catch (error) {
      console.warn('Public home game API error:', error);
      return res.status(500).json({
        success: false,
        error: { code: 'SERVER_ERROR', message: 'Failed to fetch home game' }
      });
    }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

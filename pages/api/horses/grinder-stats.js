import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../src/lib/sentryWrap';

import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
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
  // [Phase 6.1.15] Rate limit writes — prevents enumeration + drain attacks.
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }

  try {
      // Verify user is authenticated via Authorization header
      const authHeader = req.headers.authorization;
      if (!authHeader) return res.status(401).json({ success: false, error: 'Unauthorized' });

      const token = authHeader.replace('Bearer ', '');
      const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
      const user = authData?.user;
      if (authErr || !user) return res.status(401).json({ success: false, error: 'Unauthorized' });

      // Verify Admin Role
      const { data: profile } = await getSupabase()
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .maybeSingle();

      if (!profile || !['admin', 'superadmin', 'god'].includes(profile.role)) {
          return res.status(403).json({ success: false, error: 'Access denied' });
      }

      if (req.method === 'GET') {
          try {
              // A horse occupies a seat as its linked profile: the mapping is
              // content_authors.profile_id -> table_seats.user_id. Verified
              // against production 2026-08-26 (366 of 381 occupied seats match
              // a content_authors.profile_id). table_seats.horse_id exists but
              // is NULL for every row, and table_seats.player_id matches no
              // content_authors.id, so neither can be used.
              const SEAT_SCAN_CAP = 5000;
              // player_stats is one row per (user_id, club_id) — 1,732 rows
              // in production, 1,641 of them belonging to horses. The whole
              // table is pulled and grouped in JS because PostgREST aggregate
              // functions are DISABLED on this project (`hands_played.sum()`
              // returns PGRST123 "Use of aggregate functions is not allowed",
              // verified against production 2026-08-26), so a server-side
              // GROUP BY is not reachable from PostgREST at all.
              const PLAYER_STATS_CAP = 5000;

              const [personasRes, totalHorsesRes, seatsRes, activeTablesRes, playerStatsRes] = await Promise.all([
                  getSupabase()
                      .from('content_authors')
                      .select('id, name, profile_id, is_active')
                      .eq('is_active', true),

                  // Every horse, active or not, so the UI can label the two
                  // populations honestly instead of calling the active subset
                  // "total".
                  getSupabase()
                      .from('content_authors')
                      .select('id', { count: 'exact', head: true }),

                  // An occupied seat is one that has not been left.
                  getSupabase()
                      .from('table_seats')
                      .select('table_id, user_id')
                      .is('left_at', null)
                      .not('user_id', 'is', null)
                      .limit(SEAT_SCAN_CAP),

                  getSupabase()
                      .from('tables')
                      .select('id', { count: 'exact', head: true })
                      .in('status', ['running', 'active']),

                  // Per-player lifetime hands and money, keyed on the same
                  // user_id the roster already resolves (content_authors
                  // .profile_id). Summed across clubs below.
                  getSupabase()
                      .from('player_stats')
                      .select('user_id, hands_played, total_winnings, total_losses')
                      .limit(PLAYER_STATS_CAP),
              ]);

              if (personasRes.error) {
                  console.warn('Grinder Stats: content_authors error:', personasRes.error.message || personasRes.error);
                  return res.status(500).json({ success: false, error: 'Failed to fetch grinder stats' });
              }
              if (totalHorsesRes.error) console.warn('Grinder Stats: content_authors count error:', totalHorsesRes.error.message || totalHorsesRes.error);
              if (seatsRes.error) console.warn('Grinder Stats: table_seats error:', seatsRes.error.message || seatsRes.error);
              if (activeTablesRes.error) console.warn('Grinder Stats: tables error:', activeTablesRes.error.message || activeTablesRes.error);
              if (playerStatsRes.error) console.warn('Grinder Stats: player_stats error:', playerStatsRes.error.message || playerStatsRes.error);

              const personas = personasRes.data || [];
              const seats = seatsRes.data || [];
              const playerStatRows = playerStatsRes.data || [];
              const playerStatsAvailable = !playerStatsRes.error;

              // Lifetime hands + profit per user, summed over that user's
              // rows (one per club they have played in).
              const perfByUser = new Map();
              playerStatRows.forEach(row => {
                  if (!row?.user_id) return;
                  const agg = perfByUser.get(row.user_id) || { hands: 0, profit: 0 };
                  agg.hands += Number(row.hands_played) || 0;
                  agg.profit += (Number(row.total_winnings) || 0) - (Number(row.total_losses) || 0);
                  perfByUser.set(row.user_id, agg);
              });

              // seats currently held, per horse profile id
              const seatsByProfile = new Map();
              seats.forEach(s => {
                  if (!s.user_id) return;
                  const set = seatsByProfile.get(s.user_id) || new Set();
                  if (s.table_id) set.add(s.table_id);
                  seatsByProfile.set(s.user_id, set);
              });

              const roster = personas.map(p => {
                  const heldTables = p.profile_id ? (seatsByProfile.get(p.profile_id)?.size || 0) : 0;
                  // Measured, not fabricated. A horse with no player_stats row
                  // has genuinely never been recorded playing a hand, so 0 is
                  // the true answer; null is reserved for the case where the
                  // player_stats read itself failed.
                  const perf = p.profile_id ? perfByUser.get(p.profile_id) : null;
                  return {
                      horse_id: p.id,
                      name: p.name,
                      tables: heldTables,
                      hands: playerStatsAvailable ? (perf?.hands || 0) : null,
                      profit: playerStatsAvailable ? Math.round((perf?.profit || 0) * 100) / 100 : null,
                      status: heldTables > 0 ? 'playing' : 'idle',
                  };
              });

              const measuredRoster = roster.filter(r => r.hands != null);
              const totalHands = measuredRoster.reduce((sum, r) => sum + r.hands, 0);
              const totalProfit = Math.round(
                  measuredRoster.reduce((sum, r) => sum + (r.profit || 0), 0) * 100
              ) / 100;

              const stats = {
                  // Active horses only — the roster below is the same set.
                  totalGrinders: personas.length,
                  // Every content_authors row, active or not.
                  totalHorses: totalHorsesRes.count ?? null,
                  currentlyPlaying: roster.filter(r => r.tables > 0).length,
                  activeTables: activeTablesRes.count ?? null,
                  totalHands: playerStatsAvailable ? totalHands : null,
                  totalProfit: playerStatsAvailable ? totalProfit : null,
                  roster,
                  // True if player_stats was cut off by its row cap, in which
                  // case some horses' hands/profit are understated.
                  performanceTruncated: playerStatRows.length >= PLAYER_STATS_CAP,
                  // One human-readable sentence, INSIDE stats, because the
                  // frontend reads data.stats and renders this value directly.
                  // It was previously an object returned as a sibling of
                  // stats, so it never reached the UI at all — and would have
                  // thrown "Objects are not valid as a React child" if it had.
                  derivationNote: playerStatsAvailable
                      ? `All figures are measured. Hands and profit are lifetime totals from player_stats, summed across every club a horse has played in (profit = total_winnings - total_losses). Currently Playing counts horses holding an unvacated table_seats row. Active Tables counts tables with status running or active. Total Grinders is active horses; Total Horses is every horse on file.${seats.length >= SEAT_SCAN_CAP ? ' Seat scan hit its row cap, so Currently Playing may undercount.' : ''}`
                      : `Hands and profit are unavailable: the player_stats read failed, so they are reported as null rather than as zero. Currently Playing counts horses holding an unvacated table_seats row. Active Tables counts tables with status running or active. Total Grinders is active horses; Total Horses is every horse on file.${seats.length >= SEAT_SCAN_CAP ? ' Seat scan also hit its row cap, so Currently Playing may undercount.' : ''}`,
              };

              return res.status(200).json({
                  success: true,
                  stats,
              });
          } catch (error) {
              console.warn('Grinder Stats GET Error:', error);
              return res.status(500).json({ success: false, error: 'Failed to fetch grinder stats' });
          }
      }

      if (req.method === 'POST') {
          const { action } = req.body || {};

          // NOT IMPLEMENTED — and it now says so.
          //
          // All three actions were no-ops that returned success. add_to_club
          // reported "Added N horses to Shark Club with 10000 initial chips
          // each" without inserting a single club_members row or moving one
          // chip; start and stop returned instruction strings and touched
          // nothing. The operator was being told work had happened when none
          // had.
          //
          // These stay unimplemented here deliberately: seating horses and
          // granting chips is real money movement, and the house rule is that
          // chip paths are not exercised speculatively. Returning 501 means
          // the UI cannot claim success for work that did not occur.
          const NOT_IMPLEMENTED = {
              add_to_club: 'add_to_club is not implemented yet - no horses were added and no chips were moved.',
              start: 'start is not implemented yet - no horses were seated and no chips were moved.',
              stop: 'stop is not implemented yet - no horses were removed from any table.',
          };

          if (Object.prototype.hasOwnProperty.call(NOT_IMPLEMENTED, action)) {
              return res.status(501).json({ success: false, error: NOT_IMPLEMENTED[action] });
          }

          return res.status(400).json({ success: false, error: 'Unknown action' });
      }

      res.setHeader('Allow', ['GET', 'POST']);
      res.status(405).end(`Method ${req.method} Not Allowed`);

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

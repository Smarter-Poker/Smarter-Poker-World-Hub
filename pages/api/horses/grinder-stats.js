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

              const [personasRes, seatsRes, activeTablesRes] = await Promise.all([
                  getSupabase()
                      .from('content_authors')
                      .select('id, name, profile_id, is_active')
                      .eq('is_active', true),

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
              ]);

              if (personasRes.error) {
                  console.warn('Grinder Stats: content_authors error:', personasRes.error.message || personasRes.error);
                  return res.status(500).json({ success: false, error: 'Failed to fetch grinder stats' });
              }
              if (seatsRes.error) console.warn('Grinder Stats: table_seats error:', seatsRes.error.message || seatsRes.error);
              if (activeTablesRes.error) console.warn('Grinder Stats: tables error:', activeTablesRes.error.message || activeTablesRes.error);

              const personas = personasRes.data || [];
              const seats = seatsRes.data || [];

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
                  return {
                      horse_id: p.id,
                      name: p.name,
                      tables: heldTables,
                      // NOT DERIVABLE from existing columns: hand_history
                      // records participants inside a `players` jsonb array
                      // with no per-user column or index, and carries ~484k
                      // rows per day, so a per-horse count cannot be computed
                      // here without a dedicated aggregate RPC. Reported as
                      // null rather than as a fabricated 0.
                      hands: null,
                      // NOT DERIVABLE: table_seats stores a current `stack`
                      // but no buy-in baseline, so session profit has no
                      // reference point to subtract from.
                      profit: null,
                      status: heldTables > 0 ? 'playing' : 'idle',
                  };
              });

              const stats = {
                  totalGrinders: personas.length,
                  currentlyPlaying: roster.filter(r => r.tables > 0).length,
                  activeTables: activeTablesRes.count ?? null,
                  roster,
              };

              return res.status(200).json({
                  success: true,
                  stats,
                  // Say plainly which numbers are measured and which are not
                  // available, so the dashboard cannot present a null as a zero.
                  derivation: {
                      currentlyPlaying: 'Distinct active horses holding an unvacated table_seats row (content_authors.profile_id = table_seats.user_id).',
                      activeTables: 'Count of tables with status running or active.',
                      hands: 'Not available: hand_history stores participants in a jsonb array with no per-user column, so per-horse hand counts need an aggregate RPC that does not exist yet.',
                      profit: 'Not available: no buy-in baseline is stored against a seat, so profit cannot be computed.',
                      seatScanTruncated: seats.length >= SEAT_SCAN_CAP,
                  },
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
              add_to_club: 'add_to_club is not implemented yet — no horses were added and no chips were moved.',
              start: 'start is not implemented yet — no horses were seated and no chips were moved.',
              stop: 'stop is not implemented yet — no horses were removed from any table.',
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

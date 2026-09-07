import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/* ═════════════════════════════════════════════════════════════════
   API: /api/club-arena/bbj
   GET: Fetch BBJ pool amount, recent winners, tier config
   POST action=contribute: Add hand contribution to pool
   ═════════════════════════════════════════════════════════════════ */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
const { checkIdempotency } = require('../../../src/lib/club-arena/idempotency');
const { isUUID } = require('../../../src/lib/club-arena/validate');
import { reportApiError } from '../../../src/lib/sentryWrap';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
        _supabase = createClient(url, key);
    }
    return _supabase;
}

// Import tier config from engine
const STAKES_TIERS = {
  nano:      { label: 'Nano',      blindRange: '0.05/0.1 - 0.1/0.2', feeBB: 0.6,  payout: { loser: 7.5,  winner: 3.75,  table: 3.75,  total: 15  } },
  micro:     { label: 'Micro',     blindRange: '0.2/0.4 - 0.4/0.8',  feeBB: 0.4,  payout: { loser: 12.5, winner: 6.25,  table: 6.25,  total: 25  } },
  small:     { label: 'Small',     blindRange: '0.5/1 - 1.5/3',      feeBB: 0.25, payout: { loser: 20,   winner: 10,    table: 10,    total: 40  } },
  mid:       { label: 'Mid',       blindRange: '2/4 - 4/8',          feeBB: 0.12, payout: { loser: 27.5, winner: 13.75, table: 13.75, total: 55  } },
  high:      { label: 'High',      blindRange: '5/10 - 20/40',       feeBB: 0.06, payout: { loser: 35,   winner: 17.5,  table: 17.5,  total: 70  } },
  nosebleeds:{ label: 'Nosebleeds', blindRange: '25/50+',             feeBB: 0.03, payout: { loser: 42.5, winner: 21.25, table: 21.25, total: 85  } },
};

const QUALIFYING_HANDS = {
  nlh:  { label: 'NLH / FLH',    hand: 'AAAJJ+', description: 'Aces full of Jacks or better must lose to Quads or Straight Flush. Must have at least one Ace in hole cards.' },
  plo4: { label: 'PLO4 / FLO4',  hand: 'KKKK+',  description: 'Four Kings or better must lose. Both players must use two cards from their hole cards.' },
  plo5: { label: 'PLO5 / FLO5',  hand: '8-high SF', description: 'Eight-high Straight Flush or better must lose. Both players must use two cards from their hole cards.' },
};

const GENERAL_RULES = [
  'Pot must be equal to or bigger than 10BB',
  '4 players must be dealt in preflop',
  'In case of running it multiple times, only the first runout counts',
  'The Bad Beat Jackpot option is not available for Double and Triple Board games',
  'Both players must use two cards from their hole cards',
];


/* ═══════════════════════════════════════════════════════════════════════════
   THE JACKPOT FIGURE IS `main_balance`, RESOLVED BY THE FUNCTION THAT KNOWS
   ABOUT UNIONS. BBJ build plan phase 3.5, 2026-09-06.

   MEASURED ON PRODUCTION the day this was written:

     pool                     pool_amount   main_balance
     union f9806a7f...             0.00       107,092.27
     club  a7a65cfc...         1,000.00        23,142.58

   `pool_amount` is a legacy column nothing has written to since the triple-
   bank rework; the engine banks into `main_balance`. Every read in this file
   used `pool_amount`, so the World Hub has been telling players the Bad Beat
   Jackpot is empty while it held a hundred and seven thousand chips.

   The `.eq('club_id', clubId)` scope was the second half of the same bug: a
   union banks the jackpot on a row whose `club_id` IS NULL, so for every club
   in a union the query matched nothing at all and the figure fell back to 0.

   `fn_bbj_pool_for_club` is the one place that rule lives, and it is what
   Club Arena's own surfaces use. This asks it. ═══════════════════════════ */
async function readBbjPool(clubId) {
  const supabase = getSupabase();
  const { data: rows, error } = await supabase.rpc('fn_bbj_pool_for_club', { p_club_id: clubId });
  if (error) throw error;
  const resolved = Array.isArray(rows) ? rows[0] : rows;
  if (!resolved?.pool_id) return null;

  /* The RPC answers the two things that need the union rule; the rest of the
     row is read by id, which cannot be mis-scoped. */
  const { data: pool } = await supabase
    .from('bbj_pools')
    .select('id, hands_contributed, last_hit_at, last_hit_amount')
    .eq('id', resolved.pool_id)
    .maybeSingle();

  return {
    id: resolved.pool_id,
    amount: Number(resolved.main_balance || 0),
    handsContributed: Number(pool?.hands_contributed || 0),
    lastHitAt: pool?.last_hit_at || null,
    lastHitAmount: Number(pool?.last_hit_amount || 0),
  };
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
    if (!applyRateLimit(req, res, LIMITS.read)) return;
      const { clubId } = req.query;
      if (!clubId) return res.status(400).json({ error: 'clubId required' });

      // BUG #280: bbj endpoint had NO authentication — any unauthenticated request
      // could enumerate club BBJ pools, winner history, and contribution rates.
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ error: 'Auth required' });
      const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
      const user = authData?.user;
      if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

      // Verify caller is a member of this club (or union admin)
      // HARDENED: March 7, 2026 — .maybeSingle() → .maybeSingle() to prevent 500 crashes
      const { data: member } = await getSupabase()
        .from('club_members')
        .select('role')
        .eq('club_id', clubId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (!member) {
        // Check union admin fallback
        const { data: club } = await getSupabase().from('clubs').select('union_id').eq('id', clubId).maybeSingle();
        let unionAuth = false;
        if (club?.union_id) {
          const { data: ua } = await getSupabase().from('union_admins').select('role').eq('union_id', club.union_id).eq('user_id', user.id).maybeSingle();
          if (ua) {
              unionAuth = true;
          } else {
              // Owner fallback
              const { data: union } = await getSupabase().from('unions').select('id').eq('id', club.union_id).eq('owner_id', user.id).maybeSingle();
              if (union) unionAuth = true;
          }
        }
        if (!unionAuth) return res.status(403).json({ error: 'Not a member of this club' });
      }

      try {
        // Get pool — union-aware, and reading the balance the engine banks into.
        const pool = await readBbjPool(clubId);

        // Get last 10 winners
        const { data: winners } = await getSupabase()
          .from('bbj_winners')
          .select('*')
          .eq('club_id', clubId)
          .order('awarded_at', { ascending: false })
          .limit(10);

        // Fetch board cards from hand_histories and avatars from profiles
        const enrichedWinners = await Promise.all((winners || []).map(async (w) => {
          let boardCards = null;
          let boardUnavailable = false;
          let loserAvatar = null;
          let winnerAvatar = null;

          // Attempt to fetch board cards from the actual hand history
          if (w.hand_number && w.table_id) {
            try {
              const { data: hh } = await getSupabase()
                .from('hand_histories')
                .select('hand_data')
                .eq('hand_number', w.hand_number)
                .eq('table_id', w.table_id)
                .maybeSingle();
              if (hh?.hand_data) {
                boardCards = hh.hand_data.board || hh.hand_data.communityCards || null;
              }
            } catch (e) {
              /* A bare `catch(e) {}` here degraded the PUBLIC record of a jackpot
                 payout - no board, and later no names - with nothing anywhere to
                 say a read had failed. The endpoint still answers (a missing
                 board must not fail the whole list) but the failure is now
                 visible in logs and flagged on the row, so "no board" can be
                 told apart from "we could not read the board". */
              console.warn('[bbj] board read failed for hand', w.hand_number, e?.message || e);
              boardUnavailable = true;
            }
          }

          // Try to get avatars
          if (w.loser_user_id) {
            try {
              const { data: p } = await getSupabase().from('profiles').select('avatar_url').eq('id', w.loser_user_id).maybeSingle();
              loserAvatar = p?.avatar_url || null;
            } catch (e) {
              console.warn('[bbj] loser avatar read failed for', w.loser_user_id, e?.message || e);
            }
          }
          if (w.winner_user_id) {
            try {
              const { data: p } = await getSupabase().from('profiles').select('avatar_url').eq('id', w.winner_user_id).maybeSingle();
              winnerAvatar = p?.avatar_url || null;
            } catch (e) {
              console.warn('[bbj] winner avatar read failed for', w.winner_user_id, e?.message || e);
            }
          }

          return {
            id: w.id,
            // Lets a client show "board unavailable" instead of silently
            // rendering a payout with no cards as though none were dealt.
            boardUnavailable,
            loserName: w.loser_display_name || 'Player',
            loserHand: w.loser_hand,
            loserCards: w.loser_cards,
            loserAvatar,
            loserPayout: Number(w.loser_payout),
            winnerName: w.winner_display_name || 'Player',
            winnerHand: w.winner_hand,
            winnerCards: w.winner_cards,
            winnerAvatar,
            winnerPayout: Number(w.winner_payout),
            boardCards,
            totalPayout: Number(w.total_payout),
            awardedAt: w.awarded_at,
            stakesTier: w.stakes_tier,
            gameVariant: w.game_variant,
          };
        }));

        // Get recent contribution rate (last hour) for tick animation
        const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
        const { data: recentContribs } = await getSupabase()
          .from('bbj_contributions')
          .select('amount')
          .eq('pool_id', pool?.id)
          .gte('created_at', oneHourAgo);

        const hourlyRate = recentContribs?.reduce((s, c) => s + Number(c.amount), 0) || 0;

        return res.json({
          pool: {
            amount: Number(pool?.amount || 0),
            handsContributed: Number(pool?.handsContributed || 0),
            lastHitAt: pool?.lastHitAt,
            lastHitAmount: Number(pool?.lastHitAmount || 0),
          },
          winners: enrichedWinners,
          tiers: STAKES_TIERS,
          qualifyingHands: QUALIFYING_HANDS,
          rules: GENERAL_RULES,
          hourlyRate,
        });
      } catch (err) {
        console.warn('[BBJ API]', err);
        return res.status(500).json({ error: 'Internal error' });
      }
    }


    // ─── POST: configure / get_config ─────────────────────────────────────────
    if (req.method === 'POST') {
      // BUG-03 FIX: POST actions were missing rate limiting entirely
      if (!applyRateLimit(req, res, LIMITS.write)) return;

      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ error: 'Auth required' });
      const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
      const user = authData?.user;
      if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

      // Idempotency guard on mutation actions
      if (checkIdempotency(req, res)) return;

      const { action, clubId, bbjEnabled } = req.body;
      if (!clubId) return res.status(400).json({ error: 'clubId required' });
      // BUG-04 FIX: Validate UUID format
      if (!isUUID(clubId)) return res.status(400).json({ error: 'Invalid clubId format' });

      // Verify caller is owner or admin of this club (or platform admin)
      const { data: member } = await getSupabase()
        .from('club_members').select('role').eq('club_id', clubId).eq('user_id', user.id).maybeSingle();
      const isClubStaff = member && ['owner', 'admin'].includes(member.role);
      if (!isClubStaff) {
        const { data: profile } = await getSupabase()
          .from('profiles').select('role').eq('id', user.id).maybeSingle();
        if (!['admin', 'superadmin', 'god'].includes(profile?.role)) {
          return res.status(403).json({ error: 'Club owner or admin required' });
        }
      }

      // GET_CONFIG — return current BBJ setting + pool snapshot
      if (action === 'get_config') {
        const { data: club } = await getSupabase()
          .from('clubs').select('id, name, bbj_enabled').eq('id', clubId).maybeSingle();
        if (!club) return res.status(404).json({ error: 'Club not found' });

        const pool = await readBbjPool(clubId);

        return res.json({
          success: true,
          bbjEnabled: club.bbj_enabled !== false, // null or true = enabled; false = disabled
          poolAmount: Number(pool?.amount || 0),
          handsContributed: Number(pool?.handsContributed || 0),
          lastHitAt: pool?.lastHitAt || null,
          lastHitAmount: Number(pool?.lastHitAmount || 0),
        });
      }

      // CONFIGURE — enable or disable BBJ for this club
      if (action === 'configure') {
        if (typeof bbjEnabled !== 'boolean') {
          return res.status(400).json({ error: 'bbjEnabled (boolean) required' });
        }
        const { error: err_clubs_vktc6 } = await getSupabase().from('clubs').update({ bbj_enabled: bbjEnabled }).eq('id', clubId);
        if (err_clubs_vktc6) console.warn('[Supabase] Silent mutation failed in clubs:', err_clubs_vktc6.message);
        return res.json({
          success: true,
          message: `BBJ ${bbjEnabled ? 'enabled' : 'disabled'} for this club`,
          bbjEnabled,
        });
      }

      return res.status(400).json({ error: `Unknown action: ${action}` });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

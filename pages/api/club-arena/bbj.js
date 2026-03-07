/* ═══════════════════════════════════════════════════════════════════
   API: /api/club-arena/bbj
   GET: Fetch BBJ pool amount, recent winners, tier config
   POST action=contribute: Add hand contribution to pool
   ═══════════════════════════════════════════════════════════════════ */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { getServerUser } from '../../../src/lib/serverAuth';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Import tier config from engine
const STAKES_TIERS = {
  nano:      { label: 'Nano',      blindRange: '0.05/0.1 – 0.1/0.2', feeBB: 0.6,  payout: { loser: 7.5,  winner: 3.75,  table: 3.75,  total: 15  } },
  micro:     { label: 'Micro',     blindRange: '0.2/0.4 – 0.4/0.8',  feeBB: 0.4,  payout: { loser: 12.5, winner: 6.25,  table: 6.25,  total: 25  } },
  small:     { label: 'Small',     blindRange: '0.5/1 – 1.5/3',      feeBB: 0.25, payout: { loser: 20,   winner: 10,    table: 10,    total: 40  } },
  mid:       { label: 'Mid',       blindRange: '2/4 – 4/8',          feeBB: 0.12, payout: { loser: 27.5, winner: 13.75, table: 13.75, total: 55  } },
  high:      { label: 'High',      blindRange: '5/10 – 20/40',       feeBB: 0.06, payout: { loser: 35,   winner: 17.5,  table: 17.5,  total: 70  } },
  nosebleeds:{ label: 'Nosebleeds', blindRange: '25/50+',             feeBB: 0.03, payout: { loser: 42.5, winner: 21.25, table: 21.25, total: 85  } },
};

const QUALIFYING_HANDS = {
  nlh:  { label: 'NLH / FLH',    hand: 'AAAJJ+', description: 'Aces full of Jacks or better must lose to Quads or Straight Flush. Must have at least one Ace in hole cards.' },
  plo4: { label: 'PLO4 / FLO4',  hand: 'KKKK+',  description: 'Four Kings or better must lose. Both players must use two cards from their hole cards.' },
  plo5: { label: 'PLO5 / FLO5',  hand: '8-high SF', description: 'Eight-high Straight Flush or better must lose. Both players must use two cards from their hole cards.' },
};

const GENERAL_RULES = [
  'Pot must be equal to or bigger than 10 BBs',
  '4 players must be dealt in preflop',
  'In case of running it multiple times, only the first runout counts',
  'The Bad Beat Jackpot option is not available for Double and Triple Board games',
  'Both players must use two cards from their hole cards',
];

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { clubId } = req.query;
    if (!clubId) return res.status(400).json({ error: 'clubId required' });

    // BUG #280: bbj endpoint had NO authentication — any unauthenticated request
    // could enumerate club BBJ pools, winner history, and contribution rates.
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Auth required' });
    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

    // Verify caller is a member of this club (or union admin)
    // HARDENED: March 7, 2026 — .maybeSingle() → .maybeSingle() to prevent 500 crashes
    const { data: member } = await supabaseAdmin
      .from('club_members')
      .select('role')
      .eq('club_id', clubId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!member) {
      // Check union admin fallback
      const { data: club } = await supabaseAdmin.from('clubs').select('union_id').eq('id', clubId).maybeSingle();
      let unionAuth = false;
      if (club?.union_id) {
        const { data: ua } = await supabaseAdmin.from('union_admins').select('role').eq('union_id', club.union_id).eq('user_id', user.id).maybeSingle();
        unionAuth = !!ua;
      }
      if (!unionAuth) return res.status(403).json({ error: 'Not a member of this club' });
    }

    try {
      // Get pool
      const { data: pool } = await supabaseAdmin
        .from('bbj_pools')
        .select('id')
        .eq('club_id', clubId)
        .maybeSingle();

      // Get last 10 winners
      const { data: winners } = await supabaseAdmin
        .from('bbj_winners')
        .select('*')
        .eq('club_id', clubId)
        .order('awarded_at', { ascending: false })
        .limit(10);

      // Get recent contribution rate (last hour) for tick animation
      const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
      const { data: recentContribs } = await supabaseAdmin
        .from('bbj_contributions')
        .select('amount')
        .eq('pool_id', pool?.id)
        .gte('created_at', oneHourAgo);

      const hourlyRate = recentContribs?.reduce((s, c) => s + Number(c.amount), 0) || 0;

      return res.json({
        pool: {
          amount: Number(pool?.pool_amount || 0),
          handsContributed: Number(pool?.hands_contributed || 0),
          lastHitAt: pool?.last_hit_at,
          lastHitAmount: Number(pool?.last_hit_amount || 0),
        },
        winners: (winners || []).map(w => ({
          id: w.id,
          loserName: w.loser_display_name || 'Player',
          loserHand: w.loser_hand,
          loserCards: w.loser_cards,
          loserPayout: Number(w.loser_payout),
          winnerName: w.winner_display_name || 'Player',
          winnerHand: w.winner_hand,
          winnerCards: w.winner_cards,
          winnerPayout: Number(w.winner_payout),
          totalPayout: Number(w.total_payout),
          awardedAt: w.awarded_at,
          stakesTier: w.stakes_tier,
          gameVariant: w.game_variant,
        })),
        tiers: STAKES_TIERS,
        qualifyingHands: QUALIFYING_HANDS,
        rules: GENERAL_RULES,
        hourlyRate,
      });
    } catch (err) {
      console.error('[BBJ API]', err);
      return res.status(500).json({ error: 'Internal error' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

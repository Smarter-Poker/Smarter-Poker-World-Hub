/**
 * Tournament Elimination API
 * Reference: IMPLEMENTATION_PHASES.md - Phase 3
 * POST /api/captain/tournaments/[id]/eliminate - Eliminate a player
 */
import { createClient } from '@supabase/supabase-js';
import { awardXP } from '@/lib/captain/xp';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id: tournamentId } = req.query;

  if (!tournamentId) {
    return res.status(400).json({ error: 'Tournament ID required' });
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization required' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const { entry_id, eliminated_by_id } = req.body;

    if (!entry_id) {
      return res.status(400).json({ error: 'Entry ID required' });
    }

    // Get tournament
    const { data: tournament, error: tournamentError } = await supabase
      .from('captain_tournaments')
      .select('*')
      .eq('id', tournamentId)
      .single();

    if (tournamentError || !tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    // Verify staff access
    const { data: staff, error: staffError } = await supabase
      .from('captain_staff')
      .select('id')
      .eq('venue_id', tournament.venue_id)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();

    if (staffError || !staff) {
      return res.status(403).json({ error: 'You are not staff at this venue' });
    }

    // Get entry being eliminated
    const { data: entry, error: entryError } = await supabase
      .from('captain_tournament_entries')
      .select('*')
      .eq('id', entry_id)
      .eq('tournament_id', tournamentId)
      .single();

    if (entryError || !entry) {
      return res.status(404).json({ error: 'Entry not found' });
    }

    if (entry.status === 'eliminated') {
      return res.status(400).json({ error: 'Player already eliminated' });
    }

    // Count remaining players to determine finish position
    const { count: remainingCount } = await supabase
      .from('captain_tournament_entries')
      .select('*', { count: 'exact', head: true })
      .eq('tournament_id', tournamentId)
      .in('status', ['seated', 'active']);

    const finishPosition = remainingCount;

    // Calculate payout if in the money
    const payoutStructure = tournament.payout_structure || [];
    let payoutAmount = 0;
    let payoutPosition = null;

    // Check if this position pays
    const payoutInfo = payoutStructure.find(p => p.position === finishPosition);
    if (payoutInfo) {
      // Calculate prize pool
      const totalEntries = tournament.current_entries || 0;
      const totalRebuys = await getTotalRebuys(tournamentId);
      const totalAddons = await getTotalAddons(tournamentId);

      const prizePool = (totalEntries * tournament.buyin_amount) +
        (totalRebuys * (tournament.rebuy_amount || 0)) +
        (totalAddons * (tournament.addon_amount || 0));

      // Guaranteed pool adjustment
      const effectivePrizePool = Math.max(prizePool, tournament.guaranteed_pool || 0);

      // Calculate payout (percentage or fixed)
      if (payoutInfo.percentage) {
        payoutAmount = Math.floor(effectivePrizePool * payoutInfo.percentage / 100);
      } else if (payoutInfo.amount) {
        payoutAmount = payoutInfo.amount;
      }

      payoutPosition = finishPosition;
    }

    // Handle bounty if applicable
    let bountiesCollected = 0;
    if (tournament.bounty_amount && eliminated_by_id) {
      // Award bounty to eliminator
      await supabase
        .from('captain_tournament_entries')
        .update({
          bounties_collected: supabase.raw('bounties_collected + 1')
        })
        .eq('id', eliminated_by_id);

      bountiesCollected = 1;
    }

    // Update eliminated player
    const { data: eliminated, error: updateError } = await supabase
      .from('captain_tournament_entries')
      .update({
        status: 'eliminated',
        eliminated_at: new Date().toISOString(),
        eliminated_by: eliminated_by_id || null,
        finish_position: finishPosition,
        payout_amount: payoutAmount,
        payout_position: payoutPosition
      })
      .eq('id', entry_id)
      .select(`
        *,
        profiles (id, display_name, avatar_url)
      `)
      .single();

    if (updateError) throw updateError;

    // Award XP if player cashed
    if (payoutAmount > 0 && entry.player_id) {
      await awardXP(entry.player_id, 'tournament.cashed', {
        tournament_id: tournamentId,
        tournament_name: tournament.name,
        finish_position: finishPosition,
        payout: payoutAmount
      });
    }

    // Check if tournament should end (only 1 player left)
    if (remainingCount <= 2) {
      // Mark the winner
      const { data: winner } = await supabase
        .from('captain_tournament_entries')
        .select('*')
        .eq('tournament_id', tournamentId)
        .in('status', ['seated', 'active'])
        .neq('id', entry_id)
        .single();

      if (winner) {
        // Calculate winner payout
        const winnerPayout = payoutStructure.find(p => p.position === 1);
        let winnerAmount = 0;

        if (winnerPayout) {
          const totalEntries = tournament.current_entries || 0;
          const totalRebuys = await getTotalRebuys(tournamentId);
          const totalAddons = await getTotalAddons(tournamentId);

          const prizePool = (totalEntries * tournament.buyin_amount) +
            (totalRebuys * (tournament.rebuy_amount || 0)) +
            (totalAddons * (tournament.addon_amount || 0));

          const effectivePrizePool = Math.max(prizePool, tournament.guaranteed_pool || 0);

          if (winnerPayout.percentage) {
            winnerAmount = Math.floor(effectivePrizePool * winnerPayout.percentage / 100);
          } else if (winnerPayout.amount) {
            winnerAmount = winnerPayout.amount;
          }
        }

        await supabase
          .from('captain_tournament_entries')
          .update({
            status: 'winner',
            finish_position: 1,
            payout_amount: winnerAmount,
            payout_position: 1
          })
          .eq('id', winner.id);

        // Award XP to winner
        if (winner.player_id) {
          await awardXP(winner.player_id, 'tournament.cashed', {
            tournament_id: tournamentId,
            tournament_name: tournament.name,
            finish_position: 1,
            payout: winnerAmount
          });
        }

        // End tournament
        await supabase
          .from('captain_tournaments')
          .update({
            status: 'completed',
            ended_at: new Date().toISOString()
          })
          .eq('id', tournamentId);
      }
    }

    return res.status(200).json({
      entry: eliminated,
      finishPosition,
      payoutAmount,
      inTheMoney: payoutAmount > 0,
      remainingPlayers: remainingCount - 1
    });
  } catch (error) {
    console.error('Eliminate player error:', error);
    return res.status(500).json({ error: error.message });
  }
}

async function getTotalRebuys(tournamentId) {
  const { data } = await supabase
    .from('captain_tournament_entries')
    .select('rebuy_count')
    .eq('tournament_id', tournamentId);

  return data?.reduce((sum, e) => sum + (e.rebuy_count || 0), 0) || 0;
}

async function getTotalAddons(tournamentId) {
  const { count } = await supabase
    .from('captain_tournament_entries')
    .select('*', { count: 'exact', head: true })
    .eq('tournament_id', tournamentId)
    .eq('addon_taken', true);

  return count || 0;
}

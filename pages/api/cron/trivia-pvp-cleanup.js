/**
 * PVP CLEANUP CRON JOB
 * Handles abandoned PvP matches and refunds diamonds
 * 
 * Runs hourly to:
 * - Find matches stuck in 'active' status for >10 minutes
 * - If neither player submitted score → refund both stakes
 * - If one player submitted → award win to that player
 * - Mark match as 'abandoned'
 * 
 * Schedule: Every hour (0 * * * *)
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    // Verify cron secret
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const now = new Date();
        const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);

        // Find abandoned active matches (older than 10 minutes)
        const { data: abandonedMatches } = await supabase
            .from('trivia_pvp_matches')
            .select('*')
            .eq('status', 'active')
            .lt('created_at', tenMinutesAgo.toISOString());

        let refunded = 0;
        let forfeited = 0;

        for (const match of abandonedMatches || []) {
            const p1Submitted = match.player1_score !== null;
            const p2Submitted = match.player2_score !== null;
            const stakeAmount = match.stake_amount || 10;

            if (!p1Submitted && !p2Submitted) {
                // Neither played — refund both
                await refundPlayer(match.player1_id, stakeAmount);
                await refundPlayer(match.player2_id, stakeAmount);

                await supabase
                    .from('trivia_pvp_matches')
                    .update({ status: 'abandoned' })
                    .eq('id', match.id);

                refunded++;
            } else if (p1Submitted && !p2Submitted) {
                // Player 1 played, Player 2 didn't — Player 1 wins by forfeit
                await awardForfeitWin(match.player1_id, match.player2_id, stakeAmount, match.id);
                forfeited++;
            } else if (!p1Submitted && p2Submitted) {
                // Player 2 played, Player 1 didn't — Player 2 wins by forfeit
                await awardForfeitWin(match.player2_id, match.player1_id, stakeAmount, match.id);
                forfeited++;
            }
        }

        // Also clean up stale queue entries (older than 5 minutes)
        await supabase
            .from('trivia_pvp_queue')
            .update({ status: 'expired' })
            .eq('status', 'waiting')
            .lt('created_at', new Date(now.getTime() - 5 * 60 * 1000).toISOString());

        return res.status(200).json({
            success: true,
            refunded,
            forfeited,
            timestamp: now.toISOString()
        });

    } catch (error) {
        console.error('[PvP Cleanup] Error:', error);
        return res.status(500).json({ error: error.message });
    }
}

async function refundPlayer(playerId, amount) {
    if (!playerId) return;

    const { data: profile } = await supabase
        .from('profiles')
        .select('diamonds')
        .eq('id', playerId)
        .single();

    if (profile) {
        await supabase
            .from('profiles')
            .update({ diamonds: (profile.diamonds || 0) + amount })
            .eq('id', playerId);
    }
}

async function awardForfeitWin(winnerId, loserId, stakeAmount, matchId) {
    // 10% rake on total pot
    const totalPot = stakeAmount * 2;
    const rakeAmount = Math.floor(totalPot * 0.1);
    const winnerPayout = totalPot - rakeAmount;

    // Award winner
    const { data: winner } = await supabase
        .from('profiles')
        .select('diamonds')
        .eq('id', winnerId)
        .single();

    if (winner) {
        await supabase
            .from('profiles')
            .update({ diamonds: (winner.diamonds || 0) + winnerPayout })
            .eq('id', winnerId);
    }

    // Update match
    await supabase
        .from('trivia_pvp_matches')
        .update({
            status: 'complete',
            winner_id: winnerId,
            completed_at: new Date().toISOString()
        })
        .eq('id', matchId);

    // Update stats for both players
    await updatePlayerStats(winnerId, 'win', winnerPayout - stakeAmount);
    await updatePlayerStats(loserId, 'loss', stakeAmount);
}

async function updatePlayerStats(playerId, outcome, diamondsDelta) {
    if (!playerId) return;

    const { data: current } = await supabase
        .from('trivia_pvp_stats')
        .select('*')
        .eq('user_id', playerId)
        .single();

    const prev = current || { wins: 0, losses: 0, ties: 0, win_streak: 0, best_streak: 0, total_diamonds_won: 0, total_diamonds_lost: 0 };

    const updates = {
        user_id: playerId,
        wins: outcome === 'win' ? (prev.wins || 0) + 1 : (prev.wins || 0),
        losses: outcome === 'loss' ? (prev.losses || 0) + 1 : (prev.losses || 0),
        ties: prev.ties || 0,
        win_streak: outcome === 'win' ? (prev.win_streak || 0) + 1 : 0,
        best_streak: outcome === 'win'
            ? Math.max((prev.win_streak || 0) + 1, prev.best_streak || 0)
            : (prev.best_streak || 0),
        total_diamonds_won: outcome === 'win'
            ? (prev.total_diamonds_won || 0) + (diamondsDelta || 0)
            : (prev.total_diamonds_won || 0),
        total_diamonds_lost: outcome === 'loss'
            ? (prev.total_diamonds_lost || 0) + (diamondsDelta || 0)
            : (prev.total_diamonds_lost || 0),
        updated_at: new Date().toISOString()
    };

    await supabase
        .from('trivia_pvp_stats')
        .upsert(updates, { onConflict: 'user_id' });
}

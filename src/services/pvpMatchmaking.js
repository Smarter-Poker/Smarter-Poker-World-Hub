/**
 * PvP Matchmaking Service
 * Handles real-time matchmaking using Supabase Realtime
 */

import { supabase } from '../lib/supabase';

/**
 * Join the matchmaking queue for a specific stake level
 * @param {string} userId - The user's ID
 * @param {number} stakeAmount - Diamond stake amount (10, 25, 50, 100)
 * @returns {Object} Queue entry data or error
 */
export async function joinMatchmakingQueue(userId, stakeAmount) {
    try {
        // First, check if user already in queue
        const { data: existing } = await supabase
            .from('trivia_pvp_queue')
            .select('*')
            .eq('user_id', userId)
            .eq('status', 'waiting')
            .maybeSingle();

        if (existing) {
            // Already in queue, return existing entry
            return { data: existing, alreadyInQueue: true };
        }

        // Add user to queue
        const expiresAt = new Date();
        expiresAt.setMinutes(expiresAt.getMinutes() + 2); // 2 minute timeout

        const { data, error } = await supabase
            .from('trivia_pvp_queue')
            .insert({
                user_id: userId,
                stake_amount: stakeAmount,
                status: 'waiting',
                expires_at: expiresAt.toISOString()
            })
            .select()
            .maybeSingle();

        if (error) throw error;

        return { data };
    } catch (error) {
        console.error('[PvP Matchmaking] Error joining queue:', error);
        return { error };
    }
}

/**
 * Leave the matchmaking queue
 * @param {string} userId - The user's ID
 */
export async function leaveMatchmakingQueue(userId) {
    try {
        await supabase
            .from('trivia_pvp_queue')
            .update({ status: 'cancelled' })
            .eq('user_id', userId)
            .eq('status', 'waiting');

        return { success: true };
    } catch (error) {
        console.error('[PvP Matchmaking] Error leaving queue:', error);
        return { error };
    }
}

/**
 * Find a match for a user in the queue
 * @param {string} userId - The user's ID
 * @param {number} stakeAmount - Diamond stake amount
 * @returns {Object} Match data or null
 */
export async function findMatch(userId, stakeAmount) {
    try {
        // Find another waiting player with same stake (not self)
        const { data: opponent, error } = await supabase
            .from('trivia_pvp_queue')
            .select('*')
            .eq('stake_amount', stakeAmount)
            .eq('status', 'waiting')
            .neq('user_id', userId)
            .gt('expires_at', new Date().toISOString())
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle();

        if (error || !opponent) {
            return null; // No match found
        }

        // Get opponent profile
        const { data: opponentProfile, error: profileError } = await supabase
            .from('profiles')
            .select('id, username')
            .eq('id', opponent.user_id)
            .maybeSingle();

        if (profileError) {
            console.warn('[PvP Matchmaking] Warning: Could not fetch opponent profile:', profileError);
        }

        // Get opponent's PvP stats
        const { data: wins, error: winsError } = await supabase
            .from('trivia_pvp_matches')
            .select('id')
            .eq('winner_id', opponent.user_id);

        if (winsError) {
            console.warn('[PvP Matchmaking] Warning: Could not fetch opponent wins:', winsError);
        }

        const { data: losses, error: lossesError } = await supabase
            .from('trivia_pvp_matches')
            .select('id')
            .or(`player1_id.eq.${opponent.user_id},player2_id.eq.${opponent.user_id}`)
            .neq('winner_id', opponent.user_id)
            .not('winner_id', 'is', null);

        if (lossesError) {
            console.warn('[PvP Matchmaking] Warning: Could not fetch opponent losses:', lossesError);
        }

        // Load 20 random questions for the match (all categories)
        const { data: questions, error: questionsError } = await supabase
            .from('trivia_questions')
            .select('*')
            .limit(100);

        if (questionsError || !questions || questions.length === 0) {
            throw new Error('Failed to load trivia questions for match');
        }

        const matchQuestions = questions
            .sort(() => Math.random() - 0.5)
            .slice(0, 20);

        // Create the match
        const { data: match, error: matchError } = await supabase
            .from('trivia_pvp_matches')
            .insert({
                player1_id: userId,
                player2_id: opponent.user_id,
                stake_amount: stakeAmount,
                questions: matchQuestions,
                status: 'active',
                created_at: new Date().toISOString()
            })
            .select()
            .maybeSingle();

        if (matchError || !match) {
            throw matchError || new Error('Failed to create match');
        }

        // Update both queue entries to matched
        await supabase
            .from('trivia_pvp_queue')
            .update({ status: 'matched', match_id: match.id })
            .in('user_id', [userId, opponent.user_id])
            .eq('status', 'waiting');

        return {
            match,
            opponent: {
                id: opponentProfile?.id || opponent.user_id,
                username: opponentProfile?.username || 'Opponent',
                wins: wins?.length || 0,
                losses: losses?.length || 0
            },
            questions: matchQuestions
        };
    } catch (error) {
        console.error('[PvP Matchmaking] Error finding match:', error);
        return null;
    }
}

/**
 * Subscribe to match updates for real-time sync
 * @param {string} matchId - The match ID
 * @param {Function} onUpdate - Callback for updates
 * @returns {Object} Subscription object
 */
export function subscribeToMatch(matchId, onUpdate) {
    const channel = supabase
        .channel(`pvp_match:${matchId}`)
        .on('postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'trivia_pvp_matches', filter: `id=eq.${matchId}` },
            (payload) => {
                onUpdate(payload.new);
            }
        )
        .subscribe();

    // Return cleanup function for callers to use in useEffect return
    return () => { supabase.removeChannel(channel); };
}

/**
 * Subscribe to queue changes for finding opponents
 * @param {number} stakeAmount - The stake level to monitor
 * @param {Function} onNewPlayer - Callback when new player joins
 * @returns {Object} Subscription object
 */
export function subscribeToQueue(stakeAmount, onNewPlayer) {
    const channel = supabase
        .channel(`pvp_queue:${stakeAmount}`)
        .on('postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'trivia_pvp_queue', filter: `stake_amount=eq.${stakeAmount}` },
            (payload) => {
                if (payload.new.status === 'waiting') {
                    onNewPlayer(payload.new);
                }
            }
        )
        .subscribe();

    // Return cleanup function for callers to use in useEffect return
    return () => { supabase.removeChannel(channel); };
}

/**
 * Submit player's score for a match
 * @param {string} matchId - The match ID
 * @param {string} playerId - The player's ID
 * @param {number} score - Player's score
 * @param {boolean} isPlayer1 - Is this player1 or player2
 */
export async function submitMatchScore(matchId, playerId, score, isPlayer1) {
    try {
        const updateField = isPlayer1 ? 'player1_score' : 'player2_score';

        const { error } = await supabase
            .from('trivia_pvp_matches')
            .update({ [updateField]: score })
            .eq('id', matchId);

        if (error) throw error;

        // Check if both scores are submitted
        const { data: match } = await supabase
            .from('trivia_pvp_matches')
            .select('*')
            .eq('id', matchId)
            .maybeSingle();

        if (match?.player1_score !== null && match?.player2_score !== null) {
            // Both players finished, determine winner
            const winnerId = match.player1_score > match.player2_score
                ? match.player1_id
                : match.player2_score > match.player1_score
                    ? match.player2_id
                    : null; // Tie

            await supabase
                .from('trivia_pvp_matches')
                .update({
                    status: 'complete',
                    winner_id: winnerId,
                    completed_at: new Date().toISOString()
                })
                .eq('id', matchId);

            return { match, winnerId, complete: true };
        }

        return { match, complete: false };
    } catch (error) {
        console.error('[PvP Matchmaking] Error submitting score:', error);
        return { error };
    }
}

/**
 * Process diamond transfer after match completion
 * @param {string} winnerId - Winner's user ID
 * @param {string} loserId - Loser's user ID
 * @param {number} stakeAmount - The stake amount
 */
export async function processMatchReward(winnerId, loserId, stakeAmount) {
    try {
        // 10% house rake on total pot (both stakes combined)
        const totalPot = stakeAmount * 2;
        const rakeAmount = Math.floor(totalPot * 0.1);
        const winnerPayout = totalPot - rakeAmount;

        // Use RPC for atomic operation (avoids race conditions)
        // This assumes an 'award_diamonds_pvp' RPC exists that handles atomicity
        const { data: rpcResult, error: rpcError } = await supabase.rpc('award_diamonds', {
            p_user_id: winnerId,
            p_amount: winnerPayout,
            p_type: 'pvp_match_win',
            p_description: `PvP Match Win vs ${loserId} — Pot: ${totalPot}💎, Rake: ${rakeAmount}💎`
        });

        if (rpcError) {
            console.error('[PvP Matchmaking] RPC error awarding winner:', rpcError);
            // Fallback: non-atomic direct update (less ideal but better than failing completely)
            const { data: winner } = await supabase
                .from('profiles')
                .select('diamonds')
                .eq('id', winnerId)
                .maybeSingle();

            if (!winner) { console.error('[PvP] Winner profile not found:', winnerId); return { success: false, error: 'Winner profile not found' }; }
            await supabase
                .from('profiles')
                .update({ diamonds: (winner?.diamonds || 0) + winnerPayout })
                .eq('id', winnerId);
        }

        // Log the transaction for audit trail
        await supabase.from('diamond_transactions').insert({
            user_id: winnerId,
            amount: winnerPayout,
            transaction_type: 'pvp_match_win',
            description: `PvP Match Win vs ${loserId}`,
            balance_after: (rpcResult?.balance || 0)
        }).catch(() => { }); // Non-critical, ignore errors

        // Loser already had their stake deducted when joining — nothing to do

        return { success: true, winnerPayout, rakeAmount };
    } catch (error) {
        console.error('[PvP Matchmaking] Error processing reward:', error);
        return { error };
    }
}

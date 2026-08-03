/**
 * PvP Matchmaking Service
 * Handles matchmaking using polling for queue status
 */

import { supabase } from '../lib/supabase';
import { busEmit } from '../engine/EventBus';
import { fetchRandomQuestionPool, filterAndShuffle } from '../lib/triviaQuestionLoader';

const MIN_QUALITY_SCORE = 6;

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
        console.warn('[PvP Matchmaking] Error joining queue:', error);
        return { error };
    }
}

/**
 * Leave the matchmaking queue
 * @param {string} userId - The user's ID
 */
export async function leaveMatchmakingQueue(userId) {
    try {
        const { error: err_trivia_pvp_queue_t18er } = await supabase
          .from('trivia_pvp_queue')
          .update({ status: 'cancelled' })
            .eq('user_id', userId)
            .eq('status', 'waiting');
        if (err_trivia_pvp_queue_t18er) console.warn('[Supabase] Silent mutation failed in trivia_pvp_queue:', err_trivia_pvp_queue_t18er.message);

        return { success: true };
    } catch (error) {
        console.warn('[PvP Matchmaking] Error leaving queue:', error);
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

        // Phase 55: real PvP matches (money-flow critical) need:
        //   1. Random-offset fetch — was always pulling the same 100 newest
        //      rows by Postgres-internal order, so opponents repeatedly faced
        //      the same questions.
        //   2. Quality floor — reported-bad (qs=2) and unclear (qs=4)
        //      questions must NEVER land in a PvP match where money is at stake.
        //   3. Unbiased Fisher-Yates shuffle (was using sort(()=>Math.random()-0.5)
        //      which is mathematically biased — some permutations 2x more likely
        //      than others, opponent could exploit).
        const questions = await fetchRandomQuestionPool(supabase, { pageSize: 100 });
        if (!questions || questions.length === 0) {
            throw new Error('Failed to load trivia questions for match');
        }
        const matchQuestions = filterAndShuffle(questions, [], 20, { minQualityScore: MIN_QUALITY_SCORE })
            .slice(0, 20);
        if (matchQuestions.length < 20) {
            throw new Error('Insufficient quality questions available for match');
        }

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
        const { error: err_trivia_pvp_queue_ufns9 } = await supabase
          .from('trivia_pvp_queue')
          .update({ status: 'matched', match_id: match.id })
            .in('user_id', [userId, opponent.user_id])
            .eq('status', 'waiting');
        if (err_trivia_pvp_queue_ufns9) console.warn('[Supabase] Silent mutation failed in trivia_pvp_queue:', err_trivia_pvp_queue_ufns9.message);

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
        console.warn('[PvP Matchmaking] Error finding match:', error);
        return null;
    }
}

/**
 * Subscribe to match updates for real-time sync
 * @param {string} matchId - The match ID
 * @param {Function} onUpdate - Callback for updates
 * @returns {Function} Cleanup function
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
 * FIX(audit): Load an existing match (created by the opponent's findMatch) and
 * shape it exactly like findMatch's return value, so the player whose queue row
 * was flipped to 'matched' can enter the SAME match instead of re-running
 * findMatch — which always found nothing, because the opponent's queue row is
 * already 'matched', leaving this player out of a match that held their stake.
 *
 * @param {string} matchId - trivia_pvp_matches.id from the matched queue row
 * @param {string} userId  - The local user's ID (must be a participant)
 * @returns {Object|null} { match, opponent, questions } or null
 */
async function loadMatchForPlayer(matchId, userId) {
    try {
        if (!matchId || !userId) return null;

        const { data: match, error } = await supabase
            .from('trivia_pvp_matches')
            .select('*')
            .eq('id', matchId)
            .maybeSingle();
        if (error || !match) return null;
        // Only enter matches this user actually belongs to.
        if (match.player1_id !== userId && match.player2_id !== userId) return null;

        const opponentId = match.player1_id === userId ? match.player2_id : match.player1_id;

        let opponentProfile = null;
        let opponentStats = null;
        if (opponentId) {
            const { data: prof } = await supabase
                .from('profiles')
                .select('id, username')
                .eq('id', opponentId)
                .maybeSingle();
            opponentProfile = prof;

            const { data: st } = await supabase
                .from('trivia_pvp_stats')
                .select('wins, losses')
                .eq('user_id', opponentId)
                .maybeSingle();
            opponentStats = st;
        }

        return {
            match,
            opponent: {
                id: opponentId || null,
                username: opponentProfile?.username || 'Opponent',
                wins: opponentStats?.wins || 0,
                losses: opponentStats?.losses || 0
            },
            questions: Array.isArray(match.questions) ? match.questions : []
        };
    } catch (e) {
        console.warn('[PvP Matchmaking] loadMatchForPlayer failed:', e);
        return null;
    }
}

/**
 * Subscribe to queue changes for finding opponents — polling implementation
 * Replaces the old `pvp_queue:{stakeAmount}` postgres_changes channel.
 *
 * Polls every 3 seconds for the user's own queue entry. If the entry's
 * status has changed from 'waiting' to 'matched', fires onNewPlayer with the
 * loaded { match, opponent, questions } payload (same shape findMatch returns)
 * so the caller can enter the already-created match directly. Falls back to
 * the raw queue row if the match cannot be loaded.
 * FIX(audit): previously the raw queue row was always delivered; the page
 * callback ignored it (own user_id) and the matched player never joined.
 *
 * @param {number} stakeAmount - The stake level to monitor
 * @param {string} userId      - The local user's ID (needed to poll own entry)
 * @param {Function} onNewPlayer - Callback when a match is found
 * @returns {Function} Cleanup / unsubscribe function
 */
export function subscribeToQueue(stakeAmount, onNewPlayer, userId) {
    const POLL_MS = 3000;
    let lastStatus = 'waiting';
    let stopped = false;

    const poll = async () => {
        if (stopped) return;
        try {
            // Query the caller's own queue entry — no need to watch all entries
            // at this stake tier, which was the wasteful pattern before.
            const query = supabase
                .from('trivia_pvp_queue')
                .select('*')
                .eq('stake_amount', stakeAmount)
                .eq('status', 'waiting');

            // If we have the userId, scope the poll to the user's own row
            if (userId) {
                query.eq('user_id', userId);
            }

            const { data: rows } = await query.order('created_at', { ascending: false }).limit(1);

            if (stopped) return;

            // Check if a match was made (status flipped from waiting to matched
            // by the server — we see it disappear from the 'waiting' result set)
            if ((!rows || rows.length === 0) && lastStatus === 'waiting') {
                // Entry no longer in 'waiting' — check if it's now 'matched'
                const { data: matched } = await supabase
                    .from('trivia_pvp_queue')
                    .select('*')
                    .eq('stake_amount', stakeAmount)
                    .eq('status', 'matched')
                    .eq('user_id', userId)
                    .order('updated_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();

                if (matched && !stopped) {
                    lastStatus = 'matched';
                    console.debug('[PvP Queue] Match found via polling:', matched.match_id);
                    // FIX(audit): the raw queue row alone cannot put the player
                    // into the battle — the page callback used to receive it,
                    // see its own user_id and ignore it, so the notified player
                    // never joined the match the opponent created (and their
                    // stake was consumed by the horse fallback instead). Load
                    // the match row (it already holds the shared question set)
                    // and deliver the same { match, opponent, questions } shape
                    // findMatch returns so the page can enter via
                    // handleMatchFound.
                    const matchData = await loadMatchForPlayer(matched.match_id, userId);
                    if (stopped) return;
                    if (matchData) {
                        onNewPlayer(matchData);
                    } else {
                        // Fall back to the raw row so callers can still react.
                        onNewPlayer(matched);
                    }
                }
            }
        } catch (err) {
            console.warn('[PvP Queue] Poll error:', err);
        }
    };

    // Kick off immediately, then on interval
    poll();
    const intervalId = setInterval(poll, POLL_MS);

    return () => {
        stopped = true;
        clearInterval(intervalId);
    };
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

            const { error: err_trivia_pvp_matches_9besc } = await supabase

              .from('trivia_pvp_matches')

              .update({
                    status: 'complete',
                    winner_id: winnerId,
                    completed_at: new Date().toISOString()
                })
                .eq('id', matchId);

            if (err_trivia_pvp_matches_9besc) console.warn('[Supabase] Silent mutation failed in trivia_pvp_matches:', err_trivia_pvp_matches_9besc.message);

            return { match, winnerId, complete: true };
        }

        return { match, complete: false };
    } catch (error) {
        console.warn('[PvP Matchmaking] Error submitting score:', error);
        return { error };
    }
}

/**
 * Process diamond transfer after match completion
 * @param {string} winnerId - Winner's user ID
 * @param {string} loserId - Loser's user ID
 * @param {number} stakeAmount - The stake amount
 * @param {string} [matchId] - The PvP match ID. Used as p_reference_id so
 *                              double-fires (realtime retry, double-click,
 *                              network retry) credit the winner only once.
 */
export async function processMatchReward(winnerId, loserId, stakeAmount, matchId = null) {
    try {
        // 10% house rake on total pot (both stakes combined)
        const totalPot = stakeAmount * 2;
        const rakeAmount = Math.floor(totalPot * 0.1);
        const winnerPayout = totalPot - rakeAmount;

        // Phase 55 (money-loss fix): stable reference_id for both RPCs so
        // upstream retries can't double-credit. Fall back to a deterministic
        // composite if matchId wasn't passed (legacy callers).
        const referenceId = matchId
            ? `pvp_match_win_${matchId}`
            : `pvp_match_win_${winnerId}_${loserId}_${stakeAmount}`;

        // Use RPC for atomic operation (avoids race conditions)
        const { data: rpcResult, error: rpcError } = await supabase.rpc('award_diamonds', {
            p_user_id: winnerId,
            p_amount: winnerPayout,
            p_type: 'pvp_match_win',
            p_description: `PvP Match Win vs ${loserId} — Pot: ${totalPot}diamonds, Rake: ${rakeAmount}diamonds`,
            p_reference_id: referenceId,
        });

        if (rpcError) {
            console.warn('[PvP Matchmaking] RPC error awarding winner:', rpcError);
            // Fallback: use add_diamonds_to_balance with same reference_id so
            // it dedupes against the primary attempt if both somehow ran.
            const { data: winner } = await supabase
                .from('profiles')
                .select('diamonds')
                .eq('id', winnerId)
                .maybeSingle();

            if (!winner) { console.warn('[PvP] Winner profile not found:', winnerId); return { success: false, error: 'Winner profile not found' }; }

            // Phase 55 (money-loss fix): was awaiting silently; if the fallback
            // also failed, the winner got nothing and no error surfaced.
            const { error: fallbackErr } = await supabase.rpc('add_diamonds_to_balance', {
                p_user_id: winnerId,
                p_amount: winnerPayout,
                p_type: 'pvp_win',
                p_description: `PvP Match Win vs ${loserId} — Pot: ${totalPot}diamonds, Rake: ${rakeAmount}diamonds (fallback)`,
                p_reference_id: referenceId,
            });
            if (fallbackErr) {
                console.warn('[PvP Matchmaking] FALLBACK ALSO FAILED — winner not credited:', fallbackErr);
                return { success: false, error: 'reward_fallback_failed', detail: fallbackErr.message };
            }
        }

        // Log the transaction for audit trail
        await supabase.from('diamond_transactions').insert({
            user_id: winnerId,
            amount: winnerPayout,
            transaction_type: 'pvp_match_win',
            description: `PvP Match Win vs ${loserId}`,
            balance_after: (rpcResult?.balance || 0)
        }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e)); // Non-critical, ignore errors

        // Loser already had their stake deducted when joining — nothing to do
        busEmit.diamondsEarned(winnerPayout, 'PvP Match Win');

        return { success: true, winnerPayout, rakeAmount };
    } catch (error) {
        console.warn('[PvP Matchmaking] Error processing reward:', error);
        return { error };
    }
}

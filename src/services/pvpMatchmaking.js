/**
 * PvP Matchmaking Service
 * Handles matchmaking using polling for queue status.
 *
 * SCOPE (server-authoritative migration): this module now does MATCHMAKING
 * ONLY - queue rows and the match row. Everything money- or score-shaped
 * moved server-side:
 *   - questions are drawn by /api/trivia/session-start (the match row is
 *     created with questions:null so the server seeds a roster this client
 *     cannot hand-pick, and the answer key never rides on the row);
 *   - scores come from graded trivia_sessions, never from a client write
 *     (the old submitMatchScore wrote whatever the browser sent);
 *   - payouts happen in /api/trivia/pvp-settle-match (the old
 *     processMatchReward called a browser-side credit RPC that lost
 *     authenticated EXECUTE on 2026-08-03, so winners were unpaid anyway).
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

        // Create the match WITHOUT questions. The roster used to be picked
        // and stored here - full objects, answer key included, readable by
        // anyone via the permissive match SELECT policy, and hand-pickable by
        // a tampered client. session-start now seeds the roster server-side
        // (first player to start wins an atomic questions-IS-NULL write) and
        // stores bare question ids only.
        const { data: match, error: matchError } = await supabase
            .from('trivia_pvp_matches')
            .insert({
                player1_id: userId,
                player2_id: opponent.user_id,
                stake_amount: stakeAmount,
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
            }
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
 * No questions in the payload: both players fetch the shared roster through
 * /api/trivia/session-start (answer-free, per-player option order).
 *
 * @param {string} matchId - trivia_pvp_matches.id from the matched queue row
 * @param {string} userId  - The local user's ID (must be a participant)
 * @returns {Object|null} { match, opponent } or null
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
            }
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
 * loaded { match, opponent } payload (same shape findMatch returns) so the
 * caller can enter the already-created match directly. Falls back to the raw
 * queue row if the match cannot be loaded.
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
                    .order('created_at', { ascending: false })
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
                    // the match row and deliver the same { match, opponent }
                    // shape findMatch returns so the page can enter via
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

// NOTE: submitMatchScore() and processMatchReward() used to live here.
// Both are gone by design, not by accident:
//   - submitMatchScore wrote a client-computed score straight onto the match
//     row and flipped it to 'complete' - the score that settled the money was
//     whatever the browser claimed. Scores now exist only as server-graded
//     trivia_sessions counts, and the settlement engine writes the row's
//     score columns itself (display only - it never reads them back).
//   - processMatchReward credited the winner from the browser through diamond
//     RPCs that lost authenticated EXECUTE on 2026-08-03 (winners were unpaid
//     since). /api/trivia/pvp-settle-match is the replacement: service-role,
//     idempotent reference ids shared with the /api/cron/pvp-settle sweep.
// Do not reintroduce client-side equivalents of either.

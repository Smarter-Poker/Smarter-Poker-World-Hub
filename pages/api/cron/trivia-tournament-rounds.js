/**
 * TOURNAMENT ROUND ADVANCEMENT CRON
 * Runs hourly to:
 * - Check active rounds whose deadline has passed
 * - Apply forfeits for players who didn't play
 * - Advance winners to next round
 * - Send notifications (round start, forfeit warning, elimination, winner)
 * - Complete tournament when final round is done
 * 
 * Schedule: 0 * * * * (every hour)
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const HOUSE_RAKE_PERCENT = 10;

export default async function handler(req, res) {
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const now = new Date();
        const results = {
            roundsCompleted: 0,
            roundsAdvanced: 0,
            forfeitWarnings: 0,
            tournamentsFinished: 0
        };

        // 1. Send forfeit warnings (1 hour before deadline)
        const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
        const { data: warningRounds } = await supabase
            .from('trivia_tournament_rounds')
            .select('*, trivia_tournaments(*)')
            .eq('status', 'active')
            .gt('deadline', now.toISOString())
            .lte('deadline', oneHourFromNow.toISOString());

        for (const round of warningRounds || []) {
            const matchups = round.matchups || [];
            for (const matchup of matchups) {
                if (matchup.winner_id || matchup.is_bye) continue;

                // Warn players who haven't played yet
                const playersToWarn = [];
                if (matchup.player1_id && matchup.player1_score === null) {
                    playersToWarn.push(matchup.player1_id);
                }
                if (matchup.player2_id && matchup.player2_score === null) {
                    playersToWarn.push(matchup.player2_id);
                }

                for (const playerId of playersToWarn) {
                    // Check if warning already sent
                    const { data: existing } = await supabase
                        .from('trivia_tournament_notifications')
                        .select('id')
                        .eq('user_id', playerId)
                        .eq('tournament_id', round.tournament_id)
                        .eq('notification_type', 'forfeit_warning')
                        .gte('created_at', new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString())
                        .limit(1);

                    if (!existing || existing.length === 0) {
                        await supabase
                            .from('trivia_tournament_notifications')
                            .insert({
                                user_id: playerId,
                                tournament_id: round.tournament_id,
                                notification_type: 'forfeit_warning',
                                message: `⚠️ Round ${round.round_number} deadline is in 1 hour! Play now or you'll be disqualified.`
                            });
                        results.forfeitWarnings++;
                    }
                }
            }
        }

        // 2. Process expired rounds (deadline has passed)
        const { data: expiredRounds } = await supabase
            .from('trivia_tournament_rounds')
            .select('*, trivia_tournaments(*)')
            .eq('status', 'active')
            .lte('deadline', now.toISOString());

        for (const round of expiredRounds || []) {
            const tournament = round.trivia_tournaments;
            if (!tournament) continue;

            // Process forfeits and determine winners
            const matchups = round.matchups || [];
            const updatedMatchups = matchups.map(matchup => {
                if (matchup.winner_id || matchup.is_bye) return matchup;

                const p1Played = matchup.player1_score !== null;
                const p2Played = matchup.player2_score !== null;

                if (p1Played && p2Played) {
                    // Both played — higher score wins
                    if (matchup.player1_score > matchup.player2_score) {
                        matchup.winner_id = matchup.player1_id;
                    } else if (matchup.player2_score > matchup.player1_score) {
                        matchup.winner_id = matchup.player2_id;
                    } else {
                        // Tie — random winner (or could use time-based tiebreaker)
                        matchup.winner_id = Math.random() < 0.5 ? matchup.player1_id : matchup.player2_id;
                    }
                } else if (p1Played && !p2Played) {
                    matchup.winner_id = matchup.player1_id;
                    matchup.player2_forfeited = true;
                } else if (!p1Played && p2Played) {
                    matchup.winner_id = matchup.player2_id;
                    matchup.player1_forfeited = true;
                } else {
                    // Neither played — random winner advances
                    matchup.winner_id = matchup.player1_id || matchup.player2_id;
                    matchup.both_forfeited = true;
                }

                return matchup;
            });

            // Update round as complete
            await supabase
                .from('trivia_tournament_rounds')
                .update({ status: 'complete', matchups: updatedMatchups })
                .eq('id', round.id);

            // Mark eliminated players
            for (const matchup of updatedMatchups) {
                const loserId = matchup.player1_id === matchup.winner_id
                    ? matchup.player2_id
                    : matchup.player1_id;

                if (loserId) {
                    await supabase
                        .from('trivia_tournament_entries')
                        .update({ eliminated_round: round.round_number })
                        .eq('tournament_id', tournament.id)
                        .eq('user_id', loserId);

                    await supabase
                        .from('trivia_tournament_notifications')
                        .insert({
                            user_id: loserId,
                            tournament_id: tournament.id,
                            notification_type: 'eliminated',
                            message: `You've been eliminated in Round ${round.round_number} of ${tournament.name}.`
                        });
                }
            }

            results.roundsCompleted++;

            // Determine winners for next round
            const winners = updatedMatchups
                .map(m => m.winner_id)
                .filter(Boolean);

            // Check if this was the final round
            if (winners.length <= 1 || round.round_number >= (tournament.total_rounds || 999)) {
                await completeTournament(tournament, winners[0], round.round_number);
                results.tournamentsFinished++;
            } else {
                // Create next round
                await createNextRound(tournament, winners, round.round_number + 1);
                results.roundsAdvanced++;
            }
        }

        return res.status(200).json({
            success: true,
            results,
            timestamp: now.toISOString()
        });

    } catch (error) {
        console.error('[Tournament Rounds] Error:', error);
        return res.status(500).json({ error: error.message });
    }
}

/**
 * Create next round matchups from winners
 */
async function createNextRound(tournament, winners, roundNumber) {
    const matchups = [];

    for (let i = 0; i < winners.length; i += 2) {
        const player1 = winners[i] || null;
        const player2 = winners[i + 1] || null;

        const matchup = {
            match_index: matchups.length,
            player1_id: player1,
            player2_id: player2,
            player1_score: null,
            player2_score: null,
            winner_id: null,
            is_bye: !player1 || !player2
        };

        // Auto-advance byes
        if (matchup.is_bye) {
            matchup.winner_id = player1 || player2;
        }

        matchups.push(matchup);
    }

    const deadline = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await supabase
        .from('trivia_tournament_rounds')
        .insert({
            tournament_id: tournament.id,
            round_number: roundNumber,
            deadline: deadline.toISOString(),
            status: 'active',
            matchups
        });

    await supabase
        .from('trivia_tournaments')
        .update({
            current_round: roundNumber,
            round_deadline: deadline.toISOString()
        })
        .eq('id', tournament.id);

    // Notify advancing players
    const notifications = winners
        .filter(Boolean)
        .map(userId => ({
            user_id: userId,
            tournament_id: tournament.id,
            notification_type: 'round_start',
            message: `Round ${roundNumber} of ${tournament.name} has started! You have 24 hours to play.`
        }));

    if (notifications.length > 0) {
        await supabase
            .from('trivia_tournament_notifications')
            .insert(notifications);
    }

    console.log(`[Tournament] Round ${roundNumber} created: ${matchups.length} matchups`);
}

/**
 * Complete tournament and distribute prizes
 */
async function completeTournament(tournament, winnerId, finalRound) {
    // Get all entries sorted by how far they got
    const { data: entries } = await supabase
        .from('trivia_tournament_entries')
        .select('*, profiles(username)')
        .eq('tournament_id', tournament.id)
        .order('eliminated_round', { ascending: false, nullsFirst: true })
        .order('score', { ascending: false });

    if (!entries || entries.length === 0) {
        await supabase
            .from('trivia_tournaments')
            .update({ status: 'completed', completed_at: new Date().toISOString() })
            .eq('id', tournament.id);
        return;
    }

    // Calculate prize pool
    const totalEntryFees = entries.length * tournament.entry_fee;
    const houseRake = Math.floor(totalEntryFees * HOUSE_RAKE_PERCENT / 100);
    const prizePool = totalEntryFees - houseRake;

    // Prize distribution: 50% 1st, 30% 2nd, 20% 3rd
    const prizes = [
        { place: 1, percent: 50 },
        { place: 2, percent: 30 },
        { place: 3, percent: 20 }
    ];

    const winners = [];

    // 1st = tournament winner
    // 2nd = finalist (lost in final round)
    // 3rd = semi-finalist (lost in round before final)
    const ranked = [
        entries.find(e => e.user_id === winnerId),
        ...entries.filter(e => e.user_id !== winnerId && !e.eliminated_round),
        ...entries.filter(e => e.eliminated_round === finalRound),
        ...entries
            .filter(e => e.eliminated_round && e.eliminated_round < finalRound)
            .sort((a, b) => (b.eliminated_round || 0) - (a.eliminated_round || 0))
    ].filter(Boolean);

    // Remove duplicates
    const seen = new Set();
    const uniqueRanked = ranked.filter(e => {
        if (seen.has(e.user_id)) return false;
        seen.add(e.user_id);
        return true;
    });

    for (let i = 0; i < Math.min(3, uniqueRanked.length); i++) {
        const entry = uniqueRanked[i];
        const prizeAmount = Math.floor(prizePool * prizes[i].percent / 100);

        // Award diamonds via logging RPC
        await supabase.rpc('add_diamonds_to_balance', {
            p_user_id: entry.user_id,
            p_amount: prizeAmount,
            p_type: 'tournament_prize',
            p_description: `#${i + 1} place — ${tournament.name} (${prizeAmount}💎)`,
            p_reference_id: tournament.id
        });

        // Update entry
        await supabase
            .from('trivia_tournament_entries')
            .update({ prize_won: prizeAmount, placement: i + 1 })
            .eq('id', entry.id);

        winners.push({
            place: i + 1,
            user_id: entry.user_id,
            username: entry.profiles?.username,
            prize: prizeAmount
        });

        // Notify winner
        await supabase
            .from('trivia_tournament_notifications')
            .insert({
                user_id: entry.user_id,
                tournament_id: tournament.id,
                notification_type: 'winner',
                message: `🏆 You placed #${i + 1} in ${tournament.name}! You won ${prizeAmount}💎!`
            });
    }

    // Update tournament
    await supabase
        .from('trivia_tournaments')
        .update({
            status: 'completed',
            prize_pool: prizePool,
            winners,
            completed_at: new Date().toISOString()
        })
        .eq('id', tournament.id);

    console.log(`[Tournament] Completed: ${tournament.name}, Winners:`, winners);
}

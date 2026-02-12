/**
 * TRIVIA TOURNAMENT CRON JOB — Bracket System
 * Manages daily tournament lifecycle:
 * - Creates new tournament daily for 7PM CST (1AM UTC)
 * - Generates brackets when tournament starts
 * - Archives completed/cancelled tournaments
 * 
 * Schedule: 0 1 * * * (1AM UTC = 7PM CST daily)
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ENTRY_FEE = 25;
const HOUSE_RAKE_PERCENT = 10;

export default async function handler(req, res) {
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const now = new Date();
        const results = {
            created: null,
            started: null,
            cancelled: null
        };

        // 1. Start any tournament whose start_time has passed and is still 'upcoming'
        const { data: upcomingTournaments } = await supabase
            .from('trivia_tournaments')
            .select('*')
            .eq('status', 'upcoming')
            .lte('start_time', now.toISOString());

        for (const tournament of upcomingTournaments || []) {
            // Get registered entries
            const { data: entries } = await supabase
                .from('trivia_tournament_entries')
                .select('*')
                .eq('tournament_id', tournament.id)
                .order('created_at', { ascending: true });

            if (!entries || entries.length < 2) {
                // Not enough players — cancel and refund
                await cancelAndRefund(tournament, entries || []);
                results.cancelled = tournament.id;
                continue;
            }

            // Generate bracket
            const bracketResult = await generateBracket(tournament, entries);
            results.started = { id: tournament.id, players: entries.length, rounds: bracketResult.totalRounds };
        }

        // 2. Create tomorrow's tournament
        const tomorrow7pmCST = getNext7pmCST();

        // Check if tournament already exists for that time
        const startOfDay = new Date(tomorrow7pmCST);
        startOfDay.setUTCHours(0, 0, 0, 0);
        const endOfDay = new Date(tomorrow7pmCST);
        endOfDay.setUTCHours(23, 59, 59, 999);

        const { data: existingTournament } = await supabase
            .from('trivia_tournaments')
            .select('id')
            .gte('start_time', startOfDay.toISOString())
            .lt('start_time', endOfDay.toISOString())
            .limit(1);

        if (!existingTournament || existingTournament.length === 0) {
            // Load questions for the tournament
            const { data: questions } = await supabase
                .from('trivia_questions')
                .select('*')
                .limit(100);

            const tournamentQuestions = questions
                ?.sort(() => Math.random() - 0.5)
                .slice(0, 20) || []; // 20 questions per round (all categories)

            const { data: newTournament, error } = await supabase
                .from('trivia_tournaments')
                .insert({
                    name: `Daily Championship — ${tomorrow7pmCST.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}`,
                    start_time: tomorrow7pmCST.toISOString(),
                    end_time: null, // Ends when final round completes
                    entry_fee: ENTRY_FEE,
                    prize_pool: 0,
                    questions: tournamentQuestions,
                    status: 'upcoming',
                    tournament_type: 'bracket',
                    current_round: 0,
                    created_at: now.toISOString()
                })
                .select()
                .single();

            if (!error && newTournament) {
                results.created = newTournament.id;
                console.log(`[Tournament] Created: ${newTournament.name}`);
            }
        }

        return res.status(200).json({
            success: true,
            results,
            timestamp: now.toISOString()
        });

    } catch (error) {
        console.error('[Tournament Cron] Error:', error);
        return res.status(500).json({ error: error.message });
    }
}

/**
 * Generate bracket from registered entries
 * Seeds players, adds byes for power-of-2, creates Round 1 matchups
 */
async function generateBracket(tournament, entries) {
    // Determine bracket size (next power of 2)
    const numPlayers = entries.length;
    let bracketSize = 2;
    while (bracketSize < numPlayers) bracketSize *= 2;

    const totalRounds = Math.log2(bracketSize);

    // Seed players (random seeding for now)
    const shuffled = entries.sort(() => Math.random() - 0.5);
    for (let i = 0; i < shuffled.length; i++) {
        await supabase
            .from('trivia_tournament_entries')
            .update({ seed_number: i + 1 })
            .eq('id', shuffled[i].id);
    }

    // Create Round 1 matchups
    const matchups = [];
    for (let i = 0; i < bracketSize; i += 2) {
        const player1 = shuffled[i] || null;
        const player2 = shuffled[i + 1] || null;

        const matchup = {
            match_index: matchups.length,
            player1_id: player1?.user_id || null,
            player2_id: player2?.user_id || null,
            player1_score: null,
            player2_score: null,
            winner_id: null,
            is_bye: !player1 || !player2
        };

        // Auto-advance byes
        if (matchup.is_bye) {
            matchup.winner_id = player1?.user_id || player2?.user_id;
        }

        matchups.push(matchup);
    }

    // 24 hours from now for round deadline
    const deadline = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // Create round record
    await supabase
        .from('trivia_tournament_rounds')
        .insert({
            tournament_id: tournament.id,
            round_number: 1,
            deadline: deadline.toISOString(),
            status: 'active',
            matchups
        });

    // Update tournament status
    await supabase
        .from('trivia_tournaments')
        .update({
            status: 'active',
            current_round: 1,
            total_rounds: totalRounds,
            round_deadline: deadline.toISOString()
        })
        .eq('id', tournament.id);

    // Send round_start notifications to all players
    const notifications = entries.map(e => ({
        user_id: e.user_id,
        tournament_id: tournament.id,
        notification_type: 'round_start',
        message: `Round 1 of ${tournament.name} has started! You have 24 hours to play.`
    }));

    if (notifications.length > 0) {
        await supabase
            .from('trivia_tournament_notifications')
            .insert(notifications);
    }

    console.log(`[Tournament] Bracket generated: ${numPlayers} players, ${totalRounds} rounds, ${matchups.length} matchups`);
    return { totalRounds, matchups };
}

/**
 * Cancel tournament and refund all entries
 */
async function cancelAndRefund(tournament, entries) {
    for (const entry of entries) {
        const { data: profile } = await supabase
            .from('profiles')
            .select('diamonds')
            .eq('id', entry.user_id)
            .single();

        if (profile) {
            await supabase
                .from('profiles')
                .update({ diamonds: (profile.diamonds || 0) + tournament.entry_fee })
                .eq('id', entry.user_id);
        }

        // Notify player
        await supabase
            .from('trivia_tournament_notifications')
            .insert({
                user_id: entry.user_id,
                tournament_id: tournament.id,
                notification_type: 'eliminated',
                message: `${tournament.name} was cancelled — not enough players. Your ${tournament.entry_fee}💎 has been refunded.`
            });
    }

    await supabase
        .from('trivia_tournaments')
        .update({ status: 'cancelled' })
        .eq('id', tournament.id);

    console.log(`[Tournament] Cancelled: ${tournament.name} (${entries.length} entries refunded)`);
}

/**
 * Get next 7PM CST time
 * 7PM CST = 1AM UTC next day (during standard time)
 * 7PM CDT = 12AM UTC next day (during daylight saving)
 */
function getNext7pmCST() {
    const now = new Date();

    // Create a date for today at 7PM CST (UTC-6)
    // Use 1AM UTC as default (CST), adjust if needed
    const today7pm = new Date(now);
    today7pm.setUTCHours(1, 0, 0, 0); // 7PM CST = 1AM UTC next day
    today7pm.setUTCDate(today7pm.getUTCDate() + 1);

    // If today's 7PM hasn't passed yet, use today
    const today7pmCheck = new Date(now);
    today7pmCheck.setUTCHours(1, 0, 0, 0);
    if (now.getUTCHours() < 1) {
        // Still before 1AM UTC today (which is 7PM CST yesterday)
        return today7pmCheck;
    }

    return today7pm;
}

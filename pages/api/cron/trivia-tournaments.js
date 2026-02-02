/**
 * TRIVIA TOURNAMENT CRON JOB
 * Manages weekly tournament lifecycle:
 * - Creates new tournaments (Saturday 8PM CST)
 * - Starts active tournaments
 * - Ends tournaments and distributes prizes
 * - Archives completed tournaments
 * 
 * Schedule: Run every hour
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ENTRY_FEE = 25;
const HOUSE_RAKE_PERCENT = 10;

export default async function handler(req, res) {
    // Verify cron secret
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const now = new Date();
        const results = {
            created: null,
            started: null,
            completed: null
        };

        // 1. Check for tournaments that need to start
        const { data: upcomingTournaments } = await supabase
            .from('trivia_tournaments')
            .select('*')
            .eq('status', 'upcoming')
            .lte('start_time', now.toISOString());

        for (const tournament of upcomingTournaments || []) {
            await supabase
                .from('trivia_tournaments')
                .update({ status: 'active' })
                .eq('id', tournament.id);

            results.started = tournament.id;
            console.log(`[Tournament] Started: ${tournament.name}`);
        }

        // 2. Check for tournaments that need to end
        const { data: activeTournaments } = await supabase
            .from('trivia_tournaments')
            .select('*')
            .eq('status', 'active')
            .lte('end_time', now.toISOString());

        for (const tournament of activeTournaments || []) {
            await completeTournament(tournament);
            results.completed = tournament.id;
            console.log(`[Tournament] Completed: ${tournament.name}`);
        }

        // 3. Create next week's tournament if needed
        const nextSaturday = getNextSaturday8pmCST();

        // Check if tournament already exists for that time
        const { data: existingTournament } = await supabase
            .from('trivia_tournaments')
            .select('id')
            .gte('start_time', nextSaturday.toISOString())
            .lt('start_time', new Date(nextSaturday.getTime() + 86400000).toISOString())
            .single();

        if (!existingTournament) {
            const endTime = new Date(nextSaturday.getTime() + 60 * 60 * 1000); // 1 hour duration

            // Load questions for the tournament
            const { data: questions } = await supabase
                .from('trivia_questions')
                .select('*')
                .limit(50);

            const tournamentQuestions = questions
                ?.sort(() => Math.random() - 0.5)
                .slice(0, 20) || [];

            const { data: newTournament, error } = await supabase
                .from('trivia_tournaments')
                .insert({
                    name: `Weekly Championship - ${nextSaturday.toLocaleDateString()}`,
                    start_time: nextSaturday.toISOString(),
                    end_time: endTime.toISOString(),
                    entry_fee: ENTRY_FEE,
                    prize_pool: 0, // Will grow as players join
                    questions: tournamentQuestions,
                    status: 'upcoming',
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

async function completeTournament(tournament) {
    // Get all entries sorted by score
    const { data: entries } = await supabase
        .from('trivia_tournament_entries')
        .select('*, profiles(username)')
        .eq('tournament_id', tournament.id)
        .order('score', { ascending: false })
        .order('time_spent', { ascending: true }); // Tiebreaker: faster time wins

    if (!entries || entries.length === 0) {
        // No participants, just mark complete
        await supabase
            .from('trivia_tournaments')
            .update({
                status: 'completed',
                completed_at: new Date().toISOString()
            })
            .eq('id', tournament.id);
        return;
    }

    // Calculate prize pool
    const totalEntryFees = entries.length * ENTRY_FEE;
    const houseRake = Math.floor(totalEntryFees * HOUSE_RAKE_PERCENT / 100);
    const prizePool = totalEntryFees - houseRake;

    // Prize distribution: 50% 1st, 30% 2nd, 20% 3rd
    const prizes = [
        { place: 1, percent: 50 },
        { place: 2, percent: 30 },
        { place: 3, percent: 20 }
    ];

    const winners = [];

    for (let i = 0; i < Math.min(3, entries.length); i++) {
        const entry = entries[i];
        const prizeAmount = Math.floor(prizePool * prizes[i].percent / 100);

        // Award diamonds to winner
        const { data: profile } = await supabase
            .from('profiles')
            .select('diamonds')
            .eq('id', entry.user_id)
            .single();

        if (profile) {
            await supabase
                .from('profiles')
                .update({ diamonds: (profile.diamonds || 0) + prizeAmount })
                .eq('id', entry.user_id);
        }

        // Update entry with prize
        await supabase
            .from('trivia_tournament_entries')
            .update({
                prize_won: prizeAmount,
                placement: i + 1
            })
            .eq('id', entry.id);

        winners.push({
            place: i + 1,
            user_id: entry.user_id,
            username: entry.profiles?.username,
            score: entry.score,
            prize: prizeAmount
        });
    }

    // Update tournament as completed
    await supabase
        .from('trivia_tournaments')
        .update({
            status: 'completed',
            prize_pool: prizePool,
            winners: winners,
            completed_at: new Date().toISOString()
        })
        .eq('id', tournament.id);
}

function getNextSaturday8pmCST() {
    const now = new Date();
    const dayOfWeek = now.getUTCDay(); // 0 = Sunday, 6 = Saturday

    // Calculate days until next Saturday
    let daysUntilSaturday = (6 - dayOfWeek + 7) % 7;
    if (daysUntilSaturday === 0) {
        // It's Saturday, check if 8pm CST has passed
        const saturdayStart = new Date(now);
        saturdayStart.setUTCHours(2, 0, 0, 0); // 8pm CST = 2am UTC next day
        if (now > saturdayStart) {
            daysUntilSaturday = 7; // Next Saturday
        }
    }

    const nextSaturday = new Date(now);
    nextSaturday.setDate(now.getDate() + daysUntilSaturday);

    // Set to 8pm CST (UTC-6) = 2am UTC next day
    nextSaturday.setUTCHours(2, 0, 0, 0);

    return nextSaturday;
}

/**
 * HORSE TOURNAMENT TEST SCRIPT
 * Simulates 100 horse (AI) players registering for and playing in a tournament.
 * 
 * Usage: node scripts/horse-tournament-test.js
 * 
 * What it does:
 * 1. Fetches all horse profiles from the database
 * 2. Creates a test tournament starting NOW (or registers horses into an existing one)
 * 3. Starts the tournament and generates brackets
 * 4. Plays through all rounds automatically, simulating scores
 * 5. Prints bracket results for each round
 * 
 * Flags:
 *   --create-tournament   Creates a new test tournament (default: uses existing upcoming)
 *   --count N             Number of horses to register (default: all available, max 100)
 *   --play-rounds         Auto-play through all rounds (default: just register)
 *   --entry-fee N         Entry fee in diamonds (default: 25)
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Parse CLI args
const args = process.argv.slice(2);
const CREATE_TOURNAMENT = args.includes('--create-tournament');
const PLAY_ROUNDS = args.includes('--play-rounds');
const countIdx = args.indexOf('--count');
const MAX_HORSES = countIdx !== -1 ? parseInt(args[countIdx + 1]) : 100;
const feeIdx = args.indexOf('--entry-fee');
const ENTRY_FEE = feeIdx !== -1 ? parseInt(args[feeIdx + 1]) : 25;

const HOUSE_RAKE_PERCENT = 10;

async function main() {
    console.log('🐴 Horse Tournament Test Script');
    console.log('================================\n');

    // 1. Fetch horse profiles
    console.log('📋 Fetching horse profiles...');
    const { data: horses, error: horseErr } = await supabase
        .from('profiles')
        .select('id, username, diamonds')
        .eq('is_horse', true)
        .limit(MAX_HORSES);

    if (horseErr) {
        console.error('❌ Error fetching horses:', horseErr.message);
        process.exit(1);
    }

    if (!horses || horses.length === 0) {
        console.error('❌ No horse profiles found! Make sure profiles have is_horse = true');
        process.exit(1);
    }

    console.log(`✅ Found ${horses.length} horse profiles\n`);

    // Show first 10 horses
    horses.slice(0, 10).forEach(h => {
        console.log(`   🐴 ${h.username || 'Unknown'} (${h.diamonds || 0}💎)`);
    });
    if (horses.length > 10) console.log(`   ... and ${horses.length - 10} more\n`);

    // 2. Find or create tournament
    let tournament;

    if (CREATE_TOURNAMENT) {
        console.log('\n🏟️  Creating test tournament...');
        const startTime = new Date(Date.now() + 10000); // 10 seconds from now
        const endTime = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

        const { data: newTournament, error: createErr } = await supabase
            .from('trivia_tournaments')
            .insert({
                name: `🐴 Horse Test Championship #${Date.now().toString().slice(-4)}`,
                start_time: startTime.toISOString(),
                end_time: endTime.toISOString(),
                entry_fee: ENTRY_FEE,
                prize_pool: 0,
                status: 'upcoming',
                tournament_type: 'bracket',
                current_round: 0,
                questions: await getTestQuestions(),
                created_at: new Date().toISOString()
            })
            .select()
            .single();

        if (createErr) {
            console.error('❌ Error creating tournament:', createErr.message);
            process.exit(1);
        }

        tournament = newTournament;
        console.log(`✅ Created: "${tournament.name}" (ID: ${tournament.id})`);
        console.log(`   Start: ${new Date(tournament.start_time).toLocaleString()}`);
        console.log(`   Entry: ${ENTRY_FEE}💎\n`);
    } else {
        // Find existing upcoming tournament
        const { data: existing } = await supabase
            .from('trivia_tournaments')
            .select('*')
            .in('status', ['upcoming', 'active'])
            .order('start_time', { ascending: true })
            .limit(1)
            .single();

        if (!existing) {
            console.error('❌ No upcoming/active tournament found. Use --create-tournament to create one.');
            process.exit(1);
        }

        tournament = existing;
        console.log(`\n🏟️  Using existing tournament: "${tournament.name}" (${tournament.status})`);
    }

    // 3. Register horses
    console.log(`\n📝 Registering ${horses.length} horses for ${ENTRY_FEE}💎 each...\n`);
    let registered = 0;
    let skipped = 0;

    for (const horse of horses) {
        // Check if already registered
        const { data: existing } = await supabase
            .from('trivia_tournament_entries')
            .select('id')
            .eq('tournament_id', tournament.id)
            .eq('user_id', horse.id)
            .limit(1);

        if (existing && existing.length > 0) {
            skipped++;
            continue;
        }

        // Give horses diamonds if they don't have enough
        const currentDiamonds = horse.diamonds || 0;
        if (currentDiamonds < ENTRY_FEE) {
            await supabase
                .from('profiles')
                .update({ diamonds: currentDiamonds + 1000 })
                .eq('id', horse.id);
        }

        // Deduct entry fee
        const { data: freshProfile } = await supabase
            .from('profiles')
            .select('diamonds')
            .eq('id', horse.id)
            .single();

        const newBalance = (freshProfile?.diamonds || 1000) - ENTRY_FEE;
        await supabase
            .from('profiles')
            .update({ diamonds: Math.max(0, newBalance) })
            .eq('id', horse.id);

        // Create entry
        const { error: entryErr } = await supabase
            .from('trivia_tournament_entries')
            .insert({
                tournament_id: tournament.id,
                user_id: horse.id,
                score: 0,
                created_at: new Date().toISOString()
            });

        if (entryErr) {
            console.log(`   ❌ ${horse.username}: ${entryErr.message}`);
        } else {
            registered++;
            if (registered <= 20 || registered % 10 === 0) {
                console.log(`   ✅ [${registered}/${horses.length}] ${horse.username} registered`);
            }
        }
    }

    // Update prize pool
    const netEntryFee = ENTRY_FEE - Math.floor(ENTRY_FEE * HOUSE_RAKE_PERCENT / 100);
    const totalPrizeAdd = netEntryFee * registered;
    await supabase
        .from('trivia_tournaments')
        .update({
            prize_pool: (tournament.prize_pool || 0) + totalPrizeAdd
        })
        .eq('id', tournament.id);

    console.log(`\n📊 Registration Summary:`);
    console.log(`   Registered: ${registered}`);
    console.log(`   Skipped (already registered): ${skipped}`);
    console.log(`   Total entry fees: ${registered * ENTRY_FEE}💎`);
    console.log(`   Prize pool addition: ${totalPrizeAdd}💎 (after 10% rake)`);
    console.log(`   House rake: ${registered * ENTRY_FEE - totalPrizeAdd}💎\n`);

    // 4. Generate bracket if tournament is upcoming and we created it
    if (CREATE_TOURNAMENT || tournament.status === 'upcoming') {
        console.log('🎲 Generating brackets...\n');
        await generateAndStartBracket(tournament);
    }

    // 5. Auto-play rounds
    if (PLAY_ROUNDS) {
        console.log('\n⚔️  Auto-playing all rounds...\n');
        await playAllRounds(tournament.id);
    }

    console.log('\n✅ Script complete!');
    process.exit(0);
}

async function getTestQuestions() {
    const { data: questions } = await supabase
        .from('trivia_questions')
        .select('*')
        .limit(100);

    return (questions || [])
        .sort(() => Math.random() - 0.5)
        .slice(0, 10);
}

async function generateAndStartBracket(tournament) {
    // Get registered entries
    const { data: entries } = await supabase
        .from('trivia_tournament_entries')
        .select('*')
        .eq('tournament_id', tournament.id)
        .order('created_at', { ascending: true });

    if (!entries || entries.length < 2) {
        console.log('❌ Not enough entries to generate bracket');
        return;
    }

    const numPlayers = entries.length;
    let bracketSize = 2;
    while (bracketSize < numPlayers) bracketSize *= 2;
    const totalRounds = Math.log2(bracketSize);

    console.log(`   Players: ${numPlayers}`);
    console.log(`   Bracket size: ${bracketSize}`);
    console.log(`   Total rounds: ${totalRounds}`);
    console.log(`   Byes: ${bracketSize - numPlayers}`);

    // Random seeding
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

        if (matchup.is_bye) {
            matchup.winner_id = player1?.user_id || player2?.user_id;
        }

        matchups.push(matchup);
    }

    const deadline = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await supabase
        .from('trivia_tournament_rounds')
        .insert({
            tournament_id: tournament.id,
            round_number: 1,
            deadline: deadline.toISOString(),
            status: 'active',
            matchups
        });

    await supabase
        .from('trivia_tournaments')
        .update({
            status: 'active',
            current_round: 1,
            total_rounds: totalRounds,
            round_deadline: deadline.toISOString()
        })
        .eq('id', tournament.id);

    const byes = matchups.filter(m => m.is_bye).length;
    const realMatches = matchups.length - byes;
    console.log(`\n   ✅ Round 1 created: ${matchups.length} matchups (${realMatches} real, ${byes} byes)`);
}

async function playAllRounds(tournamentId) {
    let roundNumber = 1;
    let keepGoing = true;

    while (keepGoing) {
        // Get current active round
        const { data: round } = await supabase
            .from('trivia_tournament_rounds')
            .select('*')
            .eq('tournament_id', tournamentId)
            .eq('round_number', roundNumber)
            .single();

        if (!round) {
            console.log(`   No round ${roundNumber} found — tournament may be complete.`);
            break;
        }

        console.log(`\n   ⚔️  Playing Round ${roundNumber}...`);

        const matchups = round.matchups || [];
        const updatedMatchups = [...matchups];
        let matchesPlayed = 0;

        for (let i = 0; i < updatedMatchups.length; i++) {
            const m = updatedMatchups[i];
            if (m.winner_id || m.is_bye) continue; // Skip byes and already resolved

            // Simulate both players playing
            // Random scores between 200-1000 (in increments of 100)
            const p1Score = Math.floor(Math.random() * 9 + 2) * 100; // 200-1000
            const p2Score = Math.floor(Math.random() * 9 + 2) * 100;

            updatedMatchups[i] = {
                ...m,
                player1_score: p1Score,
                player2_score: p2Score,
                winner_id: p1Score >= p2Score ? m.player1_id : m.player2_id
            };

            matchesPlayed++;
        }

        // Update round
        await supabase
            .from('trivia_tournament_rounds')
            .update({ status: 'complete', matchups: updatedMatchups })
            .eq('id', round.id);

        // Mark eliminated players
        for (const m of updatedMatchups) {
            if (m.is_bye) continue;
            const loserId = m.player1_id === m.winner_id ? m.player2_id : m.player1_id;
            if (loserId) {
                await supabase
                    .from('trivia_tournament_entries')
                    .update({ eliminated_round: roundNumber })
                    .eq('tournament_id', tournamentId)
                    .eq('user_id', loserId);
            }
        }

        // Get winners
        const winners = updatedMatchups.map(m => m.winner_id).filter(Boolean);

        // Print round results
        console.log(`   Results for Round ${roundNumber}:`);
        for (const m of updatedMatchups) {
            if (m.is_bye) {
                const byePlayer = m.player1_id || m.player2_id;
                const { data: p } = await supabase.from('profiles').select('username').eq('id', byePlayer).single();
                console.log(`      BYE: ${p?.username || 'Unknown'} advances`);
            } else {
                const { data: wp } = await supabase.from('profiles').select('username').eq('id', m.winner_id).single();
                console.log(`      ${m.player1_score} vs ${m.player2_score} → ${wp?.username || 'Unknown'} wins`);
            }
        }
        console.log(`   ${matchesPlayed} matches played, ${winners.length} players advance\n`);

        // Check if final round
        if (winners.length <= 1) {
            console.log(`\n   🏆 TOURNAMENT COMPLETE!`);
            const { data: wp } = await supabase.from('profiles').select('username').eq('id', winners[0]).single();
            console.log(`   🥇 Champion: ${wp?.username || 'Unknown'}\n`);

            // Get tournament for prize calc
            const { data: tournament } = await supabase
                .from('trivia_tournaments')
                .select('*')
                .eq('id', tournamentId)
                .single();

            // Get entries ranked
            const { data: entries } = await supabase
                .from('trivia_tournament_entries')
                .select('*')
                .eq('tournament_id', tournamentId)
                .order('eliminated_round', { ascending: false, nullsFirst: true });

            const allEntries = entries || [];
            const prizePool = tournament?.prize_pool || 0;
            const prizes = [
                { place: 1, pct: 50 },
                { place: 2, pct: 30 },
                { place: 3, pct: 20 }
            ];

            // Build ranked list
            const winnerId = winners[0];
            const ranked = [
                allEntries.find(e => e.user_id === winnerId),
                ...allEntries.filter(e => e.user_id !== winnerId && e.eliminated_round === roundNumber),
                ...allEntries.filter(e => e.eliminated_round && e.eliminated_round < roundNumber)
                    .sort((a, b) => (b.eliminated_round || 0) - (a.eliminated_round || 0))
            ].filter(Boolean);

            // Dedupe
            const seen = new Set();
            const unique = ranked.filter(e => {
                if (seen.has(e.user_id)) return false;
                seen.add(e.user_id);
                return true;
            });

            // Distribute prizes
            const prizeWinners = [];
            for (let i = 0; i < Math.min(3, unique.length); i++) {
                const entry = unique[i];
                const prizeAmount = Math.floor(prizePool * prizes[i].pct / 100);

                // Get profile info
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('diamonds, username')
                    .eq('id', entry.user_id)
                    .single();

                if (profile) {
                    await supabase
                        .from('profiles')
                        .update({ diamonds: (profile.diamonds || 0) + prizeAmount })
                        .eq('id', entry.user_id);
                }

                await supabase
                    .from('trivia_tournament_entries')
                    .update({ prize_won: prizeAmount, placement: i + 1 })
                    .eq('id', entry.id);

                const username = profile?.username || 'Unknown';
                prizeWinners.push({
                    place: i + 1,
                    user_id: entry.user_id,
                    username,
                    prize: prizeAmount
                });

                console.log(`   ${['🥇', '🥈', '🥉'][i]} #${i + 1}: ${username} — +${prizeAmount}💎`);
            }

            // Update tournament
            await supabase
                .from('trivia_tournaments')
                .update({
                    status: 'completed',
                    winners: prizeWinners,
                    completed_at: new Date().toISOString()
                })
                .eq('id', tournamentId);

            keepGoing = false;
        } else {
            // Create next round
            const nextRound = roundNumber + 1;
            const nextMatchups = [];

            for (let i = 0; i < winners.length; i += 2) {
                const p1 = winners[i] || null;
                const p2 = winners[i + 1] || null;

                const matchup = {
                    match_index: nextMatchups.length,
                    player1_id: p1,
                    player2_id: p2,
                    player1_score: null,
                    player2_score: null,
                    winner_id: null,
                    is_bye: !p1 || !p2
                };

                if (matchup.is_bye) {
                    matchup.winner_id = p1 || p2;
                }

                nextMatchups.push(matchup);
            }

            const deadline = new Date(Date.now() + 24 * 60 * 60 * 1000);

            await supabase
                .from('trivia_tournament_rounds')
                .insert({
                    tournament_id: tournamentId,
                    round_number: nextRound,
                    deadline: deadline.toISOString(),
                    status: 'active',
                    matchups: nextMatchups
                });

            await supabase
                .from('trivia_tournaments')
                .update({
                    current_round: nextRound,
                    round_deadline: deadline.toISOString()
                })
                .eq('id', tournamentId);

            const byes = nextMatchups.filter(m => m.is_bye).length;
            console.log(`   ✅ Round ${nextRound} created: ${nextMatchups.length} matchups (${nextMatchups.length - byes} real, ${byes} byes)`);
            roundNumber = nextRound;
        }
    }
}

main().catch(err => {
    console.error('💥 Fatal error:', err);
    process.exit(1);
});

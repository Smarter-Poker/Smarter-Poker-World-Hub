#!/usr/bin/env node
/**
 * Seed Tables, Games, Tournaments, Entries, Waitlist & Seats
 * for Club JAQK (venue 1996)
 *
 * Run: node scripts/seed-jaqk-games-tournaments.js
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

// Load env
const envPath = new URL('../.env.local', import.meta.url).pathname;
const envVars = {};
readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
    const m = line.match(/^([A-Z_]+)="?([^"]*)"?$/);
    if (m) envVars[m[1]] = m[2].replace(/\n$/, '');
});
const url = envVars.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = envVars.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const sb = createClient(url, key);

const VENUE_ID = 1996;
const uuid = () => crypto.randomUUID();
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const ago = (days) => new Date(Date.now() - days * 86400000).toISOString();
const future = (days) => new Date(Date.now() + days * 86400000).toISOString();
const today = () => new Date().toISOString();

let inserted = 0;
let errors = 0;

async function insert(table, rows, selectCols = 'id') {
    const { data, error } = await sb.from(table).insert(rows).select(selectCols);
    if (error) {
        console.error(`  ❌ ${table}: ${error.message}`);
        errors++;
        return [];
    }
    const count = Array.isArray(data) ? data.length : 1;
    inserted += count;
    console.log(`  ✅ ${table}: ${count} rows inserted`);
    return data || [];
}

// Real profile IDs (same as main seed script)
const PROFILE_IDS = [
    '9b027798-9532-403f-a5c1-15554ce2959c',
    'f39893fa-6830-49b6-9f80-b32191328ac0',
    '9b918b56-08d8-4a06-b8a0-de2bf4022303',
    '262b4a43-9749-4994-b6e5-b4b107ead280',
    'c1b575fb-3efd-43b6-b314-353e1d300aaa',
    '0d8a22d1-8ea8-40d7-a821-10547198ff6c',
    '7e616640-58dd-4d8d-a18e-2f37f057bcd9',
    'b6d34da3-9b2d-40b9-9dc3-8a46b74e651f',
    '6cf64a8a-04db-458c-ab06-18f559163143',
    '113fc1bc-25f5-4508-8244-2aa3aa04a3cf',
    'fce27c9f-8b57-441e-84ce-90b7ae37e9f9',
    'b2f00fd7-c18a-40fa-ab52-60c810b66c22',
    'f96043f3-2f0b-41bb-8e6e-7eac3ee89437',
    'c3be6a2a-0ee2-4bff-8e5e-1e2dbc58c7aa',
    'da19e413-3c47-4b8a-8bde-53a2d99db580',
    'b06d62b1-3abe-4dfa-ab3e-65dcbd834c82',
    '1c3ba37c-5f9c-4f47-9a08-b3f1c3c0e3b8',
    'a4bb95ac-31b3-4d3c-af5d-ff5b1a3e7f22',
    'e8c55d79-6f82-4a15-b1c3-9d7ef4a8b612',
    'd2a13f68-8e94-4c21-a7b9-3c6da5f19e43',
    'f7e98b42-1234-4567-89ab-cdef01234567',
    'a1b2c3d4-5678-9abc-def0-123456789abc',
    '12345678-abcd-4ef0-1234-567890abcdef',
    'fedcba98-7654-4321-0fed-cba987654321',
    '11223344-5566-4778-8990-aabbccddeeff',
    'aabbccdd-eeff-4011-2233-445566778899',
    '99887766-5544-4332-2110-ffeeddccbbaa',
    'deadbeef-cafe-4bab-e123-456789abcdef',
    'c0ffee00-dead-4bee-f000-baadf00dcafe',
    'face1234-5678-4abc-def0-123456789012',
];

const PLAYER_NAMES = [
    'Marcus Chen', 'Sarah Rodriguez', 'James Williams', 'Emily Nakamura',
    'David Okonkwo', 'Olivia Martin', 'Michael Patel', 'Jessica Thompson',
    'Daniel Kim', 'Ashley Garcia', 'Christopher Lee', 'Amanda Johnson',
    'Robert Nguyen', 'Stephanie Brown', 'Kevin Davis', 'Megan Wilson',
    'Anthony Moore', 'Lauren Taylor', 'Brian Anderson', 'Nicole White',
];

console.log('═══════════════════════════════════════════════');
console.log('  CLUB JAQK (venue 1996) — Tables, Games & Tournaments');
console.log('═══════════════════════════════════════════════\n');

async function main() {
    // ════════════════════════════════════════════
    // 1. COMMANDER TABLES (12 physical tables)
    // ════════════════════════════════════════════
    console.log('── Tables ─────────────────────────────────────');

    // Check if tables already exist
    const { data: existingTables } = await sb.from('commander_tables')
        .select('id, table_number, status')
        .eq('venue_id', VENUE_ID);

    let TABLE_IDS;
    if (existingTables && existingTables.length >= 12) {
        TABLE_IDS = existingTables.map(t => t.id);
        console.log(`  ⏭️  commander_tables: ${existingTables.length} already exist`);
    } else {
        const tableRows = [];
        for (let i = 1; i <= 12; i++) {
            const tableName = i === 1 ? 'Featured Table' : i === 12 ? 'VIP Table' : `Table ${i}`;
            let status;
            if (i <= 5) status = 'in_use';
            else if (i <= 9) status = 'available';
            else if (i <= 11) status = 'reserved';
            else status = 'maintenance';

            tableRows.push({
                venue_id: VENUE_ID,
                table_number: i,
                table_name: tableName,
                max_seats: 9,
                status,
                game_type: i <= 3 ? 'nlh' : (i <= 5 ? 'plo' : null),
                stakes: i === 1 ? '1/2' : i === 2 ? '2/5' : i === 3 ? '5/10' : i === 4 ? '1/2' : i === 5 ? '2/5' : null,
            });
        }
        const result = await insert('commander_tables', tableRows);
        TABLE_IDS = result.map(t => t.id);
    }

    // ════════════════════════════════════════════
    // 2. COMMANDER GAMES (5 running games)
    // ════════════════════════════════════════════
    console.log('\n── Games (5 Running) ──────────────────────────');

    const { data: existingGames } = await sb.from('commander_games')
        .select('id')
        .eq('venue_id', VENUE_ID)
        .in('status', ['running', 'waiting']);

    let GAME_IDS;
    if (existingGames && existingGames.length >= 5) {
        GAME_IDS = existingGames.map(g => g.id);
        console.log(`  ⏭️  commander_games: ${existingGames.length} already running`);
    } else {
        const gameConfigs = [
            { table_idx: 0, game_type: 'nlh', stakes: '1/2', min_buyin: 100, max_buyin: 300, current_players: 8 },
            { table_idx: 1, game_type: 'nlh', stakes: '2/5', min_buyin: 200, max_buyin: 1000, current_players: 7 },
            { table_idx: 2, game_type: 'nlh', stakes: '5/10', min_buyin: 500, max_buyin: 3000, current_players: 6 },
            { table_idx: 3, game_type: 'plo', stakes: '1/2', min_buyin: 100, max_buyin: 500, current_players: 9 },
            { table_idx: 4, game_type: 'plo', stakes: '2/5', min_buyin: 300, max_buyin: 2000, current_players: 5 },
        ];

        const gameRows = gameConfigs.map(g => ({
            venue_id: VENUE_ID,
            table_id: TABLE_IDS[g.table_idx] || null,
            game_type: g.game_type,
            stakes: g.stakes,
            min_buyin: g.min_buyin,
            max_buyin: g.max_buyin,
            max_players: 9,
            current_players: g.current_players,
            status: 'running',
            started_at: ago(rand(1, 6) / 24), // started 1-6 hours ago
            is_must_move: false,
            settings: {},
        }));
        const result = await insert('commander_games', gameRows);
        GAME_IDS = result.map(g => g.id);

        // Update tables to reference their games
        for (let i = 0; i < GAME_IDS.length; i++) {
            if (TABLE_IDS[i]) {
                await sb.from('commander_tables')
                    .update({ current_game_id: GAME_IDS[i], status: 'in_use' })
                    .eq('id', TABLE_IDS[i]);
            }
        }
    }

    // ════════════════════════════════════════════
    // 3. COMMANDER SEATS (for 5 running games)
    // ════════════════════════════════════════════
    console.log('\n── Seats ──────────────────────────────────────');

    const gameConfigs = [
        { current_players: 8 },
        { current_players: 7 },
        { current_players: 6 },
        { current_players: 9 },
        { current_players: 5 },
    ];

    const seatRows = [];
    for (let gi = 0; gi < GAME_IDS.length; gi++) {
        const numPlayers = gameConfigs[gi].current_players;
        // Check if seats already exist for this game
        const { data: existingSeats } = await sb.from('commander_seats')
            .select('id')
            .eq('game_id', GAME_IDS[gi]);
        if (existingSeats && existingSeats.length > 0) continue;

        for (let s = 1; s <= 9; s++) {
            const isOccupied = s <= numPlayers;
            // Only use real profile IDs (first 10) to avoid FK violation
            const pidIdx = (gi * 9 + s - 1) % 10;
            seatRows.push({
                game_id: GAME_IDS[gi],
                seat_number: s,
                status: isOccupied ? 'occupied' : 'empty',
                player_id: isOccupied ? PROFILE_IDS[pidIdx] : null,
                player_name: isOccupied ? PLAYER_NAMES[pidIdx % PLAYER_NAMES.length] : null,
            });
        }
    }
    if (seatRows.length > 0) {
        await insert('commander_seats', seatRows);
    } else {
        console.log('  ⏭️  commander_seats: already exist');
    }

    // ════════════════════════════════════════════
    // 4. COMMANDER WAITLIST (10 entries across game types)
    // ════════════════════════════════════════════
    console.log('\n── Waitlist ───────────────────────────────────');

    const { data: existingWL } = await sb.from('commander_waitlist')
        .select('id').eq('venue_id', VENUE_ID);
    if (existingWL && existingWL.length > 0) {
        console.log(`  ⏭️  commander_waitlist: ${existingWL.length} already exist`);
    } else {
        const waitlistEntries = [
            { game_type: 'nlh', stakes: '1/2', idx: 0 },
            { game_type: 'nlh', stakes: '1/2', idx: 1 },
            { game_type: 'nlh', stakes: '1/2', idx: 2 },
            { game_type: 'nlh', stakes: '2/5', idx: 3 },
            { game_type: 'nlh', stakes: '2/5', idx: 4 },
            { game_type: 'nlh', stakes: '5/10', idx: 5 },
            { game_type: 'plo', stakes: '1/2', idx: 6 },
            { game_type: 'plo', stakes: '1/2', idx: 7 },
            { game_type: 'plo', stakes: '2/5', idx: 8 },
            { game_type: 'plo', stakes: '2/5', idx: 9 },
        ];
        const wlRows = waitlistEntries.map((w, i) => ({
            venue_id: VENUE_ID,
            player_id: PROFILE_IDS[w.idx % 10], // Only use first 10 real profile IDs
            player_name: PLAYER_NAMES[w.idx % PLAYER_NAMES.length],
            game_type: w.game_type,
            stakes: w.stakes,
            position: i + 1,
            status: 'waiting',
            created_at: ago(rand(0, 2) / 24),
        }));
        await insert('commander_waitlist', wlRows);
    }

    // ════════════════════════════════════════════
    // 5. COMMANDER TOURNAMENTS (12 tournaments)
    // ════════════════════════════════════════════
    console.log('\n── Tournaments ────────────────────────────────');

    const { data: existingTourneys } = await sb.from('commander_tournaments')
        .select('id').eq('venue_id', VENUE_ID);

    let TOURNEY_IDS;
    if (existingTourneys && existingTourneys.length >= 10) {
        TOURNEY_IDS = existingTourneys.map(t => t.id);
        console.log(`  ⏭️  commander_tournaments: ${existingTourneys.length} already exist`);
    } else {
        const blindStructure = [
            { level: 1, small: 25, big: 50, ante: 0, duration: 20 },
            { level: 2, small: 50, big: 100, ante: 0, duration: 20 },
            { level: 3, small: 75, big: 150, ante: 25, duration: 20 },
            { level: 4, small: 100, big: 200, ante: 25, duration: 20 },
            { level: 5, small: 150, big: 300, ante: 50, duration: 20 },
            { level: 6, small: 200, big: 400, ante: 50, duration: 20 },
            { level: 7, small: 300, big: 600, ante: 75, duration: 20 },
            { level: 8, small: 400, big: 800, ante: 100, duration: 20 },
            { level: 9, small: 500, big: 1000, ante: 100, duration: 15 },
            { level: 10, small: 600, big: 1200, ante: 200, duration: 15 },
            { level: 11, small: 800, big: 1600, ante: 200, duration: 15 },
            { level: 12, small: 1000, big: 2000, ante: 300, duration: 15 },
        ];

        const payoutStructure = [
            { place: 1, percentage: 40 },
            { place: 2, percentage: 25 },
            { place: 3, percentage: 15 },
            { place: 4, percentage: 10 },
            { place: 5, percentage: 5 },
            { place: 6, percentage: 3 },
            { place: 7, percentage: 2 },
        ];

        const tournamentDefs = [
            // 3 Active (running/registration)
            {
                name: 'Nightly Turbo NLH', type: 'turbo', buyin: 60, fee: 10, chips: 10000, status: 'running',
                scheduled_start: ago(0.1), current_level: 4, current_entries: 32, players_remaining: 18
            },
            {
                name: 'PLO Bounty Special', type: 'bounty', buyin: 100, fee: 15, chips: 15000, status: 'running',
                scheduled_start: ago(0.15), current_level: 3, current_entries: 24, players_remaining: 20, bounty_amount: 25
            },
            {
                name: '$200 Deepstack NLH', type: 'freezeout', buyin: 200, fee: 30, chips: 25000, status: 'registration',
                scheduled_start: future(0.1), current_entries: 8, players_remaining: 8
            },

            // 5 Upcoming (scheduled)
            {
                name: 'Saturday Showdown', type: 'freezeout', buyin: 300, fee: 40, chips: 30000, status: 'scheduled',
                scheduled_start: future(1)
            },
            {
                name: 'Freeroll Friday', type: 'rebuy', buyin: 0, fee: 0, chips: 5000, status: 'scheduled',
                scheduled_start: future(2), allows_rebuys: true, rebuy_amount: 10, rebuy_chips: 5000, max_rebuys: 2, rebuy_end_level: 4
            },
            {
                name: 'High Roller $1K', type: 'freezeout', buyin: 1000, fee: 100, chips: 50000, status: 'scheduled',
                scheduled_start: future(3), guaranteed_pool: 20000
            },
            {
                name: 'Sunday PLO Championship', type: 'freezeout', buyin: 500, fee: 50, chips: 40000, status: 'scheduled',
                scheduled_start: future(4), guaranteed_pool: 15000
            },
            {
                name: 'Monday Mystery Bounty', type: 'bounty', buyin: 150, fee: 20, chips: 20000, status: 'scheduled',
                scheduled_start: future(5), bounty_amount: 50
            },

            // 4 Completed
            {
                name: 'Daily Deepstack NLH', type: 'freezeout', buyin: 100, fee: 15, chips: 15000, status: 'completed',
                scheduled_start: ago(1), current_entries: 45, players_remaining: 0, actual_prizepool: 4500
            },
            {
                name: 'Ladies Night Turbo', type: 'turbo', buyin: 50, fee: 10, chips: 8000, status: 'completed',
                scheduled_start: ago(2), current_entries: 28, players_remaining: 0, actual_prizepool: 1400
            },
            {
                name: 'Thursday PLO Turbo', type: 'turbo', buyin: 75, fee: 10, chips: 10000, status: 'completed',
                scheduled_start: ago(3), current_entries: 35, players_remaining: 0, actual_prizepool: 2625
            },
            {
                name: 'Wednesday Bounty Brawl', type: 'bounty', buyin: 120, fee: 15, chips: 12000, status: 'completed',
                scheduled_start: ago(5), current_entries: 40, players_remaining: 0, bounty_amount: 30, actual_prizepool: 4800
            },
        ];

        const tourneyRows = tournamentDefs.map(t => ({
            venue_id: VENUE_ID,
            name: t.name,
            description: `${t.name} — ${t.type} format at Club JAQK`,
            tournament_type: t.type,
            buyin_amount: t.buyin,
            buyin_fee: t.fee,
            starting_chips: t.chips,
            scheduled_start: t.scheduled_start,
            registration_opens: t.status === 'scheduled' ? ago(0) : t.scheduled_start,
            actual_start: ['running', 'completed'].includes(t.status) ? t.scheduled_start : null,
            ended_at: t.status === 'completed' ? ago(parseFloat(t.scheduled_start.includes('-') ? 0 : 0) - 0.2) : null,
            late_registration_levels: 6,
            min_entries: 2,
            max_entries: t.buyin >= 500 ? 60 : 100,
            guaranteed_pool: t.guaranteed_pool || null,
            status: t.status,
            current_level: t.current_level || 0,
            current_entries: t.current_entries || 0,
            players_remaining: t.players_remaining || 0,
            total_chips_in_play: t.current_entries ? t.current_entries * t.chips : 0,
            average_stack: t.players_remaining > 0 ? Math.floor((t.current_entries * t.chips) / t.players_remaining) : 0,
            blind_structure: blindStructure,
            break_schedule: [{ after_level: 4, duration: 10 }, { after_level: 8, duration: 15 }],
            payout_structure: payoutStructure,
            allows_rebuys: t.allows_rebuys || false,
            rebuy_amount: t.rebuy_amount || null,
            rebuy_chips: t.rebuy_chips || null,
            max_rebuys: t.max_rebuys || null,
            rebuy_end_level: t.rebuy_end_level || null,
            allows_addon: false,
            bounty_amount: t.bounty_amount || null,
            broadcast_to_smarter: true,
            settings: {},
            paying_places: t.status === 'completed' ? 7 : null,
            actual_prizepool: t.actual_prizepool || null,
        }));

        const result = await insert('commander_tournaments', tourneyRows);
        TOURNEY_IDS = result.map(t => t.id);
    }

    // ════════════════════════════════════════════
    // 6. COMMANDER TOURNAMENT ENTRIES
    // ════════════════════════════════════════════
    console.log('\n── Tournament Entries ──────────────────────────');

    if (!TOURNEY_IDS || TOURNEY_IDS.length === 0) {
        console.log('  ⏭️  No tournament IDs available, skipping entries');
    } else {
        const { data: existingEntries } = await sb.from('commander_tournament_entries')
            .select('id')
            .in('tournament_id', TOURNEY_IDS.slice(0, 3));

        if (existingEntries && existingEntries.length > 0) {
            console.log(`  ⏭️  commander_tournament_entries: ${existingEntries.length} already exist`);
        } else {
            const entryRows = [];

            // Active tournaments (indices 0, 1, 2) + completed tournaments (9, 10, 11, 12)
            const tourneysNeedingEntries = [
                { idx: 0, count: 32, eliminated: 14 },
                { idx: 1, count: 24, eliminated: 4 },
                { idx: 2, count: 8, eliminated: 0 },
                // Completed tournaments
                { idx: 9, count: 45, eliminated: 45 },
                { idx: 10, count: 28, eliminated: 28 },
                { idx: 11, count: 35, eliminated: 35 },
            ];

            for (const t of tourneysNeedingEntries) {
                if (!TOURNEY_IDS[t.idx]) continue;
                for (let e = 0; e < t.count; e++) {
                    const isEliminated = e < t.eliminated;
                    const isPaidOut = t.eliminated === t.count && e < 7; // top 7 get paid
                    // Valid statuses: active, registered, eliminated, seated
                    entryRows.push({
                        tournament_id: TOURNEY_IDS[t.idx],
                        player_id: PROFILE_IDS[e % 10],
                        player_name: PLAYER_NAMES[e % PLAYER_NAMES.length],
                        status: isEliminated ? 'eliminated' : 'active',
                        table_number: isEliminated ? null : rand(1, 4),
                        seat_number: isEliminated ? null : rand(1, 9),
                        current_chips: isEliminated ? 0 : rand(5000, 60000),
                        rebuy_count: 0,
                        addon_taken: false,
                        total_invested: 100,
                        finish_position: isPaidOut ? e + 1 : (isEliminated ? rand(t.count - t.eliminated + 1, t.count) : null),
                        payout_amount: isPaidOut ? Math.floor((t.count * 100) * [0.40, 0.25, 0.15, 0.10, 0.05, 0.03, 0.02][e]) : null,
                        bounties_collected: 0,
                        registered_at: ago(rand(0, 3)),
                    });
                }
            }

            await insert('commander_tournament_entries', entryRows);
        }
    }

    // ════════════════════════════════════════════
    // SUMMARY
    // ════════════════════════════════════════════
    console.log('\n═══════════════════════════════════════════════');
    console.log(`  COMPLETE: ${inserted} rows inserted, ${errors} errors`);
    console.log('═══════════════════════════════════════════════');

    if (errors > 0) process.exit(1);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});

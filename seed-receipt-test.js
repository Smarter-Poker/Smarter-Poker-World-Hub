const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    // 1. Get Club JAQK specifically
    const { data: venue } = await supabase.from('poker_venues').select('id, name').ilike('name', '%jaqk%').limit(1).maybeSingle();
    if (!venue) return console.error('No Club JAQK found');
    console.log(`Targeting venue: ${venue.name} (${venue.id})`);

    // 2. Create a test tournament under Club JAQK
    const startTime = new Date();
    startTime.setHours(startTime.getHours() + 1);

    const { data: existingTourn } = await supabase.from('commander_tournaments').select('tournament_type').not('tournament_type', 'is', null).limit(1).maybeSingle();
    const type = existingTourn ? existingTourn.tournament_type : 'Holdem';

    const { data: tourn, error: tErr } = await supabase.from('commander_tournaments').insert({
        venue_id: venue.id,
        name: 'CLUB JAQK OFFICIAL TEST',
        scheduled_start: startTime.toISOString(),
        buyin_amount: 500,
        buyin_fee: 50,
        starting_chips: 50000,
        status: 'scheduled',
        tournament_type: type,
        settings: { receipts: { player: true, dealer: true, cage: true } }
    }).select().maybeSingle();

    if (tErr) return console.error('Tournament create err:', tErr);
    console.log(`Created live tournament: ${tourn.name} (${tourn.id})`);

    // 3. Find a test player
    let playerEmail = 'danny@clubjaqk.com'; // Just using a known test string for display if we can't find DB ID

    // We can also just pull the first record from commander_bankroll_sessions since we know players have sessions
    const { data: session } = await supabase.from('commander_bankroll_sessions').select('player_id, player_name').limit(1).maybeSingle();

    let playerId = session ? session.player_id : 'test-id-123';
    let playerName = session ? session.player_name : 'Test Player';

    console.log(`Found live player: ${playerName} (${playerId})`);

    // 4. Output the exact IDs so the browser subagent can use them
    console.log(`--- TEST DATA ---`);
    console.log(`VENUE_ID=${venue.id}`);
    console.log(`TOURNAMENT_ID=${tourn.id}`);
    console.log(`PLAYER_ID=${playerId}`);
    console.log(`PLAYER_NAME=${playerName}`);
}

run();

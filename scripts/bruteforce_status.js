const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
require('dotenv').config({ path: '.env.local' });

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function tryStatuses() {
    const statusesToTry = [
        'Announced', 'Registering', 'Running', 'Completed', 'Cancelled', 'Scheduled'
    ];

    for (const status of statusesToTry) {
        const tId = crypto.randomUUID();
        const { error } = await supabaseAdmin.from('tournaments').insert({
            id: tId,
            name: 'test',
            game_type: 'texas_holdem',
            buy_in_amount: 100,
            buy_in_fee: 0,
            max_players: 100,
            start_time: new Date().toISOString(),
            status: status
        });

        if (!error) {
            console.log(`✅ SUCCESS! Valid status: '${status}'`);
            await supabaseAdmin.from('tournaments').delete().eq('id', tId);
            return;
        } else {
            console.log(`❌ Failed for '${status}': ${error.message} - ${JSON.stringify(error)}`);
        }
    }
}

tryStatuses();

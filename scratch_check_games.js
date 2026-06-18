const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const mlbDb = createClient(supabaseUrl, supabaseKey);

async function run() {
    const { data, error } = await mlbDb.from('mlb_games').select('game_pk, date, predictions').not('predictions', 'is', null).limit(1);
    console.log("Error:", error);
    console.log("Data:", JSON.stringify(data, null, 2));
}
run();

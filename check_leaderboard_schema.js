import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
    console.log('Checking training_leaderboard schema...');

    // Attempt to select the columns we want to add
    const { data, error } = await supabase
        .from('training_leaderboard')
        .select('total_gtow_score')
        .limit(1);

    if (error) {
        console.log('🔴 Column total_gtow_score missing:', error.message);
    } else {
        console.log('🟢 Column total_gtow_score exists!');
    }
}

main().catch(console.error);

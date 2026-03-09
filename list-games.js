import { createClient } from './src/lib/supabaseServerClient.js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function run() {
    const { data: games, error } = await supabase.from('game_registry').select('slug, title').limit(5);
    console.log(games);
}
run();

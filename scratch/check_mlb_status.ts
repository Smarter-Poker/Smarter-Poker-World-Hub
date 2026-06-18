import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    const yesterdayDate = new Date();
    yesterdayDate.setHours(yesterdayDate.getHours() - 24);
    const last24hIso = yesterdayDate.toISOString();

    const { data, error } = await supabase.rpc('get_mlb_status_metrics', {
        last_24h_iso: last24hIso,
        today_str: '2026-06-18'
    });
    
    if (error) {
        console.log("RPC Error:", error.message);
    } else {
        console.log("RPC Success:", Object.keys(data));
    }
}
check();

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

async function main() {
    const { data, error } = await supabase.rpc('get_mlb_validation_stats', { cutoff: new Date().toISOString() });
    console.log("With cutoff param:", error ? error.message : "Success");
    
    const { data: d2, error: e2 } = await supabase.rpc('get_mlb_validation_stats');
    console.log("Without param:", e2 ? e2.message : "Success");
}
main();

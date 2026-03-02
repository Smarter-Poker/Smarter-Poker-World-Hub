import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    const { data: vips } = await supabase.from('profiles').select('vip_level, vip_tier, is_vip, vip_expires_at').eq('is_vip', true).limit(5);
    console.log('VIP Examples:', vips);

    // Check Club Commander access structures
    // 1. Are there specific staff roles?
    const { data: staff } = await supabase.from('commander_staff').select('*').limit(1);
    console.log('Commander Staff Ex:', staff);

    // 2. Are there commander_venues?
    const { data: venues } = await supabase.from('commander_venues').select('*').limit(1);
    console.log('Commander Venues Ex:', venues);
}
run();

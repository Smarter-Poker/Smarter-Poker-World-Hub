import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    const searchTerm = '%bhenricks%';

    const { data: users, error: err1 } = await supabase.from('users').select('*').ilike('email', searchTerm);
    console.log('Users matching email:', users);

    const { data: profiles, error: err2 } = await supabase.from('profiles').select('*').ilike('email', searchTerm);
    console.log('Profiles matching email:', profiles);
}
run();

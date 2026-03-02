import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    const email = 'BHENRICKS21@GMAIL.COM'.toLowerCase();
    console.log('Searching for:', email);

    // Try via admin API
    const { data: users, error } = await supabase.auth.admin.listUsers();
    if (error) {
        console.error('Admin API Error:', error);
    } else {
        const user = users.users.find(u => u.email && u.email.toLowerCase() === email);
        console.log('Auth User:', user ? user.id : 'Not found');

        if (user) {
            const { data: profile } = await supabase.from('users').select('*').eq('id', user.id).single();
            if (profile) {
                console.log('Public User Record:', profile);
                return;
            }
        }
    }

    // Try Direct DB querying
    const { data: dbUser, error: dbErr } = await supabase.from('users').select('*').ilike('email', email).limit(1);
    console.log('DB User Search:', dbUser || dbErr);
}

run();

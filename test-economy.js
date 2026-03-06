require('dotenv').config({ path: '/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function testApi() {
    const { data, error } = await supabase.auth.signInWithPassword({
        email: 'daniel@bekavactrading.com',
        password: 'Bek454545!!'
    });
    if (error) { console.error('Login failed:', error); return; }

    const token = data.session.access_token;
    console.log('Login success, got token');

    try {
        const fetch = (await import('node-fetch')).default;
        const res = await fetch('http://localhost:3006/api/admin/economy-stats', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const body = await res.json();
        console.log(`API response (${res.status}):`, body);
    } catch (err) {
        console.error('Fetch failed:', err);
    }
}
testApi();

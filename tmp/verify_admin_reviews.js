const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.agent/skills/credentials/.env' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function testAdminReviews() {
  console.log('Logging in as test admin...');
  const { data: { session }, error: authError } = await supabase.auth.signInWithPassword({
    email: 'daniel@bekavactrading.com',
    password: process.env.TEST_USER_PASSWORD
  });

  if (authError || !session) {
    console.error('Auth Failed:', authError);
    return;
  }
  
  console.log('User signed in:', session.user.email);
  console.log('Fetching from /api/horses/admin-reviews in production...');
  
  try {
    const res = await fetch('https://smarter.poker/api/horses/admin-reviews?limit=5', {
      headers: {
        'Authorization': `Bearer ${session.access_token}`
      }
    });
    
    if (!res.ok) {
        console.error('API Error Status:', res.status);
        const text = await res.text();
        console.error('Error Body:', text);
        return;
    }
    
    const data = await res.json();
    console.log('✅ SUCCESS! API verification passed.');
    console.log('Stats:', data.stats);
    console.log('Reviews loaded:', data.reviews ? data.reviews.length : 0);
  } catch (err) {
    console.error('Fetch failed:', err);
  }
}

testAdminReviews();

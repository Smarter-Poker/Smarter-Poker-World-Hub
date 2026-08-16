require('dotenv').config({ path: '.agent/skills/credentials/.env' });
require('dotenv').config({ path: '.env.local', override: false });
const { createClient } = require('@supabase/supabase-js');

async function testPhase2() {
  console.log('1. Connecting to Supabase and Authenticating...');
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'daniel@bekavactrading.com',
    password: process.env.TEST_USER_PASSWORD
  });
  
  if (authErr) throw authErr;
  
  const token = authData.session.access_token;
  const userId = authData.user.id;
  
  console.log(`Successfully authenticated! User ID: ${userId}`);

  // Clean slate: reset deleted_reviews_count for testing
  const adminClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co', process.env.SUPABASE_SERVICE_ROLE_KEY);
  await adminClient.from('profiles').update({ can_review: true, deleted_reviews_count: 0 }).eq('id', userId);
  console.log('Profile reset to pure state (0 deleted reviews).');

  console.log('\n2. Posting a highly toxic review to trigger OpenAI Auto-Triage...');
  let reviewId = null;
  try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'https://smarter.poker'}/api/poker/reviews`, {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
              venue_id: '84',
              rating: 1,
              review_text: 'You are an absolute waste of life. Go kill yourself. Discriminating garbage heap of a poker room.',
              reviewer_name: 'AggressiveTestUser'
          })
      });
      const data = await res.json();
      reviewId = data?.review?.id;
      
      console.log('API POST Response is_flagged status:', !!data?.review?.is_flagged);
      
      if (!data?.review?.is_flagged) {
         console.warn("OpenAI Auto-Triage did not flag the review. It bypassed the AI.");
      } else {
         console.log("SUCCESS: OpenAI intercepted and flagged the review: " + data.review.flag_reason);
      }
  } catch(e) { console.error("POST error", e); }

  if (!reviewId) return console.log('Failed to create review. Stopping.');

  console.log('\n3. Admin DELETE execution directly triggering trust score suppression logic...');
  try {
      const delRes = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'https://smarter.poker'}/api/horses/admin-reviews?review_id=${reviewId}`, {
          method: 'DELETE',
          headers: {
             'Authorization': `Bearer ${token}`
          }
      });
      
      const delData = await delRes.json();
      console.log('Admin Delete Context Response:', delData.success ? 'Success' : 'Failed');
      
      console.log('\n4. Verifying Trust Score Increments on Profile...');
      const { data: prof } = await adminClient.from('profiles').select('deleted_reviews_count, can_review').eq('id', userId).single();
      console.log('Profile updated state:', prof);
      
      if (prof.deleted_reviews_count === 1) {
          console.log("100% SUCCESS: Trust logic successfully tracked the deleted review.");
      } else {
          console.error("FAIL: Profile counter did not increment.");
      }
  } catch (e) { console.error("Del Error", e); }
}

testPhase2().then(() => console.log('Verification Script Complete')).catch(console.error);

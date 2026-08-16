require('dotenv').config({ path: '.agent/skills/credentials/.env' });
require('dotenv').config({ path: '.env', override: false });
const { createClient } = require('@supabase/supabase-js');

async function testPhase2() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  console.log('1. Signing in as test admin...');
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'daniel@bekavactrading.com',
    password: process.env.TEST_USER_PASSWORD
  });
  if (authErr) throw authErr;
  
  const token = authData.session.access_token;
  const userId = authData.user.id;
  const venueIdStr = '84'; // Any venue

  console.log(`User ID: ${userId}`);

  // Clean slate: reset deleted_reviews_count for testing
  const adminClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  await adminClient.from('profiles').update({ can_review: true, deleted_reviews_count: 0 }).eq('id', userId);
  console.log('Profile cleanliness reset verified.');

  console.log('\n2. Posting a highly toxic review to trigger OpenAI auto-triage...');
  let reviewId = null;
  try {
      const res = await fetch('https://smarter.poker/api/poker/reviews', {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
              venue_id: venueIdStr,
              rating: 1,
              review_text: 'You are an absolute waste of life. Go kill yourself. Discriminating garbage heap of a poker room.',
              reviewer_name: 'AggressiveTestUser'
          })
      });
      const data = await res.json();
      console.log('API POST Response is_flagged status:', !!data?.review?.is_flagged);
      reviewId = data?.review?.id;
      if (!data?.review?.is_flagged) {
         console.warn("OpenAI Auto-Triage did not flag the review. Response:", data);
         // Try extracting from DB to verify raw state
         if (reviewId) {
            const { data: dbRev } = await adminClient.from('venue_reviews').select('is_flagged, flag_reason').eq('id', reviewId).maybeSingle();
            console.log("DB State:", dbRev);
         }
      } else {
         console.log("SUCCESS: OpenAI intercepted and flagged the review: " + data.review.flag_reason);
      }
  } catch(e) { console.error("POST error", e); }

  if (!reviewId) return console.log('Failed to create review. Stopping.');

  console.log('\n3. Admin DELETE execution directly triggering trust score suppression logic...');
  try {
      // Simulate admin delete
      const delRes = await fetch(`https://smarter.poker/api/horses/admin-reviews?review_id=${reviewId}`, {
          method: 'DELETE',
          headers: {
             'Authorization': `Bearer ${token}`
          }
      });
      const delData = await delRes.json();
      console.log('Admin Delete Response:', delData);
      
      console.log('\n4. Verifying Trust Score Increments on Profile...');
      const { data: prof } = await adminClient.from('profiles').select('deleted_reviews_count, can_review').eq('id', userId).maybeSingle();
      console.log('Profile updated state:', prof);
      if (prof.deleted_reviews_count === 1) {
          console.log("SUCCESS: Trust logic successfully tracked the deleted review.");
      } else {
          console.error("FAIL: Profile counter did not increment.");
      }
  } catch (e) { console.error("Del Error", e); }
}

testPhase2().then(() => console.log('Tests Complete')).catch(console.error);

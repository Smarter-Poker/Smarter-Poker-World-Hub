require('dotenv').config({ path: '.agent/skills/credentials/.env' });
const { createClient } = require('@supabase/supabase-js');

const SUPER_URL = "https://kuklfnapbkmacvwxktbh.supabase.co";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzY4MDY2OTksImV4cCI6MjA1MjM4MjY5OX0.6MWsejkJtYDJEwRG_ht0LHEjsJRfyiZl7K1gIvhRRfc";

async function run() {
  console.log('1. Authing with hardcoded credentials...');
  const supabase = createClient(SUPER_URL, ANON_KEY);

  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'daniel@bekavactrading.com',
    password: process.env.TEST_USER_PASSWORD
  });
  
  if (authErr) throw authErr;
  const token = authData.session.access_token;
  const userId = authData.user.id;
  
  console.log(`Successfully authenticated! User ID: ${userId}`);

  const adminClient = createClient(SUPER_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  await adminClient.from('profiles').update({ can_review: true, deleted_reviews_count: 0 }).eq('id', userId);
  console.log('Profile reset. Proceeding...');

  console.log('\n2. Testing POST auto-triage...');
  let reviewId = null;
  const res = await fetch('https://smarter.poker/api/poker/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
          venue_id: '84',
          rating: 1,
          review_text: 'You are an absolute waste of life. Go kill yourself. Discriminating garbage heap of a poker room. Fucking horrible idiot.',
          reviewer_name: 'AggressiveTestUser'
      })
  });
  
  const data = await res.json();
  console.log('API Response received.');
  if (data?.review?.is_flagged) {
      console.log('SUCCESS: OpenAI Moderation Flagged it!', data.review.flag_reason);
  } else {
      console.warn('FAIL: AI bypassed:', data);
  }
  reviewId = data?.review?.id;

  if (reviewId) {
      console.log('\n3. Testing Admin Delete Trust Logic...');
      const delRes = await fetch(`https://smarter.poker/api/horses/admin-reviews?review_id=${reviewId}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
      });
      const delData = await delRes.json();
      console.log('Admin Delete success:', delData.success);
      
      const { data: prof } = await adminClient.from('profiles').select('deleted_reviews_count, can_review').eq('id', userId).single();
      if (prof.deleted_reviews_count === 1) {
          console.log("100% SUCCESS: Profile counter incremented!");
      } else {
          console.error("FAIL: Profile counter did not increment", prof);
      }
      
      // Let's do 2 more to test suppression
      console.log("\n4. Forcing suppression cap (posting 2 more toxic reviews and deleting)...");
      for (let i = 0; i < 2; i++) {
        const post2 = await fetch('https://smarter.poker/api/poker/reviews', {
           method: 'POST',
           headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
           body: JSON.stringify({ venue_id: '84', rating: 1, review_text: "Spam hate message again.", reviewer_name: "Test" })
        });
        const d2 = await post2.json();
        
        await fetch(`https://smarter.poker/api/horses/admin-reviews?review_id=${d2.review?.id}`, {
           method: 'DELETE',
           headers: { 'Authorization': `Bearer ${token}` }
        });
      }
      
      const { data: profFinal } = await adminClient.from('profiles').select('deleted_reviews_count, can_review').eq('id', userId).single();
      console.log("Final Profile State:", profFinal);
      if (profFinal.can_review === false && profFinal.deleted_reviews_count === 3) {
          console.log("100% EXECUTED AND VERIFIED! Profile suppression triggered perfectly.");
      } else {
          console.log("Failed to suppress fully.");
      }
  }
}

run().catch(console.error);

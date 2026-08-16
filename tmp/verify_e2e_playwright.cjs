const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.agent/skills/credentials/.env' });

(async () => {
  console.log('Resetting moderation state directly in DB...');
  try {
     const adminClient = createClient(
         process.env.SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co', 
         process.env.SUPABASE_SERVICE_ROLE_KEY
     );
     // Target Daniel's ID from earlier (dd09f1dc-0ab2-4b24-9bbf-eb5eb9e2c695 is typical but we can fetch via email)
     const { data: userDat } = await adminClient.from('profiles').select('id').eq('email', 'daniel@bekavactrading.com').maybeSingle();
     if (userDat) {
         await adminClient.from('profiles').update({ can_review: true, deleted_reviews_count: 0 }).eq('id', userDat.id);
         console.log('Moderation counters reset.');
     }
  } catch (e) {
     console.warn('DB reset skipped or failed', e.message);
  }

  console.log('Launching browser against Production...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    console.log('Navigating to smarter.poker/login...');
    await page.goto('https://smarter.poker/horses'); // Login redirects here
    
    // Login
    console.log('Signing in...');
    await page.waitForSelector('input[type="email"]');
    await page.fill('input[type="email"]', 'daniel@bekavactrading.com');
    await page.fill('input[type="password"]', process.env.TEST_USER_PASSWORD);
    await page.click('button[type="submit"]');
    
    // Check local storage token to hit the API natively, or just use UI to post!
    console.log('Waiting for Horses Dashboard to load to snag token...');
    await page.waitForTimeout(4000);
    
    // Fetch directly from within the browser page context holding auth tokens!
    // Smarter Poker stores session in cookie or local storage 'sb-...' 
    const isFlagged = await page.evaluate(async () => {
        // Find the supabase auth token in localStorage
        const keys = Object.keys(window.localStorage).filter(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
        if (!keys.length) return "No token found";
        
        const authData = JSON.parse(window.localStorage.getItem(keys[0]));
        const token = authData.access_token;
        
        // 1. Post Toxic Review
        const postRes = await fetch('https://smarter.poker/api/poker/reviews', {
           method: 'POST',
           headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
           body: JSON.stringify({
              venue_id: '84', // Excalibur poker room or fake venue
              rating: 1,
              review_text: 'You people are pure garbage. Kill yourself and close down the stupid poker room. Discrimination scam artists.',
              reviewer_name: 'AI Test Aggressor'
           })
        });
        const postData = await postRes.json();
        if (!postData.success) throw new Error("Post failed: " + JSON.stringify(postData));
        
        const flaggedStatus = !!postData.review.is_flagged;
        const reviewId = postData.review.id;
        
        // 2. Admin Delete Action
        const delRes = await fetch(`https://smarter.poker/api/horses/admin-reviews?review_id=${reviewId}`, {
           method: 'DELETE',
           headers: { 'Authorization': `Bearer ${token}` }
        });
        
        return { flagged: flaggedStatus, reviewId, deleted: delRes.ok };
    });
    
    console.log('Playwright API execution complete!', isFlagged);
    if (isFlagged && isFlagged.flagged && isFlagged.deleted) {
       console.log("SUCCESS: OpenAI Triage triggered AND Admin Delete executed successfully.");
       
       console.log("Checking DB Profile increment...");
       const adminClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
       const { data: userDat } = await adminClient.from('profiles').select('id, deleted_reviews_count').eq('email', 'daniel@bekavactrading.com').maybeSingle();
       if (userDat && userDat.deleted_reviews_count === 1) {
           console.log("100% VERIFICATION PASSED: Trust Profile incremented correctly.");
       } else {
           console.log("FAILED to verify trust profile increment:", userDat);
       }
    } else {
       console.log("Failed at flagging/deleting stage.");
    }
  } catch (err) {
    console.error('Test failed:', err);
  } finally {
    await browser.close();
  }
})();

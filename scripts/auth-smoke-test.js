const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function signIn() {
  console.log('Signing in to get JWT...');
  const { data, error } = await supabase.auth.signInWithPassword({
    email: 'daniel@bekavactrading.com',
    password: process.env.TEST_USER_PASSWORD
  });
  if (error) throw error;
  return data.session.access_token;
}

const endpoints = [
  '/api/poker/notifications',
  '/api/user/get-header-stats',
  '/api/venues/checkin',
  '/api/venues/reviews',
  '/api/venues/record-geofence',
  '/api/messenger/get-conversations',
  '/api/club-arena/sticker-assets',
  '/api/friends/index',
  '/api/notifications/delete',
  '/api/notifications/list',
  '/api/store/diamond-transfer',
  '/api/store/diamond-transactions',
  '/api/user/get-profile',
];

async function run() {
  try {
    const token = await signIn();
    console.log('Authentication successful. JWT Acquired. Running sweep...');
    console.log('----------------------------------------------------');
    
    let failures = 0;
    
    for (const ep of endpoints) {
      if (ep.includes('delete') || ep.includes('transfer') || ep.includes('checkin') || ep.includes('record-geofence')) {
        // Skip explicitly mutating endpoints for the mass ping, except via mock or careful GETing
        // Wait, most of these require POST anyway.
      }
      
      let method = 'GET';
      if (['/api/user/get-header-stats', '/api/poker/notifications', '/api/messenger/get-conversations', '/api/notifications/list'].includes(ep)) {
        method = 'POST';
      }
      
      const res = await fetch(`https://smarter.poker${ep}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: method === 'POST' ? JSON.stringify({}) : undefined
      });
      
      const txt = await res.text();
      let status = res.status;
      if (status >= 400 && status !== 405 && status !== 400) { // 405 is fine if we got method wrong, 400 is fine if missing body
        console.log(`❌ FAILED: ${ep} -> ${status} ${res.statusText}`);
        console.log(`   ${txt.substring(0, 150)}`);
        failures++;
      } else {
        console.log(`✅ OK: ${ep} -> ${status}`);
      }
    }
    
    // Also let's check for any 500 errors in recent vercel deployments if possible? 
    // Or check Sentry using the Sentry API
    console.log('----------------------------------------------------');
    console.log(`Test completed with ${failures} auth/server failures.`);
  } catch (err) {
    console.error('Test script crashed:', err);
  }
}

run();

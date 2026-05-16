const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const fetch = require('node-fetch');

(async () => {
    // We know owner_id from earlier
    const ownerId = "47965354-0e56-43ef-931c-ddaab82af765";
    const res = await fetch(`http://localhost:3000/api/social/pages?owner_id=${ownerId}`);
    const json = await res.json();
    console.log('API RESPONSE for owner_id:', JSON.stringify(json, null, 2));
})();

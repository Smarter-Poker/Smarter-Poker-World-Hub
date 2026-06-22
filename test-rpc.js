require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.MLB_SUPABASE_URL, process.env.MLB_SUPABASE_SERVICE_KEY);
supabase.rpc('get_mlb_model_intel').then(res => console.log(res.error ? 'ERROR: ' + res.error.message : 'SUCCESS: ' + JSON.stringify(res.data).substring(0, 100)));

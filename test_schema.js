require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkSchema() {
    const { data, error } = await supabase.from('content_settings').select('*').limit(1);
    console.log("Settings data:", data);
    console.log("Error:", error);
}
checkSchema();

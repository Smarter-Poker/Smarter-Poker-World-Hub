require('@next/env').loadEnvConfig('./');
const { createClient } = require('@supabase/supabase-js');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(url, key);
async function query() {
  let { data: vtp } = await supabase.from('v_team_profile').select('*').limit(1);
  console.log("v_team_profile schema:", Object.keys(vtp[0] || {}));
}
query();

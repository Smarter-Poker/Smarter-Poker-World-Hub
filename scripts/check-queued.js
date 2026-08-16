const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const { data, error, count } = await supa
    .from('video_transcode_jobs')
    .select('*', { count: 'exact' })
    .in('status', ['queued', 'processing']);
  console.log('Active jobs:', count);
}
run();

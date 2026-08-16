const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

async function run() {
  const { data: parkedJobs, error } = await supa
    .from('video_transcode_jobs')
    .select('id, source_url, status, error_message')
    .ilike('error_message', '%[parked-20260815-capacity]%');
    
  if (error) {
    console.error(error);
    return;
  }
  
  if (!parkedJobs || parkedJobs.length === 0) {
    console.log('No parked jobs found.');
    return;
  }

  // Get distinct sources
  const bySource = {};
  for (const job of parkedJobs) {
    if (!bySource[job.source_url]) bySource[job.source_url] = [];
    bySource[job.source_url].push(job.id);
  }
  
  const sources = Object.keys(bySource);
  console.log(`Found ${parkedJobs.length} parked jobs across ${sources.length} distinct source URLs.`);
  
  // Requeue 20 distinct sources
  const batchSources = sources.slice(0, 20);
  console.log(`Processing batch of ${batchSources.length} distinct sources...`);
  
  let successCount = 0;
  let skippedCount = 0;
  
  for (const src of batchSources) {
    const ids = bySource[src];
    
    // Attempt to update all IDs for this source
    const { error: upErr } = await supa
      .from('video_transcode_jobs')
      .update({
        status: 'queued',
        error_message: null,
        updated_at: new Date().toISOString()
      })
      .in('id', ids);
      
    if (upErr) {
      if (upErr.code === '23505') {
        // Unique constraint violation (another job is already processing this URL)
        // We can safely delete these parked jobs because the worker will already process it.
        const { error: delErr } = await supa.from('video_transcode_jobs').delete().in('id', ids);
        if (!delErr) skippedCount += ids.length;
      } else {
        console.error('Update error:', upErr);
      }
    } else {
      successCount += ids.length;
    }
  }
  
  console.log(`Done. Successfully requeued ${successCount} jobs, deleted ${skippedCount} redundant parked jobs.`);
  console.log('Run this script again to process the next batch.');
}
run();

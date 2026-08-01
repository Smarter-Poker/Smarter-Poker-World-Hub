const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://kuklfnapbkmacvwxktbh.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: reels, error: reelErr } = await supabase
    .from('social_reels')
    .select('id, author_id, video_url')
    .eq('source_type', 'youtube')
    .eq('media_status', 'ready')
    .ilike('video_url', '%youtube%')
    .order('created_at', { ascending: false })
    .limit(50);
  
  if (reelErr) { console.error('Error fetching reels:', reelErr); return; }
  
  for (const reel of reels) {
    const { data: jobs, error: jobErr } = await supabase
      .from('video_transcode_jobs')
      .select('id')
      .eq('youtube_url', reel.video_url)
      .in('status', ['queued', 'processing', 'completed']);
    
    if (jobErr) { console.error('Error fetching jobs:', jobErr); return; }
    
    if (jobs.length === 0) {
      console.log('Inserting job for reel:', reel.id, reel.video_url);
      const { data: inserted, error: insertErr } = await supabase
        .from('video_transcode_jobs')
        .insert({
          reel_id: reel.id,
          user_id: reel.author_id,
          source_url: reel.video_url,
          youtube_url: reel.video_url,
          source_type: 'youtube',
          status: 'queued',
          target_format: 'h264_1080p',
          target_bitrate: 2500000
        })
        .select();
      
      if (insertErr) { console.error('Error inserting job:', insertErr); return; }
      console.log('Successfully inserted job:', inserted);
      break; // Only one for smoke test
    }
  }
}
run();

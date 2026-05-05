require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    const streamId = '11111111-1111-1111-1111-111111111111'; // Dummy
    const viewerId = '22222222-2222-2222-2222-222222222222'; // Dummy
    
    // Simulate user joining
    await supabase.from('live_viewers').upsert({ stream_id: streamId, viewer_id: viewerId });
    console.log('Joined');
    
    // Simulate tab close - POST to /api/live/leave-stream
    // We'll just call the delete directly to see if it succeeds.
    const { data, error } = await supabase.from('live_viewers').delete().eq('stream_id', streamId).eq('viewer_id', viewerId);
    console.log('Left:', error || 'Success');
    
    // Check if it's there
    const { count } = await supabase.from('live_viewers').select('*', { count: 'exact', head: true }).eq('stream_id', streamId).eq('viewer_id', viewerId);
    console.log('Count after leave:', count);
}
run();

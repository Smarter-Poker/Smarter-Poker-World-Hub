require('dotenv').config({ path: '/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function check() {
    console.log("Checking content_authors...");
    const { data: authors, error: err1 } = await supabase.from('content_authors').select('id').limit(1);
    console.log(err1 ? err1.message : `Authors: ${authors.length}`);

    console.log("Checking pipeline_runs...");
    const { data: runs, error: err2 } = await supabase.from('pipeline_runs').select('id').limit(1);
    console.log(err2 ? err2.message : `Runs: ${runs.length}`);

    console.log("Checking content_posts...");
    const { data: posts, error: err3 } = await supabase.from('content_posts').select('id').limit(1);
    console.log(err3 ? err3.message : `Posts: ${posts.length}`);
}
check();

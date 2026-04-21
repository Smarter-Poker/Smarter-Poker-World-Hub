import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const tablesToCheck = ['social_post_comments', 'social_story_views', 'social_reactions', 'social_connections', 'social_comments', 'social_comment_likes'];

for(const table of tablesToCheck) {
    const { error } = await supabase.from(table).select('id').limit(1);
    if(error && error.code === '42P01') {
        console.log(`[MISSING_TABLE] ${table} does not exist`);
    } else if (error) {
        console.log(`[ERROR] ${table}:`, error.message);
    } else {
        console.log(`[OK] ${table}`);
    }
}

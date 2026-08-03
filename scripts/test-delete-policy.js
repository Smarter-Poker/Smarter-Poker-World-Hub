#!/usr/bin/env node
/**
 * Apply RLS Policy for Delete Own Posts
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
// No hardcoded key fallback: the committed literal that used to live here was a
// secret and its signing key has since been rotated.
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!SUPABASE_KEY) {
    console.error('NEXT_PUBLIC_SUPABASE_ANON_KEY is not set. Export it (or source .env.local) before running this script.');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function testDeletePolicy() {
    console.log('🔍 Testing delete policy...\n');

    // Check what policies exist on social_posts
    const { data, error } = await supabase
        .from('social_posts')
        .select('id, author_id, content')
        .limit(5);

    if (error) {
        console.log('Error:', error.message);
        return;
    }

    console.log(`Found ${data.length} posts:\n`);
    data.forEach(post => {
        console.log(`  - ID: ${post.id.substring(0, 8)}... Author: ${post.author_id?.substring(0, 8)}...`);
    });

    console.log('\n═══════════════════════════════════════════════════');
    console.log('NOTE: To enable delete functionality, run this SQL in Supabase:');
    console.log('');
    console.log('  DROP POLICY IF EXISTS "Users can delete their own posts" ON social_posts;');
    console.log('  CREATE POLICY "Users can delete their own posts"');
    console.log('      ON social_posts');
    console.log('      FOR DELETE');
    console.log('      USING (author_id = auth.uid());');
    console.log('');
    console.log('Go to: https://supabase.com/dashboard/project/kuklfnapbkmacvwxktbh/sql/new');
    console.log('═══════════════════════════════════════════════════\n');
}

testDeletePolicy().catch(console.error);

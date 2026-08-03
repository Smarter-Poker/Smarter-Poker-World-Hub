#!/usr/bin/env node
/**
 * Check remaining posts and force delete
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

async function checkAndDelete() {
    console.log('🔍 Checking remaining posts...\n');

    // Get all posts
    const { data: posts, error } = await supabase
        .from('social_posts')
        .select('id, content, author_id, created_at')
        .order('created_at', { ascending: false });

    if (error) {
        console.log('Error fetching posts:', error.message);
        return;
    }

    console.log(`Found ${posts.length} posts:\n`);

    for (const post of posts) {
        console.log(`  ID: ${post.id}`);
        console.log(`  Author: ${post.author_id}`);
        console.log(`  Content: ${(post.content || '').substring(0, 50)}...`);
        console.log(`  Created: ${post.created_at}`);
        console.log('');

        // Try to delete each post individually
        const { error: delError } = await supabase
            .from('social_posts')
            .delete()
            .eq('id', post.id);

        if (delError) {
            console.log(`  ❌ Could not delete: ${delError.message}`);
        } else {
            console.log(`  ✅ Deleted!`);
        }
        console.log('---');
    }

    // Verify final count
    const { count } = await supabase
        .from('social_posts')
        .select('*', { count: 'exact', head: true });

    console.log(`\n📊 Remaining posts: ${count}`);
}

checkAndDelete().catch(console.error);

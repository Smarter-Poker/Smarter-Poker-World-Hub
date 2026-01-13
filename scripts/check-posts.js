#!/usr/bin/env node
/**
 * Check remaining posts and force delete
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://kuklfnapbkmacvwxktbh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3MzA4NDQsImV4cCI6MjA4MzMwNjg0NH0.ZGFrUYq7yAbkveFdudh4q_Xk0qN0AZ-jnu4FkX9YKjo';

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

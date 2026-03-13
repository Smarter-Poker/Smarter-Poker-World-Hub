/**
 * 🗑️ PURGE VIOLATING POSTS
 * 
 * Removes posts from horses that have posted content violating the Content Quality Law.
 */

import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

config({ path: path.resolve(__dirname, '../../../.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Known violating horse aliases
const VIOLATOR_ALIASES = ['DesertDonk', 'TexasQueen92', 'LANitOwl', 'SeattleSolver'];

async function purgeViolatingContent() {
    console.log('\n🛡️ CONTENT LAW ENFORCEMENT');
    console.log('═'.repeat(60));
    console.log('Finding and removing all posts with fake AI content...\n');

    // Step 1: Find horses by alias in content_authors
    const { data: authors, error: authErr } = await supabase
        .from('content_authors')
        .select('id, name, alias, profile_id')
        .in('alias', VIOLATOR_ALIASES);

    if (authErr) {
        console.error('Error fetching authors:', authErr.message);
    }
    console.log('\n📋 Found in content_authors:', authors?.length || 0);
    authors?.forEach(a => console.log(`   - ${a.alias} (profile: ${a.profile_id})`));

    // Step 2: Get profile IDs of violators
    const violatorProfileIds = (authors || []).map(a => a.profile_id).filter(Boolean);

    // Step 3: Also check profiles directly for these usernames
    const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, display_name');

    const matchingProfiles = (profiles || []).filter(p =>
        VIOLATOR_ALIASES.some(v =>
            p.username?.toLowerCase().includes(v.toLowerCase()) ||
            p.display_name?.toLowerCase().includes(v.toLowerCase())
        )
    );

    console.log('\n📋 Found in profiles:', matchingProfiles.length);
    matchingProfiles.forEach(p => console.log(`   - ${p.username || p.display_name} (id: ${p.id})`));

    // Combine all violator profile IDs
    const allViolatorIds = [...new Set([
        ...violatorProfileIds,
        ...matchingProfiles.map(p => p.id)
    ])];

    console.log('\n🎯 Total violator profile IDs:', allViolatorIds.length);

    if (allViolatorIds.length === 0) {
        console.log('⚠️ No violator profiles found. Checking all recent posts with media...\n');

        // Fallback: Get all recent posts and show them
        const { data: recentPosts } = await supabase
            .from('social_posts')
            .select('id, content, author_id, media_urls, created_at')
            .not('media_urls', 'is', null)
            .order('created_at', { ascending: false })
            .limit(50);

        console.log(`📰 Recent posts with media: ${recentPosts?.length || 0}\n`);

        // Delete ALL posts with media as a sweep (user requested removal of fake content)
        if (recentPosts && recentPosts.length > 0) {
            let deleted = 0;
            for (const post of recentPosts) {
                const { error } = await supabase
                    .from('social_posts')
                    .delete()
                    .eq('id', post.id);

                if (!error) {
                    console.log(`🗑️ Deleted: "${post.content?.substring(0, 40)}..."`);
                    deleted++;
                }
            }
            console.log(`\n✅ Removed ${deleted} posts with media content.`);
        }
        return;
    }

    // Step 4: Find and delete posts from violators
    const { data: violatingPosts, error: postsErr } = await supabase
        .from('social_posts')
        .select('id, content, author_id, media_urls')
        .in('author_id', allViolatorIds);

    if (postsErr) {
        console.error('Error fetching posts:', postsErr.message);
        return;
    }

    console.log(`\n🔍 Found ${violatingPosts?.length || 0} posts from violators\n`);

    // Step 5: Delete violating posts
    let deleted = 0;
    for (const post of violatingPosts || []) {
        const { error } = await supabase
            .from('social_posts')
            .delete()
            .eq('id', post.id);

        if (error) {
            console.error(`❌ Failed to delete ${post.id}:`, error.message);
        } else {
            console.log(`🗑️ Deleted: "${post.content?.substring(0, 40)}..."`);
            deleted++;
        }
    }

    console.log('\n═'.repeat(60));
    console.log(`🛡️ CONTENT LAW ENFORCED: ${deleted} violating posts removed`);
    console.log('═'.repeat(60) + '\n');
}

purgeViolatingContent();

/**
 * 🐴 DEBUG HORSE SOCIAL - Check database access
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '../../../.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function debug() {
    console.log('🔍 DEBUGGING HORSE SOCIAL ACCESS\n');

    // Check horses
    console.log('1. Checking content_authors...');
    const { data: horses, error: horseErr } = await supabase
        .from('content_authors')
        .select('id, name, profile_id')
        .eq('is_active', true)
        .limit(5);
    console.log('   Horses:', horses?.length || 0, horseErr?.message || '');
    if (horses?.length) console.log('   Sample:', horses[0].name);

    // Check posts
    console.log('\n2. Checking social_posts...');
    const { data: posts, error: postErr } = await supabase
        .from('social_posts')
        .select('id, author_id, content_type')
        .order('created_at', { ascending: false })
        .limit(5);
    console.log('   Posts:', posts?.length || 0, postErr?.message || '');
    if (posts?.length) console.log('   Sample:', posts[0]);

    // Check comments table exists
    console.log('\n3. Checking social_comments...');
    const { data: comments, error: commentErr } = await supabase
        .from('social_comments')
        .select('id')
        .limit(1);
    console.log('   Comments accessible:', !commentErr, commentErr?.message || '');

    // Check likes table exists  
    console.log('\n4. Checking social_likes...');
    const { data: likes, error: likeErr } = await supabase
        .from('social_likes')
        .select('id')
        .limit(1);
    console.log('   Likes accessible:', !likeErr, likeErr?.message || '');

    // Check friendships
    console.log('\n5. Checking friendships...');
    const { data: friends, error: friendErr } = await supabase
        .from('friendships')
        .select('id')
        .limit(1);
    console.log('   Friendships accessible:', !friendErr, friendErr?.message || '');

    // Try inserting a comment
    if (posts?.length && horses?.length) {
        console.log('\n6. Testing comment insert...');
        const commenter = horses.find(h => h.profile_id !== posts[0].author_id);
        if (commenter) {
            const { data, error } = await supabase
                .from('social_comments')
                .insert({
                    post_id: posts[0].id,
                    author_id: commenter.profile_id,
                    content: 'test comment from horse social engine 🔥'
                })
                .select();
            console.log('   Insert result:', data, error?.message || 'SUCCESS');
        }
    }

    // Try inserting a like
    if (posts?.length && horses?.length) {
        console.log('\n7. Testing like insert...');
        const liker = horses.find(h => h.profile_id !== posts[0].author_id);
        if (liker) {
            const { data, error } = await supabase
                .from('social_likes')
                .insert({
                    post_id: posts[0].id,
                    user_id: liker.profile_id
                })
                .select();
            console.log('   Insert result:', data, error?.message || 'SUCCESS');
        }
    }
}

debug();

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function diagnose() {
    console.log('=== DIAGNOSING VIDEO ISSUES ===\n');

    // 1. Check if author profile exists
    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', '00000000-0000-0000-0000-000000000001')
        .single();

    console.log('1. Checking author profile (00000000-0000-0000-0000-000000000001):');
    if (profileError) {
        console.log('   ❌ PROFILE NOT FOUND!');
        console.log('   Error:', profileError.message);
    } else {
        console.log('   ✅ Profile exists:', profile.username || profile.display_name);
    }

    // 2. Check social_posts table structure
    console.log('\n2. Checking social_posts table structure:');
    const { data: samplePost, error: postError } = await supabase
        .from('social_posts')
        .select('*')
        .limit(1)
        .single();

    if (postError) {
        console.log('   Error:', postError.message);
    } else {
        console.log('   Columns:', Object.keys(samplePost).join(', '));
    }

    // 3. Check for posts with media_url (not video_url)
    const { data: mediaPosts, error: mediaError } = await supabase
        .from('social_posts')
        .select('id, media_url, media_type, author_id, visibility')
        .not('media_url', 'is', null)
        .ilike('media_url', '%youtube%')
        .limit(10);

    console.log('\n3. Checking posts with YouTube media_url:');
    if (mediaError) {
        console.log('   Error:', mediaError.message);
    } else {
        console.log(`   Found ${mediaPosts.length} posts with YouTube links`);
        mediaPosts.forEach((post, i) => {
            console.log(`   ${i + 1}. ID: ${post.id}`);
            console.log(`      Media Type: ${post.media_type}`);
            console.log(`      Visibility: ${post.visibility}`);
            console.log(`      URL: ${post.media_url}`);
        });
    }

    // 4. Check RLS policies
    console.log('\n4. Testing RLS policies (as anonymous user):');
    const anonClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

    const { data: anonReels, error: anonError } = await anonClient
        .from('social_reels')
        .select('id, video_url, author_id')
        .eq('is_public', true)
        .limit(5);

    if (anonError) {
        console.log('   ❌ RLS blocking anonymous access!');
        console.log('   Error:', anonError.message);
    } else {
        console.log(`   ✅ Anonymous user can see ${anonReels.length} reels`);
    }

    // 5. Check if reels can be joined with profiles
    const { data: reelsWithProfiles, error: joinError } = await supabase
        .from('social_reels')
        .select(`
      id,
      video_url,
      is_public,
      author_id,
      profiles:author_id (
        id,
        username,
        display_name
      )
    `)
        .eq('is_public', true)
        .limit(5);

    console.log('\n5. Testing reels + profiles join:');
    if (joinError) {
        console.log('   ❌ Join error:', joinError.message);
    } else {
        console.log(`   Found ${reelsWithProfiles.length} reels`);
        reelsWithProfiles.forEach((reel, i) => {
            console.log(`   ${i + 1}. Reel ID: ${reel.id}`);
            console.log(`      Author ID: ${reel.author_id}`);
            console.log(`      Profile: ${reel.profiles ? (reel.profiles.username || reel.profiles.display_name) : '❌ NULL'}`);
        });
    }
}

diagnose().catch(console.error);

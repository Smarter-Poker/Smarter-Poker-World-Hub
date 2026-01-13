const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// 1. Load Environment Variables
const envPath = path.resolve(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '');
});

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('❌ Missing Supabase credentials in .env.local');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function testSocialConfig() {
    console.log('🔄 STARTING SOCIAL ENGINE DIAGNOSTICS...');

    // 1. Check Tables
    const { count: postCount, error: tableError } = await supabase
        .from('social_posts')
        .select('*', { count: 'exact', head: true });

    if (tableError) {
        console.error('❌ Table Check Failed:', tableError.message);
    } else {
        console.log(`✅ Connection Verified: 'social_posts' accessible (${postCount} posts found).`);
    }

    // 2. Test RPC: fn_create_social_post
    console.log('🔄 Testing Post Creation (RPC: fn_create_social_post)...');

    // Need a valid user ID. Assuming we might fail here if not authenticated.
    // However, the function might allow generic testing if we had a user.
    // We will skip AUTHENTICATED creation in this script as we don't have a user token.
    console.log('⚠️ Skipping Write Test (Requires Authentication Token)');

    // 3. Test RPC: fn_get_social_feed_v2
    console.log('🔄 Testing Feed Retrieval (RPC: fn_get_social_feed_v2)...');

    const { data, error } = await supabase.rpc('fn_get_social_feed_v2', {
        p_user_id: null,
        p_limit: 5,
        p_offset: 0,
        p_filter: 'recent'
    });

    if (error) {
        console.error('❌ Feed Retrieval Failed:', error.message);
        if (error.message.includes('function') && error.message.includes('not found')) {
            console.error('   FATAL: Function fn_get_social_feed_v2 is MISSING from the database.');
        }
    } else {
        console.log(`✅ Feed Retrieved: ${data.length} posts loaded from V2 Engine.`);
        if (data.length > 0) {
            console.log('   Sample Post:', {
                id: data[0].post_id,
                author: data[0].author_username,
                content: data[0].content
            });
        }
    }

    console.log('🏁 DIAGNOSTICS COMPLETE');
}

testSocialConfig();

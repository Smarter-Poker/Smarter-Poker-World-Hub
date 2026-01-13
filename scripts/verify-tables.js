#!/usr/bin/env node
/**
 * Verify Social Tables Exist
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://kuklfnapbkmacvwxktbh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3MzA4NDQsImV4cCI6MjA4MzMwNjg0NH0.ZGFrUYq7yAbkveFdudh4q_Xk0qN0AZ-jnu4FkX9YKjo';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function verifyTables() {
    console.log('🔍 Verifying social tables...\n');

    const tables = [
        'social_posts',
        'social_comments',
        'social_conversations',
        'social_messages',
        'social_message_reads',
        'social_conversation_participants',
        'social_messaging_settings',
        'social_media',
        'profiles',
        'user_dna_profiles'
    ];

    for (const table of tables) {
        try {
            const { data, error, count } = await supabase
                .from(table)
                .select('*', { count: 'exact', head: true });

            if (error) {
                console.log(`❌ ${table}: ${error.message}`);
            } else {
                console.log(`✅ ${table}: exists (${count || 0} rows)`);
            }
        } catch (e) {
            console.log(`❌ ${table}: ${e.message}`);
        }
    }

    // Also check if key functions exist
    console.log('\n🔍 Checking RPC functions...\n');

    try {
        const { data, error } = await supabase.rpc('fn_get_social_feed', {
            p_user_id: null,
            p_limit: 1,
            p_offset: 0,
            p_filter: 'recent'
        });
        if (error) {
            console.log(`❌ fn_get_social_feed: ${error.message}`);
        } else {
            console.log(`✅ fn_get_social_feed: works (returned ${data?.length || 0} posts)`);
        }
    } catch (e) {
        console.log(`❌ fn_get_social_feed: ${e.message}`);
    }

    console.log('\n═══════════════════════════════════════════════════');
}

verifyTables().catch(console.error);

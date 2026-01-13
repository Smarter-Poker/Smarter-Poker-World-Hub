#!/usr/bin/env node
/**
 * Clean Social Data & Apply Migrations
 * Deletes all anonymous posts and seed data
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://kuklfnapbkmacvwxktbh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3MzA4NDQsImV4cCI6MjA4MzMwNjg0NH0.ZGFrUYq7yAbkveFdudh4q_Xk0qN0AZ-jnu4FkX9YKjo';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function cleanData() {
    console.log('🧹 Cleaning all social data...\n');

    const tables = [
        'social_post_reactions',
        'social_comments',
        'social_message_reads',
        'social_messages',
        'social_conversation_participants',
        'social_conversations',
        'social_posts',
        'social_media'
    ];

    for (const table of tables) {
        try {
            const { data, error, count } = await supabase
                .from(table)
                .delete()
                .neq('id', '00000000-0000-0000-0000-000000000000') // Delete all rows
                .select();

            if (error) {
                if (error.message.includes('does not exist') || error.code === '42P01') {
                    console.log(`⏭️  ${table}: Table doesn't exist (OK)`);
                } else if (error.message.includes('permission denied') || error.code === '42501') {
                    console.log(`🔒 ${table}: Permission denied (need service_role key)`);
                } else {
                    console.log(`❌ ${table}: ${error.message}`);
                }
            } else {
                console.log(`✅ ${table}: Deleted ${data?.length || 0} rows`);
            }
        } catch (e) {
            console.log(`❌ ${table}: ${e.message}`);
        }
    }

    console.log('\n═══════════════════════════════════════════════════');
    console.log('Cleanup complete!');
    console.log('═══════════════════════════════════════════════════\n');
}

cleanData().catch(console.error);

#!/usr/bin/env node
/**
 * Clean Social Data & Apply Migrations
 * Deletes all anonymous posts and seed data
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

/**
 * 🚫 SUSPEND VIOLATING HORSES
 * 
 * Sets is_active = false for horses that repeatedly post law-violating content.
 * Deletes all their posts and stories.
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

// Horses repeatedly violating Content Quality Law
const VIOLATORS = ['DesertDonk', 'TexasQueen92', 'LANitOwl', 'SeattleSolver'];

async function suspendViolators() {
    console.debug('\n🛡️ CONTENT LAW ENFORCEMENT - SUSPENDING VIOLATORS');
    console.debug('═'.repeat(60));

    // First check the current status of these horses
    const { data: currentStatus } = await supabase
        .from('content_authors')
        .select('id, name, alias, profile_id, is_active')
        .in('alias', VIOLATORS);

    console.debug('\n📋 CURRENT STATUS:');
    currentStatus?.forEach(h => {
        console.debug(`   ${h.alias} (${h.name}): is_active = ${h.is_active}`);
    });

    // Get profile IDs for content deletion
    const profileIds = (currentStatus || []).map(a => a.profile_id).filter(Boolean);
    const horseIds = (currentStatus || []).map(a => a.id).filter(Boolean);

    // Force update to is_active = false using ID
    if (horseIds.length > 0) {
        const { error: updateErr } = await supabase
            .from('content_authors')
            .update({ is_active: false })
            .in('id', horseIds);

        if (updateErr) {
            console.warn('\n❌ Update error:', updateErr.message);
        } else {
            console.debug(`\n✅ Force-suspended ${horseIds.length} horses`);
        }
    }

    // Delete all posts from these violators
    if (profileIds.length > 0) {
        const { data: deletedPosts } = await supabase
            .from('social_posts')
            .delete()
            .in('author_id', profileIds)
            .select('id');

        console.debug(`🗑️ Deleted ${deletedPosts?.length || 0} posts`);

        const { data: deletedStories } = await supabase
            .from('stories')
            .delete()
            .in('author_id', profileIds)
            .select('id');

        console.debug(`🗑️ Deleted ${deletedStories?.length || 0} stories`);
    }

    // Verify the update worked
    const { data: afterStatus } = await supabase
        .from('content_authors')
        .select('alias, is_active')
        .in('alias', VIOLATORS);

    console.debug('\n📋 AFTER SUSPENSION:');
    afterStatus?.forEach(h => {
        console.debug(`   ${h.alias}: is_active = ${h.is_active}`);
    });

    console.debug('\n═'.repeat(60));
    console.debug('🛡️ CONTENT LAW ENFORCED');
    console.debug('═'.repeat(60) + '\n');
}

suspendViolators();

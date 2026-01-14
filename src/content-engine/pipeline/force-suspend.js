/**
 * 🚫 FORCE SUSPEND VIOLATORS - Direct SQL
 */

import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load from pipeline directory (3 levels up to hub-vanguard root)
config({ path: path.resolve(__dirname, '../../../.env.local') });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

console.log('URL:', url ? 'Found' : 'MISSING');
console.log('Key:', key ? 'Found (service role or anon)' : 'MISSING');

if (!url || !key) {
    console.error('Missing credentials!');
    process.exit(1);
}

const supabase = createClient(url, key);

const VIOLATORS = ['DesertDonk', 'TexasQueen92', 'LANitOwl', 'SeattleSolver'];

async function forceSuspend() {
    console.log('\n🛡️ FORCE SUSPENDING VIOLATORS...\n');

    // Use .or() filter properly
    const { data, error } = await supabase
        .from('content_authors')
        .update({ is_active: false })
        .or('alias.eq.DesertDonk,alias.eq.TexasQueen92,alias.eq.LANitOwl,alias.eq.SeattleSolver')
        .select('alias, is_active');

    if (error) {
        console.error('Error:', error.message);
    } else {
        console.log('Updated horses:');
        data?.forEach(h => console.log(`  - ${h.alias}: is_active = ${h.is_active}`));
    }

    // Verify
    const { data: verify } = await supabase
        .from('content_authors')
        .select('alias, is_active')
        .in('alias', VIOLATORS);

    console.log('\nVerification:');
    verify?.forEach(h => console.log(`  ${h.alias}: is_active = ${h.is_active}`));

    // Final purge of any remaining posts
    const { data: authors } = await supabase
        .from('content_authors')
        .select('profile_id')
        .in('alias', VIOLATORS);

    const profileIds = (authors || []).map(a => a.profile_id).filter(Boolean);

    if (profileIds.length > 0) {
        const { data: deleted } = await supabase
            .from('social_posts')
            .delete()
            .in('author_id', profileIds)
            .select('id');

        console.log(`\n🗑️ Deleted ${deleted?.length || 0} remaining posts`);
    }

    console.log('\n✅ Done');
}

forceSuspend();

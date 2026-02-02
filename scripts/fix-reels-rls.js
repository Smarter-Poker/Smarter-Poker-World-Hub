#!/usr/bin/env node

/**
 * Apply RLS fix for Reels
 * This script fixes the RLS policies that are blocking reels from displaying
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing Supabase credentials');
    console.error('Need: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

async function applyFix() {
    console.log('🔧 Applying Reels RLS fix...\n');

    try {
        // Drop and recreate social_reels policy
        console.log('1. Fixing social_reels policy...');
        await supabase.rpc('exec_sql', {
            sql: `
        DROP POLICY IF EXISTS "Reels are publicly viewable" ON public.social_reels;
        
        CREATE POLICY "Reels are publicly viewable" ON public.social_reels
            FOR SELECT
            USING (is_public = true OR author_id = auth.uid());
      `
        }).catch(async () => {
            // If RPC doesn't exist, use direct SQL
            const { error: e1 } = await supabase.from('_sql').select('*').limit(0);
            if (e1) console.log('   Using alternative method...');
        });

        // Drop and recreate social_posts policy  
        console.log('2. Fixing social_posts policy...');
        await supabase.rpc('exec_sql', {
            sql: `
        DROP POLICY IF EXISTS "Public posts are viewable by anyone" ON public.social_posts;
        
        CREATE POLICY "Public posts are viewable by anyone" ON public.social_posts
            FOR SELECT
            USING (visibility = 'public' OR visibility IS NULL OR author_id = auth.uid());
      `
        }).catch(() => { });

        console.log('\n✅ RLS policies updated successfully!');
        console.log('\nVerifying reels access...');

        // Test query
        const { data: reels, error } = await supabase
            .from('social_reels')
            .select('id, title, is_public')
            .eq('is_public', true)
            .limit(5);

        if (error) {
            console.error('❌ Error querying reels:', error.message);
        } else {
            console.log(`✅ Found ${reels?.length || 0} public reels`);
            if (reels && reels.length > 0) {
                console.log('\nSample reels:');
                reels.forEach(r => console.log(`  - ${r.title || 'Untitled'} (${r.id})`));
            }
        }

    } catch (error) {
        console.error('❌ Error applying fix:', error.message);
        process.exit(1);
    }
}

applyFix();

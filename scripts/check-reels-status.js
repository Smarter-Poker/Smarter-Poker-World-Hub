#!/usr/bin/env node

/**
 * Check current state of reels in database
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkReelsStatus() {
    console.log('🔍 Checking reels status...\n');

    try {
        // Check public reels
        const { data: publicReels, error: publicError } = await supabase
            .from('social_reels')
            .select('id, video_url, caption, is_public, created_at')
            .eq('is_public', true)
            .order('created_at', { ascending: false });

        console.log(`Public reels: ${publicReels?.length || 0}`);
        if (publicError) console.error('Error:', publicError.message);

        // Check ALL reels (including private)
        const { data: allReels, error: allError } = await supabase
            .from('social_reels')
            .select('id, video_url, caption, is_public, created_at')
            .order('created_at', { ascending: false });

        console.log(`Total reels: ${allReels?.length || 0}`);
        console.log(`Private reels: ${(allReels?.length || 0) - (publicReels?.length || 0)}\n`);

        if (allReels && allReels.length > 0) {
            console.log('Sample reels:');
            allReels.slice(0, 10).forEach((reel, i) => {
                console.log(`${i + 1}. ${reel.is_public ? '✅ PUBLIC' : '❌ PRIVATE'} - ${reel.caption?.substring(0, 50) || 'No caption'}...`);
                console.log(`   URL: ${reel.video_url?.substring(0, 60)}...`);
            });
        }

        // Check if we accidentally marked good reels as private
        const { data: privateReels } = await supabase
            .from('social_reels')
            .select('id, video_url, caption, is_public')
            .eq('is_public', false);

        if (privateReels && privateReels.length > 0) {
            console.log(`\n⚠️  Found ${privateReels.length} private reels`);
            console.log('These may have been accidentally hidden by the cleanup script.\n');
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

checkReelsStatus();

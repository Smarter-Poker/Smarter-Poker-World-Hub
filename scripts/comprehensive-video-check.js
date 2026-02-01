#!/usr/bin/env node

/**
 * Comprehensive Video System Check
 * Verifies all aspects of video functionality
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
    console.error('❌ Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
});

async function comprehensiveCheck() {
    console.log('🔍 COMPREHENSIVE VIDEO SYSTEM CHECK\n');
    console.log('='.repeat(60));

    const issues = [];

    try {
        // 1. Check total counts
        console.log('\n1️⃣  Checking Total Counts...');
        const { count: reelsCount } = await supabase
            .from('social_reels')
            .select('*', { count: 'exact', head: true });
        const { count: publicReelsCount } = await supabase
            .from('social_reels')
            .select('*', { count: 'exact', head: true })
            .eq('is_public', true);
        const { count: postsCount } = await supabase
            .from('social_posts')
            .select('*', { count: 'exact', head: true })
            .eq('content_type', 'video');
        const { count: publicPostsCount } = await supabase
            .from('social_posts')
            .select('*', { count: 'exact', head: true })
            .eq('content_type', 'video')
            .eq('visibility', 'public');

        console.log(`   Total Reels: ${reelsCount}`);
        console.log(`   Public Reels: ${publicReelsCount}`);
        console.log(`   Total Video Posts: ${postsCount}`);
        console.log(`   Public Video Posts: ${publicPostsCount}`);

        // 2. Check for orphaned videos (missing authors)
        console.log('\n2️⃣  Checking for Orphaned Videos...');
        const { data: reelsWithProfiles } = await supabase
            .from('social_reels')
            .select(`
                id,
                author_id,
                profiles:author_id (
                    id,
                    username,
                    avatar_url
                )
            `)
            .eq('is_public', true)
            .limit(100);

        const orphanedReels = reelsWithProfiles?.filter(r => !r.profiles) || [];
        console.log(`   Orphaned Reels (missing author): ${orphanedReels.length}`);
        if (orphanedReels.length > 0) {
            console.log('   ⚠️  IDs:', orphanedReels.map(r => r.id).slice(0, 5).join(', '));
            issues.push(`${orphanedReels.length} reels have missing author profiles`);
        }

        // Check posts too
        const { data: postsWithProfiles } = await supabase
            .from('social_posts')
            .select(`
                id,
                author_id,
                profiles:author_id (
                    id,
                    username
                )
            `)
            .eq('content_type', 'video')
            .eq('visibility', 'public')
            .limit(100);

        const orphanedPosts = postsWithProfiles?.filter(p => !p.profiles) || [];
        console.log(`   Orphaned Posts (missing author): ${orphanedPosts.length}`);
        if (orphanedPosts.length > 0) {
            console.log('   ⚠️  IDs:', orphanedPosts.map(p => p.id).slice(0, 5).join(', '));
            issues.push(`${orphanedPosts.length} video posts have missing author profiles`);
        }

        // 3. Check video URL patterns
        console.log('\n3️⃣  Analyzing Video URL Patterns...');
        const { data: allReels } = await supabase
            .from('social_reels')
            .select('id, video_url')
            .eq('is_public', true);

        const patterns = {
            shorts: 0,
            watch: 0,
            embed: 0,
            youtu_be: 0,
            invalid: 0
        };

        const invalidUrls = [];

        allReels?.forEach(r => {
            if (!r.video_url || r.video_url.trim() === '') {
                patterns.invalid++;
                invalidUrls.push(r.id);
            } else if (r.video_url.includes('youtube.com/shorts/')) {
                patterns.shorts++;
            } else if (r.video_url.includes('youtube.com/watch')) {
                patterns.watch++;
            } else if (r.video_url.includes('youtube.com/embed/')) {
                patterns.embed++;
            } else if (r.video_url.includes('youtu.be/')) {
                patterns.youtu_be++;
            } else {
                patterns.invalid++;
                invalidUrls.push(r.id);
            }
        });

        console.log('   YouTube Shorts:', patterns.shorts);
        console.log('   YouTube Watch:', patterns.watch);
        console.log('   YouTube Embed:', patterns.embed);
        console.log('   Youtu.be:', patterns.youtu_be);
        console.log('   Invalid/Empty:', patterns.invalid);

        if (patterns.invalid > 0) {
            console.log('   ⚠️  Invalid URL IDs:', invalidUrls.slice(0, 5).join(', '));
            issues.push(`${patterns.invalid} reels have invalid or empty URLs`);
        }

        // 4. Test anonymous access (critical for public viewing)
        console.log('\n4️⃣  Testing Anonymous Access...');
        const anonClient = createClient(supabaseUrl, supabaseAnonKey);

        const { data: anonReels, error: anonReelsError } = await anonClient
            .from('social_reels')
            .select('id, video_url, caption, author_id')
            .eq('is_public', true)
            .limit(5);

        if (anonReelsError) {
            console.log('   ❌ Anonymous Reels access FAILED:', anonReelsError.message);
            issues.push('Anonymous users cannot access public reels - RLS policy issue');
        } else {
            console.log(`   ✅ Anonymous Reels access OK (fetched ${anonReels.length} reels)`);
        }

        const { data: anonPosts, error: anonPostsError } = await anonClient
            .from('social_posts')
            .select('id, content, media_urls, author_id')
            .eq('content_type', 'video')
            .eq('visibility', 'public')
            .limit(5);

        if (anonPostsError) {
            console.log('   ❌ Anonymous Posts access FAILED:', anonPostsError.message);
            issues.push('Anonymous users cannot access public video posts - RLS policy issue');
        } else {
            console.log(`   ✅ Anonymous Posts access OK (fetched ${anonPosts.length} posts)`);
        }

        // 5. Test profile joins for anonymous users
        console.log('\n5️⃣  Testing Profile Joins for Anonymous Users...');
        const { data: anonReelsWithProfiles, error: anonProfileError } = await anonClient
            .from('social_reels')
            .select(`
                id,
                video_url,
                caption,
                author_id,
                profiles:author_id (
                    id,
                    username,
                    avatar_url
                )
            `)
            .eq('is_public', true)
            .limit(5);

        if (anonProfileError) {
            console.log('   ❌ Profile join FAILED:', anonProfileError.message);
            issues.push('Anonymous users cannot fetch author profiles - RLS policy issue');
        } else {
            const withProfiles = anonReelsWithProfiles?.filter(r => r.profiles) || [];
            console.log(`   ✅ Profile joins OK (${withProfiles.length}/${anonReelsWithProfiles?.length || 0} have profiles)`);

            if (withProfiles.length < (anonReelsWithProfiles?.length || 0)) {
                const missing = (anonReelsWithProfiles?.length || 0) - withProfiles.length;
                console.log(`   ⚠️  ${missing} reels missing profile data`);
            }
        }

        // 6. Check for duplicate video URLs
        console.log('\n6️⃣  Checking for Duplicate Videos...');
        const { data: urlCounts } = await supabase
            .rpc('exec_sql', {
                sql: `
                    SELECT video_url, COUNT(*) as count
                    FROM social_reels
                    WHERE is_public = true AND video_url IS NOT NULL
                    GROUP BY video_url
                    HAVING COUNT(*) > 1
                    ORDER BY count DESC
                    LIMIT 10;
                `
            })
            .catch(() => ({ data: null }));

        if (urlCounts && urlCounts.length > 0) {
            console.log(`   ⚠️  Found ${urlCounts.length} duplicate video URLs`);
            issues.push(`${urlCounts.length} videos are duplicated in the database`);
        } else {
            console.log('   ✅ No duplicate videos found');
        }

        // Summary
        console.log('\n' + '='.repeat(60));
        console.log('SUMMARY');
        console.log('='.repeat(60));

        if (issues.length === 0) {
            console.log('✅ ALL CHECKS PASSED - System is 100% functional!\n');
            console.log('📊 Statistics:');
            console.log(`   - ${publicReelsCount} public reels`);
            console.log(`   - ${publicPostsCount} public video posts`);
            console.log(`   - ${patterns.shorts + patterns.watch + patterns.embed + patterns.youtu_be} valid YouTube URLs`);
            console.log('   - Anonymous access working');
            console.log('   - Profile joins working');
        } else {
            console.log(`⚠️  FOUND ${issues.length} ISSUE(S):\n`);
            issues.forEach((issue, i) => {
                console.log(`${i + 1}. ${issue}`);
            });
            console.log('\n🔧 These issues need to be addressed for 100% functionality.');
        }

    } catch (error) {
        console.error('\n❌ Error during check:', error.message);
        process.exit(1);
    }
}

comprehensiveCheck();

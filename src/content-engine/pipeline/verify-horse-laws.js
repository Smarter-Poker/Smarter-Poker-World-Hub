/**
 * 🔒 HORSE CONTENT LAW VERIFICATION
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * This script verifies that all Horse Content Laws are being followed.
 * Run this before deployment and periodically to ensure compliance.
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { config } from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
config({ path: path.resolve(__dirname, '../../../.env.local') });

import { createClient } from '@supabase/supabase-js';

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('[verify-horse-laws] SUPABASE_SERVICE_ROLE_KEY is required: content_authors is server-only and is not readable with the anon key');
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const CRON_DIR = path.resolve(__dirname, '../../../pages/api/cron');

let passed = 0;
let failed = 0;

function test(name, condition, details = '') {
    if (condition) {
        console.debug(`✅ ${name}`);
        passed++;
    } else {
        console.debug(`❌ ${name}`);
        if (details) console.debug(`   ${details}`);
        failed++;
    }
}

async function verifyLaws() {
    console.debug('\n🔒 HORSE CONTENT LAW VERIFICATION');
    console.debug('═'.repeat(60));

    // ═══════════════════════════════════════════════════════════════════════
    // LAW 1: NO AI-GENERATED IMAGES
    // ═══════════════════════════════════════════════════════════════════════
    console.debug('\n📜 LAW 1: NO AI-GENERATED IMAGES');
    console.debug('─'.repeat(40));

    // Check horses-post.js is DELETED
    const horsesPostPath = path.join(CRON_DIR, 'horses-post.js');
    test(
        'horses-post.js is DELETED',
        !fs.existsSync(horsesPostPath),
        'This file generates AI images and must be removed!'
    );

    // Check no recent AI image posts in database
    const { data: imagePosts } = await supabase
        .from('social_posts')
        .select('id, author_id, content_type')
        .eq('content_type', 'photo')
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .limit(10);

    // Get horse profile IDs
    const { data: horses } = await supabase
        .from('content_authors')
        .select('profile_id');
    const horseIds = new Set((horses || []).map(h => h.profile_id).filter(Boolean));

    const horseImagePosts = (imagePosts || []).filter(p => horseIds.has(p.author_id));
    test(
        'No AI image posts in last 24 hours',
        horseImagePosts.length === 0,
        `Found ${horseImagePosts.length} image posts from horses`
    );

    // ═══════════════════════════════════════════════════════════════════════
    // LAW 2: CONTENT SOURCES (WHITELIST ONLY)
    // ═══════════════════════════════════════════════════════════════════════
    console.debug('\n📜 LAW 2: CONTENT SOURCES (WHITELIST ONLY)');
    console.debug('─'.repeat(40));

    // Check horses-clips.js exists
    const horsesClipsPath = path.join(CRON_DIR, 'horses-clips.js');
    test(
        'horses-clips.js exists',
        fs.existsSync(horsesClipsPath),
        'Video clip cron is missing!'
    );

    // Check horses-news.js exists
    const horsesNewsPath = path.join(CRON_DIR, 'horses-news.js');
    test(
        'horses-news.js exists',
        fs.existsSync(horsesNewsPath),
        'News reposting cron is missing!'
    );

    // Literal clip libraries were retired in favor of verified database-backed
    // supply. Their absence is now the compliance invariant: restoring either
    // would bypass freshness, rights and canonical publication controls.
    const clipLibraryPath = path.resolve(__dirname, './ClipLibrary.js');
    const sportsClipLibraryPath = path.resolve(__dirname, './SportsClipLibrary.js');
    test(
        'Literal clip libraries remain retired',
        !fs.existsSync(clipLibraryPath) && !fs.existsSync(sportsClipLibraryPath),
        'Static clip supply must not return; use the verified database-backed pipeline'
    );

    const liveRoots = [
        path.resolve(__dirname, '../../../pages'),
        path.resolve(__dirname, '../../../scripts'),
        path.resolve(__dirname, '..'),
    ];
    const liveLibraryCallers = [];
    const scan = directory => {
        if (!fs.existsSync(directory)) return;
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
            const candidate = path.join(directory, entry.name);
            if (entry.isDirectory()) scan(candidate);
            else if (/\.(?:c?js|mjs|jsx|ts|tsx)$/.test(entry.name)
                && candidate !== path.resolve(__filename)) {
                const source = fs.readFileSync(candidate, 'utf8');
                if (/['"]\.\/?(?:.*\/)?(?:Sports)?ClipLibrary\.js['"]/.test(source)) {
                    liveLibraryCallers.push(candidate);
                }
            }
        }
    };
    liveRoots.forEach(scan);
    test(
        'No live code imports a retired literal clip library',
        liveLibraryCallers.length === 0,
        liveLibraryCallers.join(', ')
    );

    // ═══════════════════════════════════════════════════════════════════════
    // LAW 3: NO DUPLICATE CONTENT
    // ═══════════════════════════════════════════════════════════════════════
    console.debug('\n📜 LAW 3: NO DUPLICATE CONTENT');
    console.debug('─'.repeat(40));

    // Check horses-clips.js has duplicate prevention
    if (fs.existsSync(horsesClipsPath)) {
        const clipsContent = fs.readFileSync(horsesClipsPath, 'utf8');
        test(
            'horses-clips.js has session tracking',
            clipsContent.includes('usedClipsThisSession'),
            'Missing session-level duplicate prevention'
        );
        test(
            'horses-clips.js has cooldown check',
            clipsContent.includes('CLIP_COOLDOWN_HOURS') || clipsContent.includes('getRecentlyPostedClipIds'),
            'Missing cooldown duplicate prevention'
        );
    }

    // Check for actual duplicates in database (last 48 hours)
    const { data: recentVideos } = await supabase
        .from('social_posts')
        .select('content, media_urls')
        .eq('content_type', 'video')
        .gte('created_at', new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString());

    const videoUrls = (recentVideos || [])
        .flatMap(p => p.media_urls || [])
        .filter(Boolean);
    const uniqueUrls = new Set(videoUrls);
    test(
        'No duplicate video URLs in last 48 hours',
        videoUrls.length === uniqueUrls.size,
        `Found ${videoUrls.length - uniqueUrls.size} duplicate video URLs`
    );

    // ═══════════════════════════════════════════════════════════════════════
    // LAW 4: HORSE COORDINATION
    // ═══════════════════════════════════════════════════════════════════════
    console.debug('\n📜 LAW 4: HORSE COORDINATION');
    console.debug('─'.repeat(40));

    // Check horses-clips.js passes recentlyUsedClips
    if (fs.existsSync(horsesClipsPath)) {
        const clipsContent = fs.readFileSync(horsesClipsPath, 'utf8');
        test(
            'postVideoClip receives recentlyUsedClips',
            clipsContent.includes('postVideoClip(horse, recentlyUsedClips)'),
            'Horses not coordinating via shared clip list'
        );
    }

    // ═══════════════════════════════════════════════════════════════════════
    // LAW 5: AUTONOMOUS OPERATION
    // ═══════════════════════════════════════════════════════════════════════
    console.debug('\n📜 LAW 5: AUTONOMOUS OPERATION');
    console.debug('─'.repeat(40));

    // Check environment variables
    test(
        'SUPABASE_URL is set',
        !!process.env.NEXT_PUBLIC_SUPABASE_URL,
        'Missing Supabase URL'
    );
    test(
        'SUPABASE_KEY is set',
        !!process.env.SUPABASE_SERVICE_ROLE_KEY,
        'Missing Supabase key'
    );
    test(
        'XAI_API_KEY is set',
        !!process.env.XAI_API_KEY,
        'Missing Grok/xAI key (needed for AI features)'
    );

    // Check active horses count
    const { data: activeHorses, count } = await supabase
        .from('content_authors')
        .select('id', { count: 'exact' })
        .eq('is_active', true)
        .not('profile_id', 'is', null);

    test(
        'Active horses available',
        (count || 0) > 0,
        `Found ${count || 0} active horses`
    );

    // ═══════════════════════════════════════════════════════════════════════
    // RESULTS
    // ═══════════════════════════════════════════════════════════════════════
    console.debug('\n' + '═'.repeat(60));
    console.debug(`📊 RESULTS: ${passed} passed, ${failed} failed`);

    if (failed === 0) {
        console.debug('🎉 ALL LAWS VERIFIED - System is compliant!');
    } else {
        console.debug('🚨 VIOLATIONS DETECTED - Fix issues before deployment!');
    }
    console.debug('═'.repeat(60) + '\n');

    return { passed, failed };
}

verifyLaws();

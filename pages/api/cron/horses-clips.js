/**
 * 🐴 HORSES VIDEO CLIP CRON - 90% VIDEO CLIPS
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * LAW: 90% of Horse content should be VIDEO CLIPS from real poker streams
 * 
 * This cron:
 * 1. Selects random Horses to post
 * 2. 90% chance: Posts a video clip from the clip library
 * 3. 10% chance: Posts AI-generated text + image (original content)
 * 
 * Video clips come from:
 * - Hustler Casino Live
 * - Twitch poker streamers  
 * - Other poker content creators
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

// Dynamic imports to avoid Vercel bundling issues with Node.js native modules
let videoClipper = null;
let getRandomClip = () => null;
let getRandomCaption = () => '';
let markClipUsed = () => { };
let CLIP_CATEGORIES = { FUNNY: 'funny' };

// Lazy load the video processing modules (optional in serverless)
async function loadClipModules() {
    if (!videoClipper) {
        try {
            const clipperMod = await import('../../../src/content-engine/pipeline/VideoClipper.js');
            const libraryMod = await import('../../../src/content-engine/pipeline/ClipLibrary.js');
            videoClipper = clipperMod.videoClipper;
            getRandomClip = libraryMod.getRandomClip;
            getRandomCaption = libraryMod.getRandomCaption;
            markClipUsed = libraryMod.markClipUsed;
            CLIP_CATEGORIES = libraryMod.CLIP_CATEGORIES;
        } catch (e) {
            console.warn('Clip modules not available:', e.message);
        }
    }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const CONFIG = {
    HORSES_PER_TRIGGER: 3,
    VIDEO_CLIP_PROBABILITY: 0.90,  // LAW: 90% video clips
    MAX_CLIPS_PER_DAY: 50,
    CLIP_COOLDOWN_HOURS: 48  // Don't repost same clip within 48 hours
};

// Track clips used in this session to prevent duplicates within same cron run
const usedClipsThisSession = new Set();

// ═══════════════════════════════════════════════════════════════════════════
// GET RECENTLY POSTED CLIPS (for coordination between horses)
// ═══════════════════════════════════════════════════════════════════════════
async function getRecentlyPostedClipIds() {
    const cutoff = new Date(Date.now() - CONFIG.CLIP_COOLDOWN_HOURS * 60 * 60 * 1000);

    const { data: recentPosts } = await supabase
        .from('social_posts')
        .select('content')
        .eq('content_type', 'video')
        .gte('created_at', cutoff.toISOString())
        .limit(100);

    // Extract clip IDs from post content (they contain the video URL)
    const usedUrls = new Set();
    (recentPosts || []).forEach(post => {
        // Extract YouTube video IDs from URLs in content
        const matches = post.content?.match(/youtube\.com\/watch\?v=([a-zA-Z0-9_-]+)/g) || [];
        matches.forEach(m => usedUrls.add(m));
    });

    return usedUrls;
}

// ═══════════════════════════════════════════════════════════════════════════
// VIDEO CLIP POSTING

/**
 * Post a video clip for a Horse
 */
async function postVideoClip(horse, recentlyUsedClips = new Set()) {
    console.log(`🎬 ${horse.name}: Posting video clip...`);

    try {
        // Try database first for processed clips
        const { data: dbClip } = await supabase.rpc('get_random_clip', {
            p_category: null,
            p_exclude_horse_id: horse.id
        });

        let clipData = null;
        let videoUrl = null;

        if (dbClip && dbClip.processed_url) {
            // Use pre-processed clip from database
            clipData = dbClip;
            videoUrl = dbClip.processed_url;
            console.log(`   Using pre-processed clip: ${clipData.id}`);
        } else {
            // Fall back to ClipLibrary - get a clip NOT recently used
            let libraryClip = null;
            let attempts = 0;
            const maxAttempts = 20;

            while (!libraryClip && attempts < maxAttempts) {
                const candidate = getRandomClip();
                if (!candidate) break;

                // Check if this clip was recently used or used this session
                const clipUrl = candidate.source_url || '';
                const isRecentlyUsed = recentlyUsedClips.has(clipUrl) ||
                    usedClipsThisSession.has(candidate.id);

                if (!isRecentlyUsed) {
                    libraryClip = candidate;
                    usedClipsThisSession.add(candidate.id); // Mark as used this session
                } else {
                    console.log(`   Skipping ${candidate.id} (recently used)`);
                }
                attempts++;
            }

            if (!libraryClip) {
                console.log(`   No unique clips available after ${attempts} attempts`);
                return null;
            }

            console.log(`   Processing clip: ${libraryClip.id}`);

            // Process the clip (download, convert, upload)
            const processResult = await videoClipper.processVideo(
                libraryClip.source_url,
                {
                    startTime: libraryClip.start_time,
                    duration: libraryClip.duration,
                    addCaptions: true,
                    authorId: horse.profile_id
                }
            );

            if (!processResult.success) {
                console.error(`   Clip processing failed: ${processResult.error}`);
                return null;
            }

            videoUrl = processResult.publicUrl;
            clipData = libraryClip;
            markClipUsed(libraryClip.id);
        }

        // Generate caption
        const caption = await generateClipCaption(horse, clipData);

        // Create the post
        const { data: post, error: postError } = await supabase
            .from('social_posts')
            .insert({
                author_id: horse.profile_id,
                content: caption,
                content_type: 'video',
                media_urls: [videoUrl],
                visibility: 'public'
            })
            .select()
            .single();

        if (postError) {
            console.error(`   Post creation failed: ${postError.message}`);
            return null;
        }

        // Log clip usage in database
        if (clipData.id) {
            await supabase.rpc('mark_clip_used', {
                p_clip_id: clipData.id,
                p_horse_id: horse.id,
                p_post_id: post.id,
                p_caption: caption
            }).catch(() => { }); // Ignore if RPC doesn't exist yet
        }

        // Also post to stories
        await postToStory(horse.profile_id, videoUrl, 'video');

        console.log(`✅ ${horse.name}: Video clip posted!`);

        return {
            type: 'video_clip',
            post_id: post.id,
            clip_id: clipData.id,
            caption
        };

    } catch (error) {
        console.error(`❌ ${horse.name}: Video clip failed - ${error.message}`);
        return null;
    }
}

/**
 * Generate an authentic caption for a clip
 */
async function generateClipCaption(horse, clipData) {
    // Get template caption based on category
    const templateCaption = getRandomCaption(clipData.category || CLIP_CATEGORIES.FUNNY);

    // Optionally personalize with GPT (brief, natural)
    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [{
                role: 'system',
                content: `You are ${horse.name}, a poker player posting a video clip. 
                         Style: ${horse.voice || 'casual'}, plays ${horse.stakes || '2/5'}.
                         Keep it VERY short (1-2 sentences max). Sound like a real person sharing a clip.
                         Reference: "${templateCaption}"`
            }, {
                role: 'user',
                content: `Write a brief caption for sharing this poker clip: ${clipData.description || 'sick hand'}. Max 1-2 sentences.`
            }],
            max_tokens: 60,
            temperature: 0.9
        });

        return response.choices[0].message.content;
    } catch {
        // Fall back to template
        return templateCaption;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// ORIGINAL CONTENT (10% of posts) - Fallback to AI-generated
// ═══════════════════════════════════════════════════════════════════════════

async function postOriginalContent(horse) {
    console.log(`📝 ${horse.name}: Posting original content...`);

    // Use existing image generation logic from horses-post.js
    // This is the 10% fallback when not posting clips

    const postTypes = ['session_result', 'bad_beat', 'win_celebration', 'random_thought'];
    const postType = postTypes[Math.floor(Math.random() * postTypes.length)];

    // Generate brief text
    const content = await generateOriginalText(horse, postType);

    // Generate image
    const imageUrl = await generateOriginalImage(postType);

    if (!content || !imageUrl) {
        return null;
    }

    const { data: post, error } = await supabase
        .from('social_posts')
        .insert({
            author_id: horse.profile_id,
            content,
            content_type: 'photo',
            media_urls: [imageUrl],
            visibility: 'public'
        })
        .select()
        .single();

    if (error) {
        console.error(`   Original post failed: ${error.message}`);
        return null;
    }

    await postToStory(horse.profile_id, imageUrl, 'image');

    console.log(`✅ ${horse.name}: Original content posted!`);

    return {
        type: 'original',
        post_id: post.id,
        content
    };
}

async function generateOriginalText(horse, postType) {
    const prompts = {
        session_result: "Post a brief session result (1-2 sentences).",
        bad_beat: "Brief bad beat rant (1-2 sentences).",
        win_celebration: "Quick win celebration (1-2 sentences).",
        random_thought: "Random poker thought (1-2 sentences)."
    };

    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [{
                role: 'system',
                content: `You are ${horse.name}, a ${horse.stakes || '2/5'} poker player. 
                         Style: ${horse.voice || 'casual'}. Keep it SHORT and authentic.`
            }, {
                role: 'user',
                content: prompts[postType]
            }],
            max_tokens: 80,
            temperature: 0.95
        });
        return response.choices[0].message.content;
    } catch {
        return null;
    }
}

async function generateOriginalImage(postType) {
    // Simplified image generation - use authentic prompts
    const prompts = {
        session_result: "Phone photo of organized poker chips on casino felt, player seat perspective, realistic",
        bad_beat: "Phone photo of poker cards on green felt after a hand, casual snapshot",
        win_celebration: "Overhead phone photo of chip stacks on poker table, celebrating",
        random_thought: "Casual photo of poker room, ambient lighting, authentic atmosphere"
    };

    try {
        const response = await openai.images.generate({
            model: 'dall-e-3',
            prompt: `${prompts[postType]}. Phone camera quality, no dramatic lighting, realistic amateur photo.`,
            n: 1,
            size: '1024x1024',
            quality: 'standard'
        });

        const tempUrl = response.data[0].url;

        // Upload to Supabase
        const imageResponse = await fetch(tempUrl);
        const blob = await imageResponse.blob();
        const buffer = Buffer.from(await blob.arrayBuffer());

        const fileName = `post-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
        const filePath = `photos/horses/${fileName}`;

        const { error } = await supabase.storage
            .from('social-media')
            .upload(filePath, buffer, { contentType: 'image/png' });

        if (error) return null;

        const { data: urlData } = supabase.storage
            .from('social-media')
            .getPublicUrl(filePath);

        return urlData.publicUrl;
    } catch {
        return null;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// STORY POSTING
// ═══════════════════════════════════════════════════════════════════════════

async function postToStory(authorId, mediaUrl, mediaType = 'video') {
    try {
        await supabase.from('stories').insert({
            author_id: authorId,
            media_url: mediaUrl,
            media_type: mediaType,
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        });
        return true;
    } catch {
        return false;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN CRON HANDLER
// ═══════════════════════════════════════════════════════════════════════════

export default async function handler(req, res) {
    console.log('\n🐴 HORSES CLIP CRON - 90% VIDEO CLIPS');
    console.log('═'.repeat(50));

    if (!SUPABASE_URL || !process.env.OPENAI_API_KEY) {
        return res.status(500).json({ error: 'Missing env vars' });
    }

    try {
        // Lazy load clip modules for serverless environment
        await loadClipModules();

        // Get recently posted clips to avoid duplicates (horse coordination)
        const recentlyUsedClips = await getRecentlyPostedClipIds();
        console.log(`📋 Found ${recentlyUsedClips.size} recently posted clips to avoid`);

        // Get random active horses
        const { data: horses, error: horseError } = await supabase
            .from('content_authors')
            .select('*')
            .eq('is_active', true)
            .not('profile_id', 'is', null)
            .limit(CONFIG.HORSES_PER_TRIGGER * 2);

        if (horseError || !horses?.length) {
            return res.status(200).json({
                success: true,
                message: 'No horses available',
                posted: 0
            });
        }

        // Shuffle and select
        const shuffled = horses.sort(() => Math.random() - 0.5);
        const selectedHorses = shuffled.slice(0, CONFIG.HORSES_PER_TRIGGER);

        const results = [];

        for (const horse of selectedHorses) {
            // Random delay
            await new Promise(r => setTimeout(r, Math.random() * 4000 + 2000));

            // 100% VIDEO CLIPS ONLY - no AI generated content
            const result = await postVideoClip(horse, recentlyUsedClips);

            if (result) {
                results.push({
                    horse: horse.name,
                    ...result,
                    success: true
                });
            } else {
                results.push({
                    horse: horse.name,
                    success: false
                });
            }
        }

        const videoClips = results.filter(r => r.type === 'video_clip').length;
        const originalPosts = results.filter(r => r.type === 'original').length;

        console.log('\n📊 RESULTS:');
        console.log(`   Video Clips: ${videoClips}`);
        console.log(`   Original: ${originalPosts}`);
        console.log(`   Failed: ${results.filter(r => !r.success).length}`);

        return res.status(200).json({
            success: true,
            posted: results.filter(r => r.success).length,
            video_clips: videoClips,
            original_posts: originalPosts,
            results,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Cron error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
}

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
import { shouldHorseBeActive, isHorseActiveHour, getHorseActivityRate, applyWritingStyle } from '../../../src/content-engine/pipeline/HorseScheduler.js';

// ClipLibrary functions - loaded dynamically in handler
let getRandomClip, getRandomCaption, markClipUsed, CLIP_CATEGORIES, getHorsePreferredSources;
let clipLibraryLoaded = false;

async function loadClipLibrary() {
    if (clipLibraryLoaded) return true;
    try {
        const lib = await import('../../../src/content-engine/pipeline/ClipLibrary.js');
        getRandomClip = lib.getRandomClip;
        getRandomCaption = lib.getRandomCaption;
        markClipUsed = lib.markClipUsed;
        CLIP_CATEGORIES = lib.CLIP_CATEGORIES;
        getHorsePreferredSources = lib.getHorsePreferredSources;
        clipLibraryLoaded = true;
        console.log('✅ ClipLibrary loaded successfully');
        return true;
    } catch (e) {
        console.error('❌ Failed to load ClipLibrary:', e.message);
        return false;
    }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });


const CONFIG = {
    HORSES_PER_TRIGGER: 3,  // 3 clips per trigger (runs 4x/hour = 12 clips/hour)
    VIDEO_CLIP_PROBABILITY: 0.90,  // LAW: 90% video clips
    MAX_CLIPS_PER_DAY: 200,  // Increased capacity
    CLIP_COOLDOWN_HOURS: 48  // Don't reuse same clip for 48 hours
};

// Track clips used in this session to prevent duplicates within same cron run
const usedClipsThisSession = new Set();

// ═══════════════════════════════════════════════════════════════════════════
// VOICE ARCHETYPES - Extremely different personality types for variety
// ═══════════════════════════════════════════════════════════════════════════
const VOICE_ARCHETYPES = [
    { type: 'deadpan', style: 'Dry, minimal words. No excitement. Example: "ok this is actually insane" or "yep"' },
    { type: 'hyped', style: 'CAPS LOCK energy. Example: "YOOOO" or "BANGER" or "THIS IS NUTS"' },
    { type: 'skeptic', style: 'Doubt. Example: "still dont believe it" or "had to be rigged"' },
    { type: 'simp', style: 'Fan behavior. Example: "GOAT move" or "built different"' },
    { type: 'degen', style: 'Gambler brain. Example: "inject this into my veins" or "more pls"' },
    { type: 'analyst', style: 'Strategic lens. Example: "interesting line" or "solver approved"' },
    { type: 'nostalgic', style: 'Old school. Example: "this takes me back" or "golden era vibes"' },
    { type: 'zoomer', style: 'Gen-Z speak. Example: "no cap" or "sheesh" or "lowkey fire"' },
    { type: 'boomer', style: 'Old school vibe. Example: "thats poker baby" or "thats how its done"' },
    { type: 'lurker', style: 'Just emojis or single reaction. Example: "👀" or "🔥" or "bruh"' },
    { type: 'contrarian', style: 'Hot take. Example: "overrated but ok" or "seen better"' },
    { type: 'supportive', style: 'Pure hype. Example: "love to see it" or "W" or "legendary"' }
];

// ═══════════════════════════════════════════════════════════════════════════
// VIDEO ID VALIDATION - Ensure only real YouTube videos are posted
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validate a YouTube video ID by checking if its thumbnail exists
 * Returns true if the video ID is valid and the thumbnail is accessible
 */
async function validateYouTubeVideoId(videoId) {
    if (!videoId || typeof videoId !== 'string') return false;

    // Quick pattern check - fake IDs often end in 3 repeating uppercase letters
    if (/[A-Z]{3}$/.test(videoId)) {
        console.log(`   ⚠️ Suspicious ID pattern (ends in XXX): ${videoId}`);
        return false;
    }

    try {
        // Check if YouTube thumbnail exists (fastest way to validate)
        const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
        const response = await fetch(thumbnailUrl, { method: 'HEAD' });

        if (response.ok) {
            return true;
        } else {
            console.log(`   ❌ Invalid video ID (no thumbnail): ${videoId}`);
            return false;
        }
    } catch (e) {
        console.log(`   ❌ Video ID validation failed: ${videoId} - ${e.message}`);
        return false;
    }
}

/**
 * Extract video ID from a YouTube URL
 */
function extractVideoIdFromUrl(url) {
    if (!url) return null;
    const match = url.match(/[?&]v=([^&]+)/) || url.match(/youtu\.be\/([^?]+)/);
    return match ? match[1] : null;
}

// ═══════════════════════════════════════════════════════════════════════════
// GET RECENTLY POSTED CLIPS (for coordination between horses)
// ═══════════════════════════════════════════════════════════════════════════
async function getRecentlyPostedClipIds() {
    const cutoff = new Date(Date.now() - CONFIG.CLIP_COOLDOWN_HOURS * 60 * 60 * 1000);

    const { data: recentPosts } = await supabase
        .from('social_posts')
        .select('metadata')
        .eq('content_type', 'video')
        .gte('created_at', cutoff.toISOString())
        .limit(200);

    // Extract clip IDs from post metadata
    const usedClipIds = new Set();
    (recentPosts || []).forEach(post => {
        // Check metadata.clip_id (preferred)
        if (post.metadata?.clip_id) {
            usedClipIds.add(post.metadata.clip_id);
        }
        // Also check metadata.source_video_id for fallback
        if (post.metadata?.source_video_id) {
            usedClipIds.add(post.metadata.source_video_id);
        }
    });

    console.log(`   Found ${usedClipIds.size} recently used clip IDs`);
    return usedClipIds;
}

// ═══════════════════════════════════════════════════════════════════════════
// VIDEO CLIP POSTING

/**
 * Post a video clip for a Horse
 * Now with proper deduplication to avoid posting same clips
 */
async function postVideoClip(horse, recentlyUsedClips = new Set()) {
    console.log(`🎬 ${horse.name}: Posting video clip...`);

    try {
        // Check if ClipLibrary loaded correctly
        if (typeof getRandomClip !== 'function') {
            console.error(`   ClipLibrary not loaded: getRandomClip is ${typeof getRandomClip}`);
            return null;
        }

        // Get this horse's preferred content sources
        const preferredSources = getHorsePreferredSources ? getHorsePreferredSources(horse.profile_id) : null;
        if (preferredSources) {
            console.log(`   ${horse.name} prefers: ${preferredSources.join(', ')}`);
        }

        // Get a random clip that hasn't been used recently, preferring horse's sources
        let clip = null;
        let attempts = 0;
        const maxAttempts = 15;

        while (!clip && attempts < maxAttempts) {
            // Try to get clip from preferred source first
            const preferSource = preferredSources ? preferredSources[attempts % preferredSources.length] : null;
            const candidate = getRandomClip({ preferSource });
            if (!candidate) break;

            // Check if this clip was recently used (database check) or used this session
            if (recentlyUsedClips.has(candidate.id) || usedClipsThisSession.has(candidate.id)) {
                console.log(`   Skipping ${candidate.id} (already used)`);
                attempts++;
                continue;
            }

            // CRITICAL: Validate the video ID is real before accepting
            const videoId = extractVideoIdFromUrl(candidate.source_url) || candidate.video_id;
            const isValid = await validateYouTubeVideoId(videoId);

            if (!isValid) {
                console.log(`   ⚠️ Rejecting ${candidate.id} - invalid video ID: ${videoId}`);
                attempts++;
                continue;
            }

            // Video ID is valid - accept this clip
            clip = candidate;
            usedClipsThisSession.add(candidate.id);
            console.log(`   ✅ Validated: ${videoId}`);
            attempts++;
        }

        if (!clip) {
            console.error(`   No fresh clips available after ${attempts} attempts`);
            return null;
        }

        console.log(`   Selected clip: ${clip.id} (attempt ${attempts})`);

        // Generate caption using template
        const templateCaption = getRandomCaption ? getRandomCaption(clip.category || 'funny') : 'Check out this hand! 🔥';

        // Determine this horse's voice archetype based on their profile_id hash
        let hash = 0;
        const horseId = horse.profile_id || '';
        for (let i = 0; i < horseId.length; i++) {
            hash = ((hash << 5) - hash) + horseId.charCodeAt(i);
            hash = hash & hash;
        }
        const archetype = VOICE_ARCHETYPES[Math.abs(hash) % VOICE_ARCHETYPES.length];

        let caption = templateCaption;
        try {
            const response = await openai.chat.completions.create({
                model: 'gpt-4o',
                messages: [{
                    role: 'system',
                    content: `You are posting a poker clip.

YOUR VOICE: ${archetype.type.toUpperCase()}
${archetype.style}

ULTRA-STRICT RULES:
1. MAX 4 WORDS. 1-2 words ideal. 3+ = FAIL.
2. BANNED STARTERS: "Check", "Look", "Watch", "This", "Here"
3. BANNED: quotes, colons, dashes, hyphens, questions
4. SOUND LIKE TEXTING not a title.

GOOD: "yep" / "fire" / "👀" / "YOOO" / "sheesh"
BAD: "Check out..." / "Watch this..." / 5+ words`
                }, {
                    role: 'user',
                    content: `Caption for: ${clip.description || templateCaption}`
                }],
                max_tokens: 20,
                temperature: 0.85
            });
            caption = response.choices[0].message.content || templateCaption;
            // Clean up any quotes/dashes that slip through - strip ALL quote variants
            caption = caption
                .replace(/["\"\"''`]/g, '')  // All quote types
                .replace(/—/g, ' ')         // Em-dashes to space
                .replace(/–/g, ' ')         // En-dashes to space
                .replace(/(\w)-(\w)/g, '$1 $2')  // Hyphenated-words to spaces
                .replace(/:/g, '')          // Colons
                .replace(/\s+/g, ' ')       // Multiple spaces to single
                .trim();

            // Apply horse's unique writing style
            caption = applyWritingStyle(caption, horse.profile_id);
        } catch (e) {
            console.log(`   Using template caption (OpenAI error: ${e.message})`);
            caption = applyWritingStyle(templateCaption, horse.profile_id);
        }

        // Create the post (matches debug endpoint exactly)
        const { data: post, error: postError } = await supabase
            .from('social_posts')
            .insert({
                author_id: horse.profile_id,
                content: caption,
                content_type: 'video',
                media_urls: [clip.source_url],
                visibility: 'public',
                metadata: {
                    clip_id: clip.id,
                    source: clip.source || 'unknown'
                }
            })
            .select('id')
            .single();

        if (postError) {
            console.error(`   Post creation failed: ${postError.message}`);
            return null;
        }

        console.log(`✅ ${horse.name}: Video clip posted! Post ID: ${post.id}`);

        return {
            type: 'video_clip',
            post_id: post.id,
            clip_id: clip.id,
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

    // Load ClipLibrary dynamically
    const libLoaded = await loadClipLibrary();
    if (!libLoaded) {
        return res.status(500).json({ error: 'Failed to load ClipLibrary' });
    }

    try {
        // Get recently posted clips to avoid duplicates (horse coordination)
        const recentlyUsedClips = await getRecentlyPostedClipIds();
        console.log(`📋 Found ${recentlyUsedClips.size} recently posted clips to avoid`);

        // Get current time for per-horse scheduling
        const now = new Date();
        const currentMinute = now.getMinutes();
        const currentHour = now.getHours();

        // Get ALL active horses
        const { data: allHorses, error: horseError } = await supabase
            .from('content_authors')
            .select('*')
            .eq('is_active', true)
            .not('profile_id', 'is', null);

        if (horseError || !allHorses?.length) {
            return res.status(200).json({
                success: true,
                message: 'No horses available',
                posted: 0
            });
        }

        // FILTER: Only horses who are "awake" during their 12-hour active window
        // Each horse has a unique sleep schedule based on their profile_id hash
        const activeHorses = allHorses.filter(horse => {
            if (!horse.profile_id) return false;
            const isAwake = isHorseActiveHour(horse.profile_id, currentHour);
            if (!isAwake) {
                console.log(`   💤 ${horse.name} is sleeping (not in active hours)`);
            }
            return isAwake;
        });

        console.log(`⏰ Minute ${currentMinute}, Hour ${currentHour}`);
        console.log(`🐴 Awake horses this hour: ${activeHorses.length}/${allHorses.length}`);

        if (activeHorses.length === 0) {
            return res.status(200).json({
                success: true,
                message: 'No horses in their active slot this minute',
                posted: 0,
                activeHorses: 0
            });
        }

        // Select horses based on their activity rate (some post more than others)
        const selectedHorses = activeHorses.filter(horse => {
            const rate = getHorseActivityRate(horse.profile_id, 'post');
            return Math.random() < rate;
        }).slice(0, CONFIG.HORSES_PER_TRIGGER);

        const results = [];

        for (const horse of selectedHorses) {
            // Random delay 5-15 seconds between posts (stay under 60s timeout)
            await new Promise(r => setTimeout(r, Math.random() * 10000 + 5000));

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

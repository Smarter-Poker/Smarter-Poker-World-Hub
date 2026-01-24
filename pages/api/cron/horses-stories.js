/**
 * 🐴 HORSES STORIES CRON - Horses Post Stories Like TikTok/Instagram
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * This cron makes horses post Stories:
 * - 70% video clip stories (from clip library)
 * - 30% text-only stories (poker thoughts, hot takes, reactions)
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

// ClipLibrary functions - loaded dynamically
let getRandomClip, getRandomCaption;
let clipLibraryLoaded = false;

async function loadClipLibrary() {
    if (clipLibraryLoaded) return true;
    try {
        const lib = await import('../../../src/content-engine/pipeline/ClipLibrary.js');
        getRandomClip = lib.getRandomClip;
        getRandomCaption = lib.getRandomCaption;
        clipLibraryLoaded = true;
        return true;
    } catch (e) {
        console.error('Failed to load ClipLibrary:', e.message);
        return false;
    }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const CONFIG = {
    HORSES_PER_TRIGGER: 5,  // 5 horses post stories per cron run
    VIDEO_STORY_PROBABILITY: 0.70,  // 70% video stories
};

// Story gradients (same as frontend)
const STORY_GRADIENTS = [
    'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
    'linear-gradient(135deg, #000000 0%, #1a1a1a 100%)',
    'linear-gradient(135deg, #1877F2 0%, #0a5dc2 100%)',
    'linear-gradient(135deg, #D4AF37 0%, #AA8C2C 50%, #6B5B1E 100%)',
    'linear-gradient(135deg, #134E5E 0%, #71B280 100%)',
    'linear-gradient(135deg, #833AB4 0%, #FD1D1D 50%, #FCB045 100%)',
];

// Text story prompts
const TEXT_STORY_TOPICS = [
    "Just saw the sickest cooler on stream 🤯",
    "My thoughts on solver vs exploitative play...",
    "Hot take: 3bet sizing in 2026 should be...",
    "The worst beat I've ever witnessed 💀",
    "Midnight grinding vibes 🌙",
    "Position is everything in poker 📍",
    "That feeling when you flop the nuts 🔥",
    "Live poker reads > Online reads",
    "Bankroll management tip of the day 💰",
    "The river is such a cruel mistress 🌊",
];

async function postVideoStory(horse) {
    console.log(`🎬 ${horse.name}: Posting video story...`);

    try {
        const clip = getRandomClip?.();
        if (!clip) {
            console.log(`   No clip available`);
            return null;
        }

        const caption = getRandomCaption?.(clip.category) || "🔥";

        // Use YouTube thumbnail as story image
        const thumbnailUrl = `https://img.youtube.com/vi/${clip.video_id}/hqdefault.jpg`;

        const { data: storyId, error } = await supabase.rpc('fn_create_story', {
            p_user_id: horse.profile_id,
            p_content: caption,
            p_media_url: thumbnailUrl,
            p_media_type: 'image',
            p_background_color: null,
            p_link_url: clip.source_url,  // Link to the actual video
        });

        if (error) {
            console.error(`   Story creation failed: ${error.message}`);
            return null;
        }

        console.log(`✅ ${horse.name}: Video story posted! ID: ${storyId}`);
        return { type: 'video_story', story_id: storyId };
    } catch (e) {
        console.error(`❌ ${horse.name}: Video story failed - ${e.message}`);
        return null;
    }
}

async function postTextStory(horse) {
    console.log(`📝 ${horse.name}: Posting text story...`);

    try {
        // Pick random topic
        const topic = TEXT_STORY_TOPICS[Math.floor(Math.random() * TEXT_STORY_TOPICS.length)];
        const gradient = STORY_GRADIENTS[Math.floor(Math.random() * STORY_GRADIENTS.length)];

        // Generate unique content with OpenAI
        let content = topic;
        try {
            const response = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [{
                    role: 'user',
                    content: `Write a short, authentic poker story text (max 15 words). RULES: NO quotation marks. NO em-dashes. Natural casual text. Topic: ${topic}`
                }],
                max_tokens: 40
            });
            content = response.choices[0].message.content || topic;
            // Clean all quote/dash variants
            content = content
                .replace(/[\"""''`]/g, '')
                .replace(/[—–]/g, ' ')
                .replace(/:/g, '')
                .replace(/\s+/g, ' ')
                .trim();
        } catch (e) {
            console.log(`   Using default topic (OpenAI error)`);
        }

        const { data: storyId, error } = await supabase.rpc('fn_create_story', {
            p_user_id: horse.profile_id,
            p_content: content,
            p_media_url: null,
            p_media_type: null,
            p_background_color: gradient,
            p_link_url: null,
        });

        if (error) {
            console.error(`   Story creation failed: ${error.message}`);
            return null;
        }

        console.log(`✅ ${horse.name}: Text story posted! ID: ${storyId}`);
        return { type: 'text_story', story_id: storyId };
    } catch (e) {
        console.error(`❌ ${horse.name}: Text story failed - ${e.message}`);
        return null;
    }
}

export default async function handler(req, res) {
    console.log('\n🐴 HORSES STORIES CRON');
    console.log('═'.repeat(50));

    if (!SUPABASE_URL) {
        return res.status(500).json({ error: 'Missing env vars' });
    }

    // Load ClipLibrary
    await loadClipLibrary();

    try {
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
            await new Promise(r => setTimeout(r, Math.random() * 2000 + 1000));

            const isVideoStory = Math.random() < CONFIG.VIDEO_STORY_PROBABILITY;
            const result = isVideoStory
                ? await postVideoStory(horse)
                : await postTextStory(horse);

            results.push({
                horse: horse.name,
                ...result,
                success: !!result
            });
        }

        const videoStories = results.filter(r => r.type === 'video_story').length;
        const textStories = results.filter(r => r.type === 'text_story').length;

        console.log('\n📊 RESULTS:');
        console.log(`   Video Stories: ${videoStories}`);
        console.log(`   Text Stories: ${textStories}`);
        console.log(`   Failed: ${results.filter(r => !r.success).length}`);

        return res.status(200).json({
            success: true,
            posted: results.filter(r => r.success).length,
            video_stories: videoStories,
            text_stories: textStories,
            results,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Cron error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
}

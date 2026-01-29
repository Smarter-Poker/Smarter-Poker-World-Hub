/**
 * 🐴 HORSES SPORTS STORIES CRON - Horses Post Sports Stories
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * This cron makes horses post Sports Stories:
 * - 70% video clip stories (from sports_clips database)
 * - 30% text-only stories (sports hot takes, reactions, game commentary)
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';
import { getGrokClient } from '../../../src/lib/grokClient';
import { shouldHorseBeActive, isHorseActiveHour } from '../../../src/content-engine/pipeline/HorseScheduler.js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const grok = getGrokClient();

const CONFIG = {
    HORSES_PER_TRIGGER: 2,  // 2 stories per trigger (runs 4x/hour = 8 stories/hour)
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

// Text story topics for sports
const SPORTS_TEXT_TOPICS = [
    "Just watched the most insane game-winner 🏀",
    "Hot take: This team is winning it all this year 🏆",
    "That dunk was absolutely filthy 💀",
    "Playoff atmosphere is unmatched 🔥",
    "Late night sports highlights vibes 🌙",
    "Defense wins championships 🛡️",
    "Clutch gene is real 💪",
    "Best rivalry in sports right now 👀",
    "That play belongs in the Hall of Fame 🎯",
    "Sports never sleep 🏈⚾🏀",
];

// Get random sports clip from database
async function getRandomSportsClip(excludeIds = []) {
    try {
        let query = supabase
            .from('sports_clips')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(100);

        // Only apply NOT IN filter if we have IDs to exclude
        if (excludeIds.length > 0) {
            query = query.not('id', 'in', `(${excludeIds.join(',')})`);
        }

        const { data, error } = await query;

        if (error || !data || data.length === 0) {
            console.error('Failed to fetch sports clips:', error?.message || 'No clips found');
            return null;
        }

        // Pick random clip
        const randomClip = data[Math.floor(Math.random() * data.length)];
        return randomClip;

    } catch (error) {
        console.error('Error in getRandomSportsClip:', error);
        return null;
    }
}

// Generate sports text story using Grok
async function generateSportsTextStory(horseName) {
    try {
        const topic = SPORTS_TEXT_TOPICS[Math.floor(Math.random() * SPORTS_TEXT_TOPICS.length)];

        const prompt = `You are ${horseName}, a sports enthusiast posting a quick story on social media.

Topic: ${topic}

Write a SHORT, casual sports story (2-3 sentences max). Be authentic, use sports slang, and show genuine passion. Include relevant emojis.

Examples:
- "Bro that buzzer beater had me jumping off my couch 🏀 Clutch gene is REAL"
- "This team's defense is absolutely suffocating rn 🛡️ Championship vibes fr"
- "Late night highlights got me hyped for tomorrow's games 🔥 Sports never sleep"

Keep it SHORT and authentic. No hashtags.`;

        const completion = await grok.chat.completions.create({
            model: 'grok-beta',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.9,
            max_tokens: 100,
        });

        return completion.choices[0]?.message?.content?.trim() || topic;

    } catch (error) {
        console.error('Grok text generation failed:', error);
        return SPORTS_TEXT_TOPICS[Math.floor(Math.random() * SPORTS_TEXT_TOPICS.length)];
    }
}

// Post a sports story
async function postSportsStory(horse, storyType, content) {
    try {
        const gradient = STORY_GRADIENTS[Math.floor(Math.random() * STORY_GRADIENTS.length)];

        const storyData = {
            author_id: horse.profile_id,
            content_type: storyType,
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
            metadata: {
                gradient,
                sport_type: content.sport_type || 'general',
                category: content.category || 'story',
            },
        };

        if (storyType === 'video') {
            storyData.video_url = content.source_url;
            storyData.thumbnail_url = `https://img.youtube.com/vi/${content.video_id}/maxresdefault.jpg`;
            storyData.caption = content.title;
        } else {
            storyData.text_content = content.text;
        }

        const { data, error } = await supabase
            .from('stories')
            .insert([storyData])
            .select()
            .single();

        if (error) {
            console.error(`Failed to post story for ${horse.name}:`, error);
            return { success: false, error: error.message };
        }

        return { success: true, story_id: data.id };

    } catch (error) {
        console.error(`Error posting story for ${horse.name}:`, error);
        return { success: false, error: error.message };
    }
}

export default async function handler(req, res) {
    console.log('\n🐴 HORSES SPORTS STORIES CRON TRIGGERED\n');

    try {
        // Fetch active horses
        const { data: horses, error: horsesError } = await supabase
            .from('content_authors')
            .select('id, name, profile_id, personality_traits')
            .eq('is_active', true)
            .not('profile_id', 'is', null)
            .limit(CONFIG.HORSES_PER_TRIGGER * 3); // Get extra to account for filtering

        if (horsesError || !horses || horses.length === 0) {
            console.error('Failed to fetch horses:', horsesError);
            return res.status(500).json({
                success: false,
                error: 'Failed to fetch horses',
                posted: 0
            });
        }

        console.log(`Fetched ${horses.length} horses`);

        const results = [];
        let videoStories = 0;
        let textStories = 0;
        let postsAttempted = 0;

        for (const horse of horses) {
            if (postsAttempted >= CONFIG.HORSES_PER_TRIGGER) break;

            // Check if horse should post today
            if (!shouldHorseBeActive(horse.id)) {
                console.log(`${horse.name} has a quiet day today, skipping`);
                continue;
            }

            // Check if it's an active hour for this horse
            if (!isHorseActiveHour(horse.id)) {
                console.log(`${horse.name} not active this hour, skipping`);
                continue;
            }

            postsAttempted++;

            // Decide: video or text story
            const isVideoStory = Math.random() < CONFIG.VIDEO_STORY_PROBABILITY;

            if (isVideoStory) {
                // Post video story from sports_clips
                const clip = await getRandomSportsClip();

                if (!clip) {
                    console.log(`No sports clips available for ${horse.name}, skipping`);
                    continue;
                }

                const result = await postSportsStory(horse, 'video', clip);

                if (result.success) {
                    videoStories++;
                    results.push({
                        horse: horse.name,
                        type: 'video_story',
                        sport: clip.sport_type,
                        story_id: result.story_id,
                        success: true,
                    });
                    console.log(`✅ ${horse.name} posted video story (${clip.sport_type})`);
                } else {
                    results.push({
                        horse: horse.name,
                        type: 'video_story',
                        success: false,
                        error: result.error,
                    });
                }

            } else {
                // Post text story
                const text = await generateSportsTextStory(horse.name);
                const result = await postSportsStory(horse, 'text', { text });

                if (result.success) {
                    textStories++;
                    results.push({
                        horse: horse.name,
                        type: 'text_story',
                        story_id: result.story_id,
                        success: true,
                    });
                    console.log(`✅ ${horse.name} posted text story`);
                } else {
                    results.push({
                        horse: horse.name,
                        type: 'text_story',
                        success: false,
                        error: result.error,
                    });
                }
            }
        }

        const posted = videoStories + textStories;

        console.log(`\n✅ Posted ${posted} sports stories (${videoStories} video, ${textStories} text)\n`);

        return res.status(200).json({
            success: true,
            posted,
            video_stories: videoStories,
            text_stories: textStories,
            results,
            timestamp: new Date().toISOString(),
        });

    } catch (error) {
        console.error('Sports stories cron error:', error);
        return res.status(500).json({
            success: false,
            error: error.message,
            posted: 0,
        });
    }
}

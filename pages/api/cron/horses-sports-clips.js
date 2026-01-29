/**
 * 🏈 HORSES SPORTS CLIPS CRON - NBA, NFL, MLB, NHL, Soccer
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Horses post sports video clips from major leagues
 * 
 * This cron:
 * 1. Selects random Horses to post
 * 2. Posts sports video clips from the sports clip library
 * 
 * Sports clips come from:
 * - ESPN, NBA, NFL, MLB, NHL
 * - House of Highlights, Bleacher Report
 * - Team channels
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';
import { getGrokClient } from '../../../src/lib/grokClient.js';
import {
    applyWritingStyle,
    getTimeOfDayEnergy,
    shouldHorsePostToday
} from '../../../src/content-engine/pipeline/HorseScheduler.js';

// Sports caption templates
const SPORTS_CAPTION_TEMPLATES = {
    highlight: ["🔥 This is insane", "💯 Unreal", "Sheesh", "W"],
    buzzer_beater: ["😱 NO WAY", "🚨 CLUTCH", "Ice in his veins", "Built different"],
    touchdown: ["🏈 LETS GO", "💪 Touchdown baby", "W", "Huge"],
    dunk: ["🏀 POSTER", "😤 Nasty", "Filthy", "Boom"],
    goal: ["⚽ GOLAZO", "🔥 What a strike", "Unreal", "Banger"],
    controversy: ["👀 Yikes", "😬 Uh oh", "Refs are blind", "No way"],
    funny: ["😂 LMAO", "🤣 Dead", "Comedy", "Cant make this up"],
    analysis: ["📊 Breakdown", "🧠 Smart play", "Interesting", "Good take"],
    interview: ["💬 Real talk", "👀 Listen to this", "Facts", "He said what"],
    playoff: ["🏆 Playoff basketball", "💪 Win or go home", "This is it", "Pressure"]
};

function getRandomSportsCaption(category) {
    const templates = SPORTS_CAPTION_TEMPLATES[category] || SPORTS_CAPTION_TEMPLATES.highlight;
    return templates[Math.floor(Math.random() * templates.length)];
}

// Get random sports clip from database
async function getRandomSportsClip(excludeIds = []) {
    try {
        // Get a random clip from the database that hasn't been used recently
        let query = supabase
            .from('sports_clips')
            .select('*');

        // Only apply exclusion filter if there are IDs to exclude
        if (excludeIds.length > 0) {
            query = query.not('id', 'in', `(${excludeIds.join(',')})`);
        }

        const { data: clips, error } = await query
            .order('created_at', { ascending: false })
            .limit(50);

        if (error || !clips || clips.length === 0) {
            console.log('   ⚠️ No sports clips found in database');
            console.log('   Error:', error?.message || 'No clips returned');
            return null;
        }

        // Return a random clip from the results
        const randomClip = clips[Math.floor(Math.random() * clips.length)];
        return {
            id: randomClip.id,
            video_id: randomClip.video_id,
            source_url: randomClip.source_url,
            title: randomClip.title,
            source: randomClip.source,
            category: randomClip.category,
            sport_type: randomClip.sport_type
        };
    } catch (e) {
        console.error('   ❌ Error fetching sports clip:', e.message);
        return null;
    }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const grok = getGrokClient();

const CONFIG = {
    HORSES_PER_TRIGGER: 4,  // 4 sports clips per trigger
    CLIP_COOLDOWN_HOURS: 24  // Don't reuse same clip for 24 hours
};

// Track clips used in this session
const usedClipsThisSession = new Set();

// ═══════════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════════════════

export default async function handler(req, res) {
    try {
        console.log('\n' + '═'.repeat(60));
        console.log('🏈 SPORTS CLIPS CRON STARTED');
        console.log('═'.repeat(60));

        // Get random active horses (select more than needed since ~30% will be filtered by shouldHorsePostToday)
        const { data: horses } = await supabase
            .from('content_authors')
            .select('*')
            .eq('is_active', true)
            .not('profile_id', 'is', null)
            .limit(CONFIG.HORSES_PER_TRIGGER * 3);  // 3x to account for filtering

        if (!horses?.length) {
            return res.status(200).json({ success: true, message: 'No horses available', posted: 0 });
        }

        const shuffledHorses = horses.sort(() => Math.random() - 0.5);
        const results = [];

        // Get current time-of-day energy
        const timeEnergy = getTimeOfDayEnergy();
        console.log(`   ⏰ Time-of-day mode: ${timeEnergy.mode}`);
        console.log(`   🐴 Selected ${shuffledHorses.length} horses (will filter to ${CONFIG.HORSES_PER_TRIGGER})`);

        let postsAttempted = 0;
        for (const horse of shuffledHorses) {
            // Stop once we have enough posts
            if (postsAttempted >= CONFIG.HORSES_PER_TRIGGER) {
                break;
            }

            // Check if this horse should post today
            if (!shouldHorsePostToday(horse.profile_id)) {
                console.log(`   💤 ${horse.alias} is having a quiet day`);
                continue;
            }

            postsAttempted++;
            console.log(`\n🏈 ${horse.alias}: Posting sports clip...`);

            // Get a random sports clip from database
            const clip = await getRandomSportsClip(Array.from(usedClipsThisSession));

            if (!clip) {
                console.log(`   No sports clips available for ${horse.alias}`);
                continue;
            }

            usedClipsThisSession.add(clip.id);
            console.log(`   📺 Selected: ${clip.title} from ${clip.source}`);

            // Generate caption using Grok
            let caption = '';
            try {
                const templateCaption = getRandomSportsCaption(clip.category);

                const prompt = `You are ${horse.alias}, a sports fan posting a ${clip.category} clip.
React naturally to: "${clip.title}" from ${clip.source}

Keep it SHORT (under 15 words). Be authentic. No hashtags. No emojis (they're added separately).

Examples of good reactions:
- "this is absolutely insane"
- "no way this just happened"
- "built different fr"
- "W"
- "sheesh"

Your reaction:`;

                const completion = await grok.chat.completions.create({
                    model: 'grok-beta',
                    messages: [{ role: 'user', content: prompt }],
                    temperature: 0.9,
                    max_tokens: 50
                });

                caption = completion.choices[0]?.message?.content
                    ?.replace(/^["']|["']$/g, '')
                    .replace(/#\w+/g, '')
                    .trim();

                // Apply horse's unique writing style
                caption = applyWritingStyle(caption, horse.profile_id);
            } catch (e) {
                console.log(`   Using template caption (Grok error: ${e.message})`);
                const templateCaption = getRandomSportsCaption(clip.category);
                caption = applyWritingStyle(templateCaption, horse.profile_id);
            }

            // Create the post
            // NO hardcoded emojis - let applyWritingStyle handle it naturally (5% rate)
            const finalCaption = `${caption}\n\n${clip.source_url}`;

            const { data: post, error: postError } = await supabase
                .from('social_posts')
                .insert({
                    author_id: horse.profile_id,
                    content: finalCaption,
                    content_type: 'video',
                    media_urls: [clip.source_url],
                    visibility: 'public',
                    metadata: {
                        clip_id: clip.id,
                        source: clip.source || 'unknown',
                        sport_type: clip.sport_type || 'sports',
                        category: clip.category
                    }
                })
                .select('id')
                .single();

            if (postError) {
                console.error(`   Post creation failed: ${postError.message}`);
                continue;
            }

            console.log(`   ✅ Posted: "${caption}"`);
            results.push({
                horse: horse.alias,
                clip: clip.title,
                source: clip.source,
                success: true
            });

            // Random delay between posts
            const delay = 1000 + Math.random() * 3000;
            await new Promise(r => setTimeout(r, delay));
        }

        console.log('\n' + '═'.repeat(60));
        console.log(`📊 Posted ${results.length} sports clips`);

        return res.status(200).json({
            success: true,
            posted: results.length,
            results,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Cron error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
}

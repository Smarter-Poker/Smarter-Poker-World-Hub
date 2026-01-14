/**
 * 🐴 HORSES MEMES CRON - Post Poker Memes & Parodies
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Horses post text-based poker memes and parody content.
 * NO AI IMAGES - text posts only with relatable poker humor.
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';
import { getRandomMeme, getRandomParody, MEME_CATEGORIES } from '../../../src/content-engine/pipeline/MemeLibrary.js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const CONFIG = {
    HORSES_PER_TRIGGER: 2,
    MEME_PROBABILITY: 0.7,  // 70% memes, 30% parody captions
};

// Track memes used this session to prevent duplicates
const usedMemesThisSession = new Set();

/**
 * Post a meme for a horse
 */
async function postMeme(horse) {
    console.log(`🃏 ${horse.name}: Posting meme...`);

    try {
        // Get a random meme that hasn't been used
        let meme = null;
        let attempts = 0;

        while (!meme && attempts < 10) {
            const candidate = getRandomMeme();
            if (!usedMemesThisSession.has(candidate.text)) {
                meme = candidate;
                usedMemesThisSession.add(candidate.text);
            }
            attempts++;
        }

        if (!meme) {
            console.log(`   No unique memes available`);
            return null;
        }

        // Add emoji based on category
        const categoryEmoji = {
            bad_beat: '😭',
            tilt: '🔥',
            grind: '💪',
            fish: '🐟',
            gto: '🤖',
            lifestyle: '🎰',
            bluff: '🎭',
            cooler: '🥶'
        };

        const emoji = categoryEmoji[meme.category] || '🃏';
        const content = `${meme.text} ${emoji}`;

        // Create text post (no images!)
        const { data: post, error } = await supabase
            .from('social_posts')
            .insert({
                author_id: horse.profile_id,
                content: content,
                content_type: 'text',
                visibility: 'public'
            })
            .select()
            .single();

        if (error) {
            console.error(`   Post error: ${error.message}`);
            return null;
        }

        console.log(`✅ ${horse.name}: Meme posted!`);
        return {
            type: 'meme',
            post_id: post.id,
            category: meme.category
        };

    } catch (error) {
        console.error(`❌ ${horse.name}: Meme failed - ${error.message}`);
        return null;
    }
}

/**
 * Post to stories
 */
async function postMemeToStory(horse) {
    const meme = getRandomMeme();

    try {
        await supabase
            .from('stories')
            .insert({
                author_id: horse.profile_id,
                text_content: meme.text,
                media_type: 'text',
                expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
            });
        console.log(`   Story posted`);
    } catch (e) {
        // Stories might not support text_content, that's ok
    }
}

/**
 * Main handler
 */
export default async function handler(req, res) {
    console.log('\n🃏 HORSES MEMES CRON');
    console.log('═'.repeat(60));

    if (!SUPABASE_URL) {
        return res.status(500).json({ error: 'Missing SUPABASE_URL' });
    }

    try {
        // Get random active horses
        const { data: horses } = await supabase
            .from('content_authors')
            .select('*')
            .eq('is_active', true)
            .not('profile_id', 'is', null)
            .limit(CONFIG.HORSES_PER_TRIGGER * 2);

        if (!horses?.length) {
            return res.status(200).json({ success: true, message: 'No horses', posted: 0 });
        }

        const shuffled = horses.sort(() => Math.random() - 0.5);
        const selected = shuffled.slice(0, CONFIG.HORSES_PER_TRIGGER);

        const results = [];

        for (const horse of selected) {
            await new Promise(r => setTimeout(r, Math.random() * 2000 + 1000));

            const result = await postMeme(horse);

            if (result) {
                // Also post to story sometimes
                if (Math.random() < 0.3) {
                    await postMemeToStory(horse);
                }
                results.push({ horse: horse.alias, ...result });
            }
        }

        console.log('\n' + '═'.repeat(60));
        console.log(`📊 Posted ${results.length} memes`);

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

/**
 * Debug test endpoint for horses-clips
 */
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

// Test if ClipLibrary loads
let clipLibraryLoaded = false;
let clipLibraryError = null;
let getRandomClip = null;
let getRandomCaption = null;
let CLIP_CATEGORIES = null;

try {
    const lib = await import('../../../src/content-engine/pipeline/ClipLibrary.js');
    getRandomClip = lib.getRandomClip;
    getRandomCaption = lib.getRandomCaption;
    CLIP_CATEGORIES = lib.CLIP_CATEGORIES;
    clipLibraryLoaded = true;
} catch (e) {
    clipLibraryError = e.message;
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export default async function handler(req, res) {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const result = {
        clipLibraryLoaded,
        clipLibraryError,
        env: {
            hasSupabaseUrl: !!SUPABASE_URL,
            hasSupabaseKey: !!SUPABASE_KEY,
            hasOpenAI: !!process.env.OPENAI_API_KEY
        },
        randomClip: null,
        horseTest: null,
        captionTest: null,
        postTest: null
    };

    let clip = null;
    let horse = null;

    // Test random clip
    if (getRandomClip) {
        try {
            clip = getRandomClip();
            result.randomClip = clip ? { id: clip.id, url: clip.source_url } : 'null';
        } catch (e) {
            result.randomClip = `error: ${e.message}`;
        }
    }

    // Test horse fetch
    try {
        const { data: horses, error } = await supabase
            .from('content_authors')
            .select('id, name, profile_id, voice, stakes')
            .eq('is_active', true)
            .limit(1);

        if (error) {
            result.horseTest = `error: ${error.message}`;
        } else {
            horse = horses?.[0];
            result.horseTest = horse ? { id: horse.id, name: horse.name, profile_id: horse.profile_id } : 'no horses';
        }
    } catch (e) {
        result.horseTest = `exception: ${e.message}`;
    }

    // Test caption generation
    if (clip && horse) {
        try {
            const templateCaption = getRandomCaption(clip.category || CLIP_CATEGORIES.FUNNY);
            const response = await openai.chat.completions.create({
                model: 'gpt-4o',
                messages: [{
                    role: 'user',
                    content: `Write 1 short poker clip caption (10 words max): ${templateCaption}`
                }],
                max_tokens: 30
            });
            result.captionTest = response.choices[0].message.content;
        } catch (e) {
            result.captionTest = `error: ${e.message}`;
        }
    }

    // Test post creation (only if we have caption)
    if (clip && horse && result.captionTest && !result.captionTest.startsWith('error')) {
        try {
            const { data: post, error: postError } = await supabase
                .from('social_posts')
                .insert({
                    author_id: horse.profile_id,
                    content: result.captionTest,
                    content_type: 'video',
                    media_urls: [clip.source_url],
                    visibility: 'public',
                    metadata: {
                        clip_id: clip.id,
                        source: clip.source || 'debug'
                    }
                })
                .select('id')
                .single();

            if (postError) {
                result.postTest = `error: ${postError.message}`;
            } else {
                result.postTest = { success: true, post_id: post.id };
            }
        } catch (e) {
            result.postTest = `exception: ${e.message}`;
        }
    }

    return res.status(200).json(result);
}

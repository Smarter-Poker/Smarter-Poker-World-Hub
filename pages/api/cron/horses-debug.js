/**
 * Debug test endpoint for horses-clips
 */
import { createClient } from '@supabase/supabase-js';

// Test if ClipLibrary loads
let clipLibraryLoaded = false;
let clipLibraryError = null;
let getRandomClip = null;

try {
    const lib = await import('../../../src/content-engine/pipeline/ClipLibrary.js');
    getRandomClip = lib.getRandomClip;
    clipLibraryLoaded = true;
} catch (e) {
    clipLibraryError = e.message;
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export default async function handler(req, res) {
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
        postTest: null
    };

    // Test random clip
    if (getRandomClip) {
        try {
            const clip = getRandomClip();
            result.randomClip = clip ? { id: clip.id, url: clip.source_url } : 'null';
        } catch (e) {
            result.randomClip = `error: ${e.message}`;
        }
    }

    // Test horse fetch
    try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
        const { data: horses, error } = await supabase
            .from('content_authors')
            .select('id, name, profile_id')
            .eq('is_active', true)
            .limit(1);

        result.horseTest = error ? `error: ${error.message}` : (horses?.[0] || 'no horses');
    } catch (e) {
        result.horseTest = `exception: ${e.message}`;
    }

    return res.status(200).json(result);
}

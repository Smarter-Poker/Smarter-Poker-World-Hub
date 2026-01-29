/**
 * 🐴 HORSE AVATAR GENERATOR
 * Generates profile pictures for all horses using AI
 * 
 * POST /api/horses/generate-avatars
 * Generates avatars for horses that don't have one
 */

import { createClient } from '@supabase/supabase-js';
import { getGrokClient } from '../../../src/lib/grokClient';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const openai = getGrokClient();

// Avatar style prompts based on persona
const AVATAR_STYLES = {
    male: [
        "professional poker player portrait, confident expression, casino background, dramatic lighting",
        "serious card player headshot, sophisticated, dark background, studio lighting",
        "casual poker grinder portrait, focused expression, home office background"
    ],
    female: [
        "professional female poker player portrait, confident, casino ambiance, elegant",
        "determined woman card player headshot, sophisticated style, studio lighting",
        "focused female poker pro portrait, modern style, clean background"
    ]
};

async function generateAvatar(horse) {
    const styleOptions = AVATAR_STYLES[horse.gender] || AVATAR_STYLES.male;
    const style = styleOptions[horse.id % styleOptions.length];

    const prompt = `Portrait photo of ${horse.name}, a ${horse.gender} poker player from ${horse.location}. 
${horse.specialty === 'high_stakes' ? 'Upscale, sophisticated look.' : 'Casual but focused appearance.'}
${style}
Photorealistic, high quality, 4K, professional photography.`;

    try {
        const response = await openai.images.generate({
            model: "dall-e-3",
            prompt: prompt,
            n: 1,
            size: "1024x1024",
            quality: "standard"
        });

        return response.data[0].url;
    } catch (error) {
        console.error(`Failed to generate avatar for ${horse.name}:`, error.message);
        return null;
    }
}

async function uploadToStorage(imageUrl, horseId) {
    try {
        // Fetch the image
        const response = await fetch(imageUrl);
        const blob = await response.blob();
        const buffer = Buffer.from(await blob.arrayBuffer());

        const fileName = `horse-${horseId}-avatar.png`;
        const filePath = `avatars/horses/${fileName}`;

        // Upload to Supabase storage
        const { data, error } = await supabase.storage
            .from('avatars')
            .upload(filePath, buffer, {
                contentType: 'image/png',
                upsert: true
            });

        if (error) throw error;

        // Get public URL
        const { data: urlData } = supabase.storage
            .from('avatars')
            .getPublicUrl(filePath);

        return urlData.publicUrl;
    } catch (error) {
        console.error('Upload error:', error);
        return null;
    }
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'POST only' });
    }

    const limit = parseInt(req.query.limit) || 5; // Process 5 at a time to avoid timeout

    console.log(`🎨 Generating avatars for up to ${limit} horses...`);

    try {
        // Get horses without avatars
        const { data: horses, error } = await supabase
            .from('content_authors')
            .select('id, name, gender, location, specialty, profile_id')
            .is('avatar_url', null)
            .not('profile_id', 'is', null)
            .limit(limit);

        if (error) throw error;
        if (!horses?.length) {
            return res.status(200).json({ message: 'All horses have avatars!', generated: 0 });
        }

        const results = [];

        for (const horse of horses) {
            console.log(`🎨 Generating avatar for ${horse.name}...`);

            // Generate avatar
            const tempUrl = await generateAvatar(horse);
            if (!tempUrl) {
                results.push({ horse: horse.name, success: false, error: 'Generation failed' });
                continue;
            }

            // Upload to storage
            const permanentUrl = await uploadToStorage(tempUrl, horse.id);
            if (!permanentUrl) {
                results.push({ horse: horse.name, success: false, error: 'Upload failed' });
                continue;
            }

            // Update content_authors
            await supabase
                .from('content_authors')
                .update({ avatar_url: permanentUrl })
                .eq('id', horse.id);

            // Update profiles
            await supabase
                .from('profiles')
                .update({ avatar_url: permanentUrl })
                .eq('id', horse.profile_id);

            console.log(`✅ ${horse.name} got their avatar!`);
            results.push({ horse: horse.name, success: true, url: permanentUrl });

            // Small delay between generations
            await new Promise(r => setTimeout(r, 2000));
        }

        return res.status(200).json({
            success: true,
            generated: results.filter(r => r.success).length,
            remaining: await getRemainingCount(),
            results
        });

    } catch (error) {
        console.error('Avatar generation error:', error);
        return res.status(500).json({ error: error.message });
    }
}

async function getRemainingCount() {
    const { count } = await supabase
        .from('content_authors')
        .select('*', { count: 'exact', head: true })
        .is('avatar_url', null)
        .not('profile_id', 'is', null);
    return count || 0;
}

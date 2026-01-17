/**
 * 🤖 AI AVATAR GENERATION - TEXT TO IMAGE
 * Uses OpenAI's DALL-E 3 to generate avatars from text descriptions
 * Downloads and uploads to Supabase Storage to avoid CORS issues
 */

import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { prompt, userId } = req.body;

        if (!prompt) {
            return res.status(400).json({ error: 'Prompt is required' });
        }

        console.log('🎨 Generating avatar from text with DALL-E 3:', prompt);

        // STRICT AVATAR PROMPT - Character only, transparent-friendly background
        const strictAvatarPrompt = `Create a 3D Pixar-style CHARACTER PORTRAIT ONLY. 
Subject: ${prompt}
STRICT RULES:
- ONLY the character's head and upper shoulders (bust portrait)
- SIMPLE, CLEAN, SOLID BACKGROUND that can be easily removed (plain color, no gradients or textures)
- NO poker tables, NO cards, NO chips, NO props in the background
- NO scene, NO environment, NO accessories around character  
- Face must be the MAIN FOCUS with clear edges
- High quality 3D render like Pixar/Disney animation
- Vibrant colors, detailed facial features
- Professional avatar suitable for profile picture
- The character should embody the description given: ${prompt}
IMPORTANT: This is for a poker player avatar - just the character portrait with a simple background that can be removed.`;

        // Use DALL-E 3 for high-quality generation
        const response = await openai.images.generate({
            model: "dall-e-3",
            prompt: strictAvatarPrompt,
            n: 1,
            size: "1024x1024",
            quality: "hd",
            style: "vivid"
        });

        const openaiImageUrl = response.data[0].url;
        console.log('✅ DALL-E generated image, now downloading...');

        // Download the image from OpenAI (server-side, no CORS issue)
        const imageResponse = await fetch(openaiImageUrl);
        const arrayBuffer = await imageResponse.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Generate unique filename
        const timestamp = Date.now();
        const safeUserId = userId || 'anonymous';
        const filename = `${safeUserId}_${timestamp}.png`;
        const storagePath = `generated/${filename}`;

        // Upload to Supabase Storage
        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('custom-avatars')
            .upload(storagePath, buffer, {
                contentType: 'image/png',
                cacheControl: '3600',
                upsert: true
            });

        if (uploadError) {
            console.error('❌ Supabase upload error:', uploadError);
            throw new Error('Failed to upload avatar to storage');
        }

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
            .from('custom-avatars')
            .getPublicUrl(storagePath);

        console.log('✅ Avatar uploaded to Supabase:', publicUrl);

        return res.status(200).json({
            success: true,
            imageUrl: publicUrl
        });

    } catch (error) {
        console.error('❌ Avatar generation error:', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Failed to generate avatar'
        });
    }
}

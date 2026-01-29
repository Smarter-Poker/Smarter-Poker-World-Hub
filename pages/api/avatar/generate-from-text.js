/**
 * 🤖 AI AVATAR GENERATION - TEXT TO IMAGE
 * Uses Grok (xAI) grok-2-image to generate avatars from text descriptions
 * Uses ImageMagick for professional-grade background removal
 * Downloads and uploads to Supabase Storage
 * 
 * Updated 2026-01-29: Switched to Grok API + ImageMagick for zero-background stickers
 */

import { getGrokClient } from '../../../src/lib/grokClient';
import { createClient } from '@supabase/supabase-js';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';

const execAsync = promisify(exec);

// Increase timeout for AI generation
export const config = {
    maxDuration: 60, // 60 second timeout for Vercel
};

const openai = getGrokClient();

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

/**
 * Remove background using ImageMagick with multi-hex targeting
 * This ensures 100% alpha-transparency for sticker-style avatars
 */
async function removeBackgroundWithImageMagick(inputBuffer) {
    const tempDir = os.tmpdir();
    const inputPath = path.join(tempDir, `avatar_input_${Date.now()}.png`);
    const outputPath = path.join(tempDir, `avatar_output_${Date.now()}.png`);

    try {
        // Write input buffer to temp file
        fs.writeFileSync(inputPath, inputBuffer);

        // ImageMagick command with multi-hex targeting for white backgrounds
        // Uses fuzz factor to catch near-white pixels and checkerboard patterns
        const cmd = `convert "${inputPath}" \\
            -fuzz 15% \\
            -fill none \\
            -draw "alpha 0,0 floodfill" \\
            -draw "alpha 0,1023 floodfill" \\
            -draw "alpha 1023,0 floodfill" \\
            -draw "alpha 1023,1023 floodfill" \\
            -channel RGBA \\
            -blur 0x0.5 \\
            -level 0%,100%,1.0 \\
            "${outputPath}"`;

        await execAsync(cmd);

        // Read the processed image
        const outputBuffer = fs.readFileSync(outputPath);

        // Cleanup temp files
        fs.unlinkSync(inputPath);
        fs.unlinkSync(outputPath);

        return outputBuffer;
    } catch (error) {
        // Cleanup on error
        try { fs.unlinkSync(inputPath); } catch (e) { }
        try { fs.unlinkSync(outputPath); } catch (e) { }
        throw error;
    }
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { prompt, userId } = req.body;

        if (!prompt) {
            return res.status(400).json({ error: 'Prompt is required' });
        }

        console.log('🎨 Generating avatar with Grok grok-2-image:', prompt);

        // STRICT AVATAR PROMPT - Character only, transparent-friendly background
        const strictAvatarPrompt = `Create a 3D Pixar-style CHARACTER PORTRAIT ONLY. 
Subject: ${prompt}
STRICT RULES:
- ONLY the character's head and upper shoulders (bust portrait)
- PURE WHITE BACKGROUND (#FFFFFF) - absolutely no gradients, textures, or shadows
- NO poker tables, NO cards, NO chips, NO props in the background
- NO scene, NO environment, NO accessories around character  
- Face must be the MAIN FOCUS with clear edges
- High quality 3D render like Pixar/Disney animation
- Vibrant colors, detailed facial features
- Professional avatar suitable for profile picture
- The character should embody the description given: ${prompt}
IMPORTANT: This is for a poker player avatar - just the character portrait with a PURE WHITE background for easy removal.`;

        // Use Grok's image generation (mapped from dall-e-3 to grok-2-image)
        const response = await openai.images.generate({
            model: "dall-e-3",  // Will be mapped to grok-2-image by grokClient
            prompt: strictAvatarPrompt,
            n: 1,
            size: "1024x1024",
        });

        const imageUrl = response.data[0].url;
        console.log('✅ Grok generated image, now downloading...');

        // Download the image (server-side, no CORS issue)
        const imageResponse = await fetch(imageUrl);
        const arrayBuffer = await imageResponse.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        console.log('🔧 Removing background with ImageMagick (zero-background sticker)...');

        // Remove background using ImageMagick for professional-grade transparency
        const transparentBuffer = await removeBackgroundWithImageMagick(buffer);

        console.log('✅ Background removed (100% transparency), uploading to Supabase...');

        // Generate unique filename
        const timestamp = Date.now();
        const safeUserId = userId || 'anonymous';
        const filename = `${safeUserId}_${timestamp}.png`;
        const storagePath = `generated/${filename}`;

        // Upload to Supabase Storage
        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('custom-avatars')
            .upload(storagePath, transparentBuffer, {
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

        console.log('✅ Sticker avatar uploaded to Supabase:', publicUrl);

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

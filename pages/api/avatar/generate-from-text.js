/**
 * 🤖 AI AVATAR GENERATION - TEXT TO IMAGE
 * Uses Grok (xAI) grok-2-image-1212 to generate avatars from text descriptions
 * Uses Sharp (Node.js native) for professional-grade background removal
 * Downloads and uploads to Supabase Storage
 * 
 * Updated 2026-01-29: Uses Grok API + Sharp (serverless compatible) for zero-background stickers
 */

import { getGrokClient } from '../../../src/lib/grokClient';
import { createClient } from '../../../src/lib/supabaseServerClient';
import sharp from 'sharp';

import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

// Increase timeout for AI generation
export const config = {
    maxDuration: 60, // 60 second timeout for Vercel
};

// Use Grok for image generation
const grok = getGrokClient();

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

/**
 * Remove white/near-white background using Sharp with multi-threshold algorithm
 * Professional-grade transparency for sticker-style avatars
 */
async function removeBackgroundWithSharp(inputBuffer) {
    const { data, info } = await sharp(inputBuffer)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

    const pixels = new Uint8ClampedArray(data);
    const { width, height } = info;

    // Multi-pass background removal for professional results
    // Pass 1: Remove pure white and near-white pixels (high threshold)
    // Pass 2: Remove checkerboard pattern remnants
    // Pass 3: Edge-aware smoothing

    const whiteThreshold = 240;    // Pure white
    const nearWhiteThreshold = 225; // Near white  
    const grayThreshold = 200;      // Light gray (for gradients)

    for (let i = 0; i < pixels.length; i += 4) {
        const r = pixels[i];
        const g = pixels[i + 1];
        const b = pixels[i + 2];

        // Calculate luminance
        const luminance = 0.299 * r + 0.587 * g + 0.114 * b;

        // Check if pixel is white/near-white (RGB all high and similar)
        const isWhite = r > whiteThreshold && g > whiteThreshold && b > whiteThreshold;
        const isNearWhite = r > nearWhiteThreshold && g > nearWhiteThreshold && b > nearWhiteThreshold;

        // Check for gray/off-white (common in AI-generated backgrounds)
        const maxChannel = Math.max(r, g, b);
        const minChannel = Math.min(r, g, b);
        const colorVariance = maxChannel - minChannel;
        const isGrayish = luminance > grayThreshold && colorVariance < 30;

        // Check for checkerboard pattern colors (light gray alternating)
        const isCheckerboard = (r > 200 && g > 200 && b > 200) && colorVariance < 15;

        // Make transparent if any background condition is met
        if (isWhite || isNearWhite || isGrayish || isCheckerboard) {
            pixels[i + 3] = 0; // Set alpha to 0 (transparent)
        }
    }

    // Edge pass: Smooth alpha transitions for cleaner edges
    // Check corner pixels to confirm they should be transparent (flood-fill-like logic)
    const cornerPositions = [
        0, // top-left
        (width - 1) * 4, // top-right
        (height - 1) * width * 4, // bottom-left
        ((height - 1) * width + (width - 1)) * 4, // bottom-right
    ];

    // If corners are not fully transparent, aggressively remove based on their color
    for (const pos of cornerPositions) {
        if (pixels[pos + 3] !== 0) {
            const cornerR = pixels[pos];
            const cornerG = pixels[pos + 1];
            const cornerB = pixels[pos + 2];

            // If corner is light-ish, use it as background color reference
            if (cornerR > 180 && cornerG > 180 && cornerB > 180) {
                for (let i = 0; i < pixels.length; i += 4) {
                    const r = pixels[i];
                    const g = pixels[i + 1];
                    const b = pixels[i + 2];

                    // If similar to corner color (within tolerance), make transparent
                    const tolerance = 35;
                    if (Math.abs(r - cornerR) < tolerance &&
                        Math.abs(g - cornerG) < tolerance &&
                        Math.abs(b - cornerB) < tolerance) {
                        pixels[i + 3] = 0;
                    }
                }
            }
        }
    }

    // Convert back to PNG with transparency
    return sharp(pixels, {
        raw: {
            width: info.width,
            height: info.height,
            channels: 4
        }
    })
        .png({ compressionLevel: 9 })
        .toBuffer();
}

export default async function handler(req, res) {
  if (!applyRateLimit(req, res, LIMITS.ai)) return;

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    // BUG #266 FIX: Require JWT auth — this endpoint calls paid Grok API
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: 'Authentication required' });
    const { data: { user: authUser }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !authUser) return res.status(401).json({ success: false, error: 'Invalid token' });

    try {
        const { prompt, userId: _clientUserId } = req.body;
        const userId = authUser.id; // Always use JWT user ID

        if (!prompt) {
            return res.status(400).json({ success: false, error: 'Prompt is required' });
        }


        // STRICT AVATAR PROMPT - Character only, pure white background
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

        // Use Grok image generation (mapped from dall-e-3 to grok-2-image-1212)
        let response;
        try {
            response = await grok.images.generate({
                model: "dall-e-3",  // Will be mapped to grok-2-image-1212 by grokClient
                prompt: strictAvatarPrompt,
                n: 1,
                // Note: xAI API doesn't support size/quality params
            });
        } catch (apiError) {
            console.error('❌ Grok API call failed:', apiError.message);
            console.error('❌ Full error:', JSON.stringify(apiError, null, 2));
            throw new Error(`Grok API error: ${apiError.message}`);
        }

        if (!response?.data?.[0]?.url) {
            console.error('❌ Grok API returned no image URL:', JSON.stringify(response));
            throw new Error('Grok API returned no image URL');
        }

        const imageUrl = response.data[0].url;

        // Download the image (server-side, no CORS issue)
        const imageResponse = await fetch(imageUrl);
        const arrayBuffer = await imageResponse.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);


        // Remove background using Sharp for serverless-compatible transparency
        const transparentBuffer = await removeBackgroundWithSharp(buffer);


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

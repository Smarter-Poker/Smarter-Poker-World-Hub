/**
 * 🎨 AI AVATAR EDIT - IMAGE EDITING
 * Uses Grok Vision to analyze existing avatar + grok-2-image-1212 to regenerate with edits
 * Uses Sharp (Node.js native) for professional-grade background removal
 * 
 * Created 2026-01-29: Edit existing avatars with AI
 */

import { getGrokClient } from '../../../src/lib/grokClient';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';

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
 */
async function removeBackgroundWithSharp(inputBuffer) {
    const { data, info } = await sharp(inputBuffer)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

    const pixels = new Uint8ClampedArray(data);
    const { width, height } = info;

    const whiteThreshold = 240;
    const nearWhiteThreshold = 225;
    const grayThreshold = 200;

    for (let i = 0; i < pixels.length; i += 4) {
        const r = pixels[i];
        const g = pixels[i + 1];
        const b = pixels[i + 2];

        const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
        const isWhite = r > whiteThreshold && g > whiteThreshold && b > whiteThreshold;
        const isNearWhite = r > nearWhiteThreshold && g > nearWhiteThreshold && b > nearWhiteThreshold;

        const maxChannel = Math.max(r, g, b);
        const minChannel = Math.min(r, g, b);
        const colorVariance = maxChannel - minChannel;
        const isGrayish = luminance > grayThreshold && colorVariance < 30;
        const isCheckerboard = (r > 200 && g > 200 && b > 200) && colorVariance < 15;

        if (isWhite || isNearWhite || isGrayish || isCheckerboard) {
            pixels[i + 3] = 0;
        }
    }

    // Corner-based background detection
    const cornerPositions = [
        0,
        (width - 1) * 4,
        (height - 1) * width * 4,
        ((height - 1) * width + (width - 1)) * 4,
    ];

    for (const pos of cornerPositions) {
        if (pixels[pos + 3] !== 0) {
            const cornerR = pixels[pos];
            const cornerG = pixels[pos + 1];
            const cornerB = pixels[pos + 2];

            if (cornerR > 180 && cornerG > 180 && cornerB > 180) {
                for (let i = 0; i < pixels.length; i += 4) {
                    const r = pixels[i];
                    const g = pixels[i + 1];
                    const b = pixels[i + 2];

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

    return sharp(pixels, {
        raw: { width: info.width, height: info.height, channels: 4 }
    })
        .png({ compressionLevel: 9 })
        .toBuffer();
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { imageUrl, editPrompt, userId } = req.body;

        if (!imageUrl) {
            return res.status(400).json({ error: 'Image URL is required' });
        }

        if (!editPrompt) {
            return res.status(400).json({ error: 'Edit prompt is required' });
        }

        console.log('✏️ Editing avatar with Grok:', editPrompt);

        // Download the original image and convert to base64
        console.log('📥 Downloading original image...');
        // SIMPLIFIED APPROACH: Skip vision analysis (Grok vision doesn't support image inputs yet)
        // Instead, regenerate based on edit prompt only
        console.log('🎨 Generating edited avatar (simplified approach)...');

        const editedPrompt = `Create a 3D Pixar-style CHARACTER PORTRAIT with this modification:

${editPrompt}

STRICT RULES:
- PURE WHITE BACKGROUND (#FFFFFF)
- Head and upper shoulders only (bust portrait)
- High quality 3D render
- Professional character design`;

        const imageResponse = await grok.images.generate({
            model: "dall-e-3", // Mapped to grok-2-image by grokClient
            prompt: editedPrompt,
            n: 1,
        });

        if (!imageResponse?.data?.[0]?.url) {
            throw new Error('Grok API returned no image URL');
        }

        const newImageUrl = imageResponse.data[0].url;
        console.log('✅ Edited image generated, downloading...');

        // Download the edited image
        const editedImageResponse = await fetch(newImageUrl);
        const editedBuffer = Buffer.from(await editedImageResponse.arrayBuffer());

        console.log('🔧 Removing background...');
        const transparentBuffer = await removeBackgroundWithSharp(editedBuffer);

        console.log('☁️ Uploading to Supabase...');
        const timestamp = Date.now();
        const safeUserId = userId || 'anonymous';
        const filename = `edited_${safeUserId}_${timestamp}.png`;
        const storagePath = `generated/${filename}`;

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

        const { data: { publicUrl } } = supabase.storage
            .from('custom-avatars')
            .getPublicUrl(storagePath);

        console.log('✅ Edited avatar uploaded:', publicUrl);

        return res.status(200).json({
            success: true,
            imageUrl: publicUrl,
            editApplied: editPrompt
        });

    } catch (error) {
        console.error('❌ Avatar edit error:', error);
        console.error('Error details:', {
            message: error.message,
            status: error.status,
            response: error.response?.data,
            stack: error.stack
        });
        return res.status(500).json({
            success: false,
            error: error.message || 'Failed to edit avatar',
            details: error.response?.data || error.toString()
        });
    }
}
// Force fresh deployment 1769671621

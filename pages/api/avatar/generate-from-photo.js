/**
 * 🤖 AI AVATAR GENERATION - PHOTO TO IMAGE (LIKENESS)
 * Uses Grok Vision to analyze photo + grok-2-image-1212 to generate avatar
 * Uses Sharp (Node.js native) for professional-grade background removal
 * Downloads and uploads to Supabase Storage
 * 
 * Updated 2026-01-29: Uses Grok API + Sharp (serverless compatible) for zero-background stickers
 */

import { getGrokClient } from '../../../src/lib/grokClient';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';

// Increase body size limit for base64 images (10MB)
export const config = {
    api: {
        bodyParser: {
            sizeLimit: '10mb',
        },
        responseLimit: false,
    },
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
        const { photoBase64, prompt, userId } = req.body;

        if (!photoBase64) {
            return res.status(400).json({ error: 'Photo is required' });
        }

        console.log('🎨 Generating avatar from photo with Grok Vision + grok-2-image');
        console.log('📏 Photo base64 length:', photoBase64?.length || 0);

        // Step 1: Use Grok Vision to analyze the photo
        const analysisResponse = await grok.chat.completions.create({
            model: "grok-3",  // Grok-3 for analysis
            messages: [
                {
                    role: "user",
                    content: [
                        {
                            type: "text",
                            text: `Analyze this person's appearance in EXTREME detail for avatar creation. Be VERY specific about:

1. FACE SHAPE: (oval, round, square, heart, oblong, etc.)
2. SKIN TONE: (exact shade - fair, olive, tan, brown, dark, with undertones)
3. HAIR: Exact color, style, texture, length
4. EYES: Exact color, shape, size
5. EYEBROWS: Shape, thickness, color
6. NOSE: Size, shape
7. LIPS: Shape, fullness
8. DISTINCTIVE FEATURES: Dimples, freckles, beauty marks
9. OVERALL VIBE: Expression, energy
10. AGE RANGE: Approximate age

Be specific - this creates a Pixar-style avatar that should be RECOGNIZABLE as this person.`
                        },
                        {
                            type: "image_url",
                            image_url: { url: photoBase64 }
                        }
                    ]
                }
            ],
            max_tokens: 800
        });

        const faceDescription = analysisResponse.choices[0].message.content;
        console.log('📝 Face analysis:', faceDescription);

        // Step 2: Generate avatar with grok-2-image
        const additionalStyle = prompt ? `ADDITIONAL STYLE REQUESTS: ${prompt}. ` : '';
        const dallePrompt = `Create a 3D Pixar/Disney-style cartoon PORTRAIT that MATCHES these EXACT features:

${faceDescription}

${additionalStyle}

CRITICAL REQUIREMENTS:
- This avatar MUST be recognizable as the person described above
- MATCH the exact face shape, skin tone, hair color/style described
- Head and upper shoulders only (bust portrait)
- PURE WHITE BACKGROUND (#FFFFFF)
- NO props, NO accessories, NO poker chips, NO cards
- High quality 3D render with Pixar-level detail

The goal is that if someone knows this person, they would IMMEDIATELY recognize this avatar.`;

        const imageResponse = await grok.images.generate({
            model: "dall-e-3",  // Mapped to grok-2-image by grokClient
            prompt: dallePrompt,
            n: 1,
            size: "1024x1024",
        });

        const imageUrl = imageResponse.data[0].url;
        console.log('✅ Grok generated likeness, now downloading...');

        const imgResponse = await fetch(imageUrl);
        const arrayBuffer = await imgResponse.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        console.log('🔧 Removing background with Sharp (zero-background sticker)...');

        const transparentBuffer = await removeBackgroundWithSharp(buffer);

        console.log('✅ Background removed (100% transparency), uploading to Supabase...');

        const timestamp = Date.now();
        const safeUserId = userId || 'anonymous';
        const filename = `likeness_${safeUserId}_${timestamp}.png`;
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

        console.log('✅ Sticker avatar uploaded to Supabase:', publicUrl);

        return res.status(200).json({
            success: true,
            imageUrl: publicUrl,
            faceDescription: faceDescription
        });

    } catch (error) {
        console.error('❌ Photo avatar generation error:', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Failed to generate avatar from photo'
        });
    }
}

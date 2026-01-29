/**
 * 🤖 AI AVATAR GENERATION - PHOTO TO IMAGE (LIKENESS)
 * Uses OpenAI Vision to analyze photo + DALL-E 3 to generate avatar
 * Downloads and uploads to Supabase Storage to avoid CORS issues
 */

import { getGrokClient } from '../../../src/lib/grokClient';
import { createClient } from '@supabase/supabase-js';

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

const openai = getGrokClient();

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { photoBase64, prompt, userId } = req.body;

        if (!photoBase64) {
            return res.status(400).json({ error: 'Photo is required' });
        }

        console.log('🎨 Generating avatar from photo with GPT-4 Vision + DALL-E 3');
        console.log('📏 Photo base64 length:', photoBase64?.length || 0);

        // Step 1: Use GPT-4 Vision to analyze the photo with MORE DETAIL
        const analysisResponse = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "user",
                    content: [
                        {
                            type: "text",
                            text: `Analyze this person's appearance in EXTREME detail for avatar creation. Be VERY specific about:

1. FACE SHAPE: (oval, round, square, heart, oblong, etc.)
2. SKIN TONE: (exact shade - fair, olive, tan, brown, dark, with undertones)
3. HAIR: 
   - Exact color (not just "brown" but "warm chestnut brown with golden highlights")
   - Style (wavy, straight, curly, length, parting)
   - Texture
4. EYES:
   - Exact color and any unique patterns
   - Shape (almond, round, hooded, etc.)
   - Size relative to face
5. EYEBROWS: Shape, thickness, color, arch
6. NOSE: Size, shape, bridge width
7. LIPS: Shape, fullness, natural color
8. DISTINCTIVE FEATURES: Dimples, freckles, beauty marks, smile characteristics
9. OVERALL VIBE: Expression, energy, personality that comes through
10. AGE RANGE: Approximate age appearance

Be as specific as possible - this will create a Pixar-style avatar that should be RECOGNIZABLE as this person.`
                        },
                        {
                            type: "image_url",
                            image_url: {
                                url: photoBase64
                            }
                        }
                    ]
                }
            ],
            max_tokens: 800
        });

        const faceDescription = analysisResponse.choices[0].message.content;
        console.log('📝 Face analysis:', faceDescription);

        // Step 2: Generate avatar with DALL-E 3 using the detailed analysis
        const additionalStyle = prompt ? `ADDITIONAL STYLE REQUESTS: ${prompt}. ` : '';
        const dallePrompt = `Create a 3D Pixar/Disney-style cartoon PORTRAIT that MATCHES these EXACT features:

${faceDescription}

${additionalStyle}

CRITICAL REQUIREMENTS:
- This avatar MUST be recognizable as the person described above
- MATCH the exact face shape, skin tone, hair color/style described
- MATCH the eye color, eyebrow shape, and nose described  
- MATCH any distinctive features (dimples, beauty marks, etc.)
- The animated style should enhance but NOT change the core features
- Head and upper shoulders only (bust portrait)
- PURE WHITE BACKGROUND (#FFFFFF)
- NO props, NO accessories, NO poker chips, NO cards
- High quality 3D render with Pixar-level detail
- Warm, friendly expression matching the photo's energy

The goal is that if someone knows this person, they would IMMEDIATELY recognize this avatar as that person in cartoon form.`;

        const imageResponse = await openai.images.generate({
            model: "dall-e-3",
            prompt: dallePrompt,
            n: 1,
            size: "1024x1024",
            quality: "hd",
            style: "vivid"
        });

        const openaiImageUrl = imageResponse.data[0].url;
        console.log('✅ DALL-E generated likeness, now downloading...');

        // Download the image from OpenAI (server-side, no CORS issue)
        const imgResponse = await fetch(openaiImageUrl);
        const arrayBuffer = await imgResponse.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Generate unique filename
        const timestamp = Date.now();
        const safeUserId = userId || 'anonymous';
        const filename = `likeness_${safeUserId}_${timestamp}.png`;
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

        console.log('✅ Likeness avatar uploaded to Supabase:', publicUrl);

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


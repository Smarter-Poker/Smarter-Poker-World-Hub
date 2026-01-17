/**
 * 🤖 AI AVATAR GENERATION - PHOTO TO IMAGE (LIKENESS)
 * Uses OpenAI Vision to analyze photo + DALL-E 3 to generate avatar
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
        const { photoBase64, prompt, userId } = req.body;

        if (!photoBase64) {
            return res.status(400).json({ error: 'Photo is required' });
        }

        console.log('🎨 Generating avatar from photo with GPT-4 Vision + DALL-E 3');

        // Step 1: Use GPT-4 Vision to analyze the photo
        const analysisResponse = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "user",
                    content: [
                        {
                            type: "text",
                            text: "Analyze this person's facial features in detail. Describe their face shape, hair style, hair color, eye color, distinctive features, and overall appearance. Be specific and detailed. This will be used to create a 3D Pixar-style avatar that looks like them."
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
            max_tokens: 500
        });

        const faceDescription = analysisResponse.choices[0].message.content;
        console.log('📝 Face analysis:', faceDescription);

        // Step 2: Generate avatar with DALL-E 3 using the analysis
        const additionalStyle = prompt ? `Additional style: ${prompt}. ` : '';
        const dallePrompt = `Create a 3D Pixar-style CHARACTER PORTRAIT ONLY.
FACIAL FEATURES TO MATCH: ${faceDescription}
${additionalStyle}
STRICT RULES:
- ONLY the character's head and upper shoulders (bust portrait)
- PURE SOLID WHITE BACKGROUND - nothing else
- NO poker tables, NO cards, NO chips, NO props around character
- NO scene, NO environment, NO accessories
- Face must be the MAIN FOCUS and MATCH the described features
- High quality 3D render like Pixar/Disney animation
- Vibrant colors, detailed facial features that look like the person described
- Professional avatar suitable for profile picture
- Must look like a stylized 3D version of the person described
IMPORTANT: Character portrait ONLY on white background. Nothing else.`;

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

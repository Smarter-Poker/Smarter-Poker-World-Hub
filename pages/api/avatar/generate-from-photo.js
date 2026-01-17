/**
 * 🤖 AI AVATAR GENERATION - PHOTO TO IMAGE (LIKENESS)
 * Uses OpenAI Vision to analyze photo + DALL-E 3 to generate avatar
 */

import OpenAI from 'openai';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { photoBase64, prompt } = req.body;

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
        const additionalStyle = prompt ? `, ${prompt}` : '';
        const dallePrompt = `Create a 3D Pixar-style character portrait with these features: ${faceDescription}. Style: professional poker avatar, white background, vibrant colors, high quality, detailed${additionalStyle}`;

        const imageResponse = await openai.images.generate({
            model: "dall-e-3",
            prompt: dallePrompt,
            n: 1,
            size: "1024x1024",
            quality: "standard",
            style: "vivid"
        });

        const imageUrl = imageResponse.data[0].url;

        console.log('✅ Likeness avatar generated successfully');

        return res.status(200).json({
            success: true,
            imageUrl: imageUrl,
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

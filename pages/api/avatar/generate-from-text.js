/**
 * 🤖 AI AVATAR GENERATION - TEXT TO IMAGE
 * Uses OpenAI's DALL-E 3 to generate avatars from text descriptions
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
        const { prompt } = req.body;

        if (!prompt) {
            return res.status(400).json({ error: 'Prompt is required' });
        }

        console.log('🎨 Generating avatar from text with DALL-E 3:', prompt);

        // Use DALL-E 3 for high-quality generation
        const response = await openai.images.generate({
            model: "dall-e-3",
            prompt: prompt,
            n: 1,
            size: "1024x1024",
            quality: "standard",
            style: "vivid"
        });

        const imageUrl = response.data[0].url;

        console.log('✅ Avatar generated successfully');

        return res.status(200).json({
            success: true,
            imageUrl: imageUrl
        });

    } catch (error) {
        console.error('❌ Avatar generation error:', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Failed to generate avatar'
        });
    }
}

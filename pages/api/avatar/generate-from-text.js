/**
 * 🤖 AI AVATAR GENERATION - TEXT TO IMAGE
 * Uses Replicate's FLUX model to generate avatars from text descriptions
 */

import Replicate from 'replicate';

const replicate = new Replicate({
    auth: process.env.REPLICATE_API_TOKEN,
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

        console.log('🎨 Generating avatar from text:', prompt);

        // Use FLUX model for high-quality generation
        const output = await replicate.run(
            "black-forest-labs/flux-schnell",
            {
                input: {
                    prompt: prompt,
                    num_outputs: 1,
                    aspect_ratio: "1:1",
                    output_format: "png",
                    output_quality: 90
                }
            }
        );

        // Output is an array of image URLs
        const imageUrl = Array.isArray(output) ? output[0] : output;

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

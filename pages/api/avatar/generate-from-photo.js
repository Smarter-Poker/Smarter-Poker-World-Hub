/**
 * 🤖 AI AVATAR GENERATION - PHOTO TO IMAGE (LIKENESS)
 * Uses Replicate's image-to-image model to create avatars from user photos
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
        const { photoBase64, prompt } = req.body;

        if (!photoBase64) {
            return res.status(400).json({ error: 'Photo is required' });
        }

        console.log('🎨 Generating avatar from photo with likeness');

        // Use InstantID for face-preserving generation
        const output = await replicate.run(
            "zsxkib/instant-id",
            {
                input: {
                    image: photoBase64,
                    prompt: prompt || "3D Pixar-style poker avatar, professional quality, white background",
                    negative_prompt: "blurry, low quality, distorted, deformed, unrealistic",
                    num_outputs: 1,
                    guidance_scale: 5,
                    num_inference_steps: 30,
                    ip_adapter_scale: 0.8,
                    controlnet_conditioning_scale: 0.8
                }
            }
        );

        // Output is an array of image URLs
        const imageUrl = Array.isArray(output) ? output[0] : output;

        console.log('✅ Likeness avatar generated successfully');

        return res.status(200).json({
            success: true,
            imageUrl: imageUrl
        });

    } catch (error) {
        console.error('❌ Photo avatar generation error:', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Failed to generate avatar from photo'
        });
    }
}

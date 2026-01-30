/* ═══════════════════════════════════════════════════════════════════════════
   SCREENSHOT ANALYSIS API — Analyze poker table screenshots using Grok Vision
   ═══════════════════════════════════════════════════════════════════════════ */

import { getGrokClient } from '../../../src/services/grokClient';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { image } = req.body;

        if (!image) {
            return res.status(400).json({ error: 'Image is required' });
        }

        const grok = getGrokClient();

        // Use Grok Vision to analyze the screenshot
        const response = await grok.chat.completions.create({
            model: 'grok-2-vision-1212',
            messages: [
                {
                    role: 'system',
                    content: `You are Geeves, a world-class poker strategy expert analyzing a poker table screenshot.

When analyzing a screenshot:
1. Identify the poker variant (Hold'em, PLO, etc.)
2. Read the board cards if visible
3. Note stack sizes and pot size
4. Identify player positions
5. Read any hole cards shown
6. Assess the current action

Provide strategic advice based on what you see. Be specific and actionable.
If anything is unclear, mention it but still provide the best analysis you can.`
                },
                {
                    role: 'user',
                    content: [
                        {
                            type: 'text',
                            text: 'Please analyze this poker table screenshot and provide strategic advice.'
                        },
                        {
                            type: 'image_url',
                            image_url: {
                                url: image
                            }
                        }
                    ]
                }
            ],
            max_tokens: 1000
        });

        const analysis = response.choices[0]?.message?.content ||
            "I couldn't analyze this image. Please try a clearer screenshot of the poker table.";

        return res.status(200).json({
            analysis,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('[analyze-screenshot] Error:', error);
        return res.status(500).json({
            error: 'Failed to analyze screenshot',
            details: error.message
        });
    }
}

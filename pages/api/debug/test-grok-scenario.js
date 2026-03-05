/**
 * Debug: Test Grok Scenario Generation
 * POST /api/debug/test-grok-scenario
 * 
 * Tests the Grok AI integration for Memory Matrix scenarios.
 * Returns whether Grok generated the scenario or if fallback was used.
 */

import { getGrokClient } from '../../../src/lib/grokClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];

export default async function handler(req, res) {
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }

    // Block debug endpoints in production
    if (process.env.NODE_ENV === 'production') {
        return res.status(404).json({ success: false, error: 'Not found' });
    }
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    const { level = 3, position = 'BTN', stackDepth = 100 } = req.body;


    try {
        const grok = getGrokClient();

        const prompt = `Generate a GTO poker scenario for Memory Matrix training:

Level: ${level}
Position: ${position}
Stack Depth: ${stackDepth}bb

Return a JSON object with:
{
    "id": "test-${Date.now()}",
    "level": ${level},
    "title": "[Creative title for this spot]",
    "position": "${position}",
    "stackDepth": ${stackDepth},
    "description": "[2 sentences about this spot]",
    "tip": "[Memory tip for the range]",
    "solution": {
        "AA": "raise",
        "KK": "raise",
        ... (15-30 hands with actions: raise/call/fold/3bet)
    }
}

Return ONLY valid JSON.`;

        const startTime = Date.now();

        const completion = await grok.chat.completions.create({
            model: 'grok-3',
            messages: [
                {
                    role: 'system',
                    content: 'You are a GTO poker expert. Respond with valid JSON only.'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            temperature: 0.7,
            max_tokens: 2000,
        });

        const responseTime = Date.now() - startTime;
        const responseText = completion.choices[0]?.message?.content;

        if (!responseText) {
            return res.status(500).json({
                success: false,
                grokGenerated: false,
                error: 'Empty response from Grok',
                responseTime
            });
        }

        // Parse JSON response
        const cleanedResponse = responseText
            .replace(/```json\n?/g, '')
            .replace(/```\n?/g, '')
            .trim();

        const scenario = JSON.parse(cleanedResponse);

        // Validate it has required fields
        const hasRequiredFields = scenario.title && scenario.solution && Object.keys(scenario.solution).length > 0;


        return res.status(200).json({
            success: true,
            grokGenerated: true,
            responseTime,
            scenario: {
                id: scenario.id,
                level: scenario.level,
                title: scenario.title,
                position: scenario.position,
                stackDepth: scenario.stackDepth,
                description: scenario.description,
                tip: scenario.tip,
                handCount: Object.keys(scenario.solution || {}).length,
                sampleHands: Object.entries(scenario.solution || {}).slice(0, 5)
            },
            valid: hasRequiredFields
        });

    } catch (error) {
        console.error('[TestGrok] Error:', error.message);

        return res.status(500).json({
            success: false,
            grokGenerated: false,
            error: error.message,
            errorType: error.constructor.name
        });
    }
}

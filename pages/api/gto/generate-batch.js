/**
 * 🤖 Batch GTO Scenario Generation API
 * 
 * Generates multiple scenarios at once for library expansion.
 * 
 * POST /api/gto/generate-batch
 * Body: { level, count, position?, stackDepth?, format? }
 */

import { getGrokClient } from '../../../src/lib/grokClient';

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];

// Position configurations by level
const POSITION_CONFIGS = {
    1: ['UTG', 'MP', 'HJ'],
    2: ['UTG', 'MP', 'HJ', 'CO'],
    3: ['UTG', 'MP', 'HJ', 'CO', 'BTN'],
    4: ['UTG', 'MP', 'HJ', 'CO', 'BTN', 'SB'],
    5: ['UTG', 'MP', 'HJ', 'CO', 'BTN', 'SB', 'BB'],
    6: ['CO', 'BTN', 'SB', 'BB'],
    7: ['SB', 'BB'],
    8: ['UTG', 'MP', 'HJ', 'CO', 'BTN', 'SB', 'BB'],
    9: ['BTN', 'SB', 'BB'],
    10: ['UTG', 'CO', 'BTN', 'BB'],
};

const STACK_DEPTHS = {
    1: [100],
    2: [100, 50],
    3: [100, 50, 200],
    4: [100, 50, 200, 30],
    5: [100, 50, 200, 30, 150],
    6: [100, 50, 30],
    7: [20, 25, 30],
    8: [100, 200, 150],
    9: [30, 40, 50],
    10: [100, 200, 30, 50],
};

const FORMATS = {
    1: ['Cash 6-max'],
    2: ['Cash 6-max', 'Cash 9-max'],
    3: ['Cash 6-max', 'Cash 9-max', 'MTT'],
    4: ['Cash 6-max', 'Cash 9-max', 'MTT', 'Spin & Go'],
    5: ['Cash 6-max', 'Cash 9-max', 'MTT', 'Spin & Go'],
    6: ['Cash 6-max', 'MTT'],
    7: ['MTT', 'Spin & Go'],
    8: ['Cash 6-max deep', 'Cash 9-max deep'],
    9: ['MTT FT', 'Spin & Go HU'],
    10: ['Cash 6-max', 'MTT', 'Spin & Go', 'Mixed'],
};

const SCENARIO_TYPES = {
    1: ['Open Raise Range'],
    2: ['Open Raise Range', '3-Bet Defense'],
    3: ['Open Raise Range', '3-Bet Defense', 'Squeeze Range'],
    4: ['Open Raise Range', '3-Bet Defense', 'Squeeze Range', 'vs 4-Bet'],
    5: ['Open Raise Range', '3-Bet Defense', 'Squeeze Range', 'vs 4-Bet', 'Blind vs Blind'],
    6: ['3-Bet Range', 'Cold 4-Bet', 'Mixed Frequency'],
    7: ['Push/Fold', 'ICM Spots', 'Bubble Play'],
    8: ['Deep Stack 3-Bet', 'Pot Control', 'Multiway Pots'],
    9: ['Final Table ICM', 'Heads-Up Ranges', 'Short Stack Play'],
    10: ['Expert Mixed', 'Exploitative Adjustments', 'GTO vs Exploit'],
};

export default async function handler(req, res) {
  // BUG #244 FIX: Require JWT auth — these routes use paid AI APIs
  const { createClient: _createAuthClient } = await import('@supabase/supabase-js');
  const _authSupa = _createAuthClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const _token = req.headers.authorization?.replace('Bearer ', '');
  if (!_token) return res.status(401).json({ error: 'Auth required' });
  const { data: { user: _authUser }, error: _authErr } = await _authSupa.auth.getUser(_token);
  if (_authErr || !_authUser) return res.status(401).json({ error: 'Invalid token' });

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { level = 1, count = 5 } = req.body;

        if (level < 1 || level > 10) {
            return res.status(400).json({ error: 'Level must be between 1 and 10' });
        }

        if (count < 1 || count > 10) {
            return res.status(400).json({ error: 'Count must be between 1 and 10' });
        }

        const grok = getGrokClient();
        const scenarios = [];
        const errors = [];

        // Generate scenarios one at a time to avoid rate limits
        for (let i = 0; i < count; i++) {
            try {
                const position = POSITION_CONFIGS[level][Math.floor(Math.random() * POSITION_CONFIGS[level].length)];
                const stackDepth = STACK_DEPTHS[level][Math.floor(Math.random() * STACK_DEPTHS[level].length)];
                const format = FORMATS[level][Math.floor(Math.random() * FORMATS[level].length)];
                const scenarioType = SCENARIO_TYPES[level][Math.floor(Math.random() * SCENARIO_TYPES[level].length)];

                const prompt = buildScenarioPrompt(level, position, stackDepth, format, scenarioType, i);

                const completion = await grok.chat.completions.create({
                    model: 'grok-3',
                    messages: [
                        {
                            role: 'system',
                            content: 'You are a GTO poker expert. Create precise, solver-accurate training scenarios. Respond with valid JSON only.'
                        },
                        { role: 'user', content: prompt }
                    ],
                    temperature: 0.8, // Higher variance for diversity
                    max_tokens: 2000,
                });

                const responseText = completion.choices[0]?.message?.content;
                if (responseText) {
                    const cleanedResponse = responseText
                        .replace(/```json\n?/g, '')
                        .replace(/```\n?/g, '')
                        .trim();
                    const scenario = JSON.parse(cleanedResponse);
                    scenario.id = `grok-l${level}-${Date.now()}-${i}`;
                    scenario.level = level;
                    scenario.position = position;
                    scenario.stackDepth = stackDepth;
                    scenarios.push(scenario);
                }

                // Small delay to avoid rate limits
                await new Promise(resolve => setTimeout(resolve, 500));

            } catch (genError) {
                console.error(`[BatchGenerate] Error on scenario ${i}:`, genError);
                errors.push({ index: i, error: genError.message });
            }
        }

        return res.status(200).json({
            success: true,
            generated: scenarios.length,
            requested: count,
            scenarios,
            errors: errors.length > 0 ? errors : undefined,
            meta: {
                level,
                generatedAt: new Date().toISOString(),
            }
        });

    } catch (error) {
        console.error('[BatchGenerate] Error:', error);
        return res.status(500).json({
            success: false,
            error: error.message,
        });
    }
}

function buildScenarioPrompt(level, position, stackDepth, format, scenarioType, index) {
    const difficultyDescriptions = {
        1: 'Beginner - Simple, clear ranges',
        2: 'Beginner+ - Slightly wider ranges',
        3: 'Intermediate - Multiple positions',
        4: 'Intermediate+ - 4-bet pots, squeezes',
        5: 'Advanced - Full position awareness',
        6: 'Advanced+ - Complex 3-bet trees',
        7: 'Expert - MTT/ICM push/fold',
        8: 'Expert+ - Deep stack mastery',
        9: 'Master - Final table ICM',
        10: 'GTO Master - Mixed strategies',
    };

    return `Generate a unique GTO poker scenario #${index + 1} with:

Level: ${level} (${difficultyDescriptions[level]})
Position: ${position}
Stack: ${stackDepth}bb
Format: ${format}
Type: ${scenarioType}

Return JSON:
{
    "title": "[Unique descriptive title]",
    "description": "[2-3 sentence explanation]",
    "tip": "[Memory tip for the range]",
    "solution": {
        "AA": "raise",
        "AKs": "raise",
        ... [Include ${15 + level * 3}-${20 + level * 5} hands]
    }
}

Use solver-accurate ranges. Mix strategies for level ${level}+.
JSON ONLY, no markdown.`;
}

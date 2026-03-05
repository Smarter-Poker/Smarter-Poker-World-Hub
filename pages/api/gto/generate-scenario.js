/**
 * 🤖 Live GTO Scenario Generation API
 * 
 * Generates poker training scenarios using Grok AI in real-time.
 * Returns complete scenarios with solution grids for Memory Matrix training.
 * 
 * POST /api/gto/generate-scenario
 * Body: { level, position, stackDepth, format }
 */

import { getGrokClient } from '../../../src/lib/grokClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

// Position configurations by difficulty
const POSITION_CONFIGS = {
    1: ['UTG', 'MP', 'HJ'],           // Beginner - Early positions only
    2: ['UTG', 'MP', 'HJ', 'CO'],     // Add cutoff
    3: ['UTG', 'MP', 'HJ', 'CO', 'BTN'], // Add button
    4: ['UTG', 'MP', 'HJ', 'CO', 'BTN', 'SB'], // Add small blind
    5: ['UTG', 'MP', 'HJ', 'CO', 'BTN', 'SB', 'BB'], // All positions
    6: ['CO', 'BTN', 'SB', 'BB'],     // Late position focus
    7: ['SB', 'BB'],                  // Blind battles
    8: ['UTG', 'MP', 'HJ', 'CO', 'BTN', 'SB', 'BB'], // All positions advanced
    9: ['BTN', 'SB', 'BB'],           // 3-bet pots
    10: ['UTG', 'CO', 'BTN', 'BB'],   // Expert mixed
};

const STACK_DEPTHS = {
    1: [100],                          // Standard only
    2: [100, 50],                      // Add short stack
    3: [100, 50, 200],                 // Add deep
    4: [100, 50, 200, 30],             // Add very short
    5: [100, 50, 200, 30, 150],        // All depths
    6: [100, 50, 30],                  // Short/Standard focus
    7: [20, 25, 30],                   // MTT push/fold
    8: [100, 200, 150],                // Deep stack mastery
    9: [30, 40, 50],                   // Tournament ICM
    10: [100, 200, 30, 50],            // Expert mixed
};

const FORMATS = {
    1: ['Cash 6-max'],
    2: ['Cash 6-max', 'Cash 9-max'],
    3: ['Cash 6-max', 'Cash 9-max', 'MTT'],
    4: ['Cash 6-max', 'Cash 9-max', 'MTT', 'Spin & Go'],
    5: ['Cash 6-max', 'Cash 9-max', 'MTT', 'Spin & Go'],
    6: ['Cash 6-max', 'MTT'],
    7: ['MTT', 'Spin & Go'],
    8: ['Cash 6-max deep', 'PLO 6-max'],
    9: ['MTT FT', 'Spin & Go HU'],
    10: ['Cash 6-max', 'MTT', 'Spin & Go', 'Mixed'],
};

// Scenario type templates
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

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];

export default async function handler(req, res) {
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }

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
        const { level = 1, position, stackDepth, format, scenarioType } = req.body;

        // Validate level
        if (level < 1 || level > 10) {
            return res.status(400).json({ error: 'Level must be between 1 and 10' });
        }

        // Get random config if not specified
        const selectedPosition = position || POSITION_CONFIGS[level][Math.floor(Math.random() * POSITION_CONFIGS[level].length)];
        const selectedStackDepth = stackDepth || STACK_DEPTHS[level][Math.floor(Math.random() * STACK_DEPTHS[level].length)];
        const selectedFormat = format || FORMATS[level][Math.floor(Math.random() * FORMATS[level].length)];
        const selectedType = scenarioType || SCENARIO_TYPES[level][Math.floor(Math.random() * SCENARIO_TYPES[level].length)];

        // Build the prompt
        const prompt = buildScenarioPrompt(level, selectedPosition, selectedStackDepth, selectedFormat, selectedType);

        // Call Grok API
        const grok = getGrokClient();
        const completion = await grok.chat.completions.create({
            model: 'grok-3',
            messages: [
                {
                    role: 'system',
                    content: `You are a GTO poker expert and training content creator. You create precise, solver-accurate poker training scenarios. Your solutions must be based on equilibrium strategies from modern solvers. Always respond with valid JSON only, no markdown.`
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            temperature: 0.7,
            max_tokens: 2000,
        });

        const responseText = completion.choices[0]?.message?.content;

        if (!responseText) {
            throw new Error('Empty response from Grok');
        }

        // Parse the JSON response
        let scenario;
        try {
            // Clean up any markdown code blocks if present
            const cleanedResponse = responseText
                .replace(/```json\n?/g, '')
                .replace(/```\n?/g, '')
                .trim();
            scenario = JSON.parse(cleanedResponse);
        } catch (parseError) {
            console.error('[GenerateScenario] Failed to parse Grok response:', responseText);
            throw new Error('Failed to parse scenario from AI response');
        }

        // Validate and enhance the scenario
        const validatedScenario = validateScenario(scenario, level, selectedPosition, selectedStackDepth);

        return res.status(200).json({
            success: true,
            scenario: validatedScenario,
            meta: {
                level,
                position: selectedPosition,
                stackDepth: selectedStackDepth,
                format: selectedFormat,
                type: selectedType,
                generatedAt: new Date().toISOString(),
            }
        });

    } catch (error) {
        console.error('[GenerateScenario] Error:', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Failed to generate scenario',
        });
    }
}

function buildScenarioPrompt(level, position, stackDepth, format, scenarioType) {
    const difficultyDescriptions = {
        1: 'Beginner - Simple, clear ranges with obvious hands',
        2: 'Beginner+ - Slightly wider ranges, basic concepts',
        3: 'Intermediate - Multiple positions, some mixed strategies',
        4: 'Intermediate+ - 4-bet pots, squeeze spots',
        5: 'Advanced - Full position awareness, all stack depths',
        6: 'Advanced+ - Complex 3-bet/4-bet trees',
        7: 'Expert - MTT/ICM considerations, push/fold',
        8: 'Expert+ - Deep stack play, pot control',
        9: 'Master - Final table ICM, short stack optimization',
        10: 'GTO Master - Mixed strategies, exploit vs GTO balance',
    };

    return `Generate a GTO poker training scenario with the following parameters:

Level: ${level} (${difficultyDescriptions[level]})
Position: ${position}
Stack Depth: ${stackDepth}bb
Format: ${format}
Scenario Type: ${scenarioType}

Create a scenario in this exact JSON format:
{
    "id": "grok-${Date.now()}",
    "level": ${level},
    "title": "[Descriptive title for this spot]",
    "position": "${position}",
    "stackDepth": ${stackDepth},
    "description": "[2-3 sentence description of the scenario and why it's important]",
    "tip": "[Helpful tip for remembering this range]",
    "solution": {
        [Map of hands to actions. Format: "AA": "raise", "AKs": "raise", etc.]
        [Include ALL hands that should be played, using standard notation:]
        [- Pairs: AA, KK, QQ, etc.]
        [- Suited: AKs, AQs, T9s, etc.]
        [- Offsuit: AKo, AQo, etc.]
        [Actions can be: "raise", "call", "3bet", "fold", or mixed like "raise70"]
    }
}

IMPORTANT:
- The solution should contain ~${15 + level * 3}-${20 + level * 5} hands for level ${level}
- Use solver-accurate ranges for ${format} at ${stackDepth}bb
- Higher levels should have more complex ranges with mixed strategies
- Include suited connectors, broadway hands, and pocket pairs as appropriate
- For mixed strategies, use format like "raise70" meaning raise 70% of the time

Return ONLY the JSON object, no explanation or markdown.`;
}

function validateScenario(scenario, level, position, stackDepth) {
    // Ensure required fields exist
    if (!scenario.id) scenario.id = `grok-${Date.now()}`;
    if (!scenario.level) scenario.level = level;
    if (!scenario.position) scenario.position = position;
    if (!scenario.stackDepth) scenario.stackDepth = stackDepth;
    if (!scenario.solution) scenario.solution = {};

    // Validate solution entries
    const validatedSolution = {};
    for (const [hand, action] of Object.entries(scenario.solution)) {
        // Normalize hand notation
        const normalizedHand = normalizeHandNotation(hand);
        if (normalizedHand && isValidAction(action)) {
            validatedSolution[normalizedHand] = action;
        }
    }
    scenario.solution = validatedSolution;

    return scenario;
}

function normalizeHandNotation(hand) {
    if (!hand || typeof hand !== 'string') return null;

    const upper = hand.toUpperCase().trim();

    // Pocket pairs: AA, KK, etc.
    if (upper.length === 2 && RANKS.includes(upper[0]) && upper[0] === upper[1]) {
        return upper;
    }

    // Suited/Offsuit: AKs, AKo, T9s, etc.
    if (upper.length === 3 && RANKS.includes(upper[0]) && RANKS.includes(upper[1])) {
        const suffix = upper[2].toLowerCase();
        if (suffix === 's' || suffix === 'o') {
            return upper[0] + upper[1] + suffix;
        }
    }

    // Pairs without suffix (treat as pairs)
    if (upper.length === 2 && RANKS.includes(upper[0]) && RANKS.includes(upper[1])) {
        if (upper[0] === upper[1]) return upper;
        // Default to suited if no suffix
        return upper + 's';
    }

    return null;
}

function isValidAction(action) {
    if (!action || typeof action !== 'string') return false;
    const lower = action.toLowerCase();

    // Standard actions
    if (['raise', 'call', '3bet', '4bet', 'fold', 'check', 'allin', 'jam'].includes(lower)) {
        return true;
    }

    // Mixed strategies: raise70, call30, etc.
    if (/^(raise|call|3bet|4bet|fold|check)\d+$/.test(lower)) {
        return true;
    }

    return false;
}

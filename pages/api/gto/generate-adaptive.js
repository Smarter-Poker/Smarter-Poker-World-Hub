/**
 * Jarvis Adaptive Scenario Generation API
 * 
 * Generates personalized training scenarios targeting user's weaknesses.
 * 
 * POST /api/gto/generate-adaptive
 * Body: { userId }
 */

import { createClient } from '@supabase/supabase-js';
import { getGrokClient } from '../../../src/lib/grokClient';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { userId } = req.body;

        if (!userId) {
            return res.status(400).json({ error: 'userId required' });
        }

        // First, get the user's weak spots
        const weakSpots = await fetchWeakSpots(userId);

        if (!weakSpots || weakSpots.length === 0) {
            // No weakness data - return a general scenario
            return res.status(200).json({
                success: true,
                scenario: getDefaultScenario(),
                targetedArea: null,
                message: 'Play more games for personalized training!'
            });
        }

        // Pick the top weakness to target
        const targetWeakness = weakSpots[0];

        // Generate scenario targeting this weakness
        const scenario = await generateTargetedScenario(targetWeakness);

        return res.status(200).json({
            success: true,
            scenario,
            targetedArea: targetWeakness.area,
            weakSpots,
            message: `Targeting your ${targetWeakness.area} weakness`
        });

    } catch (error) {
        console.error('[GenerateAdaptive] Error:', error);
        return res.status(200).json({
            success: true,
            scenario: getDefaultScenario(),
            targetedArea: null,
            fallback: true
        });
    }
}

async function fetchWeakSpots(userId) {
    // Get recent sessions
    const { data: sessions, error } = await supabase
        .from('jarvis_training_sessions')
        .select('answers_data, leaks_detected, accuracy')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(15);

    if (error || !sessions?.length) {
        return [];
    }

    // Quick analysis for top weakness
    const patterns = {};

    sessions.forEach(session => {
        const answers = session.answers_data || [];
        answers.forEach(answer => {
            if (!answer.correct && answer.position) {
                patterns[answer.position] = (patterns[answer.position] || 0) + 1;
            }
        });
    });

    return Object.entries(patterns)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([area, count]) => ({
            area: `${area} Play`,
            type: 'position',
            value: area,
            errorCount: count
        }));
}

async function generateTargetedScenario(weakness) {
    const grok = getGrokClient();

    const prompt = buildAdaptivePrompt(weakness);

    try {
        const completion = await grok.chat.completions.create({
            model: 'grok-3',
            messages: [
                {
                    role: 'system',
                    content: `You are a GTO poker coach generating training scenarios.
                    Create scenarios in JSON format with: id, title, description, position, stackDepth, villainPosition, action, solution (object mapping hands to actions).
                    Focus on the player's specific weakness area. Return ONLY valid JSON.`
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            temperature: 0.7,
            max_tokens: 1500,
        });

        const responseText = completion.choices[0]?.message?.content;

        // Parse JSON response
        const cleanedResponse = responseText
            .replace(/```json\n?/g, '')
            .replace(/```\n?/g, '')
            .trim();

        const scenario = JSON.parse(cleanedResponse);
        scenario.isAdaptive = true;
        scenario.targetedWeakness = weakness.area;

        return scenario;

    } catch (error) {
        console.error('[GenerateAdaptive] Jarvis error:', error);
        return getFallbackScenario(weakness);
    }
}

function buildAdaptivePrompt(weakness) {
    const position = weakness.value || 'CO';

    return `Generate a GTO preflop training scenario specifically targeting ${weakness.area} weakness.

REQUIREMENTS:
- Position: ${position} (the player's weak spot)
- Stack Depth: 100bb (standard)
- Include 15-25 hands in the solution
- Mix of raises, calls, and folds appropriate for the position
- Make it challenging but educational

Return JSON format:
{
    "id": "adaptive_${Date.now()}",
    "title": "${position} Training - Targeted Practice",
    "description": "Practice your ${position} opening range to fill this gap in your game.",
    "position": "${position}",
    "stackDepth": 100,
    "villainPosition": null,
    "action": "open",
    "solution": {
        "AA": "raise",
        "KK": "raise",
        ... (include full range for position)
    }
}`;
}

function getFallbackScenario(weakness) {
    const position = weakness?.value || 'CO';

    // Return a pre-built scenario for common positions
    const scenarios = {
        'UTG': {
            id: `adaptive_utg_${Date.now()}`,
            title: 'UTG Opening Range',
            description: 'Practice tight UTG opens to improve early position play.',
            position: 'UTG',
            stackDepth: 100,
            action: 'open',
            isAdaptive: true,
            solution: {
                'AA': 'raise', 'KK': 'raise', 'QQ': 'raise', 'JJ': 'raise', 'TT': 'raise',
                '99': 'raise', '88': 'raise', '77': 'raise',
                'AKs': 'raise', 'AQs': 'raise', 'AJs': 'raise', 'ATs': 'raise',
                'KQs': 'raise', 'KJs': 'raise',
                'QJs': 'raise',
                'AKo': 'raise', 'AQo': 'raise', 'AJo': 'raise'
            }
        },
        'CO': {
            id: `adaptive_co_${Date.now()}`,
            title: 'CO Opening Range',
            description: 'Practice cutoff steals to improve late position aggression.',
            position: 'CO',
            stackDepth: 100,
            action: 'open',
            isAdaptive: true,
            solution: {
                'AA': 'raise', 'KK': 'raise', 'QQ': 'raise', 'JJ': 'raise', 'TT': 'raise',
                '99': 'raise', '88': 'raise', '77': 'raise', '66': 'raise', '55': 'raise',
                'AKs': 'raise', 'AQs': 'raise', 'AJs': 'raise', 'ATs': 'raise', 'A9s': 'raise',
                'A8s': 'raise', 'A7s': 'raise', 'A6s': 'raise', 'A5s': 'raise', 'A4s': 'raise',
                'KQs': 'raise', 'KJs': 'raise', 'KTs': 'raise', 'K9s': 'raise',
                'QJs': 'raise', 'QTs': 'raise', 'Q9s': 'raise',
                'JTs': 'raise', 'J9s': 'raise',
                'T9s': 'raise', '98s': 'raise', '87s': 'raise', '76s': 'raise',
                'AKo': 'raise', 'AQo': 'raise', 'AJo': 'raise', 'ATo': 'raise',
                'KQo': 'raise', 'KJo': 'raise', 'QJo': 'raise'
            }
        },
        'BTN': {
            id: `adaptive_btn_${Date.now()}`,
            title: 'Button Opening Range',
            description: 'Practice wide button opens for maximum position value.',
            position: 'BTN',
            stackDepth: 100,
            action: 'open',
            isAdaptive: true,
            solution: {
                'AA': 'raise', 'KK': 'raise', 'QQ': 'raise', 'JJ': 'raise', 'TT': 'raise',
                '99': 'raise', '88': 'raise', '77': 'raise', '66': 'raise', '55': 'raise',
                '44': 'raise', '33': 'raise', '22': 'raise',
                'AKs': 'raise', 'AQs': 'raise', 'AJs': 'raise', 'ATs': 'raise', 'A9s': 'raise',
                'A8s': 'raise', 'A7s': 'raise', 'A6s': 'raise', 'A5s': 'raise', 'A4s': 'raise',
                'A3s': 'raise', 'A2s': 'raise',
                'KQs': 'raise', 'KJs': 'raise', 'KTs': 'raise', 'K9s': 'raise', 'K8s': 'raise',
                'QJs': 'raise', 'QTs': 'raise', 'Q9s': 'raise', 'Q8s': 'raise',
                'JTs': 'raise', 'J9s': 'raise', 'J8s': 'raise',
                'T9s': 'raise', 'T8s': 'raise',
                '98s': 'raise', '97s': 'raise', '87s': 'raise', '86s': 'raise',
                '76s': 'raise', '75s': 'raise', '65s': 'raise', '54s': 'raise',
                'AKo': 'raise', 'AQo': 'raise', 'AJo': 'raise', 'ATo': 'raise', 'A9o': 'raise',
                'KQo': 'raise', 'KJo': 'raise', 'KTo': 'raise',
                'QJo': 'raise', 'QTo': 'raise', 'JTo': 'raise'
            }
        }
    };

    return scenarios[position] || scenarios['CO'];
}

function getDefaultScenario() {
    return {
        id: `default_${Date.now()}`,
        title: 'CO Opening Range',
        description: 'Standard cutoff opening range training.',
        position: 'CO',
        stackDepth: 100,
        action: 'open',
        isAdaptive: false,
        solution: {
            'AA': 'raise', 'KK': 'raise', 'QQ': 'raise', 'JJ': 'raise', 'TT': 'raise',
            '99': 'raise', '88': 'raise', '77': 'raise', '66': 'raise',
            'AKs': 'raise', 'AQs': 'raise', 'AJs': 'raise', 'ATs': 'raise',
            'KQs': 'raise', 'KJs': 'raise', 'KTs': 'raise',
            'QJs': 'raise', 'QTs': 'raise',
            'JTs': 'raise', 'T9s': 'raise', '98s': 'raise', '87s': 'raise',
            'AKo': 'raise', 'AQo': 'raise', 'AJo': 'raise',
            'KQo': 'raise'
        }
    };
}

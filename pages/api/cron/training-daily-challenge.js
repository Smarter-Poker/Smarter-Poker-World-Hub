/**
 * 🏆 TRAINING DAILY CHALLENGE + COMMUNITY SCENARIO — GROK POWERED
 * ═══════════════════════════════════════════════════════════════════════════
 * Runs daily at 06:05 UTC to generate new training challenges
 * Features:
 * - Selects a random game from rotating categories
 * - Generates a UNIQUE Grok-powered scenario for the whole community
 * - Same scenario for ALL users → creates global competition
 * - Bonus diamonds (50) for completing with 80%+ accuracy
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { getGrokClient } from '../../../src/lib/grokClient';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
    // Verify cron secret for production
    if (process.env.NODE_ENV === 'production') {
        const authHeader = req.headers.authorization;
        if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
    }

    if (!supabaseUrl || !supabaseKey) {
        return res.status(500).json({ error: 'Missing Supabase configuration' });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    try {

        // Get today's date
        const today = new Date();
        const challengeDate = today.toISOString().split('T')[0];

        // Check if today's challenge already exists
        const { data: existing } = await supabase
            .from('training_daily_challenges')
            .select('id')
            .eq('challenge_date', challengeDate)
            .maybeSingle();

        if (existing) {
            return res.status(200).json({
                success: true,
                message: 'Challenge already exists for today',
                date: challengeDate
            });
        }

        // Rotate through categories based on day of week
        const categories = ['MTT', 'CASH', 'ADVANCED', 'SPINS', 'PSYCHOLOGY'];
        const dayOfWeek = today.getDay();
        const selectedCategory = categories[dayOfWeek % categories.length];

        // Game IDs by category (picking challenging games)
        const challengeGames = {
            MTT: ['mtt-004', 'mtt-010', 'mtt-013', 'mtt-015', 'mtt-021'],
            CASH: ['cash-005', 'cash-008', 'cash-012', 'cash-014', 'cash-021'],
            ADVANCED: ['adv-002', 'adv-005', 'adv-007', 'adv-014', 'adv-018'],
            SPINS: ['spins-002', 'spins-005', 'spins-007', 'spins-010'],
            PSYCHOLOGY: ['psy-003', 'psy-004', 'psy-007', 'psy-016', 'psy-020']
        };

        const categoryGames = challengeGames[selectedCategory] || challengeGames.MTT;
        const randomIndex = Math.floor(Math.random() * categoryGames.length);
        const selectedGameId = categoryGames[randomIndex];

        // Determine level (5-8 for daily challenges, harder difficulty)
        const level = 5 + Math.floor(Math.random() * 4);

        // 🧠 GENERATE GROK-POWERED COMMUNITY SCENARIO
        let communityScenario = null;
        try {
            communityScenario = await generateCommunityScenario(selectedCategory, level, challengeDate);
        } catch (grokError) {
            console.error('[TrainingDailyChallenge] Grok generation failed:', grokError.message);
        }

        // Insert the daily challenge with community scenario
        const { data: challenge, error } = await supabase
            .from('training_daily_challenges')
            .insert({
                challenge_date: challengeDate,
                game_id: selectedGameId,
                level: level,
                required_accuracy: 80,
                bonus_xp_multiplier: 2.0,
                bonus_diamonds: 50,
                community_scenario: communityScenario // Store the Grok-generated scenario
            })
            .select()
            .single();

        if (error) {
            console.error('[TrainingDailyChallenge] Error creating challenge:', error);
            return res.status(500).json({ error: 'Failed to create challenge', details: error.message });
        }


        return res.status(200).json({
            success: true,
            message: 'Daily community challenge created',
            challenge: {
                date: challengeDate,
                gameId: selectedGameId,
                level: level,
                category: selectedCategory,
                hasCommunityScenario: !!communityScenario
            }
        });

    } catch (err) {
        console.error('[TrainingDailyChallenge] Unexpected error:', err);
        return res.status(500).json({ error: 'Internal server error', details: err.message });
    }
}

/**
 * Generate a unique community scenario using Grok
 */
async function generateCommunityScenario(category, level, date) {
    const grok = getGrokClient();

    const gameTypeMap = {
        MTT: 'deep-stack MTT tournament',
        CASH: '6-max high-stakes cash game',
        ADVANCED: 'advanced mixed-game (PLO/MTT)',
        SPINS: '3-max hyper-turbo Spin & Go',
        PSYCHOLOGY: 'high-pressure final table'
    };

    const gameType = gameTypeMap[category] || 'cash game';

    const prompt = `Create a challenging GTO poker scenario for today's GLOBAL COMMUNITY CHALLENGE.
    
DATE: ${date}
CATEGORY: ${category}
GAME TYPE: ${gameType}
DIFFICULTY: ${level}/10 (expert level - all community members compete)

Requirements:
1. This SAME scenario will be played by ALL users worldwide
2. Must be genuinely difficult and test advanced concepts
3. Include a clear GTO-optimal answer with solver reasoning
4. Make it memorable and discussion-worthy

Generate in this EXACT JSON format:
{
    "title": "Community Challenge: [Catchy title for this spot]",
    "question": "Detailed scenario question",
    "scenario": {
        "heroPosition": "[Position]",
        "heroHand": "[Specific hand]",
        "heroStack": [Stack in bb],
        "villainPosition": "[Position]",
        "villainStack": [Stack in bb],
        "board": "[Board cards or 'Preflop']",
        "pot": [Pot in bb],
        "action": "[What villain just did]",
        "context": "[Any additional context like 'bubble of WSOP ME']"
    },
    "options": [
        {"id": "a", "text": "[Option]", "frequency": "[GTO frequency %]"},
        {"id": "b", "text": "[Option]", "frequency": "[GTO frequency %]"},
        {"id": "c", "text": "[Option]", "frequency": "[GTO frequency %]"},
        {"id": "d", "text": "[Option]", "frequency": "[GTO frequency %]"}
    ],
    "correctAnswer": "[letter]",
    "explanation": "Detailed solver explanation with EV and range analysis",
    "discussionPoints": ["Point 1", "Point 2", "Point 3"]
}`;

    const response = await grok.chat.completions.create({
        model: 'grok-3',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.85,
        max_tokens: 800,
    });

    const content = response.choices[0]?.message?.content || '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
    }

    return null;
}


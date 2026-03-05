/**
 * 🎲 INFINITE UNIQUE SCENARIO GENERATOR
 * ═══════════════════════════════════════════════════════════════════════════
 * Generates completely unique poker scenarios using Grok
 * Uses variation seeds for randomized stack depths, boards, and positions
 * NEVER repeats a question
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { getGrokClient } from '../../../src/lib/grokClient';
import { createClient } from '@supabase/supabase-js';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Random seed generators for variation
const POSITIONS = ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'];
const STACKS = {
    cash: [80, 100, 120, 150, 200],
    tournament: [10, 15, 20, 25, 30, 40, 50, 60],
    sng: [8, 10, 12, 15, 20],
};

const BOARD_TEXTURES = [
    'rainbow dry', 'monotone', 'two-tone', 'paired',
    'connected', 'high card', 'low card', 'broadway heavy'
];

const VILLAIN_TYPES = [
    'tight-aggressive', 'loose-aggressive', 'tight-passive',
    'loose-passive', 'GTO', 'exploitative reg', 'recreational'
];

function getRandomElement(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function generateVariationSeed(gameType) {
    return {
        heroPosition: getRandomElement(POSITIONS),
        villainPosition: getRandomElement(POSITIONS.filter(p => p !== this?.heroPosition)),
        heroStack: getRandomElement(STACKS[gameType] || STACKS.cash),
        villainStack: getRandomElement(STACKS[gameType] || STACKS.cash),
        boardTexture: getRandomElement(BOARD_TEXTURES),
        villainType: getRandomElement(VILLAIN_TYPES),
        street: getRandomElement(['preflop', 'flop', 'turn', 'river']),
        potSize: Math.floor(Math.random() * 20) + 5,
        uniqueId: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    };
}

export default async function handler(req, res) {
  if (!applyRateLimit(req, res, LIMITS.read)) return;

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // ── Auth: verify JWT (prevent unauthenticated AI API abuse) ──
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Auth required' });
    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

    const { gameId, level = '5', gameType = 'cash', category = 'CASH' } = req.query;

    if (!gameId) {
        return res.status(400).json({ error: 'gameId is required' });
    }

    try {
        const grok = getGrokClient();
        const seed = generateVariationSeed(gameType);
        const levelNum = parseInt(level, 10);

        const prompt = `Generate a UNIQUE poker training question. Use these specific parameters to ensure variety:

VARIATION SEED (MUST USE THESE EXACTLY):
- Hero Position: ${seed.heroPosition}
- Villain Position: ${seed.villainPosition}
- Hero Stack: ${seed.heroStack}bb
- Villain Stack: ${seed.villainStack}bb
- Board Texture: ${seed.boardTexture}
- Villain Type: ${seed.villainType}
- Street: ${seed.street}
- Pot Size: ${seed.potSize}bb
- Unique ID: ${seed.uniqueId}

GAME CONTEXT:
- Game ID: ${gameId}
- Category: ${category}
- Game Type: ${gameType === 'tournament' ? 'MTT' : gameType === 'sng' ? 'Spin & Go' : '6-Max Cash'}
- Difficulty: ${levelNum}/10

Generate a realistic GTO scenario matching these parameters. The question should be challenging for level ${levelNum}.

RESPOND IN THIS EXACT JSON FORMAT:
{
    "id": "grok_${seed.uniqueId}",
    "type": "PIO",
    "question": "Specific question about the GTO play",
    "scenario": {
        "heroPosition": "${seed.heroPosition}",
        "villainPosition": "${seed.villainPosition}",
        "heroStack": ${seed.heroStack},
        "villainStack": ${seed.villainStack},
        "heroHand": "[Generate appropriate hand]",
        "board": "[Generate ${seed.street === 'preflop' ? 'null' : `${seed.boardTexture} board for ${seed.street}`}]",
        "pot": ${seed.potSize},
        "action": "[Previous action]",
        "gameType": "${gameType}"
    },
    "options": [
        {"id": "a", "text": "[Option 1]"},
        {"id": "b", "text": "[Option 2]"},
        {"id": "c", "text": "[Option 3]"},
        {"id": "d", "text": "[Option 4]"}
    ],
    "correctAnswer": "[a/b/c/d]",
    "explanation": "Detailed GTO reasoning for the correct answer"
}

CRITICAL: Make this a genuinely challenging and realistic scenario. Include specific bet sizes and GTO frequencies in the explanation.`;

        const response = await grok.chat.completions.create({
            model: 'grok-3',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.9, // High temp for maximum variety
            max_tokens: 700,
        });

        const content = response.choices[0]?.message?.content || '';

        // Extract JSON
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const question = JSON.parse(jsonMatch[0]);
            console.log(`[InfiniteScenario] ✅ Generated unique scenario: ${question.id}`);

            return res.status(200).json({
                success: true,
                question,
                variationSeed: seed,
                generatedBy: 'grok-3-infinite'
            });
        }

        throw new Error('Failed to parse Grok response');

    } catch (error) {
        console.error('[InfiniteScenario] Error:', error.message);

        return res.status(500).json({
            error: 'Failed to generate scenario',
            details: error.message
        });
    }
}

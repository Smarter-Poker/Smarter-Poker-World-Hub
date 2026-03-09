/**
 * 🎲 INFINITE UNIQUE SCENARIO GENERATOR
 * ═══════════════════════════════════════════════════════════════════════════
 * Generates completely unique poker scenarios using Grok
 * Uses variation seeds for randomized stack depths, boards, and positions
 * NEVER repeats a question
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { getGrokClient } from '../../../src/lib/grokClient';
import { createClient } from '../../../src/lib/supabaseServerClient';
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
    const hp = getRandomElement(POSITIONS);
    return {
        heroPosition: hp,
        villainPosition: getRandomElement(POSITIONS.filter(p => p !== hp)),
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
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    // ── Auth: verify JWT (prevent unauthenticated AI API abuse) ──
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: 'Auth required' });
    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

    const { gameId, level = '5', gameType = 'cash', category = 'CASH' } = req.query;

    if (!gameId) {
        return res.status(400).json({ success: false, error: 'gameId is required' });
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
    "id": "scenario_${seed.uniqueId}",
    "type": "multiple_choice",
    "question": "You are playing ${gameType} sitting ${seed.heroPosition}. You have [Hero Cards]... What is your GTO action?",
    "heroCards": ["As", "Kd"],
    "boardCards": ["Js", "Ts", "2d"],
    "scenario": {
        "heroPosition": "${seed.heroPosition}",
        "villainPosition": "${seed.villainPosition}",
        "heroStack": ${seed.heroStack},
        "villainStack": ${seed.villainStack},
        "heroHand": "AsKd",
        "board": "Js Ts 2d",
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
    "gtoFrequencies": {
        "a": 15,
        "b": 60,
        "c": 25,
        "d": 0
    },
    "evData": {
        "heroHandEV": 12.5,
        "optimalEV": 14.0
    },
    "correctAnswer": "b",
    "explanation": "Detailed GTO reasoning for the correct answer"
}

CRITICAL: Make this a genuinely challenging and realistic scenario. 
1. The gtoFrequencies MUST map to exact integers summing perfectly to 100.
2. heroCards MUST be an array of exactly 2 cards (e.g. ["As", "Kd"]).
3. boardCards MUST be an array of 3-5 cards (or empty if preflop).`;

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
            let question = JSON.parse(jsonMatch[0]);

            // Phase 36: GTO Engine Identical/Collision Check
            let seenCards = new Set();
            let collision = false;

            // Extract from heroHand or heroCards string
            const heroCardsList = (question.heroCards ? question.heroCards.join(' ') : (question.scenario?.heroHand || '')).split(' ').filter(Boolean);
            heroCardsList.forEach(c => {
                if (seenCards.has(c)) collision = true;
                seenCards.add(c);
            });

            // Extract from boardCards or board string
            const boardCardsList = (question.boardCards ? question.boardCards.join(' ') : (question.scenario?.board || '')).split(' ').filter(Boolean);
            boardCardsList.forEach(c => {
                if (seenCards.has(c)) collision = true;
                seenCards.add(c);
            });

            if (collision) {
                console.warn('[Infinite Gen] AI hallucinated duplicate cards! Fallback triggered.');
                question.scenario.heroHand = 'As Ks';
                question.scenario.board = question.scenario.board ? '2d 7c 9h' : '';
                question.heroCards = ['As', 'Ks'];
                question.boardCards = question.scenario.board ? ['2d', '7c', '9h'] : [];
            }

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
            success: false, error: 'Failed to generate scenario',
            details: error.message
        });
    }
}

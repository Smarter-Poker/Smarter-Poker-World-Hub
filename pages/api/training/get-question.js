/**
 * GET /api/training/get-question
 * Fetches next question for a training game session
 * 
 * Query params:
 * - gameId: Game identifier
 * - userId: User ID (for no-repeat tracking)
 * - level: Current level (1-10)
 * - engineType: PIO | CHART | SCENARIO
 */

import { createClient } from '@supabase/supabase-js';
import { getGrokClient } from '../../../src/lib/grokClient';
import TRAINING_CONFIG from '../../../src/config/trainingConfig';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { gameId, userId, level = 1, engineType = 'PIO' } = req.query;

    if (!gameId) {
        return res.status(400).json({ error: 'gameId required' });
    }

    try {
        // Get seen questions for this user/game to avoid repeats
        let seenQuestionIds = [];
        if (userId) {
            const { data: seen } = await supabase
                .from('user_seen_questions')
                .select('question_id')
                .eq('user_id', userId)
                .eq('game_id', gameId);

            seenQuestionIds = (seen || []).map(s => s.question_id);
        }

        let question = null;

        // Route to appropriate engine
        switch (engineType.toUpperCase()) {
            case 'PIO':
                question = await getPIOQuestion(gameId, level, seenQuestionIds);
                break;
            case 'CHART':
                question = await getChartQuestion(gameId, level, seenQuestionIds);
                break;
            case 'SCENARIO':
                question = await getScenarioQuestion(gameId, level, seenQuestionIds);
                break;
            default:
                question = await getPIOQuestion(gameId, level, seenQuestionIds);
        }

        // If no question found (all seen), reset or generate with AI
        if (!question) {
            // Try to generate with Grok AI as fallback
            question = await generateQuestionWithGrok(gameId, engineType, level);
        }

        if (!question) {
            return res.status(404).json({
                error: 'No questions available',
                message: 'All questions for this game have been completed'
            });
        }

        return res.status(200).json({
            success: true,
            question,
            level: parseInt(level),
            passThreshold: TRAINING_CONFIG.passThresholds[level] || 85,
        });

    } catch (error) {
        console.error('Get question error:', error);
        return res.status(500).json({ error: error.message });
    }
}

/**
 * PIO Engine: Get solver-based question from Supabase
 */
async function getPIOQuestion(gameId, level, seenIds) {
    // Query solver_templates for this game's scenario type
    const { data: templates, error } = await supabase
        .from('solver_templates')
        .select('*')
        .not('id', 'in', `(${seenIds.join(',') || 'null'})`)
        .limit(1);

    if (error || !templates || templates.length === 0) {
        return null;
    }

    const template = templates[0];

    return {
        id: template.id,
        type: 'PIO',
        scenario: {
            heroPosition: template.position_config,
            heroStack: template.stack_depth_bb,
            gameType: template.game_type,
            boardTexture: template.board_texture,
        },
        question: `What is the GTO play in this ${template.position_config} spot with ${template.stack_depth_bb}bb?`,
        options: buildPIOOptions(template),
        correctAnswer: template.frequencies ? Object.keys(template.frequencies)[0] : 'fold',
        explanation: template.explanation || 'Review the solver frequencies for this spot.',
        difficulty: Math.min(10, Math.max(1, level)),
    };
}

/**
 * Build options from solver template frequencies
 */
function buildPIOOptions(template) {
    const frequencies = template.frequencies || {};
    const actions = Object.keys(frequencies);

    // Ensure we have 4 options
    const allActions = ['Fold', 'Check/Call', 'Bet 33%', 'Bet 66%', 'Bet 100%', 'Raise', 'All-In'];
    const options = [];

    // Add actions from template
    actions.forEach(action => {
        options.push({
            id: action.toLowerCase().replace(/\s/g, '_'),
            text: action,
            frequency: frequencies[action],
        });
    });

    // Fill with other actions if needed
    while (options.length < 4) {
        const filler = allActions.find(a => !options.some(o => o.text === a));
        if (filler) {
            options.push({ id: filler.toLowerCase().replace(/\s/g, '_'), text: filler, frequency: 0 });
        } else {
            break;
        }
    }

    return options.slice(0, 4);
}

/**
 * CHART Engine: Get range chart question
 */
async function getChartQuestion(gameId, level, seenIds) {
    // Load from chart data files or database
    let charts;
    try {
        charts = require('../../../data/charts/push_fold_ranges.json');
    } catch {
        charts = [];
    }

    // If no charts, return null to fall back to Grok
    if (!Array.isArray(charts) || charts.length === 0) return null;

    // Find unseen chart scenario
    const available = charts.filter(c => !seenIds.includes(c.id));
    if (available.length === 0) return null;

    // Pick based on difficulty
    const chart = available[Math.floor(Math.random() * available.length)];

    return {
        id: chart.id || `chart_${Date.now()}`,
        type: 'CHART',
        scenario: {
            position: chart.position,
            stackBB: chart.stack_bb,
            chartType: chart.type,
        },
        question: chart.question || `Should you ${chart.type} with this hand from ${chart.position}?`,
        hand: chart.hand,
        options: [
            { id: 'push', text: 'Push/Raise' },
            { id: 'fold', text: 'Fold' },
            { id: 'call', text: 'Call' },
            { id: 'limp', text: 'Limp' },
        ],
        correctAnswer: chart.correct_action,
        explanation: chart.explanation,
        difficulty: level,
    };
}

/**
 * SCENARIO Engine: Get mental game question
 */
async function getScenarioQuestion(gameId, level, seenIds) {
    // Load mental game scenarios
    let scenarios;
    try {
        scenarios = require('../../../data/scenarios/mental_game.json');
    } catch {
        scenarios = [];
    }

    // If no scenarios, return null to fall back to Grok
    if (!Array.isArray(scenarios) || scenarios.length === 0) return null;

    const available = scenarios.filter(s => !seenIds.includes(s.id));
    if (available.length === 0) return null;

    const scenario = available[Math.floor(Math.random() * available.length)];

    return {
        id: scenario.id || `scenario_${Date.now()}`,
        type: 'SCENARIO',
        scenario: {
            title: scenario.title,
            context: scenario.context,
        },
        question: scenario.prompt,
        options: scenario.options.map(o => ({
            id: o.id,
            text: o.text,
            type: o.type,
        })),
        correctAnswer: scenario.options.find(o => o.correct)?.id,
        explanation: scenario.options.find(o => o.correct)?.feedback,
        difficulty: level,
        timeoutSeconds: scenario.timeout_seconds || 30,
    };
}

/**
 * Grok AI Fallback: Generate question when database is exhausted
 */
async function generateQuestionWithGrok(gameId, engineType, level) {
    try {
        const openai = getGrokClient();

        const prompt = `Generate a poker training question for a ${engineType} game at difficulty level ${level}/10.

For PIO: Create a GTO scenario with position, stack depth, and board texture
For CHART: Create a push/fold decision with specific hand and position
For SCENARIO: Create a mental game situation

Respond ONLY with valid JSON (no markdown, no explanation):
{
  "id": "ai_${Date.now()}",
  "type": "${engineType}",
  "question": "The question text",
  "scenario": {"heroPosition": "BTN", "heroStack": 30, "gameType": "6-Max Cash"},
  "options": [
    {"id": "a", "text": "Option A"},
    {"id": "b", "text": "Option B"},
    {"id": "c", "text": "Option C"},
    {"id": "d", "text": "Option D"}
  ],
  "correctAnswer": "a",
  "explanation": "Why this is correct"
}`;

        const response = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
            max_tokens: 600,
        });

        const content = response.choices[0]?.message?.content || '';
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            console.log('[Training] Grok generated question:', parsed.question);
            return parsed;
        }
    } catch (error) {
        console.error('[Training] Grok question generation failed:', error.message);
    }

    // Return hardcoded fallback question if Grok fails
    return getHardcodedQuestion(engineType, level);
}

/**
 * Hardcoded fallback questions when all else fails
 */
function getHardcodedQuestion(engineType, level) {
    const questions = {
        PIO: [
            {
                id: `fallback_pio_${Date.now()}`,
                type: 'PIO',
                scenario: { heroPosition: 'BTN', heroStack: 100, gameType: '6-Max Cash' },
                question: 'You are on the Button with AcKs. UTG raises to 3bb. What is the optimal play?',
                options: [
                    { id: 'a', text: 'Fold' },
                    { id: 'b', text: 'Call' },
                    { id: 'c', text: '3-bet to 9bb' },
                    { id: 'd', text: 'All-In' },
                ],
                correctAnswer: 'c',
                explanation: 'AKs is a premium hand that should be 3-bet for value from the Button against a UTG open.',
            },
            {
                id: `fallback_pio2_${Date.now()}`,
                type: 'PIO',
                scenario: { heroPosition: 'BB', heroStack: 25, gameType: 'MTT' },
                question: 'You are in the BB with 25bb. BTN opens to 2.5bb. SB folds. You have QJo. What is your play?',
                options: [
                    { id: 'a', text: 'Fold' },
                    { id: 'b', text: 'Call' },
                    { id: 'c', text: '3-bet to 8bb' },
                    { id: 'd', text: 'All-In' },
                ],
                correctAnswer: 'b',
                explanation: 'With QJo and 25bb, calling is preferred to close the action. 3-betting leaves you committed.',
            },
        ],
        CHART: [
            {
                id: `fallback_chart_${Date.now()}`,
                type: 'CHART',
                scenario: { position: 'SB', stackBB: 10 },
                question: 'You have 10bb in the SB with A5s. It folds to you. Should you push or fold?',
                options: [
                    { id: 'a', text: 'Push' },
                    { id: 'b', text: 'Fold' },
                    { id: 'c', text: 'Limp' },
                    { id: 'd', text: 'Min-raise' },
                ],
                correctAnswer: 'a',
                explanation: 'A5s is a clear push from SB with 10bb according to push/fold charts.',
            },
        ],
        SCENARIO: [
            {
                id: `fallback_scenario_${Date.now()}`,
                type: 'SCENARIO',
                scenario: { title: 'Tilt Management' },
                question: 'You just lost a big pot with AA vs 72o all-in preflop. What should you do?',
                options: [
                    { id: 'a', text: 'Play faster to win it back' },
                    { id: 'b', text: 'Take a 5-minute break' },
                    { id: 'c', text: 'Move up stakes for easier games' },
                    { id: 'd', text: 'Review the hand right now' },
                ],
                correctAnswer: 'b',
                explanation: 'Taking a short break helps reset your mental state and prevents tilt-driven decisions.',
            },
        ],
    };

    const engineQuestions = questions[engineType] || questions.PIO;
    const index = Math.floor(Math.random() * engineQuestions.length);
    return engineQuestions[index];
}


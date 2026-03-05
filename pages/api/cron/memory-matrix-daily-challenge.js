/**
 * Memory Matrix Daily Challenge Generator (Jarvis-Powered)
 * ═══════════════════════════════════════════════════════════════════════════
 * Generates a fresh GTO training challenge every day using Jarvis AI.
 * 
 * Cron: Runs daily at midnight UTC (0 0 * * *)
 * 
 * Creates a new challenge in `memory_daily_challenges` with:
 * - Jarvis-generated scenario with solution grid
 * - Level scaling based on day of month
 * - Weekend bonus rewards
 */

import { createClient } from '@supabase/supabase-js';
import { getGrokClient } from '../../../src/lib/grokClient';
import { getCachedResponse, setCachedResponse } from '../../../src/lib/jarvisCache';

export const config = {
    maxDuration: 60 // Allow up to 60 seconds for Grok generation
};

// Position configurations by difficulty level
const POSITION_CONFIGS = {
    1: ['UTG', 'MP', 'HJ'],
    2: ['UTG', 'MP', 'HJ', 'CO'],
    3: ['UTG', 'MP', 'HJ', 'CO', 'BTN'],
    4: ['CO', 'BTN', 'SB', 'BB'],
    5: ['UTG', 'MP', 'HJ', 'CO', 'BTN', 'SB', 'BB'],
    6: ['CO', 'BTN', 'SB', 'BB'],
    7: ['SB', 'BB'],
    8: ['UTG', 'MP', 'HJ', 'CO', 'BTN'],
    9: ['BTN', 'SB', 'BB'],
    10: ['UTG', 'CO', 'BTN', 'BB'],
};

// Stack depths by level
const STACK_DEPTHS = {
    1: [100],
    2: [100, 50],
    3: [100, 50, 200],
    4: [100, 50, 30],
    5: [100, 50, 200, 30],
    6: [100, 50, 30],
    7: [20, 25, 30],
    8: [100, 200, 150],
    9: [30, 40, 50],
    10: [100, 200, 30, 50],
};

// Scenario types by level
const SCENARIO_TYPES = {
    1: ['Open Raise Range'],
    2: ['Open Raise Range', '3-Bet Defense'],
    3: ['Open Raise Range', '3-Bet Defense', 'Squeeze Range'],
    4: ['3-Bet Range', 'vs 4-Bet', 'Blind vs Blind'],
    5: ['Open Raise Range', 'Squeeze Range', 'vs 4-Bet'],
    6: ['3-Bet Range', 'Cold 4-Bet', 'Mixed Frequency'],
    7: ['Push/Fold', 'ICM Spots', 'Bubble Play'],
    8: ['Deep Stack 3-Bet', 'Pot Control'],
    9: ['Final Table ICM', 'Short Stack Play'],
    10: ['Expert Mixed', 'GTO vs Exploit'],
};

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];

export default async function handler(req, res) {
    // Verify cron secret
    if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    try {
        const today = new Date();
        const challengeDate = today.toISOString().split('T')[0];

        // Check if challenge already exists for today
        const { data: existing } = await supabase
            .from('memory_daily_challenges')
            .select('id')
            .eq('challenge_date', challengeDate)
            .single();

        if (existing) {
            return res.status(200).json({
                message: 'Daily challenge already exists for today',
                challengeDate,
                id: existing.id
            });
        }

        // Calculate level based on day of month (progressive difficulty)
        const dayOfMonth = today.getDate();
        let level;
        if (dayOfMonth <= 3) level = Math.min(dayOfMonth, 3);
        else if (dayOfMonth <= 10) level = Math.min(3 + Math.floor((dayOfMonth - 3) / 2), 6);
        else if (dayOfMonth <= 20) level = Math.min(5 + Math.floor((dayOfMonth - 10) / 3), 8);
        else if (dayOfMonth <= 28) level = Math.min(7 + Math.floor((dayOfMonth - 20) / 3), 9);
        else level = 10;

        // Weekend bonus
        const dayOfWeek = today.getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const targetAccuracy = isWeekend ? 90 : 85;
        const diamondReward = isWeekend ? 75 : 50;
        const bonusReward = isWeekend ? 150 : 100;

        // Get random parameters for this level
        const position = POSITION_CONFIGS[level][Math.floor(Math.random() * POSITION_CONFIGS[level].length)];
        const stackDepth = STACK_DEPTHS[level][Math.floor(Math.random() * STACK_DEPTHS[level].length)];
        const scenarioType = SCENARIO_TYPES[level][Math.floor(Math.random() * SCENARIO_TYPES[level].length)];

        // Generate scenario with Grok

        const scenario = await generateGrokScenario(level, position, stackDepth, scenarioType);

        if (!scenario) {
            throw new Error('Failed to generate scenario from Grok');
        }


        // Insert the daily challenge
        const { data: challenge, error } = await supabase
            .from('memory_daily_challenges')
            .insert({
                challenge_date: challengeDate,
                game_mode: 'range',
                level: level,
                scenario_id: JSON.stringify(scenario), // Store full scenario as JSON
                target_accuracy: targetAccuracy,
                target_time: 90 + (10 - level) * 10, // More time for lower levels
                diamond_reward: diamondReward,
                bonus_reward: bonusReward
            })
            .select()
            .single();

        if (error) {
            console.error('[DailyChallenge] Insert error:', error);
            throw error;
        }

            id: challenge.id,
            level,
            title: scenario.title,
            position,
            stackDepth,
            diamondReward,
            bonusReward
        });

        return res.status(200).json({
            success: true,
            challenge: {
                id: challenge.id,
                date: challengeDate,
                level,
                title: scenario.title,
                position,
                stackDepth,
                targetAccuracy,
                diamondReward,
                bonusReward,
                isWeekend
            }
        });

    } catch (error) {
        console.error('[DailyChallenge] Cron error:', error);
        return res.status(500).json({ error: error.message });
    }
}

/**
 * Generate a GTO scenario using Grok AI
 */
async function generateGrokScenario(level, position, stackDepth, scenarioType) {
    try {
        const grok = getGrokClient();

        const prompt = buildScenarioPrompt(level, position, stackDepth, scenarioType);

        const completion = await grok.chat.completions.create({
            model: 'grok-3',
            messages: [
                {
                    role: 'system',
                    content: `You are a GTO poker expert creating daily training challenges. Your solutions must be solver-accurate. Respond with valid JSON only.`
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

        // Parse JSON response
        const cleanedResponse = responseText
            .replace(/```json\n?/g, '')
            .replace(/```\n?/g, '')
            .trim();

        const scenario = JSON.parse(cleanedResponse);

        // Validate and enhance
        return validateScenario(scenario, level, position, stackDepth);

    } catch (error) {
        console.error('[DailyChallenge] Grok generation error:', error);

        // Fallback: Create a basic scenario
        return createFallbackScenario(level, position, stackDepth, scenarioType);
    }
}

function buildScenarioPrompt(level, position, stackDepth, scenarioType) {
    const difficultyDescriptions = {
        1: 'Beginner - Simple, clear ranges',
        2: 'Beginner+ - Slightly wider ranges',
        3: 'Intermediate - Multiple positions',
        4: 'Intermediate+ - 4-bet pots',
        5: 'Advanced - Full position awareness',
        6: 'Advanced+ - Complex 3-bet trees',
        7: 'Expert - MTT/ICM considerations',
        8: 'Expert+ - Deep stack play',
        9: 'Master - Final table ICM',
        10: 'GTO Master - Mixed strategies',
    };

    return `Generate a GTO poker DAILY CHALLENGE scenario:

Level: ${level} (${difficultyDescriptions[level]})
Position: ${position}
Stack Depth: ${stackDepth}bb
Scenario Type: ${scenarioType}

Create a unique, engaging challenge in this JSON format:
{
    "id": "daily-${Date.now()}",
    "level": ${level},
    "title": "[Creative, descriptive title - make it sound exciting!]",
    "position": "${position}",
    "stackDepth": ${stackDepth},
    "description": "[2-3 sentences about this spot and what makes it interesting]",
    "tip": "[Helpful memory tip for this range]",
    "solution": {
        [Map of hands to actions: "AA": "raise", "AKs": "raise", etc.]
        [Include ${15 + level * 3}-${20 + level * 5} hands]
        [Actions: "raise", "call", "3bet", "fold", or mixed like "raise70"]
    }
}

Make it fresh and unique for today! Return ONLY the JSON.`;
}

function validateScenario(scenario, level, position, stackDepth) {
    if (!scenario.id) scenario.id = `daily-${Date.now()}`;
    if (!scenario.level) scenario.level = level;
    if (!scenario.position) scenario.position = position;
    if (!scenario.stackDepth) scenario.stackDepth = stackDepth;
    if (!scenario.solution) scenario.solution = {};

    // Validate solution entries
    const validatedSolution = {};
    for (const [hand, action] of Object.entries(scenario.solution)) {
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

    if (upper.length === 2 && RANKS.includes(upper[0]) && upper[0] === upper[1]) {
        return upper;
    }

    if (upper.length === 3 && RANKS.includes(upper[0]) && RANKS.includes(upper[1])) {
        const suffix = upper[2].toLowerCase();
        if (suffix === 's' || suffix === 'o') {
            return upper[0] + upper[1] + suffix;
        }
    }

    if (upper.length === 2 && RANKS.includes(upper[0]) && RANKS.includes(upper[1])) {
        if (upper[0] === upper[1]) return upper;
        return upper + 's';
    }

    return null;
}

function isValidAction(action) {
    if (!action || typeof action !== 'string') return false;
    const lower = action.toLowerCase();

    if (['raise', 'call', '3bet', '4bet', 'fold', 'check', 'allin', 'jam'].includes(lower)) {
        return true;
    }

    if (/^(raise|call|3bet|4bet|fold|check)\d+$/.test(lower)) {
        return true;
    }

    return false;
}

/**
 * Fallback scenario if Grok fails
 */
function createFallbackScenario(level, position, stackDepth, scenarioType) {
    const basicSolutions = {
        1: { "AA": "raise", "KK": "raise", "QQ": "raise", "JJ": "raise", "TT": "raise", "AKs": "raise", "AQs": "raise", "AKo": "raise" },
        2: { "AA": "raise", "KK": "raise", "QQ": "raise", "JJ": "raise", "TT": "raise", "99": "raise", "AKs": "raise", "AQs": "raise", "AJs": "raise", "AKo": "raise", "AQo": "raise" },
        3: { "AA": "raise", "KK": "raise", "QQ": "raise", "JJ": "raise", "TT": "raise", "99": "raise", "88": "raise", "AKs": "raise", "AQs": "raise", "AJs": "raise", "ATs": "raise", "KQs": "raise", "AKo": "raise", "AQo": "raise" },
    };

    return {
        id: `fallback-${Date.now()}`,
        level,
        title: `${position} ${scenarioType} (${stackDepth}bb)`,
        position,
        stackDepth,
        description: `Practice your ${scenarioType.toLowerCase()} from ${position} position with a ${stackDepth}bb stack.`,
        tip: "Focus on premium hands and position-appropriate raises.",
        solution: basicSolutions[Math.min(level, 3)] || basicSolutions[3]
    };
}

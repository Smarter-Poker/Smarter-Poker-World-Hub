#!/usr/bin/env node
/**
 * 🤖 Scenario Library Expansion Script
 * 
 * Uses Grok AI to generate additional scenarios for each level
 * ensuring 25+ scenarios per level.
 * 
 * Usage: node scripts/expand-scenarios.js
 */

import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Grok client
const grok = new OpenAI({
    apiKey: process.env.XAI_API_KEY,
    baseURL: 'https://api.x.ai/v1',
});

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];

// Current scenario counts (update these based on actual counts)
const TARGET_PER_LEVEL = 25;

// Level configurations
const LEVEL_CONFIGS = {
    1: {
        positions: ['UTG', 'MP', 'HJ'],
        stackDepths: [100, 50, 200],
        formats: ['Cash 6-max'],
        types: ['Open Raise Range'],
        difficulty: 'Beginner - Clear, simple ranges'
    },
    2: {
        positions: ['UTG', 'MP', 'HJ', 'CO'],
        stackDepths: [100, 50],
        formats: ['Cash 6-max', 'Cash 9-max'],
        types: ['Open Raise Range', '3-Bet Defense'],
        difficulty: 'Beginner+ - Wider ranges, basic concepts'
    },
    3: {
        positions: ['UTG', 'MP', 'HJ', 'CO', 'BTN'],
        stackDepths: [100, 50, 200],
        formats: ['Cash 6-max', 'Cash 9-max', 'MTT'],
        types: ['Open Raise Range', '3-Bet Defense', 'Squeeze Range'],
        difficulty: 'Intermediate - Multiple positions'
    },
    4: {
        positions: ['UTG', 'MP', 'HJ', 'CO', 'BTN', 'SB'],
        stackDepths: [100, 50, 200, 30],
        formats: ['Cash 6-max', 'Cash 9-max', 'MTT'],
        types: ['Open Raise Range', '3-Bet Defense', 'Squeeze Range', 'vs 4-Bet'],
        difficulty: 'Intermediate+ - 4-bet pots, squeeze spots'
    },
    5: {
        positions: ['UTG', 'MP', 'HJ', 'CO', 'BTN', 'SB', 'BB'],
        stackDepths: [100, 50, 200, 30, 150],
        formats: ['Cash 6-max', 'Cash 9-max', 'MTT', 'Spin & Go'],
        types: ['Open Raise Range', '3-Bet Defense', 'Blind vs Blind'],
        difficulty: 'Advanced - Full position awareness'
    },
    6: {
        positions: ['CO', 'BTN', 'SB', 'BB'],
        stackDepths: [100, 50, 30],
        formats: ['Cash 6-max', 'MTT'],
        types: ['3-Bet Range', 'Cold 4-Bet', 'Mixed Frequency'],
        difficulty: 'Advanced+ - Complex 3-bet/4-bet trees'
    },
    7: {
        positions: ['SB', 'BB', 'BTN'],
        stackDepths: [20, 25, 30],
        formats: ['MTT', 'Spin & Go'],
        types: ['Push/Fold', 'ICM Spots', 'Bubble Play'],
        difficulty: 'Expert - MTT/ICM push/fold decisions'
    },
    8: {
        positions: ['UTG', 'MP', 'HJ', 'CO', 'BTN', 'SB', 'BB'],
        stackDepths: [100, 200, 150],
        formats: ['Cash 6-max deep', 'Cash 9-max deep'],
        types: ['Deep Stack 3-Bet', 'Pot Control', 'Multiway Pots'],
        difficulty: 'Expert+ - Deep stack mastery'
    },
    9: {
        positions: ['BTN', 'SB', 'BB'],
        stackDepths: [30, 40, 50],
        formats: ['MTT FT', 'Spin & Go HU'],
        types: ['Final Table ICM', 'Heads-Up Ranges', 'Short Stack Play'],
        difficulty: 'Master - Final table ICM optimization'
    },
    10: {
        positions: ['UTG', 'CO', 'BTN', 'BB'],
        stackDepths: [100, 200, 30, 50],
        formats: ['Cash 6-max', 'MTT', 'Spin & Go', 'Mixed'],
        types: ['Expert Mixed', 'Exploitative Adjustments', 'GTO vs Exploit'],
        difficulty: 'GTO Master - Mixed strategies, exploit balance'
    },
};

async function generateScenario(level, position, stackDepth, format, type, index) {
    const config = LEVEL_CONFIGS[level];

    const prompt = `Generate a unique GTO poker training scenario:

Level: ${level} (${config.difficulty})
Position: ${position}
Stack: ${stackDepth}bb
Format: ${format}
Type: ${type}
Scenario Index: ${index}

Create a UNIQUE scenario (different from common examples).

Return JSON only:
{
    "id": "l${level}-grok-${index}",
    "level": ${level},
    "title": "[Unique, specific title for this spot]",
    "position": "${position}",
    "stackDepth": ${stackDepth},
    "description": "[2-3 sentences explaining this scenario]",
    "tip": "[Memory tip for this range]",
    "solution": {
        [Include ${20 + level * 2}-${25 + level * 3} hands with solver-accurate actions]
        ["AA": "raise", "AKs": "raise", etc.]
        [For mixed strategies at level 6+, use "raise70" meaning raise 70%]
    }
}

CRITICAL: Make this scenario DIFFERENT from standard examples. Focus on:
- Level ${level} appropriate complexity
- ${position} position specifics
- ${stackDepth}bb stack depth adjustments
- ${format} format considerations

JSON ONLY, no other text.`;

    try {
        const completion = await grok.chat.completions.create({
            model: 'grok-3',
            messages: [
                {
                    role: 'system',
                    content: 'You are a GTO poker expert specializing in solver-accurate range training. Generate unique, high-quality training scenarios. Respond with valid JSON only.'
                },
                { role: 'user', content: prompt }
            ],
            temperature: 0.85,
            max_tokens: 2500,
        });

        const responseText = completion.choices[0]?.message?.content;
        if (!responseText) throw new Error('Empty response');

        // Clean and parse
        const cleaned = responseText
            .replace(/```json\n?/g, '')
            .replace(/```\n?/g, '')
            .trim();

        const scenario = JSON.parse(cleaned);

        // Validate
        scenario.id = `l${level}-grok-${Date.now()}-${index}`;
        scenario.level = level;
        scenario.position = position;
        scenario.stackDepth = stackDepth;

        console.log(`  ✅ Generated: ${scenario.title}`);
        return scenario;

    } catch (error) {
        console.error(`  ❌ Failed for L${level} ${position} ${stackDepth}bb:`, error.message);
        return null;
    }
}

async function expandLevel(level, currentCount, targetCount) {
    const config = LEVEL_CONFIGS[level];
    const needed = Math.max(0, targetCount - currentCount);

    if (needed === 0) {
        console.log(`Level ${level}: Already has ${currentCount}/${targetCount} ✅`);
        return [];
    }

    console.log(`\nLevel ${level}: Generating ${needed} new scenarios...`);

    const scenarios = [];

    for (let i = 0; i < needed; i++) {
        // Rotate through configs for variety
        const position = config.positions[i % config.positions.length];
        const stackDepth = config.stackDepths[i % config.stackDepths.length];
        const format = config.formats[i % config.formats.length];
        const type = config.types[i % config.types.length];

        const scenario = await generateScenario(level, position, stackDepth, format, type, i);
        if (scenario) {
            scenarios.push(scenario);
        }

        // Rate limit protection
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return scenarios;
}

async function main() {
    console.log('🤖 Scenario Library Expansion');
    console.log('═'.repeat(50));

    if (!process.env.XAI_API_KEY) {
        console.error('❌ XAI_API_KEY not set!');
        process.exit(1);
    }

    // Current approximate counts (update based on actual database)
    const currentCounts = {
        1: 20,
        2: 20,
        3: 19,
        4: 20,
        5: 20,
        6: 20,
        7: 30,
        8: 25,
        9: 20,
        10: 25,
    };

    const allNewScenarios = [];

    for (let level = 1; level <= 10; level++) {
        const newScenarios = await expandLevel(level, currentCounts[level], TARGET_PER_LEVEL);
        allNewScenarios.push(...newScenarios);
    }

    // Save to file
    const outputPath = path.join(__dirname, '../src/games/expanded-scenarios.json');
    fs.writeFileSync(outputPath, JSON.stringify(allNewScenarios, null, 2));

    console.log('\n═'.repeat(50));
    console.log(`✅ Generated ${allNewScenarios.length} new scenarios`);
    console.log(`📁 Saved to: ${outputPath}`);
    console.log('\nRun: node scripts/integrate-expanded-scenarios.js to merge');
}

main().catch(console.error);

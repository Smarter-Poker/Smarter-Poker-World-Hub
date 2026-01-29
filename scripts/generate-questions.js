#!/usr/bin/env node

/**
 * 🎰 SIMPLE QUESTION GENERATOR
 * ═══════════════════════════════════════════════════════════════════════════
 * Generates questions one game at a time by calling the API endpoint
 * More reliable than batch generation
 * ═══════════════════════════════════════════════════════════════════════════
 */

const API_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

const TEST_GAMES = [
    'mtt-007',  // Deep Stack MTT
    'mtt-018',  // BTN Warfare
    'cash-002', // 3-Bet Pots
    'cash-018', // Blind vs Blind
    'spins-003', // Button Limp
    'spins-007', // Extreme ICM
    'psy-003',  // Cooler Cage
    'psy-012',  // Snap Decision
    'adv-001',  // Solver Mimicry
    'adv-017',  // Capped Ranges
];

async function generateForGame(gameId, level, count) {
    console.log(`\n🎮 Generating ${count} questions for ${gameId} Level ${level}...`);

    let generated = 0;
    let failed = 0;

    for (let i = 1; i <= count; i++) {
        try {
            const response = await fetch(`${API_URL}/api/training/get-question?gameId=${gameId}&level=${level}&engineType=PIO`);

            if (response.ok) {
                generated++;
                process.stdout.write(`✅`);
            } else {
                failed++;
                process.stdout.write(`❌`);
            }
        } catch (error) {
            failed++;
            process.stdout.write(`❌`);
        }

        // Rate limit
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log(`\n📊 ${gameId} Level ${level}: ${generated} generated, ${failed} failed\n`);
    return { generated, failed };
}

async function main() {
    console.log('🎰 Starting question generation for 10 test games...\n');
    console.log(`Target: 50 questions per game (25 per level × 2 levels)`);
    console.log(`Total: 500 questions\n`);

    const results = {};

    for (const gameId of TEST_GAMES) {
        results[gameId] = {
            level1: await generateForGame(gameId, 1, 25),
            level2: await generateForGame(gameId, 2, 25),
        };
    }

    console.log('\n' + '='.repeat(70));
    console.log('🎉 GENERATION COMPLETE');
    console.log('='.repeat(70));

    let totalGenerated = 0;
    let totalFailed = 0;

    for (const [gameId, levels] of Object.entries(results)) {
        const gameTotal = levels.level1.generated + levels.level2.generated;
        const gameFailed = levels.level1.failed + levels.level2.failed;
        totalGenerated += gameTotal;
        totalFailed += gameFailed;
        console.log(`${gameId}: ${gameTotal}/50 generated`);
    }

    console.log('='.repeat(70));
    console.log(`Total Generated: ${totalGenerated}/500`);
    console.log(`Total Failed: ${totalFailed}`);
    console.log('='.repeat(70));
}

main().catch(console.error);

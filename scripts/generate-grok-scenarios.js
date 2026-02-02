#!/usr/bin/env node
/**
 * 🤖 Quick Grok Scenario Generator
 * 
 * Generates scenarios directly from Grok API and outputs to console
 * for integration into ScenarioDatabase.js
 * 
 * Usage: node scripts/generate-grok-scenarios.js
 */

const API_URL = 'http://localhost:3000/api/gto/generate-scenario';

async function generateScenario(level) {
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ level }),
        });

        const result = await response.json();

        if (result.success && result.scenario) {
            return result.scenario;
        } else {
            console.error(`Level ${level} failed:`, result.error);
            return null;
        }
    } catch (error) {
        console.error(`Level ${level} error:`, error.message);
        return null;
    }
}

async function main() {
    console.log('🤖 Grok Scenario Generator\n');

    const scenarios = [];

    // Generate 5 scenarios per level (50 total)
    for (let level = 1; level <= 10; level++) {
        console.log(`\nLevel ${level}:`);

        for (let i = 0; i < 5; i++) {
            const scenario = await generateScenario(level);
            if (scenario) {
                scenarios.push(scenario);
                console.log(`  ✅ ${scenario.title}`);
            }

            // Rate limit protection
            await new Promise(r => setTimeout(r, 1500));
        }
    }

    console.log(`\n\n═══════════════════════════════════════`);
    console.log(`Generated ${scenarios.length} scenarios`);
    console.log(`═══════════════════════════════════════\n`);

    // Output as JavaScript
    console.log('// === PASTE INTO ScenarioDatabase.js ===\n');
    console.log('export const GROK_GENERATED_SCENARIOS = ');
    console.log(JSON.stringify(scenarios, null, 2) + ';');
}

main().catch(console.error);

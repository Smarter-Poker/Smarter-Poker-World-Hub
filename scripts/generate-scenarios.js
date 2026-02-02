/**
 * 🤖 GROK-POWERED SCENARIO GENERATOR
 * 
 * Uses Grok API to generate GTO poker ranges for Memory Matrix
 * Generates 187 scenarios across Levels 2-10
 */

const { getGrokClient } = require('../src/lib/grokClient');

// Scenario templates for each level
const LEVEL_TEMPLATES = {
    2: {
        name: 'Position Pulse',
        focus: 'CO/BTN/SB Opening Ranges',
        positions: ['CO', 'BTN', 'SB'],
        stackDepths: [20, 30, 50, 100, 200],
        formats: ['9max', '6max', 'MTT'],
        count: 20
    },
    3: {
        name: 'Defense Matrix',
        focus: 'BB Defense vs All Positions',
        positions: ['BB'],
        vsPositions: ['UTG', 'MP', 'HJ', 'CO', 'BTN', 'SB'],
        stackDepths: [30, 50, 100, 200],
        count: 20
    },
    4: {
        name: '3-Bet Ignition',
        focus: '3-Bet Ranges (IP & OOP)',
        scenarios: ['IP 3-bet', 'OOP 3-bet', 'Squeeze', '3-bet vs limpers'],
        stackDepths: [30, 50, 100, 200],
        count: 20
    },
    5: {
        name: 'Call Protocol',
        focus: 'Flatting Ranges (Value + Traps)',
        scenarios: ['Flat IP', 'Flat OOP', 'Set mining', 'Trap hands'],
        stackDepths: [50, 100, 200],
        count: 20
    },
    6: {
        name: '4-Bet Override',
        focus: '4-Bet/5-Bet Polarization',
        scenarios: ['4-bet value', '4-bet bluff', '5-bet shove', '4-bet vs 3-bet'],
        stackDepths: [30, 50, 100],
        count: 20
    },
    7: {
        name: 'Flop Architect',
        focus: 'C-Bet Frequencies by Texture',
        textures: ['Monotone', 'Two-tone', 'Rainbow', 'Paired', 'Connected', 'Dry', 'Wet'],
        positions: ['IP', 'OOP'],
        count: 30
    },
    8: {
        name: 'Turn Calibration',
        focus: 'Turn Barrel/Check Decisions',
        scenarios: ['Double barrel', 'Turn check', 'Turn raise', 'Turn call'],
        textures: ['Brick', 'Scare card', 'Completing draw'],
        count: 25
    },
    9: {
        name: 'River Execute',
        focus: 'Value/Bluff River Ratios',
        scenarios: ['River value bet', 'River bluff', 'River check-call', 'River check-raise'],
        count: 20
    },
    10: {
        name: 'GTO Master',
        focus: 'All Spots, Mixed Strategies',
        scenarios: ['Mixed frequency spots', 'Indifference points', 'Exploitative adjustments'],
        count: 25
    }
};

async function generateScenarioWithGrok(level, template, scenarioIndex) {
    const grok = getGrokClient();

    const prompt = `You are a GTO poker expert. Generate a precise poker range for the following scenario:

Level: ${level} - ${template.name}
Focus: ${template.focus}
Scenario #${scenarioIndex}

${level === 2 ? `Position: ${template.positions[scenarioIndex % template.positions.length]}
Stack Depth: ${template.stackDepths[Math.floor(scenarioIndex / template.positions.length) % template.stackDepths.length]}bb
Format: ${template.formats[scenarioIndex % template.formats.length]}` : ''}

${level === 3 ? `Position: BB
Vs Position: ${template.vsPositions[scenarioIndex % template.vsPositions.length]}
Stack Depth: ${template.stackDepths[Math.floor(scenarioIndex / template.vsPositions.length) % template.stackDepths.length]}bb` : ''}

${level >= 4 && level <= 6 ? `Scenario Type: ${template.scenarios[scenarioIndex % template.scenarios.length]}
Stack Depth: ${template.stackDepths[Math.floor(scenarioIndex / template.scenarios.length) % template.stackDepths.length]}bb` : ''}

${level >= 7 ? `Scenario Type: ${level === 7 ? template.textures[scenarioIndex % template.textures.length] : template.scenarios[scenarioIndex % template.scenarios.length]}` : ''}

Generate a JSON object with:
1. id: unique identifier (e.g., "l${level}-scenario-${scenarioIndex}")
2. title: descriptive title (e.g., "CO Open 50bb 6-max")
3. description: 1-2 sentence explanation
4. tip: strategic advice for the player
5. solution: object mapping hand combos to actions ('raise', 'call', or 'fold')

For the solution, include ALL relevant hands in standard poker notation:
- Pairs: AA, KK, QQ, JJ, TT, 99, 88, 77, 66, 55, 44, 33, 22
- Suited: AKs, AQs, AJs, ATs, A9s, etc.
- Offsuit: AKo, AQo, AJo, ATo, A9o, etc.

Only include hands that should be in the range. Use GTO principles.

Return ONLY valid JSON, no markdown formatting.`;

    try {
        const response = await grok.chat.completions.create({
            model: 'grok-beta',
            messages: [
                {
                    role: 'system',
                    content: 'You are a GTO poker expert who generates precise, balanced ranges. Always return valid JSON.'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            temperature: 0.3, // Lower temperature for more consistent ranges
        });

        const content = response.choices[0].message.content;

        // Parse JSON from response
        let jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('No JSON found in response');
        }

        const scenario = JSON.parse(jsonMatch[0]);
        scenario.level = level;

        return scenario;
    } catch (error) {
        console.error(`Error generating scenario L${level}-${scenarioIndex}:`, error.message);
        return null;
    }
}

async function generateAllScenarios() {
    console.log('🤖 Starting Grok-powered scenario generation...\n');

    const allScenarios = {};
    let totalGenerated = 0;

    for (let level = 2; level <= 10; level++) {
        const template = LEVEL_TEMPLATES[level];
        console.log(`\n📊 Generating Level ${level}: ${template.name} (${template.count} scenarios)`);

        allScenarios[level] = [];

        for (let i = 0; i < template.count; i++) {
            process.stdout.write(`  Scenario ${i + 1}/${template.count}... `);

            const scenario = await generateScenarioWithGrok(level, template, i);

            if (scenario) {
                allScenarios[level].push(scenario);
                totalGenerated++;
                console.log('✅');
            } else {
                console.log('❌');
            }

            // Rate limiting - wait 500ms between requests
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        console.log(`  ✅ Level ${level} complete: ${allScenarios[level].length} scenarios`);
    }

    console.log(`\n🎉 Generation complete! Total scenarios: ${totalGenerated}`);

    return allScenarios;
}

async function saveScenarios(scenarios) {
    const fs = require('fs').promises;
    const path = require('path');

    // Save as JSON for review
    const outputPath = path.join(__dirname, '../src/games/generated-scenarios.json');
    await fs.writeFile(outputPath, JSON.stringify(scenarios, null, 2));
    console.log(`\n💾 Scenarios saved to: ${outputPath}`);

    // Generate JavaScript code
    let jsCode = '// ═══════════════════════════════════════════════════════════════════════════\n';
    jsCode += '// 🤖 GROK-GENERATED SCENARIOS\n';
    jsCode += '// Generated: ' + new Date().toISOString() + '\n';
    jsCode += '// ═══════════════════════════════════════════════════════════════════════════\n\n';

    for (let level = 2; level <= 10; level++) {
        const template = LEVEL_TEMPLATES[level];
        jsCode += `// ═══════════════════════════════════════════════════════════════════════════\n`;
        jsCode += `// LEVEL ${level}: ${template.name.toUpperCase()} - ${template.focus}\n`;
        jsCode += `// ═══════════════════════════════════════════════════════════════════════════\n`;
        jsCode += `export const LEVEL_${level}_SCENARIOS = ${JSON.stringify(scenarios[level], null, 4)};\n\n`;
    }

    const jsOutputPath = path.join(__dirname, '../src/games/generated-scenarios.js');
    await fs.writeFile(jsOutputPath, jsCode);
    console.log(`📝 JavaScript code saved to: ${jsOutputPath}`);

    console.log('\n✅ Ready to integrate into ScenarioDatabase.js!');
}

async function main() {
    try {
        const scenarios = await generateAllScenarios();
        await saveScenarios(scenarios);

        console.log('\n📋 Next steps:');
        console.log('1. Review generated-scenarios.json');
        console.log('2. Copy LEVEL_X_SCENARIOS from generated-scenarios.js');
        console.log('3. Paste into ScenarioDatabase.js');
        console.log('4. Test in Memory Matrix');
    } catch (error) {
        console.error('❌ Fatal error:', error);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    main();
}

module.exports = { generateAllScenarios, generateScenarioWithGrok };

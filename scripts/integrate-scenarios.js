#!/usr/bin/env node

/**
 * Integration script to merge generated scenarios into ScenarioDatabase.js
 * Reads from generated-scenarios.json and updates the main database file
 */

const fs = require('fs');
const path = require('path');

const GENERATED_FILE = path.join(__dirname, '../src/games/generated-scenarios.json');
const DATABASE_FILE = path.join(__dirname, '../src/games/ScenarioDatabase.js');
const BACKUP_FILE = path.join(__dirname, '../src/games/ScenarioDatabase.backup.js');

async function integrateScenarios() {
    console.log('🔄 Starting scenario integration...\n');

    // 1. Read generated scenarios
    console.log('📖 Reading generated scenarios...');
    const generatedData = JSON.parse(fs.readFileSync(GENERATED_FILE, 'utf8'));

    let totalScenarios = 0;
    for (const level in generatedData) {
        const count = generatedData[level].length;
        totalScenarios += count;
        console.log(`   Level ${level}: ${count} scenarios`);
    }
    console.log(`   Total: ${totalScenarios} scenarios\n`);

    // 2. Backup existing database
    console.log('💾 Creating backup...');
    fs.copyFileSync(DATABASE_FILE, BACKUP_FILE);
    console.log(`   Backup saved to: ${BACKUP_FILE}\n`);

    // 3. Read existing database
    console.log('📖 Reading existing database...');
    let dbContent = fs.readFileSync(DATABASE_FILE, 'utf8');

    // 4. Generate scenario constants for each level
    console.log('🔨 Generating scenario constants...\n');

    for (let level = 2; level <= 10; level++) {
        const scenarios = generatedData[level] || [];
        if (scenarios.length === 0) continue;

        const constantName = `LEVEL_${level}_SCENARIOS`;
        const scenarioCode = `\n// ═══════════════════════════════════════════════════════════════════════════\n// LEVEL ${level} SCENARIOS (AI-Generated)\n// ═══════════════════════════════════════════════════════════════════════════\nexport const ${constantName} = ${JSON.stringify(scenarios, null, 4)};\n`;

        // Find insertion point (before ALL_SCENARIOS)
        const allScenariosIndex = dbContent.indexOf('export const ALL_SCENARIOS');
        if (allScenariosIndex === -1) {
            console.error('❌ Could not find ALL_SCENARIOS in database file');
            process.exit(1);
        }

        // Insert before ALL_SCENARIOS
        dbContent = dbContent.slice(0, allScenariosIndex) + scenarioCode + '\n' + dbContent.slice(allScenariosIndex);

        console.log(`   ✅ Added ${scenarios.length} scenarios for Level ${level}`);
    }

    // 5. Update ALL_SCENARIOS array
    console.log('\n🔨 Updating ALL_SCENARIOS array...');

    const levelConstants = [];
    for (let level = 1; level <= 10; level++) {
        levelConstants.push(`...LEVEL_${level}_SCENARIOS`);
    }

    const allScenariosCode = `export const ALL_SCENARIOS = [\n    ${levelConstants.join(',\n    ')}\n];`;

    // Replace existing ALL_SCENARIOS
    const allScenariosRegex = /export const ALL_SCENARIOS = \[[\s\S]*?\];/;
    dbContent = dbContent.replace(allScenariosRegex, allScenariosCode);

    console.log('   ✅ ALL_SCENARIOS updated\n');

    // 6. Write updated database
    console.log('💾 Writing updated database...');
    fs.writeFileSync(DATABASE_FILE, dbContent, 'utf8');
    console.log(`   ✅ Database updated: ${DATABASE_FILE}\n`);

    // 7. Summary
    console.log('✅ Integration complete!\n');
    console.log('📊 Summary:');
    console.log(`   Total scenarios integrated: ${totalScenarios}`);
    console.log(`   Backup location: ${BACKUP_FILE}`);
    console.log(`   Database location: ${DATABASE_FILE}\n`);
}

// Run integration
integrateScenarios().catch(err => {
    console.error('❌ Integration failed:', err);
    process.exit(1);
});

#!/usr/bin/env node
/**
 * 🚀 BATCH PAGETRANSITION INTEGRATION
 * Automatically adds PageTransition to all remaining hub pages
 */

const fs = require('fs');
const path = require('path');

const PAGES_DIR = path.join(__dirname, '../../pages/hub');

// Pages that need PageTransition (excluding already done: training, profile, social-media)
const pagesToUpdate = [
    'messenger.js',
    'video-library.js',
    'avatars.js',
    'avatars-complete.js',
    'avatars-standalone.js',
    'friends.js',
    'settings.js',
    'notifications.js',
    'news.js',
    'reels.js',
    'article.js',
    'club-arena.js',
    'diamond-arena.js',
    'diamond-store.js',
    '[orbId].js',
    'memory-games.js',
];

// Also check subdirectories
const subDirPages = [
    { dir: 'user', file: '[username].js' },
    { dir: 'training/category', file: '[categoryId].js' },
    { dir: 'training/play', file: '[gameId].js' },
];

function addPageTransitionToFile(filePath) {
    try {
        let content = fs.readFileSync(filePath, 'utf8');
        const fileName = path.basename(filePath);

        // Check if already has PageTransition
        if (content.includes('PageTransition')) {
            console.log(`✓ ${fileName} - Already has PageTransition`);
            return { updated: false, reason: 'already_has' };
        }

        // Add import after God-Mode Stack comment or last import
        const importStatement = "import PageTransition from '../../src/components/transitions/PageTransition';";

        if (content.includes('// God-Mode Stack')) {
            // Add after God-Mode Stack imports
            content = content.replace(
                /(\/\/ God-Mode Stack[\s\S]*?)(import .+ from .+;)/,
                `$1$2\n${importStatement}`
            );
        } else {
            // Find last import and add after it
            const importMatches = content.match(/import .+ from .+;/g);
            if (importMatches && importMatches.length > 0) {
                const lastImport = importMatches[importMatches.length - 1];
                content = content.replace(lastImport, `${lastImport}\n${importStatement}`);
            }
        }

        // Replace main return's <> with <PageTransition>
        content = content.replace(
            /(\s+return \(\s*)<>/,
            '$1<PageTransition>'
        );

        // Replace closing </> with </PageTransition>
        // Find the last </> before the closing of the component
        const lines = content.split('\n');
        let lastFragmentIndex = -1;

        for (let i = lines.length - 1; i >= 0; i--) {
            if (lines[i].includes('</>') && !lines[i].includes('return')) {
                lastFragmentIndex = i;
                break;
            }
        }

        if (lastFragmentIndex !== -1) {
            lines[lastFragmentIndex] = lines[lastFragmentIndex].replace('</>', '</PageTransition>');
            content = lines.join('\n');
        }

        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`✅ ${fileName} - PageTransition added`);
        return { updated: true };

    } catch (error) {
        console.error(`❌ ${path.basename(filePath)} - Error: ${error.message}`);
        return { updated: false, reason: 'error', error: error.message };
    }
}

// Process main pages
let stats = { updated: 0, skipped: 0, errors: 0 };

console.log('\n🚀 Starting PageTransition batch integration...\n');

pagesToUpdate.forEach(page => {
    const filePath = path.join(PAGES_DIR, page);
    if (fs.existsSync(filePath)) {
        const result = addPageTransitionToFile(filePath);
        if (result.updated) stats.updated++;
        else if (result.reason === 'already_has') stats.skipped++;
        else stats.errors++;
    } else {
        console.log(`⚠️  ${page} - File not found`);
    }
});

// Process subdirectory pages
subDirPages.forEach(({ dir, file }) => {
    const filePath = path.join(PAGES_DIR, dir, file);
    if (fs.existsSync(filePath)) {
        const result = addPageTransitionToFile(filePath);
        if (result.updated) stats.updated++;
        else if (result.reason === 'already_has') stats.skipped++;
        else stats.errors++;
    } else {
        console.log(`⚠️  ${dir}/${file} - File not found`);
    }
});

console.log('\n' + '='.repeat(50));
console.log('📊 BATCH INTEGRATION COMPLETE');
console.log('='.repeat(50));
console.log(`✅ Updated: ${stats.updated} pages`);
console.log(`⏭️  Skipped: ${stats.skipped} pages (already have PageTransition)`);
console.log(`❌ Errors: ${stats.errors} pages`);
console.log('='.repeat(50) + '\n');

process.exit(stats.errors > 0 ? 1 : 0);

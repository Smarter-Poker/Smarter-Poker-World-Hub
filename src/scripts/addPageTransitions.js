/**
 * 🎨 BATCH PAGE TRANSITION INTEGRATION
 * Script to add PageTransition wrapper to all hub pages
 */

const fs = require('fs');
const path = require('path');

const PAGES_DIR = path.join(__dirname, '../../../pages/hub');

const pagesToUpdate = [
    'social-media.js',
    'messenger.js',
    'video-library.js',
    'avatars.js',
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
];

function addPageTransition(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');

    // Check if already has PageTransition
    if (content.includes('PageTransition')) {
        console.log(`✓ ${path.basename(filePath)} already has PageTransition`);
        return false;
    }

    // Add import after other imports
    const importLine = "import PageTransition from '../../src/components/transitions/PageTransition';";

    // Find the last import statement
    const importRegex = /import .+ from .+;/g;
    const imports = content.match(importRegex);
    if (imports && imports.length > 0) {
        const lastImport = imports[imports.length - 1];
        content = content.replace(lastImport, `${lastImport}\n${importLine}`);
    }

    // Replace <> with <PageTransition> in main return
    content = content.replace(
        /export default function \w+\([^)]*\) {[\s\S]*?return \(\s*<>/,
        (match) => match.replace('<>', '<PageTransition>')
    );

    // Replace closing </> with </PageTransition>
    const lines = content.split('\n');
    let bracketCount = 0;
    let foundReturn = false;

    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('return (')) {
            foundReturn = true;
        }
        if (foundReturn) {
            bracketCount += (lines[i].match(/<>/g) || []).length;
            bracketCount -= (lines[i].match(/<\/>/g) || []).length;

            if (lines[i].includes('</>') && bracketCount === 0) {
                lines[i] = lines[i].replace('</>', '</PageTransition>');
                break;
            }
        }
    }

    content = lines.join('\n');

    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✓ Added PageTransition to ${path.basename(filePath)}`);
    return true;
}

// Run the script
let updated = 0;
pagesToUpdate.forEach(page => {
    const filePath = path.join(PAGES_DIR, page);
    if (fs.existsSync(filePath)) {
        if (addPageTransition(filePath)) {
            updated++;
        }
    } else {
        console.log(`✗ File not found: ${page}`);
    }
});

console.log(`\n✨ Updated ${updated} pages with PageTransition`);

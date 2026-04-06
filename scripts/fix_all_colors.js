const fs = require('fs');
const path = require('path');

function replaceColorsInFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');

    // Skip venuesMap.jsx because it has home_game defined as gold and we don't want to touch it, although we could.
    // Let's just avoid replacing 'home_game: { fill: '#d4a853'' in VenueMap.jsx
    if (filePath.endsWith('VenueMap.jsx') || filePath.endsWith('VenueCard.jsx')) {
        return; // We already handled VenueMap and VenueCard in previous turn for Home Games
    }
    
    let original = content;

    // Hex replacements
    content = content.replace(/#d4a853/gi, '#ffffff');
    content = content.replace(/#f5d799/gi, '#e2e8f0');
    content = content.replace(/#b8860b/gi, '#cbd5e1');
    content = content.replace(/#ffd700/gi, '#ffffff');
    content = content.replace(/#ffd500/gi, '#ffffff');
    
    // RGBA replacements for 212,168,83
    content = content.replace(/212,168,83/g, '255,255,255');
    // RGBA replacements for 184,134,11
    content = content.replace(/184,134,11/g, '200,214,229');

    if (content !== original) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Updated ${filePath}`);
    }
}

function walkDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            walkDir(fullPath);
        } else if (fullPath.endsWith('.css') || fullPath.endsWith('.jsx') || fullPath.endsWith('.js')) {
            replaceColorsInFile(fullPath);
        }
    }
}

walkDir('/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/styles');
walkDir('/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/src/components/poker-near-me');

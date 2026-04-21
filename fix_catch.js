const fs = require('fs');

function fixCatchInFile(filepath) {
    let content = fs.readFileSync(filepath, 'utf8');
    
    // Pattern 1: catch {} -> catch (e) { console.warn('[App] Exception:', e); }
    content = content.replace(/catch\s*\{\s*\}/g, "catch (e) { console.warn('[App] Exception:', e); }");
    
    // Pattern 2: catch { -> catch (e) { console.warn('[App] Exception:', e); 
    // This happens sometimes but usually implies an empty catch body if the next char is }
    // which is covered by Pattern 1. If there's newlines, let's fix it safely:
    content = content.replace(/catch\s*\{\s*\n\s*\}/g, "catch (e) {\nconsole.warn('[App] Exception:', e);\n}");

    fs.writeFileSync(filepath, content, 'utf8');
    console.log('Fixed', filepath);
}

fixCatchInFile('/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/pages/hub/reels.js');

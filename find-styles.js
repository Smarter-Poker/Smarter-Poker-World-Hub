const fs = require('fs');

function extractHugeBlocks(filePath) {
    const code = fs.readFileSync(filePath, 'utf8');
    
    // Find all <style jsx
    const lines = code.split('\n');
    let inStyle = false;
    let styleStart = 0;
    let styleBlocks = [];
    
    for(let i=0; i<lines.length; i++) {
        if(lines[i].includes('<style jsx')) {
            inStyle = true;
            styleStart = i;
        }
        if(inStyle && lines[i].includes('</style>')) {
            inStyle = false;
            styleBlocks.push({ start: styleStart, end: i, lines: i - styleStart });
        }
    }
    
    console.log(`Found ${styleBlocks.length} style blocks:`);
    styleBlocks.forEach((b, idx) => console.log(`Block ${idx}: Line ${b.start} to ${b.end} (${b.lines} lines)`));
}

extractHugeBlocks('pages/hub/poker-near-me.js');

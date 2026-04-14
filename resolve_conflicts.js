const fs = require('fs');
const glob = require('glob');

function resolveFile(filePath, prefer='upstream') {
    let content = fs.readFileSync(filePath, 'utf-8');
    
    // Quick check if file has conflict markers
    if (!content.includes('<<<<<<< Updated upstream')) return;

    console.log(`Resolving ${filePath} using ${prefer}...`);

    // Matches the entire conflict block:
    // <<<<<<< Updated upstream
    // (Upstream Content)
    // =======
    // (Stashed Content)
    // >>>>>>> Stashed changes
    
    // Because there can be double markers like:
    // <<<<<<< Updated upstream
    // <<<<<<< Updated upstream
    // ...
    // we need to be careful. The best way is to use a regex that matches the innermost block, or just standard block parsing.

    const lines = content.split('\n');
    const outLines = [];
    let state = 'NORMAL'; // NORMAL, IN_UPSTREAM, IN_STASH
    let upstreamContent = [];
    let stashContent = [];
    let skipCount = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        if (line.startsWith('<<<<<<< Updated upstream')) {
            if (state === 'NORMAL') {
                state = 'IN_UPSTREAM';
                upstreamContent = [];
                stashContent = [];
            }
            continue;
        }
        
        if (line.startsWith('=======')) {
            if (state === 'IN_UPSTREAM') {
                state = 'IN_STASH';
            }
            continue;
        }
        
        if (line.startsWith('>>>>>>> Stashed changes')) {
            if (state === 'IN_STASH') {
                // Resolution time!
                if (prefer === 'upstream') {
                    outLines.push(...upstreamContent);
                } else {
                    outLines.push(...stashContent);
                }
                state = 'NORMAL';
            }
            continue;
        }
        
        if (state === 'NORMAL') {
            outLines.push(line);
        } else if (state === 'IN_UPSTREAM') {
            upstreamContent.push(line);
        } else if (state === 'IN_STASH') {
            stashContent.push(line);
        }
    }

    fs.writeFileSync(filePath, outLines.join('\n'));
}

const files = [
    'src/components/poker-near-me/NewSeriesVenueCard.jsx',
    'src/hooks/useTrackedTours.js',
    'pages/hub/poker-series.js',
    'pages/hub/series/[id].js'
];

files.forEach(f => resolveFile(f, 'upstream'));

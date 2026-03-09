const fs = require('fs');

function checkFile(filename) {
    const src = fs.readFileSync(filename, 'utf-8');
    let errors = [];

    // Check for unused standard hooks
    const hooks = ['useState', 'useEffect', 'useCallback', 'useMemo', 'useRef'];
    for (const hook of hooks) {
        if (src.includes(hook) && !src.match(new RegExp(`\\b${hook}\\b`, 'g')) || src.match(new RegExp(`\\b${hook}\\b`, 'g'))?.length === 1) {
             if (src.includes(`import {`) && src.includes(hook)) {
                // Check if it's actually used in the code besides the import
                const uses = src.split(hook).length - 1;
                if (uses <= 1) errors.push(`Unused hook: ${hook}`);
             }
        }
    }

    // Check next/router
    if (src.includes('useRouter') && src.split('useRouter').length <= 2) {
        errors.push('Unused useRouter');
    }

    // Check framer-motion
    if (src.includes('AnimatePresence') && src.split('AnimatePresence').length <= 2) {
        errors.push('Unused AnimatePresence');
    }
    
    // Check busEmit definition vs usage
    if (src.includes('function busEmit') && src.split('busEmit').length <= 2) {
        errors.push('Unused busEmit');
    }

    // Check saveSession definition vs usage
    if (src.includes('function saveSession') && src.split('saveSession').length <= 2) {
        errors.push('Unused saveSession');
    }

    console.log(`--- ${filename} ---`);
    if (errors.length === 0) console.log('✅ Static Checks Passed');
    else console.log('❌ Errors:', errors.join(', '));
}

checkFile('./pages/hub/training/quiz-gauntlet.js');
checkFile('./pages/hub/training/preflop-advisor.js');
checkFile('./pages/hub/training/spr-trainer.js');


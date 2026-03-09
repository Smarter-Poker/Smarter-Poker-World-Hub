const fs = require('fs');
const path = require('path');

const files = [
    './pages/hub/training/quiz-gauntlet.js',
    './pages/hub/training/preflop-advisor.js',
    './pages/hub/training/spr-trainer.js'
];

let allPassed = true;

for (const f of files) {
    const src = fs.readFileSync(path.join(__dirname, f), 'utf-8');
    let errors = [];

    // Check hooks
    const hooks = ['useState', 'useEffect', 'useCallback', 'useMemo', 'useRef'];
    for (const hook of hooks) {
        if (src.includes(`import {`) && src.includes(hook)) {
            const matches = src.match(new RegExp(`\\b${hook}\\b`, 'g')) || [];
            if (matches.length <= 1) {
                errors.push(`Unused hook imported: ${hook}`);
            }
        }
    }

    // Check specific globals/imports
    if (src.includes('useRouter') && (src.match(/\\buseRouter\\b/g) || []).length <= 2) {
        if (src.split('useRouter').length <= 2) errors.push('Unused useRouter');
    }

    // Check busEmit
    if (src.includes('function busEmit') && src.split('busEmit').length <= 2) {
        errors.push('Unused busEmit');
    }

    // Check saveSession
    if (src.includes('function saveSession') && src.split('saveSession').length <= 2) {
        errors.push('Unused saveSession');
    }

    console.log(`--- Auditing ${path.basename(f)} ---`);
    if (errors.length === 0) {
        console.log('✅ All Static Checks Passed');
    } else {
        console.log('❌ Errors Found:');
        errors.forEach(e => console.log(`  - ${e}`));
        allPassed = false;
    }
}

if (allPassed) {
    console.log('\\n✅✅✅ VERIFICATION 100% SUCCESSFUL ✅✅✅');
} else {
    console.log('\\n❌❌❌ VERIFICATION FAILED ❌❌❌');
}

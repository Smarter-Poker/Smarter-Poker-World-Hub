const fs = require('fs');
const path = require('path');

const targetDirs = ['pages', 'src'];
let suspiciousFiles = [];

function walk(dir) {
    const list = fs.readdirSync(dir);
    for (const file of list) {
        const fullPath = path.resolve(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            walk(fullPath);
        } else if (fullPath.endsWith('.js') || fullPath.endsWith('.jsx')) {
            checkFile(fullPath);
        }
    }
}

function checkFile(file) {
    let content = '';
    try {
        content = fs.readFileSync(file, 'utf8');
    } catch (e) {
        return;
    }
    let issues = [];

    // 1. Check for orphaned loading="lazy">
    // Specifically, regex injections might have placed it improperly in the middle of JS logic
    if (content.match(/([;=,{])\s*loading="lazy">/)) {
        issues.push('Orphaned loading="lazy"> tag detected in JS logic context');
    }

    // 2. Check for Temporal Dead Zone (TDZ) issues with useCommanderSync
    // If useCommanderSync references a callback (like fetchEvents) that is defined AFTER the hook as a const/let arrow function.
    if (content.includes('useCommanderSync(')) {
        const regex = /useCommanderSync\([^,]+,\s*([a-zA-Z0-9_]+)\s*,/g;
        let match;
        while ((match = regex.exec(content)) !== null) {
            const callbackName = match[1];
            // Exclude obvious inline or reserved keywords
            if (!['function', 'async', 'true', 'false', 'null'].includes(callbackName)) {
                const declRegex = new RegExp(`(?:const|let)\\s+${callbackName}\\s*=\\s*(?:async\\s*)?(?:\\([^)]*\\)|[^=]+)\\s*=>`);
                const declMatch = declRegex.exec(content);
                if (declMatch && declMatch.index > match.index) {
                    issues.push(`TDZ Risk: Arrow function '${callbackName}' is defined AFTER useCommanderSync hook`);
                }
            }
        }
    }

    // 3. Catch stray closing braces from Claude Optimizer AbortController sweep
    // The sweep appended `return () => _c.abort();` improperly.
    // Count if there are severe imbalances of { } and ( ) if we strip strings.
    // Actually, the Next.js SWC compiler handles perfect bracket matching. If it compiles, brackets are matched.
    // However, logical mismatch (like closing a function early and injecting code outside it) can compile but act weird.
    // Let's check for `});` closing something that was meant to be an object `};` but we already fixed all build errors.

    if (issues.length > 0) {
        suspiciousFiles.push({ file, issues });
    }
}

targetDirs.forEach(dir => {
    if (fs.existsSync(dir)) walk(dir);
});

console.log(JSON.stringify(suspiciousFiles, null, 2));

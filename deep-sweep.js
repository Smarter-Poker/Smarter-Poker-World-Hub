const fs = require('fs');
const path = require('path');
const dirs = ['pages', 'src'];
let totalFiles = 0;
let lintIssues = [];

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
            if (!file.includes('node_modules') && !file.includes('.next')) {
                results = results.concat(walk(file));
            }
        } else if (file.endsWith('.js') || file.endsWith('.jsx')) {
            results.push(file);
        }
    });
    return results;
}

const allFiles = dirs.flatMap(d => walk(path.join(__dirname, d)));

allFiles.forEach(file => {
    totalFiles++;
    const src = fs.readFileSync(file, 'utf-8');
    const relFile = path.relative(__dirname, file);
    
    // 1. Unused imports (simplified heuristic)
    const importRegex = /import\s+({[^}]+}|[^{\s]+)\s+from\s+['"][^'"]+['"]/g;
    let match;
    while ((match = importRegex.exec(src)) !== null) {
        let items = match[1].replace(/[{}]/g, '').split(',').map(i => i.trim());
        items.forEach(item => {
            if (item && item !== 'React') {
                // Simple regex to check if item is used outside the import statement
                const bodyMatches = src.split(new RegExp(`\\b${item}\\b`));
                if (bodyMatches.length <= 2) {
                    lintIssues.push(`${relFile}: Unused import -> ${item}`);
                }
            }
        });
    }

    // 2. React map without key (simple heuristic)
    if (src.includes('.map(') && src.includes('<') && !src.includes('key={') && !src.includes('key=')) {
        lintIssues.push(`${relFile}: Possible .map() returning elements without 'key' prop`);
    }

    // 3. Unhandled promises (missing await/catch) inside effects/handlers
    // Skipped complex checks, stick to the most harmful silent ones

    // 4. Console.logs in production code (excluding API and admin)
    if (!relFile.includes('api/') && !relFile.includes('admin/') && src.includes('console.log(')) {
        lintIssues.push(`${relFile}: Contains console.log`);
    }
});

console.log(`Scanned ${totalFiles} files. Found ${lintIssues.length} potential issues.`);
const grouped = {};
lintIssues.forEach(issue => {
    const parts = issue.split(': ');
    const f = parts[0];
    const msg = parts[1];
    if (!grouped[f]) grouped[f] = [];
    grouped[f].push(msg);
});

// Output top 20 files with issues
let i = 0;
for (const [f, issues] of Object.entries(grouped)) {
    if (issues.length > 0 && !issues.every(i => i.includes('console.log'))) {
        console.log(`\n${f}:`);
        issues.filter(i => !i.includes('console.log')).forEach(i => console.log(`  - ${i}`));
        i++;
        if (i >= 20) break;
    }
}

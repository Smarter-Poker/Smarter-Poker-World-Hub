const fs = require('fs');
const path = require('path');

const dir = 'pages/hub/club-arena';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.js'));

let totalFixed = 0;

files.forEach(filename => {
    const filePath = path.join(dir, filename);
    let content = fs.readFileSync(filePath, 'utf8');
    const original = content;

    // 1. Fix select queries: replace 'alias' with 'display_name' in profiles select
    content = content.replace(
        /profiles[!:][^(]*\(([^)]*)\balias\b([^)]*)\)/g,
        (match, before, after) => {
            return match.replace('alias', 'display_name');
        }
    );

    // 2. Fix UI references: profiles?.alias → profiles?.display_name
    content = content.replace(/profiles\?\.alias/g, 'profiles?.display_name');

    // 3. Fix destructured references: .alias → .display_name
    content = content.replace(/\.profiles\.alias/g, '.profiles.display_name');

    if (content !== original) {
        fs.writeFileSync(filePath, content, 'utf8');
        const changes = (content.match(/display_name/g) || []).length - (original.match(/display_name/g) || []).length;
        console.log(`FIXED: ${filename} (${changes} alias → display_name)`);
        totalFixed++;
    } else {
        console.log(`SKIP: ${filename} (no alias references)`);
    }
});

console.log(`\nTotal files fixed: ${totalFixed}`);

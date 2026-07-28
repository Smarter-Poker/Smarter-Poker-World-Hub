const fs = require('fs');
const glob = require('glob'); // Note: we can just use child_process for git ls-files

const { execSync } = require('child_process');

const files = execSync('git ls-files -m pages/api').toString().split('\n').filter(Boolean);

for (const file of files) {
    let content = fs.readFileSync(file, 'utf8');
    
    // We injected: const authData = { user: authUser };
    if (content.includes('const authData = { user: authUser };')) {
        // Remove the duplicate const authUser = authData?.user; 
        // Note: it might have let authUser, or be indented.
        const regex = /(const|let)\s+authUser\s*=\s*authData\?\.user\s*;/g;
        if (regex.test(content)) {
            content = content.replace(regex, '/* removed duplicate authUser */');
            fs.writeFileSync(file, content);
            console.log(`Fixed ${file}`);
        }
    }
}

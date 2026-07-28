const fs = require('fs');
const glob = require('glob'); // Note: if glob not installed, we can just recursively read dir
const path = require('path');

function walkDir(dir, callback) {
    fs.readdirSync(dir).forEach(f => {
        let dirPath = path.join(dir, f);
        let isDirectory = fs.statSync(dirPath).isDirectory();
        isDirectory ? 
            walkDir(dirPath, callback) : callback(path.join(dir, f));
    });
}

walkDir('pages/api', (filePath) => {
    if (!filePath.endsWith('.js') && !filePath.endsWith('.ts')) return;
    
    let content = fs.readFileSync(filePath, 'utf8');
    if (!content.includes('auth.getUser(')) return;
    
    // We only want to replace instances that are standard getSupabase().auth.getUser(token)
    // or similar.
    // If we can't reliably parse it with regex, we'll just log it.
    let updated = false;

    // Pattern 1: const { data: authData, error: authErr } = await getSupabase().auth.getUser(token);
    // Pattern 2: const { data: authData, error: authError } = await getSupabase().auth.getUser(token);
    // Pattern 3: const { data: authData } = await getSupabase().auth.getUser(token);
    const regex1 = /const\s*\{\s*data\s*:\s*authData(?:\s*,\s*error\s*:\s*[^}]+)?\s*\}\s*=\s*await\s*(?:getSupabase\(\)|sb|mainDb)\.auth\.getUser\([^)]+\)\s*;/g;
    
    if (regex1.test(content)) {
        content = content.replace(regex1, "const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());\n    const authData = { user: authUser };");
        updated = true;
    }

    if (updated) {
        // compute relative depth for import
        const depth = filePath.split('/').length - 1; // e.g. pages/api/foo.js -> 3
        const prefix = '../'.repeat(depth - 1);
        const importPath = `${prefix}src/lib/serverAuth`;
        
        if (!content.includes('getServerUserWithFallback')) {
            content = `import { getServerUserWithFallback } from '${importPath}';\n` + content;
        }
        
        fs.writeFileSync(filePath, content);
        console.log(`Updated ${filePath}`);
    } else {
        console.log(`Needs manual update: ${filePath}`);
    }
});

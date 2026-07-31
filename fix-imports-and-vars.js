const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
    fs.readdirSync(dir).forEach(f => {
        let dirPath = path.join(dir, f);
        let isDirectory = fs.statSync(dirPath).isDirectory();
        isDirectory ? 
            walkDir(dirPath, callback) : callback(dirPath);
    });
}

walkDir('pages/api', (filePath) => {
    if (!filePath.endsWith('.js') && !filePath.endsWith('.ts')) return;
    
    let content = fs.readFileSync(filePath, 'utf8');
    let updated = false;

    // Fix userError -> authErr
    if (content.includes('userError || !user')) {
        content = content.replace(/userError \|\| !user/g, 'authErr || !user');
        updated = true;
    }
    if (content.includes('authError || !user')) {
        content = content.replace(/authError \|\| !user/g, 'authErr || !user');
        updated = true;
    }

    // Add missing import for getServerUserWithFallback
    if (content.includes('getServerUserWithFallback') && !content.includes('import { getServerUserWithFallback }')) {
        const depth = filePath.split('/').length - 1; 
        const prefix = '../'.repeat(depth - 1);
        const importPath = `${prefix}src/lib/serverAuth`;
        
        content = `import { getServerUserWithFallback } from '${importPath}';\n` + content;
        updated = true;
    }

    if (updated) {
        fs.writeFileSync(filePath, content);
        console.log(`Fixed ${filePath}`);
    }
});

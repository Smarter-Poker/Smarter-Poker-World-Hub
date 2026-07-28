const fs = require('fs');

function updateFile(filePath, isDepth4) {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Check if getServerUserWithFallback is imported
    if (!content.includes('getServerUserWithFallback')) {
        const importPath = isDepth4 ? '../../../../src/lib/serverAuth' : '../../../src/lib/serverAuth';
        const importStatement = `import { getServerUserWithFallback } from '${importPath}';\n`;
        content = importStatement + content;
    }
    
    // Replace auth.getUser
    if (content.includes('auth.getUser(token)')) {
        content = content.replace(
            /const \{ data: authData(?:, error: authErr)? \} = await getSupabase\(\)\.auth\.getUser\(token\);/g,
            "const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());\n                  const authData = { user: authUser };"
        );
        fs.writeFileSync(filePath, content);
        console.log(`Updated ${filePath}`);
    } else {
        console.log(`No match in ${filePath}`);
    }
}

updateFile('pages/api/trivia/daily.js', false);
updateFile('pages/api/poker/checkins/whos-here.js', true);

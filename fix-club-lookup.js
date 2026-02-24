const fs = require('fs');
const files = [
    'pages/hub/club-arena/admin.js',
    'pages/hub/club-arena/leaderboard.js',
    'pages/hub/club-arena/messages.js',
    'pages/hub/club-arena/lobby.js',
    'pages/hub/club-arena/cashier.js',
    'pages/hub/club-arena/marketplace.js',
    'pages/hub/club-arena/hand-histories.js',
    'pages/hub/club-arena/player-stats.js',
];

const UUID_LINE = `const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clubIdParam);`;

files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');

    if (!content.includes(".eq('club_id', clubIdParam)")) {
        console.log('SKIP (already fixed):', file);
        return;
    }

    // Add isUUID detection before the supabase query block
    if (!content.includes('isUUID')) {
        // Multi-line format: const { data: clubData } = await supabase
        const multiLineIdx = content.indexOf("const { data: clubData } = await supabase");
        if (multiLineIdx > 0) {
            // Find the start of the line to get proper indentation
            const lineStart = content.lastIndexOf('\n', multiLineIdx);
            const indent = content.substring(lineStart + 1, multiLineIdx).replace(/\S.*/g, '');
            content = content.substring(0, multiLineIdx) + UUID_LINE + '\n' + indent + content.substring(multiLineIdx);
        }

        // Inline format in messages.js: const { data: clubData } = await supabase.from('clubs')...
        if (!content.includes('isUUID')) {
            const inlineIdx = content.indexOf("await supabase.from('clubs').select('*').eq('club_id', clubIdParam)");
            if (inlineIdx > 0) {
                const lineStart = content.lastIndexOf('\n', inlineIdx);
                const indent = content.substring(lineStart + 1, inlineIdx).replace(/\S.*/g, '');
                // Find the beginning of the const statement
                const constIdx = content.lastIndexOf('const', inlineIdx);
                content = content.substring(0, constIdx) + UUID_LINE + '\n' + indent + content.substring(constIdx);
            }
        }
    }

    // Replace .eq('club_id', clubIdParam) with dynamic check
    content = content.replace(
        /\.eq\('club_id', clubIdParam\)/g,
        ".eq(isUUID ? 'id' : 'club_id', clubIdParam)"
    );

    fs.writeFileSync(file, content, 'utf8');
    console.log('FIXED:', file);
});

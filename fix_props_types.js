const fs = require('fs');

// Fix props.ts
let file = fs.readFileSync('pages/api/mlb/props.ts', 'utf8');
file = file.replace(/so\?: number \| null;\n\s*whip\?: number \| null;/g, "so?: number | null;\n      whip?: number | null;\n      ip?: number | null;\n      g?: number | null;\n      gs?: number | null;\n      k_per_ip?: number | null;\n      k_per_g?: number | null;");
fs.writeFileSync('pages/api/mlb/props.ts', file, 'utf8');

// Fix players.tsx
let playersFile = fs.readFileSync('pages/hub/MLB-ANALYTICS/players.tsx', 'utf8');
playersFile = playersFile.replace(/so: number \| null;\n\s*whip: number \| null;/g, "so: number | null;\n  whip: number | null;\n  k_per_ip?: number | null;\n  k_per_g?: number | null;");
fs.writeFileSync('pages/hub/MLB-ANALYTICS/players.tsx', playersFile, 'utf8');


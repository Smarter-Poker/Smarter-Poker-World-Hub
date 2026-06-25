const fs = require('fs');
let file = fs.readFileSync('pages/hub/MLB-ANALYTICS/players.tsx', 'utf8');

file = file.replace(/  ip\?: number;\n  g\?: number;\n  gs\?: number;\n  k_per_ip\?: number;\n  k_per_g\?: number;\n  k\?: number;\n  ip\?: number;\n  gs\?: number;\n  g\?: number;/, 
"  k_per_ip?: number;\n  k_per_g?: number;\n  k?: number;\n  ip?: number;\n  gs?: number;\n  g?: number;");

fs.writeFileSync('pages/hub/MLB-ANALYTICS/players.tsx', file, 'utf8');

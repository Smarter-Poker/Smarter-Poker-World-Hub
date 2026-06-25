const fs = require('fs');
let file = fs.readFileSync('pages/hub/MLB-ANALYTICS/index.tsx', 'utf8');

file = file.replace(/    rlScore = Math.max\(0, Math.round\(mlScore \* 0\.7\)\); \/\/ Scale down proxy\n    rlTier = getTier\(rlScore\);\n/g, "");
file = file.replace(/    ouScore = Math.max\(0, Math.round\(mlScore \* 0\.6\)\);\n    ouTier = getTier\(ouScore\);\n/g, "");
file = file.replace(/    let choice = overFv < underFv \? 'Over' : 'Under';\n    if \(overFv === underFv\) choice = g.gamePk % 2 === 0 \? 'Over' : 'Under';\n    ouRec = `\$\{choice\} \$\{g.avgTotalLine\}`;\n/g, "    ouRec = `O/U ${g.avgTotalLine}`;\n");

fs.writeFileSync('pages/hub/MLB-ANALYTICS/index.tsx', file, 'utf8');

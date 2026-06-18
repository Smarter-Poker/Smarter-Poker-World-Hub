const fs = require('fs');
const file = 'pages/hub/MLB-ANALYTICS/teams/[team_id].tsx';
let content = fs.readFileSync(file, 'utf8');

// Revert the bad avg/ops replacements
content = content.replace(/\(adv\.avg != null \? Number\(adv\.avg\)\.toFixed\(3\) : null\)\.replace\(\/\^0\/\, ''\) \|\| '-'/g, "(adv.avg != null ? Number(adv.avg).toFixed(3).replace(/^0/, '') : '-')");
content = content.replace(/\(adv\.ops != null \? Number\(adv\.ops\)\.toFixed\(3\) : null\)\.replace\(\/\^0\/\, ''\) \|\| '-'/g, "(adv.ops != null ? Number(adv.ops).toFixed(3).replace(/^0/, '') : '-')");

fs.writeFileSync(file, content);

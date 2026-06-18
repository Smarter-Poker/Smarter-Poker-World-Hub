const fs = require('fs');
const file = 'pages/hub/MLB-ANALYTICS/teams/[team_id].tsx';
let content = fs.readFileSync(file, 'utf8');

// Fix standard adv.xxx?.toFixed(N)
content = content.replace(/adv\.([a-z_]+)\?\.toFixed\(([0-9]+)\)/g, '(adv.$1 != null ? Number(adv.$1).toFixed($2) : null)');

// Fix Total WAR
content = content.replace(/\(\(adv\.hitting_war \|\| 0\) \+ \(adv\.pitching_war \|\| 0\)\)\.toFixed\(1\)/g, '(Number(adv.hitting_war || 0) + Number(adv.pitching_war || 0)).toFixed(1)');

fs.writeFileSync(file, content);
console.log('Fixed team_id.tsx');

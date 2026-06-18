const fs = require('fs');
const file = 'pages/hub/MLB-ANALYTICS/status.tsx';
let lines = fs.readFileSync(file, 'utf8').split('\n');
lines.splice(210, 13);
fs.writeFileSync(file, lines.join('\n'));
console.log('Fixed');

const fs = require('fs');
const path = './pages/hub/MLB-ANALYTICS/best-bets.tsx';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(/\.slice\(0, 8\)/g, '.slice(0, 10)');
content = content.replace(/\.slice\(0, 12\)/g, '.slice(0, 10)');

fs.writeFileSync(path, content);
console.log('Fixed slices');

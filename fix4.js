const fs = require('fs');
const path = './pages/hub/MLB-ANALYTICS/best-bets.tsx';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
  /: bet\.market === 'moneyline' \|\| bet\.market === 'h2h'\n\s*\?\s*`Bet The \$\{stripCity\(selectionLabel\(bet\?\.selection, bet\?\.matchup\)\)\} Money Line \$\{bet\.odds_american > 0 \? '\+' : ''\}\$\{bet\.odds_american \|\| ''\}`/g,
  `: bet.market === 'moneyline' || bet.market === 'h2h'\n                ? \`Bet The Money Line \${bet.odds_american > 0 ? '+' : ''}\${bet.odds_american || ''}\``
);

fs.writeFileSync(path, content);
console.log('Reverted to exact wording');

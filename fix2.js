const fs = require('fs');
const path = './pages/hub/MLB-ANALYTICS/best-bets.tsx';
let content = fs.readFileSync(path, 'utf8');

// Fix mostLikelyToWin sorting
content = content.replace(
  /const mostLikelyToWin = useMemo\(\(\) => \{\s*return \[\.\.\.bets\]\s*\.filter\(\(b\) => b\.bet_type === 'line' && \(b\.market === 'h2h' \|\| b\.market === 'moneyline'\)\)\s*\.sort\(\(a, b\) => \(Number\(b\.win_confidence\) \|\| 0\) - \(Number\(a\.win_confidence\) \|\| 0\)\)/,
  `const mostLikelyToWin = useMemo(() => {
    return [...bets]
      .filter((b) => b.bet_type === 'line' && (b.market === 'h2h' || b.market === 'moneyline'))
      .sort((a, b) => (Number(b.win_pct) || 0) - (Number(a.win_pct) || 0))`
);

// Fix BetCard text for Money Line
content = content.replace(
  /: bet\.market === 'moneyline'\s*\?\s*`Bet The Money Line \$\{bet\.odds_american > 0 \? '\+' : ''\}\$\{bet\.odds_american \|\| ''\}`/g,
  `: bet.market === 'moneyline' || bet.market === 'h2h'\n                ? \`Bet The Money Line \${bet.odds_american > 0 ? '+' : ''}\${bet.odds_american || ''}\``
);

content = content.replace(
  /\$\{bet\.market === 'moneyline' \? 'text-\[24px\] whitespace-normal' : 'text-\[34px\] truncate'\}/g,
  `\${(bet.market === 'moneyline' || bet.market === 'h2h') ? 'text-[24px] whitespace-normal' : 'text-[34px] truncate'}`
);

fs.writeFileSync(path, content);
console.log('Fixed fix2.js');

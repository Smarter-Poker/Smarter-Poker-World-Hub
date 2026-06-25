const fs = require('fs');
const path = './pages/hub/MLB-ANALYTICS/best-bets.tsx';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
  /<div\s*className="text-\[34px\] font-black text-white capitalize leading-tight truncate"\s*style=\{\{ fontFamily: '"Rajdhani", sans-serif' \}\}\s*>\s*\{isTotalBet/g,
  `<div
              className={\`font-black text-white capitalize leading-tight \${bet.market === 'moneyline' ? 'text-[24px] whitespace-normal' : 'text-[34px] truncate'}\`}
              style={{ fontFamily: '"Rajdhani", sans-serif' }}
            >
              {isTotalBet`
);

fs.writeFileSync(path, content);
console.log("Fixed font size");

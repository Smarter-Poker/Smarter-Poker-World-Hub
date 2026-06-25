const fs = require('fs');
const content = fs.readFileSync('./pages/hub/MLB-ANALYTICS/best-bets.tsx', 'utf8');

const regex = /const BetDetailModal = \(\{ bet, onClose \}: \{ bet: any; onClose: \(\) => void \}\) => \{([\s\S]*?)\};\n\n\/\/ ──────────────────────────────────────────────────────────────────────────────\n\/\/ Bet Card/m;
const match = content.match(regex);
console.log(match ? "Found BetDetailModal" : "Not Found");
if (match) {
  let modalContent = match[1];
  console.log("Length:", modalContent.length);
}

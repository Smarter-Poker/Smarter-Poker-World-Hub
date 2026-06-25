const fs = require('fs');
const path = '/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/pages/hub/MLB-ANALYTICS/best-bets.tsx';
let content = fs.readFileSync(path, 'utf8');

// The groups title logic needs to look good.
// "f5_moneyline" -> "Top F5 Moneyline"
const oldTitleGen = `        groups.push({ title: \`Top \${market.replace(/_/g, ' ')}\`, bets: sorted });`;
const newTitleGen = `        const titleMarket = market.replace(/_/g, ' ');
        const finalTitle = titleMarket.includes('f5') 
          ? \`Top \${titleMarket.replace('f5', 'F5')}\` 
          : \`Top \${titleMarket}\`;
        groups.push({ title: finalTitle, bets: sorted });`;

content = content.replace(oldTitleGen, newTitleGen);

// Make sure category title rendering preserves capitalization and doesn't squash F5
const oldSectionTitle = `<SectionHeader icon={Icon || Zap} label={toTitleCase(title)} />`;
const newSectionTitle = `<SectionHeader icon={Icon || Zap} label={title.toUpperCase()} />`;
content = content.replace(oldSectionTitle, newSectionTitle);

fs.writeFileSync(path, content);

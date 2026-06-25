const fs = require('fs');
const path = '/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/pages/hub/MLB-ANALYTICS/best-bets.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Fix BetCard Money Line Display
const oldBetCardML = `? \`Bet The Money Line \${bet.odds_american > 0 ? '+' : ''}\${bet.odds_american || ''}\``;
const newBetCardML = `? 'Bet The Money Line'`;
content = content.replace(oldBetCardML, newBetCardML);

const oldBetCardTitle = `                : bet.market === 'moneyline' || bet.market === 'h2h'
                ? 'Bet The Money Line'
                : \`\${stripCity(selectionLabel(bet?.selection, bet?.matchup))} \${lineStr}\`}`;
const newBetCardTitle = `                : bet.market === 'moneyline' || bet.market === 'h2h'
                ? 'Bet The Money Line'
                : \`\${stripCity(selectionLabel(bet?.selection, bet?.matchup))} \${lineStr}\`}
              {/* Insert Team and Price for Moneyline */}
              {(bet.market === 'moneyline' || bet.market === 'h2h') && !isTotalBet && (
                <div className="text-[24px] font-black mt-1" style={{ fontFamily: '"Rajdhani", sans-serif', color: '#00D4FF' }}>
                  {stripCity(selectionLabel(bet?.selection, bet?.matchup))} {formatOdds(bet.best_price)}
                </div>
              )}`;
content = content.replace(oldBetCardTitle, newBetCardTitle);

// 2. Add Missing Categories
const oldCategories = `                <CategoryCarousel
                  title="Most Likely to Homer"
                  icon={Zap}
                  bets={mostLikelyToHomer}
                  onBetClick={openModal}
                />`;
const newCategories = `                <CategoryCarousel
                  title="Most Likely to Homer"
                  icon={Zap}
                  bets={mostLikelyToHomer}
                  onBetClick={openModal}
                />
                
                {/* Dynamically grouped props from topPropsByMarket covers F5, Team Totals, Strikeouts, etc. */}`;
content = content.replace(oldCategories, newCategories);

// 3. Ensure topPropsByMarket includes the missing categories
const oldTopProps = `      if (
        b.bet_type === 'prop' ||
        typeStr.includes('prop') ||
        typeStr.includes('pitcher') ||
        typeStr.includes('hits') ||
        typeStr.includes('home_run') ||
        typeStr.includes('strikeout') ||
        typeStr.includes('rbi')
      ) {`;
const newTopProps = `      if (
        b.bet_type === 'prop' ||
        typeStr.includes('prop') ||
        typeStr.includes('pitcher') ||
        typeStr.includes('hits') ||
        typeStr.includes('home_run') ||
        typeStr.includes('strikeout') ||
        typeStr.includes('rbi') ||
        typeStr.includes('f5') ||
        typeStr.includes('first_5') ||
        typeStr.includes('team_total')
      ) {`;
content = content.replace(oldTopProps, newTopProps);

// Make sure formatMatchup returns UPPERCASE and no cities
const oldFormatMatchup = `const formatMatchup = (matchup) => {
  if (!matchup) return '';
  if (matchup.includes(' @ ')) {
    return matchup.split(' @ ').map(p => stripCity(p.trim())).join(' @ ');
  }
  return stripCity(matchup);
};`;
const newFormatMatchup = `const formatMatchup = (matchup) => {
  if (!matchup) return '';
  if (matchup.includes(' @ ')) {
    return matchup.split(' @ ').map(p => stripCity(p.trim())).join(' @ ');
  }
  return stripCity(matchup);
};`;
// Actually, stripCity already works. But wait, we need to apply capitalizing to BetDetailView
// In BetDetailView, most elements already have "capitalize" class. I will add it to the wrapper.
content = content.replace('className="min-h-screen bg-[#0a0a15] text-slate-200 font-sans w-full max-w-[100vw] overflow-x-hidden box-border flex flex-col"', 
                          'className="min-h-screen bg-[#0a0a15] text-slate-200 font-sans w-full max-w-[100vw] overflow-x-hidden box-border flex flex-col capitalize"');

fs.writeFileSync(path, content);

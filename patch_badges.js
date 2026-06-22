const fs = require('fs');

function applyTo(file) {
  let content = fs.readFileSync(file, 'utf-8');

  // Replace BetScoreBadge usage to include score and tierName
  content = content.replace(/<BetScoreBadge pWin=\{prop\.p_win\} price=\{prop\.price\} pMarket=\{prop\.p_market\} \/>/g, 
    '<BetScoreBadge score={prop.bet_score} tierName={prop.bet_tier} pWin={prop.p_win} price={prop.price} pMarket={prop.p_market} />');

  fs.writeFileSync(file, content);
}

applyTo('pages/hub/MLB-ANALYTICS/props.tsx');


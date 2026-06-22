const fs = require('fs');

function applyTo(file) {
  let content = fs.readFileSync(file, 'utf-8');

  // Fallbacks for logos
  content = content.replace(/<img([\s\S]*?)src=\{teamLogoUrl(!?)\}([\s\S]*?)>/g, (match, p1, bang, p2) => {
    if (match.includes('onError')) return match;
    return `<img${p1}src={teamLogoUrl${bang}}${p2} onError={(e) => { (e.currentTarget as HTMLImageElement).src = 'https://www.mlbstatic.com/team-logos/league-on-dark/1.svg'; }}>`;
  });
  
  content = content.replace(/<img([\s\S]*?)src=\{playerImageUrl(!?)\}([\s\S]*?)>/g, (match, p1, bang, p2) => {
    if (match.includes('onError')) return match;
    return `<img${p1}src={playerImageUrl${bang}}${p2} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}>`;
  });

  content = content.replace(/<img([\s\S]*?)src=\{headshotUrl(!?)\}([\s\S]*?)>/g, (match, p1, bang, p2) => {
    if (match.includes('onError')) return match;
    return `<img${p1}src={headshotUrl${bang}}${p2} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}>`;
  });

  content = content.replace(/<img([\s\S]*?)src=\{logoUrl(!?)\}([\s\S]*?)>/g, (match, p1, bang, p2) => {
    if (match.includes('onError')) return match;
    return `<img${p1}src={logoUrl${bang}}${p2} onError={(e) => { (e.currentTarget as HTMLImageElement).src = 'https://www.mlbstatic.com/team-logos/league-on-dark/1.svg'; }}>`;
  });

  // Uppercase for bet_tier if not already
  content = content.replace(/\{prop\.bet_tier \|\| 'PASS'\}/g, "{(prop.bet_tier || 'PASS').toUpperCase()}");
  content = content.replace(/\{bet\.bet_tier \|\| 'BET'\}/g, "{(bet.bet_tier || 'BET').toUpperCase()}");

  fs.writeFileSync(file, content);
}

applyTo('pages/hub/MLB-ANALYTICS/best-bets.tsx');
applyTo('pages/hub/MLB-ANALYTICS/props.tsx');


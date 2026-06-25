const fs = require('fs');
const path = './pages/hub/MLB-ANALYTICS/best-bets.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Add stripCity, formatMatchup
const newFunctions = `
const TEAM_NICKNAMES = [
  'Red Sox', 'Blue Jays', 'White Sox', 'Angels', 'Astros', 'Athletics', 
  'Braves', 'Brewers', 'Cardinals', 'Cubs', 'Diamondbacks', 'Dodgers', 
  'Giants', 'Guardians', 'Mariners', 'Marlins', 'Mets', 'Nationals', 
  'Orioles', 'Padres', 'Phillies', 'Pirates', 'Rangers', 'Rays', 'Reds', 
  'Rockies', 'Royals', 'Tigers', 'Twins', 'Yankees'
];

const stripCity = (fullName) => {
  if (!fullName) return '';
  const lower = fullName.toLowerCase();
  for (const nick of TEAM_NICKNAMES) {
    if (lower.includes(nick.toLowerCase())) {
      return nick;
    }
  }
  return fullName;
};

const formatMatchup = (matchup) => {
  if (!matchup) return '';
  if (matchup.includes(' @ ')) {
    return matchup.split(' @ ').map(p => stripCity(p.trim())).join(' @ ');
  }
  return stripCity(matchup);
};
`;

content = content.replace('const formatWinPct = (wc: any) => {', newFunctions + '\nconst formatWinPct = (wc: any) => {');

// 2. Update selectionLabel
content = content.replace(
  /const selectionLabel = \(selection: string \| null, matchup\?: string\): string => \{[\s\S]*?return toTitleCase\(selection\.replace\(\/_\/g, ' '\)\);\n\};/m,
  `const selectionLabel = (selection: string | null, matchup?: string): string => {
  if (!selection) return '—';
  let s = selection.toLowerCase();

  let teamName = '';
  if (s === 'home' || s.startsWith('home_')) {
    teamName = 'Home';
    if (matchup) {
      const parts = matchup.split(' @ ');
      if (parts.length === 2) teamName = parts[1];
    }
    teamName = stripCity(teamName);
    const suffix = s.replace(/^home_?/, '');
    return toTitleCase(teamName) + (suffix ? ' ' + suffix : '');
  }
  if (s === 'away' || s.startsWith('away_')) {
    teamName = 'Away';
    if (matchup) {
      const parts = matchup.split(' @ ');
      if (parts.length === 2) teamName = parts[0];
    }
    teamName = stripCity(teamName);
    const suffix = s.replace(/^away_?/, '');
    return toTitleCase(teamName) + (suffix ? ' ' + suffix : '');
  }

  // Totals formatting
  const matchupScope = matchup ? \` (\${formatMatchup(matchup)})\` : '';
  if (s.startsWith('over')) return toTitleCase(\`Over \${s.replace(/^over_?/, '')}\`) + matchupScope;
  if (s.startsWith('under'))
    return toTitleCase(\`Under \${s.replace(/^under_?/, '')}\`) + matchupScope;

  return toTitleCase(stripCity(selection.replace(/_/g, ' ')));
};`
);

// 3. Update BetCard usages of matchup and team_name
content = content.replace(
  /\{bet\.matchup \|\| bet\.team_name \|\| 'MLB GAME'\}/g,
  `{formatMatchup(bet.matchup) || stripCity(bet.team_name) || 'MLB GAME'}`
);

content = content.replace(
  /selectionLabel\(bet\?\.selection, bet\?\.matchup\)/g,
  `stripCity(selectionLabel(bet?.selection, bet?.matchup))`
);

content = content.replace(
  /\{isTotalBet\n\s*\?\s*\(\(\) => \{\n\s*const sel = \(bet\.selection \|\| ''\)\.toLowerCase\(\);\n\s*const isOver = sel\.includes\('over'\);\n\s*return `\$\{isOver \? 'Over' : 'Under'\} \$\{lineStr\}`;\n\s*\}\)\(\)\n\s*: `\$\{selectionLabel\(bet\?\.selection, bet\?\.matchup\)\} \$\{lineStr\}`\}/m,
  `{isTotalBet
                ? (() => {
                    const sel = (bet.selection || '').toLowerCase();
                    const isOver = sel.includes('over');
                    return \`\${isOver ? 'Over' : 'Under'} \${lineStr}\`;
                  })()
                : \`\${stripCity(selectionLabel(bet?.selection, bet?.matchup))} \${lineStr}\`}`
);

// 4. Update CategoryCarousel to enforce min 3
content = content.replace(
  /if \(!bets \|\| bets\.length === 0\) return null;/g,
  `if (!bets || bets.length < 3) return null;`
);

// 5. Update BetDetailModal to capitalize text
content = content.replace(
  /<div className="text-\[21px\] text-slate-300 leading-relaxed font-bold tracking-wide flex-1 ">/g,
  `<div className="text-[21px] text-slate-300 leading-relaxed font-bold tracking-wide flex-1 capitalize">`
);

// Remove the BetDetailModal entirely from the bottom and change it to BetDetailView
// We will replace BetDetailModal with BetDetailView that doesn't have the fixed overlay.
// Actually, it's easier to just modify the rendering at the bottom of the page.

fs.writeFileSync(path, content);
console.log("Replaced stuff successfully.");

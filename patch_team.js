const fs = require('fs');
let content = fs.readFileSync('pages/hub/MLB-ANALYTICS/teams/[team_id].tsx', 'utf-8');

// Replace Drs with DRS
content = content.replace(
  '<StatBox label="Drs"',
  '<StatBox label="DRS"'
);

// Add missing OAA, UZR, DEF
content = content.replace(
  '{adv.drs != null && (\n                      <StatBox label="DRS" value={Number(adv.drs) >= 0 ? `+${fmtInt(adv.drs)}` : fmtInt(adv.drs)} color={Number(adv.drs) >= 0 ? \'#22C55E\' : \'#EF4444\'} />\n                    )}',
  `{adv.drs != null && (
                      <StatBox label="DRS" value={Number(adv.drs) >= 0 ? \`+\${fmtInt(adv.drs)}\` : fmtInt(adv.drs)} color={Number(adv.drs) >= 0 ? '#22C55E' : '#EF4444'} />
                    )}
                    {adv.oaa != null && (
                      <StatBox label="OAA" value={Number(adv.oaa) >= 0 ? \`+\${fmtInt(adv.oaa)}\` : fmtInt(adv.oaa)} color={Number(adv.oaa) >= 0 ? '#22C55E' : '#EF4444'} />
                    )}
                    {adv.uzr != null && (
                      <StatBox label="UZR" value={Number(adv.uzr) >= 0 ? \`+\${fmtNum(adv.uzr)}\` : fmtNum(adv.uzr)} color={Number(adv.uzr) >= 0 ? '#22C55E' : '#EF4444'} />
                    )}
                    {adv.def != null && (
                      <StatBox label="DEF" value={Number(adv.def) >= 0 ? \`+\${fmtNum(adv.def)}\` : fmtNum(adv.def)} color={Number(adv.def) >= 0 ? '#22C55E' : '#EF4444'} />
                    )}`
);

// Fix Lob% Tooltip casing
content = content.replace(
  '<StatBox label="Lob%"',
  '<StatBox label="LOB%"'
);
content = content.replace(
  '<StatBox label="LOB%" value={adv.lob_pct',
  '<StatBox label="LOB%" value={adv.lob_pct'
);

// Use game_pk keys
// There's a map for games: games.map((game: any, idx: number) => (
//   <tr key={idx} ... => key={game.game_pk || idx}
// Wait, the file might use divs for games. Let's replace key={idx} in games.map
content = content.replace(
  'games.map((game: any, idx: number) => (\n                    <div\n                      key={idx}',
  'games.map((game: any, idx: number) => (\n                    <div\n                      key={game.game_pk || idx}'
);

fs.writeFileSync('pages/hub/MLB-ANALYTICS/teams/[team_id].tsx', content);


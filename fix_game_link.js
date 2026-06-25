const fs = require('fs');
let file = fs.readFileSync('pages/hub/MLB-ANALYTICS/game/[id].tsx', 'utf8');

// Replace the prop rendering inside gameProps.slice(0, 10).map
file = file.replace(/<div className="flex items-center gap-3 min-w-0">\s*{\/\* eslint-disable-next-line @next\/next\/no-img-element \*\/}\s*<img\s*src=\{playerHeadshot\(prop\.player_id\) \|\| teamLogo\(prop\.team_id\) \|\| ''\}\s*alt=\{prop\.player_name\}\s*className="w-10 h-10 rounded-full object-cover bg-\[#060B14\] border border-\[#1A2436\] shrink-0"\s*loading="lazy"\s*\/>\s*<div className="flex flex-col min-w-0">\s*<span className="font-\['Rajdhani'\] text-\[30px\] font-extrabold font-\['Rajdhani'\] text-white truncate">\s*\{prop\.player_name\}\s*<\/span>\s*<span className="text-\[21px\] text-\[#8BA4D5\] capitalize tracking-wider">\s*\{propLabel\(prop\.prop\)\} \{prop\.side === 'under' \? 'U' : 'O'\} \{prop\.line\}\s*<\/span>\s*<\/div>\s*<\/div>/g, 
`<div className="flex items-center gap-3 min-w-0">
                        <Link href={\`/hub/MLB-ANALYTICS/players/\${prop.player_id}\`} className="flex items-center gap-3 min-w-0 hover:opacity-80 transition-opacity" onClick={(e) => e.stopPropagation()}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={playerHeadshot(prop.player_id) || teamLogo(prop.team_id) || ''}
                            alt={prop.player_name}
                            className="w-10 h-10 rounded-full object-cover bg-[#060B14] border border-[#1A2436] shrink-0"
                            loading="lazy"
                          />
                          <div className="flex flex-col min-w-0">
                            <span className="font-['Rajdhani'] text-[30px] font-extrabold font-['Rajdhani'] text-white truncate hover:text-[#00D4FF] transition-colors">
                              {prop.player_name}
                            </span>
                          </div>
                        </Link>
                        <div className="flex flex-col min-w-0 justify-end pb-1">
                          <span className="text-[21px] text-[#8BA4D5] capitalize tracking-wider">
                            {propLabel(prop.prop)} {prop.side === 'under' ? 'U' : 'O'} {prop.line}
                          </span>
                        </div>
                      </div>`);

fs.writeFileSync('pages/hub/MLB-ANALYTICS/game/[id].tsx', file, 'utf8');

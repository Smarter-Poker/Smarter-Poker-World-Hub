const fs = require('fs');
let file = fs.readFileSync('pages/hub/MLB-ANALYTICS/props.tsx', 'utf8');

// Replace the prop rendering to include a Link
file = file.replace(/<div className="flex items-center gap-3">\s*{\/\* eslint-disable-next-line @next\/next\/no-img-element \*\/}\s*<img\s*src=\{playerHeadshot\(prop\.player_id\) \|\| teamLogo\(prop\.team_id\) \|\| ''\}\s*alt=\{prop\.player_name\}\s*className="w-12 h-12 rounded-full object-cover bg-\[#060B14\] border border-\[#1A2436\] shrink-0"\s*loading="lazy"\s*\/>\s*<div className="flex flex-col min-w-0">\s*<span className="font-\['Rajdhani'\] text-\[30px\] font-extrabold text-white truncate leading-none">\s*\{prop\.player_name\}\s*<\/span>\s*<span className="text-\[21px\] text-\[#8BA4D5\] capitalize tracking-wider leading-tight">\s*\{prop\.team_name \|\| 'TBA'\} \• \{propLabel\(prop\.prop\)\}\s*<\/span>\s*<\/div>\s*<\/div>/g, 
`<div className="flex items-center gap-3">
                      <Link href={\`/hub/MLB-ANALYTICS/players/\${prop.player_id}\`} className="flex items-center gap-3 hover:opacity-80 transition-opacity" onClick={(e) => e.stopPropagation()}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={playerHeadshot(prop.player_id) || teamLogo(prop.team_id) || ''}
                          alt={prop.player_name}
                          className="w-12 h-12 rounded-full object-cover bg-[#060B14] border border-[#1A2436] shrink-0"
                          loading="lazy"
                        />
                        <div className="flex flex-col min-w-0">
                          <span className="font-['Rajdhani'] text-[30px] font-extrabold text-white truncate leading-none hover:text-[#00D4FF] transition-colors">
                            {prop.player_name}
                          </span>
                        </div>
                      </Link>
                      <div className="flex flex-col min-w-0 justify-end pb-1">
                        <span className="text-[21px] text-[#8BA4D5] capitalize tracking-wider leading-tight">
                          {prop.team_name || 'TBA'} • {propLabel(prop.prop)}
                        </span>
                      </div>
                    </div>`);

if (!file.includes("import Link from 'next/link';")) {
  file = `import Link from 'next/link';\n` + file;
}

fs.writeFileSync('pages/hub/MLB-ANALYTICS/props.tsx', file, 'utf8');

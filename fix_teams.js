const fs = require('fs');
const file = 'pages/hub/MLB-ANALYTICS/teams.tsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Fix fetcher
content = content.replace(
    `const fetcher = (url: string) => fetch(url).then(res => res.json());`,
    `const fetcher = async (url: string) => {\n    try {\n        const res = await fetch(url);\n        if (!res.ok) {\n            throw new Error(\`HTTP error! status: \${res.status}\`);\n        }\n        return await res.json();\n    } catch (err) {\n        logError('SWR Fetch', err);\n        throw err;\n    }\n};`
);

// 2. Fix error UI rendering
content = content.replace(
    `if (error || data?.error) {`,
    `const hasError = error || data?.error;\n    if (hasError) {`
);

// 3. Fix error icon
content = content.replace(
    `<Shield className="w-12 h-12 text-[#FF00FF] mx-auto mb-4 relative z-10" style={{ filter: 'drop-shadow(0 0 8px rgba(255,0,255,0.8))' }} />`,
    `<Activity className="w-12 h-12 text-[#FF00FF] mx-auto mb-4 relative z-10" style={{ filter: 'drop-shadow(0 0 8px rgba(255,0,255,0.8))' }} />`
);

// 4. Fix skeleton
content = content.replace(
    `{filteredTeams.length === 0 ? (`,
    `{(isValidating && !data) ? (\n                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">\n                                    {[...Array(6)].map((_, i) => (\n                                        <div key={i} className="metal-frame" style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>\n                                            <Loader2 className="w-8 h-8 text-[#00D4FF] animate-spin" />\n                                        </div>\n                                    ))}\n                                </div>\n                            ) : filteredTeams.length === 0 ? (`
);

// 5. Fix TeamCardComponent implementation to be the hardened one
const oldTeamCard = `const TeamCardComponent = ({ team }: { team: any }) => {
    return (
        <Link href={\`/hub/MLB-ANALYTICS/teams/\${team.team_id}\`} passHref>
            <div style={{ padding: 16, background: 'linear-gradient(180deg, #1a2332 0%, #0d1117 100%)', border: '1px solid #3d4f5f', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <TeamLogo teamId={team.team_id} teamName={team.name} />
                    <div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', letterSpacing: 1 }}>{team.name}</div>
                        <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 4 }}>{team.league} • {team.division}</div>
                    </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#00D4FF' }}>{team.streaks?.record || '0-0'}</div>
                    <div style={{ fontSize: 11, color: '#64748B', marginTop: 4 }}>L10: {team.streaks?.last10_record || '0-0'}</div>
                </div>
            </div>
        </Link>
    );
};`;

const newTeamCard = `const TeamCardComponent = ({ team }: { team: any }) => {
    const record = team.streaks?.record || '0-0';
    const last10 = team.streaks?.last10_record || '0-0';
    let isHot = false;
    if (last10) {
        const [w] = last10.split('-').map(Number);
        if (w >= 7) isHot = true; 
    }
    const leagueStr = team.league || '??';
    const divStr = team.division || '??';
    
    return (
        <div className="metal-frame hover-glow cursor-pointer" style={{ display: 'block', textDecoration: 'none', marginBottom: 16 }}>
            {/* Corner Bolts */}
            <div className="frame-bolt" style={{ top: 8, left: 8 }} />
            <div className="frame-bolt" style={{ top: 8, right: 8 }} />
            <div className="frame-bolt" style={{ bottom: 8, left: 8 }} />
            <div className="frame-bolt" style={{ bottom: 8, right: 8 }} />
            
            {isHot && <div className="neon-strip left" />}

            <div style={{ display: 'block', padding: '20px', textDecoration: 'none', color: 'inherit' }}>
                <Link href={\`/hub/MLB-ANALYTICS/teams/\${team.team_id}\`} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                            <div className="neon-ring">
                                <TeamLogo teamId={team.team_id} teamName={team.name} />
                            </div>
                            <div>
                                <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: 1, color: 'white', textTransform: 'uppercase', textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>{team.name}</div>
                                <div style={{ fontSize: 12, fontWeight: 800, color: '#00D4FF', textTransform: 'uppercase', letterSpacing: 1.5, marginTop: 4 }}>
                                    <span style={{ color: '#F472B6' }}>{leagueStr}</span> • {divStr}
                                </div>
                            </div>
                        </div>
                        <div style={{ color: 'var(--metal-highlight)' }}>
                            <Activity size={24} color={isHot ? '#EF4444' : '#475569'} style={{ filter: isHot ? 'drop-shadow(0 0 8px rgba(239, 68, 68, 0.6))' : 'none' }} />
                        </div>
                    </div>

                    {/* Stats Panel */}
                    <div className="stats-panel">
                        <div className="stat-segment">
                            <div className="stat-label">RECORD</div>
                            <div className="stat-value" style={{ color: 'white', textShadow: 'none' }}>{record}</div>
                        </div>
                        <div className="stat-segment">
                            <div className="stat-label">L10</div>
                            <div className="stat-value">{last10}</div>
                        </div>
                        <div className="stat-segment">
                            <div className="stat-label">HOME</div>
                            <div className="stat-value" style={{ color: '#FCD34D', textShadow: '0 0 8px rgba(252, 211, 77, 0.4)' }}>
                                {team.splits?.home || '0-0'}
                            </div>
                        </div>
                    </div>
                </Link>
            </div>
        </div>
    );
};`;

content = content.replace(oldTeamCard, newTeamCard);

fs.writeFileSync(file, content);
console.log('Fixed teams.tsx');

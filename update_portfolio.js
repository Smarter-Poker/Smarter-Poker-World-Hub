const fs = require('fs');
const path = './pages/hub/MLB-ANALYTICS/portfolio.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Add imports
content = content.replace("import useSWR from 'swr';", "import useSWR from 'swr';\nimport { useState } from 'react';\nimport { RecentBetsTable } from '../../../components/mlb/RecentBetsTable';");

// 2. Change component signature and add state
content = content.replace(
    "export default function PortfolioPage({ fallbackData, initialDays, initialMarket }: { fallbackData: PortfolioPageProps, initialDays: string | null, initialMarket: string }) {\n    const { data, error, isLoading } = useSWR('/api/mlb/portfolio', fetcher, {\n        refreshInterval: 15000,\n        fallbackData\n    });",
    `export default function PortfolioPage() {
    const [daysFilter, setDaysFilter] = useState<number | null>(null);
    const [marketFilter, setMarketFilter] = useState<string>('ALL');

    const apiUrl = \`/api/mlb/portfolio?\${daysFilter ? \`days=\${daysFilter}&\` : ''}market=\${marketFilter}\`;

    const { data, error, isLoading } = useSWR(apiUrl, fetcher, {
        refreshInterval: 15000
    });`
);

// 3. Add Filter UI
const filterHtml = `
                {/* Filter Bar */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', marginBottom: '24px', alignItems: 'center', justifyContent: 'space-between', background: '#131420', padding: '16px', borderRadius: '12px', border: '1px solid #2a3a4a' }}>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <span style={{ color: '#94A3B8', fontSize: '12px', fontWeight: 600, marginRight: '8px' }}>TIMEFRAME:</span>
                        {[7, 14, 30].map(d => (
                            <button
                                key={d}
                                onClick={() => setDaysFilter(d)}
                                style={{
                                    padding: '6px 12px',
                                    borderRadius: '6px',
                                    fontSize: '12px',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    background: daysFilter === d ? 'rgba(0, 212, 255, 0.1)' : 'transparent',
                                    color: daysFilter === d ? '#00D4FF' : '#64748B',
                                    border: daysFilter === d ? '1px solid rgba(0, 212, 255, 0.3)' : '1px solid transparent',
                                    transition: 'all 0.2s'
                                }}
                            >
                                {d} DAYS
                            </button>
                        ))}
                        <button
                            onClick={() => setDaysFilter(null)}
                            style={{
                                padding: '6px 12px',
                                borderRadius: '6px',
                                fontSize: '12px',
                                fontWeight: 700,
                                cursor: 'pointer',
                                background: daysFilter === null ? 'rgba(0, 212, 255, 0.1)' : 'transparent',
                                color: daysFilter === null ? '#00D4FF' : '#64748B',
                                border: daysFilter === null ? '1px solid rgba(0, 212, 255, 0.3)' : '1px solid transparent',
                                transition: 'all 0.2s'
                            }}
                        >
                            YTD
                        </button>
                    </div>
                    
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <span style={{ color: '#94A3B8', fontSize: '12px', fontWeight: 600, marginRight: '8px' }}>MARKET:</span>
                        {['ALL', 'Moneyline', 'Run Line', 'Totals'].map(m => (
                            <button
                                key={m}
                                onClick={() => setMarketFilter(m)}
                                style={{
                                    padding: '6px 12px',
                                    borderRadius: '6px',
                                    fontSize: '12px',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    background: marketFilter === m ? 'rgba(255, 0, 255, 0.1)' : 'transparent',
                                    color: marketFilter === m ? '#FF00FF' : '#64748B',
                                    border: marketFilter === m ? '1px solid rgba(255, 0, 255, 0.3)' : '1px solid transparent',
                                    transition: 'all 0.2s'
                                }}
                            >
                                {m === 'ALL' ? 'ALL' : m === 'Moneyline' ? 'ML' : m === 'Run Line' ? 'RL' : 'TOT'}
                            </button>
                        ))}
                    </div>
                </div>
`;

content = content.replace(
    /<div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', marginBottom: '32px' }}>/,
    filterHtml + "\n                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', marginBottom: '32px' }}>"
);

// 4. Replace table with component
const tableStart = "<div style={{ background: '#0d1117', border: '1px solid #2a3a4a', borderRadius: '12px', overflowX: 'auto', paddingBottom: '20px', boxShadow: 'inset 0 0 20px rgba(0,0,0,0.5)', width: '100%' }}>";
const tableEnd = "</div>\n            </div>\n            <BottomNavBar />";

const regex = new RegExp(tableStart.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&') + "(.|\\n)*?</div>\\n            </div>\\n            <BottomNavBar />");

content = content.replace(regex, 
    "<div>\n                    {isLoading ? <div style={{ padding: '24px', textAlign: 'center', color: '#94A3B8' }}>Loading simulator data...</div> : <RecentBetsTable bets={recentBets} />}\n                </div>\n            </div>\n            <BottomNavBar />"
);

fs.writeFileSync(path, content);

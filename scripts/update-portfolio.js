const fs = require('fs');
const file = 'pages/hub/MLB-ANALYTICS/portfolio.tsx';
let content = fs.readFileSync(file, 'utf8');

if (!content.includes("import { useState }")) {
    content = content.replace("import useSWR from 'swr';", "import { useState } from 'react';\nimport useSWR from 'swr';");
}

const filterBar = `
                <div style={{ background: '#0d1117', border: '1px solid #2a3a4a', borderRadius: '12px', padding: '16px', marginBottom: '24px', display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ color: '#94A3B8', fontSize: '13px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px' }}>Timeframe:</span>
                        <div style={{ display: 'flex', background: '#0a0a15', borderRadius: '8px', border: '1px solid #1a2332', overflow: 'hidden' }}>
                            {['1W', '1M', 'YTD', 'ALL'].map(tf => (
                                <button key={tf} onClick={() => setTimeframe(tf)} style={{ background: timeframe === tf ? 'rgba(0, 212, 255, 0.15)' : 'transparent', border: 'none', color: timeframe === tf ? '#00D4FF' : '#64748B', padding: '6px 12px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s' }}>
                                    {tf}
                                </button>
                            ))}
                        </div>
                    </div>
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ color: '#94A3B8', fontSize: '13px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px' }}>Market:</span>
                        <select 
                            value={market} 
                            onChange={(e) => setMarket(e.target.value)}
                            style={{ background: '#0a0a15', border: '1px solid #1a2332', borderRadius: '8px', color: '#F8FAFC', padding: '6px 12px', fontSize: '13px', fontWeight: 600, outline: 'none', cursor: 'pointer' }}
                        >
                            <option value="ALL">All Markets</option>
                            <option value="Moneyline">Moneyline</option>
                            <option value="Runline">Runline</option>
                            <option value="Totals">Totals</option>
                        </select>
                    </div>
                </div>`;

content = content.replace(
    `export default function PortfolioPage({ fallbackData }: { fallbackData: PortfolioPageProps }) {`,
    `export default function PortfolioPage({ fallbackData, initialDays, initialMarket }: { fallbackData: PortfolioPageProps, initialDays: string | null, initialMarket: string }) {
    const [timeframe, setTimeframe] = useState(initialDays === '7' ? '1W' : (initialDays === '30' ? '1M' : (initialDays === '365' ? 'YTD' : 'ALL')));
    const [market, setMarket] = useState(initialMarket);`
);

content = content.replace(
    `const { data } = useSWR('/api/mlb/portfolio', fetcher, {`,
    `const daysMap: Record<string, number | null> = { '1W': 7, '1M': 30, 'YTD': 365, 'ALL': null };
    const currentDays = daysMap[timeframe];
    
    const queryParams = new URLSearchParams();
    if (currentDays) queryParams.set('days', currentDays.toString());
    if (market !== 'ALL') queryParams.set('market', market);

    const { data } = useSWR(\`/api/mlb/portfolio?\${queryParams.toString()}\`, fetcher, {`
);

content = content.replace(
    `<div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>`,
    filterBar + `\n                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>`
);

content = content.replace(
    `export async function getServerSideProps({ res }) {`,
    `export async function getServerSideProps({ res, query }) {`
);

content = content.replace(
    `const stats = await fetchPortfolioStats(mlbDb);`,
    `const days = query.days ? parseInt(query.days as string, 10) : undefined;
        const market = query.market && query.market !== 'ALL' ? query.market as string : undefined;
        const stats = await fetchPortfolioStats(mlbDb, days, market);`
);

content = content.replace(
    `props: {
                fallbackData: stats
            }`,
    `props: {
                fallbackData: stats,
                initialDays: query.days || null,
                initialMarket: query.market || 'ALL'
            }`
);

fs.writeFileSync(file, content, 'utf8');
console.log('Update script completed.');

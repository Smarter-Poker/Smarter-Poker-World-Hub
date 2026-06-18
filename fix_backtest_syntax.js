const fs = require('fs');
const file = 'pages/api/mlb/backtest.ts';
let content = fs.readFileSync(file, 'utf8');

const replacement = `            if (countErr) throw countErr;

            let allMarketRows: any[] = [];
            const limit = 1000;
            const numPages = Math.ceil((count || 0) / limit);
            
            if (numPages > 0) {
                // Chunk the requests to prevent Vercel 504 timeouts on large datasets
                for (let i = 0; i < numPages; i += 5) {
                    const promises: any[] = [];
                    for (let j = 0; j < 5 && (i + j) < numPages; j++) {
                        const offset = (i + j) * limit;
                        promises.push(
                            mlbDb
                                .from('pred_market_output')
                                .select('market, unit_profit, actual_result, brier_score, rec')
                                .range(offset, offset + limit - 1)
                        );
                    }
                    const results = await Promise.all(promises) as any[];
                    for (const r of results) {
                        if (r.error) throw r.error;
                        if (r.data) allMarketRows = allMarketRows.concat(r.data);
                    }
                }
            }`;

content = content.replace(
    /const \{ count\, error\: countErr \} = await mlbDb\n\s+\.from\('pred_market_output'\)\n\s+\.select\('\*'\,\ \{ count\: 'exact'\, head\: true \}\);\n\s+if \(r\.data\) allMarketRows = allMarketRows\.concat\(r\.data\);\n\s+\}\n\s+\}\n\s+\}/,
    `const { count, error: countErr } = await mlbDb
                .from('pred_market_output')
                .select('*', { count: 'exact', head: true });
                
${replacement}`
);

fs.writeFileSync(file, content);
console.log('Fixed backtest.ts syntax');

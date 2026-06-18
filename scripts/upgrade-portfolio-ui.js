const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '../pages/hub/MLB-ANALYTICS/portfolio.tsx');
let content = fs.readFileSync(file, 'utf8');

// 1. Add recharts imports
if (!content.includes('AreaChart')) {
    content = content.replace("import useSWR from 'swr';", "import useSWR from 'swr';\nimport { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';");
}

// 2. Replace MetricBox with Metal UI version
content = content.replace(
    /const MetricBox = \(\{[^\}]+\} \=\> \([\s\S]+?<\/div>\s*\);/m,
    `const MetricBox = ({ title, value, sub, valueColor = '#00D4FF' }: MetricBoxProps) => (
    <div style={{ 
        background: '#0d1117', 
        border: '1px solid #2a3a4a', 
        borderRadius: '12px', 
        padding: '16px', 
        display: 'flex', 
        flexDirection: 'column',
        boxShadow: 'inset 0 2px 10px rgba(255, 255, 255, 0.02), 0 4px 15px rgba(0, 0, 0, 0.5)'
    }}>
        <div style={{ fontSize: '11px', fontWeight: 800, color: '#8b9bb4', letterSpacing: '1.5px', marginBottom: '8px', textTransform: 'uppercase' }}>{title}</div>
        <div style={{ fontSize: '24px', fontWeight: 800, color: valueColor, textShadow: valueColor === '#00D4FF' || valueColor === '#10B981' ? \`0 0 10px \${valueColor}40\` : 'none' }}>{value}</div>
        {sub && <div style={{ fontSize: '12px', color: '#64748B', marginTop: '4px' }}>{sub}</div>}
    </div>
);`
);

// 3. Replace background to dark metal
content = content.replace("background: '#F8FAFC'", "background: '#0a0a15'");

// 4. Update Header text colors
content = content.replace("color: '#0F172A'", "color: '#F8FAFC'");
content = content.replace("color: '#10B981'", "color: '#00D4FF'");

// 5. Update Current Bankroll box
content = content.replace(
    /<div style=\{\{ background: '#fff', border: '1px solid #10B981'[\s\S]+?<\/div>\s*<\/div>\s*<\/div>/m,
    `<div style={{ 
                        background: 'linear-gradient(180deg, #1a2332 0%, #0d1117 100%)', 
                        border: '1px solid #00D4FF', 
                        borderRadius: '12px', 
                        padding: '32px 24px', 
                        display: 'flex', 
                        flexDirection: 'column', 
                        justifyContent: 'center', 
                        alignItems: 'center', 
                        boxShadow: '0 0 20px rgba(0, 212, 255, 0.15), inset 0 0 10px rgba(0, 212, 255, 0.05)' 
                    }}>
                        <div style={{ fontSize: '12px', fontWeight: 800, color: '#00D4FF', letterSpacing: '2px', marginBottom: '12px' }}>CURRENT BANKROLL</div>
                        <div style={{ fontSize: '56px', fontWeight: 900, color: '#fff', lineHeight: 1, textShadow: '0 0 20px rgba(255, 255, 255, 0.2)' }}>
                            {formatCurrency(currentBankroll)}
                        </div>
                        <div style={{ fontSize: '15px', fontWeight: 700, color: '#00D4FF', marginTop: '12px', textShadow: '0 0 8px rgba(0, 212, 255, 0.4)' }}>
                            {formatCurrency(totalPnl, true)} from start
                        </div>
                        <div style={{ fontSize: '13px', color: '#8b9bb4', marginTop: '6px' }}>
                            Started at $1,000.00
                        </div>
                    </div>`
);

// 6. Update MetricBox instances
content = content.replace("valueColor={totalPnl > 0 ? '#10B981' : totalPnl < 0 ? '#EF4444' : '#0F172A'}", "valueColor={totalPnl > 0 ? '#00D4FF' : totalPnl < 0 ? '#FF0055' : '#F8FAFC'}");
content = content.replace("valueColor={roi > 0 ? '#10B981' : roi < 0 ? '#EF4444' : '#0F172A'}", "valueColor={roi > 0 ? '#00D4FF' : roi < 0 ? '#FF0055' : '#F8FAFC'}");
content = content.replace("valueColor={maxDrawdown > 0 ? '#EF4444' : '#0F172A'}", "valueColor={maxDrawdown > 0 ? '#FF0055' : '#F8FAFC'}");
content = content.replace("valueColor=\"#10B981\"", "valueColor=\"#00D4FF\"");

// 7. Update button styles
content = content.replace(/background: '#fff', border: '1px solid #E2E8F0', borderRadius: '6px', color: '#3B82F6'/g, "background: 'rgba(0, 212, 255, 0.1)', border: '1px solid rgba(0, 212, 255, 0.3)', borderRadius: '6px', color: '#00D4FF'");

// 8. Replace HTML Table with AreaChart for Equity Curve
content = content.replace(
    /<h2 style=\{\{ fontSize: '16px', fontWeight: 700, color: '#0F172A', marginBottom: '12px' \}\}>Weekly Equity Curve<\/h2>\s*<div style=\{\{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', overflow: 'hidden', marginBottom: '32px' \}\}>[\s\S]+?<\/table>\s*<\/div>/m,
    `<h2 style={{ fontSize: '18px', fontWeight: 800, color: '#F8FAFC', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '4px', height: '18px', background: '#00D4FF', borderRadius: '2px', boxShadow: '0 0 8px rgba(0, 212, 255, 0.6)' }} />
                    Equity Curve
                </h2>
                <div style={{ background: '#0d1117', border: '1px solid #2a3a4a', borderRadius: '12px', padding: '24px', marginBottom: '32px', height: '350px', boxShadow: 'inset 0 0 20px rgba(0,0,0,0.5)' }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={weeklyCurve} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                            <defs>
                                <linearGradient id="colorBankroll" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#00D4FF" stopOpacity={0.4}/>
                                    <stop offset="95%" stopColor="#00D4FF" stopOpacity={0.0}/>
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#2a3a4a" vertical={false} />
                            <XAxis 
                                dataKey="weekOf" 
                                stroke="#64748B" 
                                fontSize={12} 
                                tickLine={false} 
                                axisLine={false}
                                tickFormatter={(val) => {
                                    const d = new Date(val);
                                    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
                                }}
                            />
                            <YAxis 
                                stroke="#64748B" 
                                fontSize={12} 
                                tickLine={false} 
                                axisLine={false} 
                                domain={['auto', 'auto']}
                                tickFormatter={(val) => \`\$\${val}\`}
                            />
                            <Tooltip 
                                contentStyle={{ background: '#0a0a15', border: '1px solid #00D4FF', borderRadius: '8px', boxShadow: '0 4px 15px rgba(0, 0, 0, 0.5)' }}
                                itemStyle={{ color: '#00D4FF', fontWeight: 700 }}
                                labelStyle={{ color: '#F8FAFC', marginBottom: '4px' }}
                                formatter={(value: number) => [formatCurrency(value), 'Bankroll']}
                                labelFormatter={(label) => \`Week of \${label}\`}
                            />
                            <Area type="monotone" dataKey="bankroll" stroke="#00D4FF" strokeWidth={3} fillOpacity={1} fill="url(#colorBankroll)" activeDot={{ r: 6, fill: '#00D4FF', stroke: '#0a0a15', strokeWidth: 2 }} />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>`
);

// 9. Update Recent Bets table to dark theme
content = content.replace(
    /<h2 style=\{\{ fontSize: '16px', fontWeight: 700, color: '#0F172A', marginBottom: '12px' \}\}>Recent Simulated Bets/m,
    `<h2 style={{ fontSize: '18px', fontWeight: 800, color: '#F8FAFC', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '4px', height: '18px', background: '#FF00FF', borderRadius: '2px', boxShadow: '0 0 8px rgba(255, 0, 255, 0.6)' }} />
                    Recent Simulated Bets`
);

content = content.replace(
    /<div style=\{\{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', overflow: 'hidden', paddingBottom: '20px' \}\}>/m,
    `<div style={{ background: '#0d1117', border: '1px solid #2a3a4a', borderRadius: '12px', overflow: 'hidden', paddingBottom: '20px', boxShadow: 'inset 0 0 20px rgba(0,0,0,0.5)' }}>`
);

content = content.replace(
    /<tr style=\{\{ borderBottom: '1px solid #E2E8F0', color: '#64748B' \}\}>/g,
    `<tr style={{ borderBottom: '1px solid #2a3a4a', color: '#8b9bb4', backgroundColor: '#1a2332' }}>`
);

content = content.replace(
    /borderBottom: i < recentBets\.length - 1 \? '1px solid #E2E8F0' : 'none'/g,
    `borderBottom: i < recentBets.length - 1 ? '1px solid #2a3a4a' : 'none'`
);

content = content.replace(/color: '#0F172A'/g, "color: '#F8FAFC'");
content = content.replace(/color: '#10B981'/g, "color: '#00D4FF'");
content = content.replace(/color: '#EF4444'/g, "color: '#FF0055'");
content = content.replace(/background: '#F1F5F9'/g, "background: 'rgba(255, 255, 255, 0.05)'");
content = content.replace(/background: isWin \? '#D1FAE5' : \(isLoss \? '#FEE2E2' : '#F1F5F9'\)/g, "background: isWin ? 'rgba(0, 212, 255, 0.1)' : (isLoss ? 'rgba(255, 0, 85, 0.1)' : 'rgba(255, 255, 255, 0.05)')");
content = content.replace(/color: isWin \? '#10B981' : \(isLoss \? '#EF4444' : '#64748B'\)/g, "color: isWin ? '#00D4FF' : (isLoss ? '#FF0055' : '#8b9bb4')");
content = content.replace(/color: pnl > 0 \? '#10B981' : \(pnl < 0 \? '#EF4444' : '#64748B'\)/g, "color: pnl > 0 ? '#00D4FF' : (pnl < 0 ? '#FF0055' : '#8b9bb4')");

fs.writeFileSync(file, content, 'utf8');
console.log('Successfully upgraded UI for portfolio.tsx');

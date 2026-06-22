const fs = require('fs');

let content = fs.readFileSync('pages/hub/MLB-ANALYTICS/portfolio.tsx', 'utf-8');

// Fix falsy 0 bankroll
content = content.replace(
  "const sBankroll = baseline ? Number(baseline.starting_bankroll) : (data?.currentBankroll ? data.currentBankroll - (data.totalPnl || 0) : 1000);",
  "const sBankroll = baseline ? Number(baseline.starting_bankroll) : (data?.currentBankroll != null ? data.currentBankroll - (data.totalPnl || 0) : 1000);"
);

// Fix title casing
content = content.replace(/\{g\.bet_tier\}/g, "{(g.bet_tier || '').toUpperCase()}");
content = content.replace(/\{bet\.bet_tier \|\| ''\}/g, "{(bet.bet_tier || '').toUpperCase()}");

// Add isValidating overlay on the wrapper
content = content.replace(
  '<div className="flex flex-col lg:flex-row gap-4 mb-8 relative z-10">',
  `<div className="flex flex-col lg:flex-row gap-4 mb-8 relative z-10">
              {isRefreshing && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#0a0a15]/50 backdrop-blur-sm rounded-xl">
                  <Loader2 className="w-12 h-12 animate-spin text-[#00D4FF]" />
                </div>
              )}`
);

content = content.replace(
  '<SectionTitle>Equity Curve</SectionTitle>',
  `<SectionTitle>Equity Curve</SectionTitle>
            <div className="relative">
              {isRefreshing && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#0a0a15]/50 backdrop-blur-sm rounded-xl">
                  <Loader2 className="w-12 h-12 animate-spin text-[#00D4FF]" />
                </div>
              )}`
);

content = content.replace(
  '</ResponsiveContainer>\n              )}\n            </div>',
  `</ResponsiveContainer>\n              )}\n            </div>\n            </div>`
);


fs.writeFileSync('pages/hub/MLB-ANALYTICS/portfolio.tsx', content);


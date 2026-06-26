const fs = require('fs');

const path = 'pages/hub/MLB-ANALYTICS/best-bets.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Add bestF5Runlines
const hook1 = `const bestF5Moneylines = useMemo(() => (data?.topF5Moneylines || []).slice(0, 10), [data]);`;
const hook2 = `const bestF5Runlines = useMemo(() => (data?.topF5Runlines || []).slice(0, 10), [data]);\n  ${hook1}`;
content = content.replace(hook1, hook2);

// 2. Add CategoryCarousel for F5 Run Lines
const cat1 = `{/* Dedicated F5 Moneyline Section */}`;
const cat2 = `{/* Dedicated F5 Runline Section */}
                {bestF5Runlines.length > 0 && (
                  <CategoryCarousel
                    title="Best Bets: First 5 Innings Run Lines"
                    icon={TrendingUp}
                    bets={bestF5Runlines}
                    onBetClick={openModal}
                  />
                )}
                ${cat1}`;
content = content.replace(cat1, cat2);

// 3. Make sure 'f5_run_line' gets labelled properly in marketLabel
// Already handled: "else if (cleanMarket === 'first_5_run_line' || cleanMarket === 'f5_run_line') { marketLabel = 'First 5 Inning Run Line'; }"

fs.writeFileSync(path, content);
console.log("Patched best-bets.tsx for F5 Run Lines!");

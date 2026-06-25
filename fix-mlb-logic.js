const fs = require('fs');

// 1. Fix best-bets.tsx
const tsxPath = 'pages/hub/MLB-ANALYTICS/best-bets.tsx';
let tsxCode = fs.readFileSync(tsxPath, 'utf8');

// Date Formatting
const formatCode = `
  // Format Date to "THURSDAY 6-25-2026"
  const formattedDate = useMemo(() => {
    if (!officialDate) return '—';
    try {
      const [year, month, day] = officialDate.split('-');
      const d = new Date(Number(year), Number(month) - 1, Number(day));
      const dayOfWeek = d.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();
      // Remove leading zeros from month and day for '6-25-2026'
      const m = parseInt(month, 10);
      const dNum = parseInt(day, 10);
      return \`\${dayOfWeek} \${m}-\${dNum}-\${year}\`;
    } catch (e) {
      return officialDate;
    }
  }, [officialDate]);
`;

tsxCode = tsxCode.replace('  const officialDate = data?.officialDate || \'\';', '  const officialDate = data?.officialDate || \'\';\n' + formatCode);

// Use formattedDate instead of officialDate
tsxCode = tsxCode.replace(
  "Ranked By Bet Score · {officialDate || todayStr || '—'}",
  "Ranked By Bet Score · {formattedDate}"
);

// Replace mostLikelyToWin logic
const oldMostLikely = `  const mostLikelyToWin = useMemo(() => {
    return [...bets]
      .filter((b) => ['line', 'game'].includes(b.bet_type) && (b.market === 'h2h' || b.market === 'moneyline'))
      .sort((a, b) => (Number(b.win_confidence) || 0) - (Number(a.win_confidence) || 0))
      .slice(0, 10);
  }, [bets]);`;

const newMostLikely = `  const mostLikelyToWin = useMemo(() => {
    if (data?.topMoneylines?.length > 0) {
      return data.topMoneylines;
    }
    return [...bets]
      .filter((b) => ['line', 'game'].includes(b.bet_type) && (b.market === 'h2h' || b.market === 'moneyline'))
      .sort((a, b) => (Number(b.win_confidence) || 0) - (Number(a.win_confidence) || 0))
      .slice(0, 10);
  }, [bets, data]);`;

tsxCode = tsxCode.replace(oldMostLikely, newMostLikely);
fs.writeFileSync(tsxPath, tsxCode);


// 2. Fix best-bets.ts
const tsPath = 'pages/api/mlb/best-bets.ts';
let tsCode = fs.readFileSync(tsPath, 'utf8');

// Fetch top moneylines from pred_mlb_predictions
const fetchTopMoneylines = `
    // Enrich bets from RPC result
    const rawBets = data?.bets || [];
    const enrichedBets = await enrichBets(rawBets, mlbDb);

    // Fetch pure highest win probability moneylines (regardless of edge) for Most Likely To Win
    let topMoneylines = [];
    if (data?.officialDate) {
      const { data: rawTopML } = await mlbDb
        .from('pred_mlb_predictions')
        .select('*')
        .eq('official_date', data.officialDate)
        .in('market', ['moneyline', 'h2h'])
        .order('model_prob', { ascending: false })
        .limit(10);
      if (rawTopML && rawTopML.length > 0) {
        topMoneylines = await enrichBets(rawTopML, mlbDb);
      }
    }
`;

tsCode = tsCode.replace(
  `    // Enrich bets from RPC result
    const rawBets = data?.bets || [];
    const enrichedBets = await enrichBets(rawBets, mlbDb);`,
  fetchTopMoneylines
);

// Include topMoneylines in response
tsCode = tsCode.replace(
  `stats: { totalBets, eliteBets, topScore, topLock },`,
  `stats: { totalBets, eliteBets, topScore, topLock },
          topMoneylines,`
);

fs.writeFileSync(tsPath, tsCode);

console.log('Patched best-bets.tsx and best-bets.ts');

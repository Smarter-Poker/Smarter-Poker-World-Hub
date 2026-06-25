const fs = require('fs');
let file = fs.readFileSync('pages/hub/MLB-ANALYTICS/game/[id].tsx', 'utf8');

// Add the SWR fetch for the specific game
file = file.replace(/const \{ data: dashData, error: dashErr \} = useSWR\('\/api\/mlb\/dashboard', fetcher, \{\n\s*refreshInterval: 120000,\n\s*\}\);/, "const { data: dashData, error: dashErr } = useSWR('/api/mlb/dashboard', fetcher, {\n    refreshInterval: 120000,\n  });\n  const { data: specificGameData, error: specificGameErr } = useSWR(gamePk && (!dashData || !dashData.slateGames?.find((g: any) => g.gamePk === gamePk)) ? `/api/mlb/game/${gamePk}` : null, fetcher);");

// Update isLoading
file = file.replace(/const isLoading = \(\!dashData && \!dashErr\) \|\| \(\!betsData && \!betsErr\) \|\| \(\!propsData && \!propsErr\);/, "const isLoading = (!dashData && !dashErr && !specificGameData && !specificGameErr) || (!betsData && !betsErr) || (!propsData && !propsErr);");

// Update useMemo for game
file = file.replace(/const game: GameCard \| undefined = useMemo\(\(\) => \{\n\s*if \(\!dashData\?\.slateGames \|\| \!gamePk\) return undefined;\n\s*return dashData\.slateGames\.find\(\(g: GameCard\) => g\.gamePk === gamePk\);\n\s*\}, \[dashData, gamePk\]\);/, "const game: GameCard | undefined = useMemo(() => {\n    if (!gamePk) return undefined;\n    if (dashData?.slateGames) {\n      const found = dashData.slateGames.find((g: GameCard) => g.gamePk === gamePk);\n      if (found) return found;\n    }\n    return specificGameData;\n  }, [dashData, specificGameData, gamePk]);");

// Add import Link
if (!file.includes("import Link from 'next/link';")) {
  file = file.replace("import Head from 'next/head';", "import Head from 'next/head';\nimport Link from 'next/link';");
}

fs.writeFileSync('pages/hub/MLB-ANALYTICS/game/[id].tsx', file, 'utf8');

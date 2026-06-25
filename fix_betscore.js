const fs = require('fs');
let file = fs.readFileSync('src/lib/betScore.ts', 'utf8');

file = file.replace(/function confidenceMult\([\s\S]*?\) : number \{[\s\S]*?return Math\.max\(0\.4, Math\.min\(1\.0, m\)\);\n\}/, 
`function confidenceMult(
  ev: number,
  american: number,
  vol: boolean,
  lineupLocked: boolean,
  d: number | null
): number {
  return 1.0; // STRICT FACTUAL AUDIT: Removed all synthetic haircuts.
}`);

file = file.replace(/  if \(pMarket != null\) \{[\s\S]*?adjWin = pWin \* modelWeight \+ pMarket \* \(1 - modelWeight\);\n  \}/g, 
`  // STRICT FACTUAL AUDIT: Removed Bayesian shrinkage toward market. Using true model pWin.`);

file = file.replace(/  if \(pWin != null && pMarket != null\) \{[\s\S]*?\}\n  \n  if \(rawEv > 20\) factors\.push\(\{ dir: "down", text: "Raw edge is implausibly large \(>20%\) — usually a stale line or injury scratch, so the score is safely shrunk\." \}\);\n/g, "");

fs.writeFileSync('src/lib/betScore.ts', file, 'utf8');

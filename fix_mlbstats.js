const fs = require('fs');
let file = fs.readFileSync('utils/mlbStats.ts', 'utf8');

file = file.replace(/let maxLossStreak = 0;/g, "let maxLossStreak = 0;\n    let flat_pnl = 0;\n    const unit_size = 10;");

file = file.replace(
/        if \(pnl > 0 \|\| bet.result === 'WIN'\) \{/g, 
`        if (pnl > 0 || bet.result === 'WIN') {
            flat_pnl += betStake > 0 ? (pnl / betStake) * unit_size : 0;`
);

file = file.replace(
/        \} else if \(pnl < 0 \|\| bet.result === 'LOSS'\) \{/g,
`        } else if (pnl < 0 || bet.result === 'LOSS') {
            flat_pnl -= unit_size;`
);

file = file.replace(
/    const unit_size = 10;\n    const flat_final_bankroll = 1000 \+ \(wins \* unit_size\) \- \(losses \* unit_size \* 1\.10\); \/\/ Approximation if avg odds are around -110/g,
`    const flat_final_bankroll = 1000 + flat_pnl; // True flat stake based on actual ROI`
);

fs.writeFileSync('utils/mlbStats.ts', file, 'utf8');

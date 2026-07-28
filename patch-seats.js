const fs = require('fs');
const file = 'src/components/training/games/UniversalDynamicTable.jsx';
let content = fs.readFileSync(file, 'utf8');

// Update playerCount useMemo to depend on feltScale and force 6-max max on small screens
const target = `    const playerCount = useMemo(() => {
        if (gameType === 'spins' || gameType === 'sng') return 3;
        if (gameType === 'heads-up' || gameType === 'hu') return 2;
        if (gameType === '6max' || gameType === 'cash') return 6;
        return 9; // Default to 9-max for MTT
    }, [gameType]);`;

const replacement = `    const playerCount = useMemo(() => {
        if (gameType === 'spins' || gameType === 'sng') return 3;
        if (gameType === 'heads-up' || gameType === 'hu') return 2;
        // Force 6-max maximum on small viewports to prevent furniture collision
        if (feltScale <= 0.65) return 6;
        if (gameType === '6max' || gameType === 'cash') return 6;
        return 9; // Default to 9-max for MTT
    }, [gameType, feltScale]);`;

if (content.includes(target)) {
    fs.writeFileSync(file, content.replace(target, replacement));
    console.log('Patched playerCount logic');
} else {
    console.log('Target not found');
}

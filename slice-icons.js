const sharp = require('sharp');
const path = require('path');

const SRC = '/Users/smarter.poker/.gemini/antigravity/brain/1b22c1d6-8e81-4203-99fa-8721c29b9200/media__1773088096613.jpg';
const PODS_DIR = '/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/public/images/lobby-pods';
const DOCK_DIR = '/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/public/images/lobby-dock';

// The image is a 4-column × 3-row grid
// Each row has icons + text labels below them
// We need to extract just the icon portions (without the outer frame)

async function main() {
    const meta = await sharp(SRC).metadata();
    console.log(`Source image: ${meta.width}x${meta.height}`);

    // The image has an outer metallic frame border.
    // Let's estimate the usable area inside the frame.
    // Looking at the image: ~5% border on each side
    const borderLeft = Math.round(meta.width * 0.04);
    const borderRight = Math.round(meta.width * 0.04);
    const borderTop = Math.round(meta.height * 0.03);
    const borderBottom = Math.round(meta.height * 0.03);

    const usableW = meta.width - borderLeft - borderRight;
    const usableH = meta.height - borderTop - borderBottom;

    // 4 columns, 3 rows
    const cols = 4;
    const rows = 3;
    const cellW = Math.floor(usableW / cols);
    const cellH = Math.floor(usableH / rows);

    console.log(`Usable area: ${usableW}x${usableH}, Cell: ${cellW}x${cellH}`);

    // Grid mapping: [row, col] => { filename, dir }
    // Row 0: Poker Near Me, Find Games, Live Games, Poker Tours
    // Row 1: Map View, Calendar, Poker Series, Daily Grind One
    // Row 2: Trip Planner, Saved Venues, Friends, Tournament Alerts
    const grid = [
        // Row 0
        [
            { name: 'nearme.png', dir: PODS_DIR },
            { name: 'search.png', dir: PODS_DIR },
            { name: 'livegames.png', dir: PODS_DIR },
            { name: 'tours.png', dir: PODS_DIR },
        ],
        // Row 1
        [
            { name: 'mapview.png', dir: PODS_DIR },
            { name: 'calendar.png', dir: PODS_DIR },
            { name: 'series.png', dir: PODS_DIR },
            { name: 'daily.png', dir: PODS_DIR },
        ],
        // Row 2
        [
            { name: 'trip-planner.png', dir: DOCK_DIR },
            { name: 'saved.png', dir: DOCK_DIR },
            { name: 'friends.png', dir: DOCK_DIR },
            { name: 'alerts.png', dir: DOCK_DIR },
        ],
    ];

    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const { name, dir } = grid[row][col];
            const left = borderLeft + col * cellW;
            const top = borderTop + row * cellH;

            // Extract the icon portion (top ~70% of the cell, skipping the text label at the bottom)
            const iconH = Math.round(cellH * 0.72);

            const outPath = path.join(dir, name);

            await sharp(SRC)
                .extract({ left, top, width: cellW, height: iconH })
                .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
                .png()
                .toFile(outPath);

            console.log(`✅ ${name} → ${outPath}`);
        }
    }

    console.log('\nDone! All 12 icons extracted.');
}

main().catch(err => { console.error(err); process.exit(1); });

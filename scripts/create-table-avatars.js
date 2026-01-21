/**
 * AVATAR WITH GOLD BADGE - PROPER SIZE
 * Character: 125×125px (minimum size)
 * Badge: 125×45px
 * Total: 125×170px
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// PROPER SIZES
const AVATAR_WIDTH = 125;
const AVATAR_HEIGHT = 170;
const CHARACTER_SIZE = 125;
const BADGE_HEIGHT = 45;

const FREE_INPUT = path.join(__dirname, '../public/avatars/free');
const VIP_INPUT = path.join(__dirname, '../public/avatars/vip');
const OUTPUT_DIR = path.join(__dirname, '../public/avatars/table');

if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// GOLD badge with dark border
function createBadgeSVG() {
    return Buffer.from(`
        <svg width="${AVATAR_WIDTH}" height="${BADGE_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
            <rect x="2" y="2" width="${AVATAR_WIDTH - 4}" height="${BADGE_HEIGHT - 4}" 
                  rx="4" ry="4" 
                  fill="#d4a000" 
                  stroke="#8B6914" 
                  stroke-width="3"/>
        </svg>
    `);
}

async function processAvatar(inputPath, outputPath) {
    try {
        // Resize character to fill full height, badge overlaps bottom
        const resizedCharacter = await sharp(inputPath)
            .resize(AVATAR_WIDTH, AVATAR_HEIGHT, { fit: 'cover', position: 'top' })
            .toBuffer();

        const badgeSVG = createBadgeSVG();

        // Badge ON TOP at the bottom
        await sharp(resizedCharacter)
            .composite([{ input: badgeSVG, top: AVATAR_HEIGHT - BADGE_HEIGHT, left: 0 }])
            .png()
            .toFile(outputPath);

        console.log(`✓ ${path.basename(inputPath)}`);
        return true;
    } catch (error) {
        console.error(`✗ ${inputPath}: ${error.message}`);
        return false;
    }
}

async function processDirectory(inputDir, prefix) {
    const files = fs.readdirSync(inputDir).filter(f => f.endsWith('.png'));
    console.log(`Processing ${files.length} from ${prefix}/...`);

    for (const file of files) {
        await processAvatar(
            path.join(inputDir, file),
            path.join(OUTPUT_DIR, `${prefix}_${file}`)
        );
    }
}

async function main() {
    console.log('Creating avatars at PROPER SIZE (125×170)...\n');
    console.log(`Character: ${CHARACTER_SIZE}×${CHARACTER_SIZE}px`);
    console.log(`Badge: ${AVATAR_WIDTH}×${BADGE_HEIGHT}px`);
    console.log(`Total: ${AVATAR_WIDTH}×${AVATAR_HEIGHT}px\n`);

    if (fs.existsSync(FREE_INPUT)) await processDirectory(FREE_INPUT, 'free');
    if (fs.existsSync(VIP_INPUT)) await processDirectory(VIP_INPUT, 'vip');

    console.log('\n✅ Complete! Output:', OUTPUT_DIR);
}

main();

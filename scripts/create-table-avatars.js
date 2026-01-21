/**
 * AVATAR WITH GOLD BADGE - Matching Template
 * Gold/yellow background badge with dark border
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const FINAL_WIDTH = 78;
const FINAL_HEIGHT = 125;
const BADGE_HEIGHT = 35;

const FREE_INPUT = path.join(__dirname, '../public/avatars/free');
const VIP_INPUT = path.join(__dirname, '../public/avatars/vip');
const OUTPUT_DIR = path.join(__dirname, '../public/avatars/table');

if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// GOLD badge matching template style
function createBadgeSVG() {
    return Buffer.from(`
        <svg width="${FINAL_WIDTH}" height="${BADGE_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
            <rect x="1" y="1" width="${FINAL_WIDTH - 2}" height="${BADGE_HEIGHT - 2}" 
                  rx="3" ry="3" 
                  fill="#d4a000" 
                  stroke="#8B6914" 
                  stroke-width="2"/>
        </svg>
    `);
}

async function processAvatar(inputPath, outputPath) {
    try {
        const resizedCharacter = await sharp(inputPath)
            .resize(FINAL_WIDTH, FINAL_HEIGHT, { fit: 'cover', position: 'top' })
            .toBuffer();

        const badgeSVG = createBadgeSVG();

        await sharp(resizedCharacter)
            .composite([{ input: badgeSVG, top: FINAL_HEIGHT - BADGE_HEIGHT, left: 0 }])
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
    console.log('Creating avatars with GOLD badges...\n');

    if (fs.existsSync(FREE_INPUT)) await processDirectory(FREE_INPUT, 'free');
    if (fs.existsSync(VIP_INPUT)) await processDirectory(VIP_INPUT, 'vip');

    console.log('\n✅ Complete! Output:', OUTPUT_DIR);
}

main();

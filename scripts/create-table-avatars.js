/**
 * ═══════════════════════════════════════════════════════════════════════════
 * RETIRED 2026-08-23. THIS SCRIPT WILL DESTROY THE SHIPPED AVATARS.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * It was written when a table avatar was "character + gold nameplate badge"
 * composited into 125x170. Neither half of that is true any more:
 *
 *   1. THE BADGE IS GONE. The seat draws a real name box under the art
 *      (.seat__info). A baked plate lands directly on top of it. The CSS that
 *      used to clip the plate off no longer exists either - SeatSlot.css still
 *      carries comments describing a clip-path rule that is not in the file,
 *      and --sp-bust-clip is hardcoded 0%.
 *
 *   2. THE SHIPPED ART IS REPAIRED, AND THIS WOULD OVERWRITE IT. A background
 *      remover had punched holes through 26 of the 100 subjects and eaten bays
 *      inward from the outline of 34 more - the eagle's crown, the unicorn's
 *      body, the geisha's face. Those repairs live in the /avatars/table/
 *      files THEMSELVES (see the avatar-matte-repair and
 *      avatar-silhouette-restore commits). Re-running this regenerates every
 *      one of them from /avatars/{free,vip}/ and throws the repairs away.
 *
 *   3. FOR THREE SLUGS THE SOURCE IS THE WRONG CHARACTER ENTIRELY. The gallery
 *      images for free/viking and vip/viking_warrior were byte-identical to
 *      each other while their busts are distinct people. Regenerating from
 *      source would collapse two different avatars into one.
 *
 * It is kept, rather than deleted, because it documents how the family was
 * originally cut. It refuses to run without an explicit acknowledgement so a
 * future `node scripts/create-table-avatars.js` cannot quietly undo the lot.
 * If you genuinely need to re-cut the family, fix the three mismatched sources
 * first and drop the badge composite below.
 */

const RETIRED_REASON =
  'create-table-avatars.js is RETIRED: it re-bakes a gold nameplate the seat no ' +
  'longer clips, and it overwrites the repaired mattes in public/avatars/table/. ' +
  'Re-run only with I_UNDERSTAND_THIS_OVERWRITES_REPAIRED_AVATARS=1, and read the ' +
  'header first.';

if (process.env.I_UNDERSTAND_THIS_OVERWRITES_REPAIRED_AVATARS !== '1') {
  console.error('\n' + RETIRED_REASON + '\n');
  process.exit(1);
}

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

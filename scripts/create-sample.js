const sharp = require('sharp');

const FINAL_WIDTH = 78;
const FINAL_HEIGHT = 125;
const BADGE_HEIGHT = 35;

// Black background with gold border
const badgeSVG = Buffer.from(`
    <svg width="${FINAL_WIDTH}" height="${BADGE_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
        <rect x="2" y="2" width="${FINAL_WIDTH - 4}" height="${BADGE_HEIGHT - 4}" 
              rx="4" ry="4" 
              fill="#000000" 
              stroke="#d4a000" 
              stroke-width="2"/>
    </svg>
`);

async function createSample() {
    const input = './public/avatars/vip/viking_warrior.png';
    const output = './public/avatars/table/SAMPLE_viking.png';

    const resized = await sharp(input)
        .resize(FINAL_WIDTH, FINAL_HEIGHT, { fit: 'cover', position: 'top' })
        .toBuffer();

    await sharp(resized)
        .composite([{ input: badgeSVG, top: FINAL_HEIGHT - BADGE_HEIGHT, left: 0 }])
        .png()
        .toFile(output);

    console.log('Sample created:', output);
}

createSample();

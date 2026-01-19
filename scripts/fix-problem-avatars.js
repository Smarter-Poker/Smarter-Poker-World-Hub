/**
 * Fix specific avatars with white background issues
 * Uses a more aggressive threshold for problem avatars
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const AVATARS_DIR = path.join(__dirname, '../public/avatars');

// Avatars that need more aggressive cleanup
const PROBLEM_AVATARS = [
    { path: 'vip/dancer.png', threshold: 220 },      // Dance Icon
    { path: 'free/shiba.png', threshold: 220 },       // Shiba Inu
    { path: 'vip/liberty.png', threshold: 220 },      // Liberty Statue
    { path: 'vip/unicorn.png', threshold: 220 },      // Unicorn Magic
    { path: 'vip/grumpy_cat.png', threshold: 220 },   // Grumpy Cat
    { path: 'free/rabbit.png', threshold: 215 },      // Lucky Rabbit (severe)
    { path: 'vip/gorilla.png', threshold: 220 },      // Wise Gorilla
];

async function fixAvatar(avatarPath, threshold) {
    const fullPath = path.join(AVATARS_DIR, avatarPath);

    if (!fs.existsSync(fullPath)) {
        console.log(`⚠️ File not found: ${avatarPath}`);
        return;
    }

    try {
        console.log(`Processing: ${avatarPath} (threshold: ${threshold})`);

        const buffer = fs.readFileSync(fullPath);

        const transparentBuffer = await sharp(buffer)
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true })
            .then(({ data, info }) => {
                const pixels = new Uint8ClampedArray(data);

                for (let i = 0; i < pixels.length; i += 4) {
                    const r = pixels[i];
                    const g = pixels[i + 1];
                    const b = pixels[i + 2];

                    // More aggressive: remove pixels that are near-white
                    if (r > threshold && g > threshold && b > threshold) {
                        pixels[i + 3] = 0;
                    }
                }

                return sharp(pixels, {
                    raw: {
                        width: info.width,
                        height: info.height,
                        channels: 4
                    }
                })
                    .png({ compressionLevel: 9 })
                    .toBuffer();
            });

        fs.writeFileSync(fullPath, transparentBuffer);
        console.log(`✅ Fixed: ${avatarPath}`);

    } catch (error) {
        console.error(`❌ Error fixing ${avatarPath}:`, error.message);
    }
}

async function main() {
    console.log('🔧 Fixing problem avatars with aggressive background removal...\n');

    for (const avatar of PROBLEM_AVATARS) {
        await fixAvatar(avatar.path, avatar.threshold);
    }

    console.log('\n✅ Done fixing problem avatars!');
}

main().catch(console.error);

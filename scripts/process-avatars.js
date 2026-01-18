/**
 * Batch process all preset avatars to remove white backgrounds
 * Processes all 75 static avatar images in /public/avatars/
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const AVATARS_DIR = path.join(__dirname, '../public/avatars');
const THRESHOLD = 220; // RGB threshold for white removal (lowered to catch off-white backgrounds)

async function processAvatar(filePath) {
    try {
        console.log(`Processing: ${path.basename(filePath)}`);

        // Read the image
        const buffer = fs.readFileSync(filePath);

        // Process to remove white background
        const transparentBuffer = await sharp(buffer)
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true })
            .then(({ data, info }) => {
                const pixels = new Uint8ClampedArray(data);

                // Make white pixels transparent
                for (let i = 0; i < pixels.length; i += 4) {
                    const r = pixels[i];
                    const g = pixels[i + 1];
                    const b = pixels[i + 2];

                    if (r > THRESHOLD && g > THRESHOLD && b > THRESHOLD) {
                        pixels[i + 3] = 0; // Set alpha to 0
                    }
                }

                // Convert back to PNG
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

        // Overwrite original file with transparent version
        fs.writeFileSync(filePath, transparentBuffer);
        console.log(`✅ Processed: ${path.basename(filePath)}`);

    } catch (error) {
        console.error(`❌ Error processing ${filePath}:`, error.message);
    }
}

async function processAllAvatars() {
    console.log('🎨 Starting batch avatar processing...\n');

    // Process free avatars
    const freeDir = path.join(AVATARS_DIR, 'free');
    const freeFiles = fs.readdirSync(freeDir)
        .filter(f => f.endsWith('.png'))
        .map(f => path.join(freeDir, f));

    console.log(`Found ${freeFiles.length} FREE avatars`);
    for (const file of freeFiles) {
        await processAvatar(file);
    }

    // Process VIP avatars
    const vipDir = path.join(AVATARS_DIR, 'vip');
    const vipFiles = fs.readdirSync(vipDir)
        .filter(f => f.endsWith('.png'))
        .map(f => path.join(vipDir, f));

    console.log(`\nFound ${vipFiles.length} VIP avatars`);
    for (const file of vipFiles) {
        await processAvatar(file);
    }

    console.log(`\n✅ Complete! Processed ${freeFiles.length + vipFiles.length} avatars`);
}

processAllAvatars().catch(console.error);

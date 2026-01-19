#!/usr/bin/env node
/**
 * 🔍 ASSET INTEGRITY CHECKER
 * ═══════════════════════════════════════════════════════════════════════════
 * Scans TRAINING_CLINICS.js for asset references and verifies they exist
 * Generates mock assets if missing
 * ═══════════════════════════════════════════════════════════════════════════
 */

const fs = require('fs');
const path = require('path');

const PUBLIC_DIR = path.join(__dirname, '../public');
const CLINICS_FILE = path.join(__dirname, '../src/data/TRAINING_CLINICS.js');

// Mock asset generators
function generateMockImage(filepath) {
    // Create a simple SVG placeholder
    const filename = path.basename(filepath);
    const svg = `<svg width="400" height="400" xmlns="http://www.w3.org/2000/svg">
  <rect width="400" height="400" fill="#1a2744"/>
  <text x="200" y="200" font-family="Arial" font-size="24" fill="#fff" text-anchor="middle">
    ${filename}
  </text>
  <text x="200" y="230" font-family="Arial" font-size="14" fill="#888" text-anchor="middle">
    Mock Asset
  </text>
</svg>`;

    fs.mkdirSync(path.dirname(filepath), { recursive: true });
    fs.writeFileSync(filepath, svg);
    console.log(`   ✅ Generated mock image: ${path.relative(PUBLIC_DIR, filepath)}`);
}

function generateMockAudio(filepath) {
    // Create a minimal WAV file (silence)
    const header = Buffer.from([
        0x52, 0x49, 0x46, 0x46, // "RIFF"
        0x24, 0x00, 0x00, 0x00, // File size - 8
        0x57, 0x41, 0x56, 0x45, // "WAVE"
        0x66, 0x6D, 0x74, 0x20, // "fmt "
        0x10, 0x00, 0x00, 0x00, // Subchunk size
        0x01, 0x00,             // Audio format (PCM)
        0x01, 0x00,             // Num channels (mono)
        0x44, 0xAC, 0x00, 0x00, // Sample rate (44100)
        0x88, 0x58, 0x01, 0x00, // Byte rate
        0x02, 0x00,             // Block align
        0x10, 0x00,             // Bits per sample
        0x64, 0x61, 0x74, 0x61, // "data"
        0x00, 0x00, 0x00, 0x00  // Data size
    ]);

    fs.mkdirSync(path.dirname(filepath), { recursive: true });
    fs.writeFileSync(filepath, header);
    console.log(`   ✅ Generated mock audio: ${path.relative(PUBLIC_DIR, filepath)}`);
}

async function checkAssets() {
    console.log('🔍 Asset Integrity Check\n');
    console.log('═══════════════════════════════════════════════════════════════\n');

    // Check if TRAINING_CLINICS.js exists
    if (!fs.existsSync(CLINICS_FILE)) {
        console.error('❌ TRAINING_CLINICS.js not found');
        process.exit(1);
    }

    console.log('Step 1: Scanning TRAINING_CLINICS.js for asset references...\n');

    const clinicsContent = fs.readFileSync(CLINICS_FILE, 'utf8');

    // Extract image references (look for common patterns)
    const imagePatterns = [
        /image:\s*['"]([^'"]+)['"]/g,
        /img_src:\s*['"]([^'"]+)['"]/g,
        /icon_url:\s*['"]([^'"]+)['"]/g,
    ];

    // Extract audio references
    const audioPatterns = [
        /audio:\s*['"]([^'"]+)['"]/g,
        /audio_src:\s*['"]([^'"]+)['"]/g,
        /sound:\s*['"]([^'"]+)['"]/g,
    ];

    const imageRefs = new Set();
    const audioRefs = new Set();

    // Scan for images
    imagePatterns.forEach(pattern => {
        let match;
        while ((match = pattern.exec(clinicsContent)) !== null) {
            imageRefs.add(match[1]);
        }
    });

    // Scan for audio
    audioPatterns.forEach(pattern => {
        let match;
        while ((match = pattern.exec(clinicsContent)) !== null) {
            audioRefs.add(match[1]);
        }
    });

    console.log(`Found ${imageRefs.size} image references`);
    console.log(`Found ${audioRefs.size} audio references\n`);

    // Check images
    if (imageRefs.size > 0) {
        console.log('Step 2: Verifying image assets...\n');
        let missingImages = 0;

        imageRefs.forEach(ref => {
            const filepath = path.join(PUBLIC_DIR, ref);
            if (!fs.existsSync(filepath)) {
                console.log(`❌ Missing: ${ref}`);
                generateMockImage(filepath);
                missingImages++;
            } else {
                console.log(`✅ Found: ${ref}`);
            }
        });

        if (missingImages > 0) {
            console.log(`\n⚠️  Generated ${missingImages} mock images\n`);
        } else {
            console.log(`\n✅ All images found\n`);
        }
    }

    // Check audio
    if (audioRefs.size > 0) {
        console.log('Step 3: Verifying audio assets...\n');
        let missingAudio = 0;

        audioRefs.forEach(ref => {
            const filepath = path.join(PUBLIC_DIR, ref);
            if (!fs.existsSync(filepath)) {
                console.log(`❌ Missing: ${ref}`);
                generateMockAudio(filepath);
                missingAudio++;
            } else {
                console.log(`✅ Found: ${ref}`);
            }
        });

        if (missingAudio > 0) {
            console.log(`\n⚠️  Generated ${missingAudio} mock audio files\n`);
        } else {
            console.log(`\n✅ All audio files found\n`);
        }
    }

    // Check for standard training assets
    console.log('Step 4: Verifying standard training assets...\n');

    const standardAssets = [
        'audio/deal.mp3',
        'audio/click.mp3',
        'audio/correct.mp3',
        'audio/incorrect.mp3',
        'audio/chip-stack.mp3',
        'audio/tick.mp3',
        'audio/heartbeat.mp3',
    ];

    let missingStandard = 0;

    standardAssets.forEach(asset => {
        const filepath = path.join(PUBLIC_DIR, asset);
        if (!fs.existsSync(filepath)) {
            console.log(`❌ Missing: ${asset}`);
            if (asset.endsWith('.mp3') || asset.endsWith('.wav')) {
                generateMockAudio(filepath);
            }
            missingStandard++;
        } else {
            console.log(`✅ Found: ${asset}`);
        }
    });

    if (missingStandard > 0) {
        console.log(`\n⚠️  Generated ${missingStandard} mock standard assets\n`);
    } else {
        console.log(`\n✅ All standard assets found\n`);
    }

    // Summary
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('✅ ASSET INTEGRITY CHECK COMPLETE');
    console.log('═══════════════════════════════════════════════════════════════');

    const totalMissing = (imageRefs.size > 0 ? missingImages : 0) +
        (audioRefs.size > 0 ? missingAudio : 0) +
        missingStandard;

    if (totalMissing > 0) {
        console.log(`⚠️  Generated ${totalMissing} mock assets`);
        console.log('   Replace with real assets before production!\n');
    } else {
        console.log('✅ All assets present\n');
    }

    process.exit(0);
}

checkAssets().catch(err => {
    console.error('\n💥 Asset check failed:', err.message);
    console.error(err);
    process.exit(1);
});

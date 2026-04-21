/**
 * 🧪 TEST VIDEO CLIPPING PIPELINE
 * Tests the full flow: Download -> Vertical Conversion -> Upload
 */

import { videoClipper } from './VideoClipper.js';
import { getRandomClip, getRandomCaption, markClipUsed, getClipStats } from './ClipLibrary.js';
import fs from 'fs';

async function testClipPipeline() {
    console.debug('\n🧪 TESTING VIDEO CLIP PIPELINE');
    console.debug('═'.repeat(60));

    // Step 1: Get a random clip from library
    console.debug('\n📚 Step 1: Getting random clip from library...');
    const clip = getRandomClip();
    console.debug(`   Selected: ${clip.title}`);
    console.debug(`   Category: ${clip.category}`);
    console.debug(`   URL: ${clip.source_url}`);

    // Step 2: Get a caption
    console.debug('\n💬 Step 2: Getting caption...');
    const caption = getRandomCaption(clip.category);
    console.debug(`   Caption: "${caption}"`);

    // Step 3: Process the clip (download + convert to vertical)
    console.debug('\n🎬 Step 3: Processing clip...');
    const result = await videoClipper.processVideo(clip.source_url, {
        startTime: clip.start_time,
        duration: Math.min(clip.duration, 45), // Limit to 45s for testing
        addCaptions: false, // Skip captions for speed
        convertToVertical: true,
        caption: caption,
        // authorId: 'test-author-id' // Uncomment to test with real Supabase
    });

    console.debug('\n📊 RESULT:');
    console.debug(JSON.stringify(result, null, 2));

    // Mark as used
    if (result.success) {
        markClipUsed(clip.id);
        console.debug(`\n✅ SUCCESS! Clip processed and marked as used.`);
    } else {
        console.debug(`\n❌ FAILED: ${result.error}`);
    }

    // Show library stats
    console.debug('\n📈 LIBRARY STATS:');
    console.debug(getClipStats());

    return result;
}

async function testLocalConversion() {
    console.debug('\n🧪 TESTING LOCAL VERTICAL CONVERSION');
    console.debug('═'.repeat(60));

    const inputPath = './output/downloads/test_clip.mp4';

    if (!fs.existsSync(inputPath)) {
        console.debug(`❌ No test file found at ${inputPath}`);
        console.debug('   Run the full pipeline test first.');
        return;
    }

    const result = await videoClipper.convertToVertical(inputPath, {
        deleteOriginal: false
    });

    console.debug('Result:', result);
}

async function downloadAndTestClip() {
    console.debug('\n🧪 TESTING DOWNLOAD ONLY');
    console.debug('═'.repeat(60));

    const clip = getRandomClip();
    console.debug(`Testing: ${clip.title}`);

    const result = await videoClipper.downloadVideo(clip.source_url);
    console.debug('Download result:', result);

    if (result.success) {
        const duration = await videoClipper.getVideoDuration(result.path);
        console.debug(`Duration: ${duration}s`);

        // Now convert to vertical
        console.debug('\nConverting to vertical...');
        const vertResult = await videoClipper.convertToVertical(result.path, {
            deleteOriginal: false
        });
        console.debug('Vertical result:', vertResult);
    }
}

// Run the test
const testType = process.argv[2] || 'full';

if (testType === 'full') {
    testClipPipeline().catch(console.warn);
} else if (testType === 'local') {
    testLocalConversion().catch(console.warn);
} else if (testType === 'download') {
    downloadAndTestClip().catch(console.warn);
} else {
    console.debug('Usage: node test-clipper.js [full|local|download]');
}

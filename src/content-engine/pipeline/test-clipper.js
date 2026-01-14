/**
 * 🧪 TEST VIDEO CLIPPING PIPELINE
 * Tests the full flow: Download -> Vertical Conversion -> Upload
 */

import { videoClipper } from './VideoClipper.js';
import { getRandomClip, getRandomCaption, markClipUsed, getClipStats } from './ClipLibrary.js';
import fs from 'fs';
import path from 'path';

async function testClipPipeline() {
    console.log('\n🧪 TESTING VIDEO CLIP PIPELINE');
    console.log('═'.repeat(60));

    // Step 1: Get a random clip from library
    console.log('\n📚 Step 1: Getting random clip from library...');
    const clip = getRandomClip();
    console.log(`   Selected: ${clip.title}`);
    console.log(`   Category: ${clip.category}`);
    console.log(`   URL: ${clip.source_url}`);

    // Step 2: Get a caption
    console.log('\n💬 Step 2: Getting caption...');
    const caption = getRandomCaption(clip.category);
    console.log(`   Caption: "${caption}"`);

    // Step 3: Process the clip (download + convert to vertical)
    console.log('\n🎬 Step 3: Processing clip...');
    const result = await videoClipper.processVideo(clip.source_url, {
        startTime: clip.start_time,
        duration: Math.min(clip.duration, 45), // Limit to 45s for testing
        addCaptions: false, // Skip captions for speed
        convertToVertical: true,
        caption: caption,
        // authorId: 'test-author-id' // Uncomment to test with real Supabase
    });

    console.log('\n📊 RESULT:');
    console.log(JSON.stringify(result, null, 2));

    // Mark as used
    if (result.success) {
        markClipUsed(clip.id);
        console.log(`\n✅ SUCCESS! Clip processed and marked as used.`);
    } else {
        console.log(`\n❌ FAILED: ${result.error}`);
    }

    // Show library stats
    console.log('\n📈 LIBRARY STATS:');
    console.log(getClipStats());

    return result;
}

async function testLocalConversion() {
    console.log('\n🧪 TESTING LOCAL VERTICAL CONVERSION');
    console.log('═'.repeat(60));

    const inputPath = './output/downloads/test_clip.mp4';

    if (!fs.existsSync(inputPath)) {
        console.log(`❌ No test file found at ${inputPath}`);
        console.log('   Run the full pipeline test first.');
        return;
    }

    const result = await videoClipper.convertToVertical(inputPath, {
        deleteOriginal: false
    });

    console.log('Result:', result);
}

async function downloadAndTestClip() {
    console.log('\n🧪 TESTING DOWNLOAD ONLY');
    console.log('═'.repeat(60));

    const clip = getRandomClip();
    console.log(`Testing: ${clip.title}`);

    const result = await videoClipper.downloadVideo(clip.source_url);
    console.log('Download result:', result);

    if (result.success) {
        const duration = await videoClipper.getVideoDuration(result.path);
        console.log(`Duration: ${duration}s`);

        // Now convert to vertical
        console.log('\nConverting to vertical...');
        const vertResult = await videoClipper.convertToVertical(result.path, {
            deleteOriginal: false
        });
        console.log('Vertical result:', vertResult);
    }
}

// Run the test
const testType = process.argv[2] || 'full';

if (testType === 'full') {
    testClipPipeline().catch(console.error);
} else if (testType === 'local') {
    testLocalConversion().catch(console.error);
} else if (testType === 'download') {
    downloadAndTestClip().catch(console.error);
} else {
    console.log('Usage: node test-clipper.js [full|local|download]');
}

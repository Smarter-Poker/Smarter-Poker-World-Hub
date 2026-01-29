/**
 * 🧪 EMOJI RATE VERIFICATION TEST
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Tests that emoji usage is exactly 5% (1 in 20 posts)
 * 
 * Run: node test-emoji-rate.js
 * ═══════════════════════════════════════════════════════════════════════════
 */

// Simulate the emoji logic from HorseScheduler.js
function applyEmojiLogic(text) {
    const hasEmoji = text.match(/[\u{1F300}-\u{1F9FF}]/u);
    const endsWithEmoji = text.match(/[\u{1F300}-\u{1F9FF}]\s*$/u);

    // GLOBAL 5% emoji rate (1 in 20 posts) - real users rarely emoji
    if (!hasEmoji && Math.random() < 0.05) {
        const emojis = ['🔥', '💯', '😂', '👀', '💪'];
        const emoji = emojis[Math.floor(Math.random() * emojis.length)];

        // Random placement
        const placement = Math.random();
        if (placement < 0.15) {
            // 15% chance: emoji only (for very short responses)
            if (text.length < 10) return emoji;
        } else if (placement < 0.35) {
            // 20% chance: emoji at start
            return emoji + ' ' + text;
        } else if (!endsWithEmoji) {
            // 65% chance: emoji at end
            return text + ' ' + emoji;
        }
    }

    return text;
}

// Test with 10,000 posts
const TOTAL_POSTS = 10000;
let postsWithEmoji = 0;
let postsWithDoubleEmoji = 0;

console.log('🧪 Testing emoji rate over', TOTAL_POSTS, 'posts...\n');

for (let i = 0; i < TOTAL_POSTS; i++) {
    const originalText = 'this is a test post';
    const result = applyEmojiLogic(originalText);

    // Check if emoji was added
    if (result !== originalText) {
        postsWithEmoji++;

        // Check for double emojis
        const emojiMatches = result.match(/[\u{1F300}-\u{1F9FF}]/gu);
        if (emojiMatches && emojiMatches.length > 1) {
            postsWithDoubleEmoji++;
        }
    }
}

const actualRate = (postsWithEmoji / TOTAL_POSTS) * 100;
const expectedRate = 5.0;
const tolerance = 0.5; // Allow 0.5% variance

console.log('═'.repeat(60));
console.log('📊 RESULTS:');
console.log('═'.repeat(60));
console.log(`Total posts tested:      ${TOTAL_POSTS.toLocaleString()}`);
console.log(`Posts with emoji:        ${postsWithEmoji.toLocaleString()}`);
console.log(`Posts with double emoji: ${postsWithDoubleEmoji.toLocaleString()}`);
console.log(`\nActual emoji rate:       ${actualRate.toFixed(2)}%`);
console.log(`Expected rate:           ${expectedRate.toFixed(2)}%`);
console.log(`Variance:                ${Math.abs(actualRate - expectedRate).toFixed(2)}%`);
console.log('═'.repeat(60));

// Validation
const withinTolerance = Math.abs(actualRate - expectedRate) <= tolerance;
const noDoubleEmojis = postsWithDoubleEmoji === 0;

if (withinTolerance && noDoubleEmojis) {
    console.log('✅ TEST PASSED');
    console.log(`   - Emoji rate is ${actualRate.toFixed(2)}% (target: 5%)`);
    console.log('   - No double emojis detected');
} else {
    console.log('❌ TEST FAILED');
    if (!withinTolerance) {
        console.log(`   - Emoji rate ${actualRate.toFixed(2)}% is outside tolerance (${expectedRate}% ± ${tolerance}%)`);
    }
    if (!noDoubleEmojis) {
        console.log(`   - Found ${postsWithDoubleEmoji} posts with double emojis`);
    }
}

console.log('═'.repeat(60));

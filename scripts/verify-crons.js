// Test shim to run the cron API endpoints locally
require('dotenv').config({ path: '.env.local' });

// Mock Request/Response
const req = { headers: {} };
const res = {
    status: (code) => ({
        json: (data) => console.log(`[${code}] Response:`, JSON.stringify(data, null, 2))
    })
};

async function testCrons() {
    console.log('🧪 TESTING VIDEO CRON (pokernews-videos.js)...');
    try {
        const { default: videoHandler } = await import('../pages/api/cron/pokernews-videos.js');
        await videoHandler(req, res);
    } catch (e) {
        console.error('Video Cron Failed:', e);
    }

    console.log('\n🧪 TESTING NEWS CRON (news-scraper.js)...');
    try {
        const { default: newsHandler } = await import('../pages/api/cron/news-scraper.js');
        await newsHandler(req, res);
    } catch (e) {
        console.error('News Cron Failed:', e);
    }
}

testCrons();

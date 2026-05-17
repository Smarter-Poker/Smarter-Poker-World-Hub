const Parser = require('rss-parser');
const parser = new Parser({
    headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
    }
});

const feeds = [
    'https://www.pokernews.com/rss.php',
    'https://www.cardplayer.com/poker-news.rss',
    'https://www.cardplayer.com/poker-news/rss',
    'https://www.poker.org/feed',
    'https://www.pokernews.com/news.rss'
];

async function test() {
    for (const feed of feeds) {
        try {
            console.log(`Testing feed: ${feed}...`);
            const parsed = await parser.parseURL(feed);
            console.log(`  ✅ Success! Title: "${parsed.title}", Items: ${parsed.items?.length || 0}`);
            if (parsed.items && parsed.items.length > 0) {
                console.log(`  Sample item title: "${parsed.items[0].title}"`);
                console.log(`  Sample item date: "${parsed.items[0].pubDate || parsed.items[0].isoDate}"`);
            }
        } catch (e) {
            console.log(`  ❌ Failed: ${e.message}`);
        }
    }
}

test();

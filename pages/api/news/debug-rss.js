/**
 * Debug RSS - Check what image data RSS feeds actually contain
 */
import Parser from 'rss-parser';

const rssParser = new Parser({
    customFields: {
        item: ['media:content', 'media:thumbnail', 'content:encoded', 'enclosure', 'media:group']
    }
});

export default async function handler(req, res) {
    const results = [];

    // Test a few RSS feeds
    const testFeeds = [
        { name: 'PokerNews', url: 'https://www.pokernews.com/news.rss' },
        { name: 'Upswing', url: 'https://upswingpoker.com/feed/' },
        { name: 'Google News Poker', url: 'https://news.google.com/rss/search?q=poker+news+today&hl=en-US&gl=US&ceid=US:en' }
    ];

    for (const feed of testFeeds) {
        try {
            const parsed = await rssParser.parseURL(feed.url);
            const item = parsed.items[0];

            results.push({
                source: feed.name,
                title: item.title?.substring(0, 50),
                link: item.link?.substring(0, 80),
                hasEnclosure: !!item.enclosure,
                enclosureUrl: item.enclosure?.url?.substring(0, 80),
                hasMediaContent: !!item['media:content'],
                mediaContent: JSON.stringify(item['media:content'])?.substring(0, 200),
                hasMediaThumbnail: !!item['media:thumbnail'],
                mediaThumbnail: JSON.stringify(item['media:thumbnail'])?.substring(0, 200),
                hasMediaGroup: !!item['media:group'],
                mediaGroup: JSON.stringify(item['media:group'])?.substring(0, 200),
                descriptionHasImg: item.description?.includes('<img'),
                contentHasImg: item.content?.includes('<img'),
                contentEncodedHasImg: item['content:encoded']?.includes('<img')
            });
        } catch (error) {
            results.push({ source: feed.name, error: error.message });
        }
    }

    return res.status(200).json({ results });
}

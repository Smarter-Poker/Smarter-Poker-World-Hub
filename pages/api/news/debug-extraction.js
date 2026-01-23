/**
 * Debug Image Extraction - Shows exactly what RSS feeds contain
 */
import Parser from 'rss-parser';

const rssParser = new Parser({
    customFields: {
        item: ['media:content', 'media:thumbnail', 'content:encoded', 'enclosure', 'media:group']
    }
});

function extractImage(item) {
    const results = {
        hasEnclosure: !!item.enclosure,
        enclosureUrl: item.enclosure?.url,
        hasMediaContent: !!item['media:content'],
        mediaContentRaw: JSON.stringify(item['media:content']),
        hasMediaThumbnail: !!item['media:thumbnail'],
        mediaThumbnailRaw: JSON.stringify(item['media:thumbnail']),
        hasMediaGroup: !!item['media:group'],
        descriptionHasImg: item.description?.includes('<img'),
        contentHasImg: item.content?.includes('<img'),
        contentEncodedHasImg: item['content:encoded']?.includes('<img'),
        extractedUrl: null
    };

    // Try enclosure
    if (item.enclosure?.url) {
        results.extractedUrl = item.enclosure.url;
        results.extractedFrom = 'enclosure';
        return results;
    }

    // Try media:content
    if (item['media:content']) {
        const media = Array.isArray(item['media:content']) ? item['media:content'][0] : item['media:content'];
        if (media?.$?.url) {
            results.extractedUrl = media.$.url;
            results.extractedFrom = 'media:content.$';
            return results;
        }
        if (media?.url) {
            results.extractedUrl = media.url;
            results.extractedFrom = 'media:content.url';
            return results;
        }
    }

    // Try media:thumbnail
    if (item['media:thumbnail']) {
        const thumb = Array.isArray(item['media:thumbnail']) ? item['media:thumbnail'][0] : item['media:thumbnail'];
        if (thumb?.$?.url) {
            results.extractedUrl = thumb.$.url;
            results.extractedFrom = 'media:thumbnail.$';
            return results;
        }
        if (thumb?.url) {
            results.extractedUrl = thumb.url;
            results.extractedFrom = 'media:thumbnail.url';
            return results;
        }
    }

    // Try description img
    if (item.description) {
        const imgMatch = item.description.match(/<img[^>]+src=["']([^"']+)["']/i);
        if (imgMatch) {
            results.extractedUrl = imgMatch[1];
            results.extractedFrom = 'description img';
            return results;
        }
    }

    results.extractedFrom = 'none';
    return results;
}

export default async function handler(req, res) {
    const results = [];

    const testFeeds = [
        { name: 'PokerNews', url: 'https://www.pokernews.com/news.rss' },
        { name: 'Upswing', url: 'https://upswingpoker.com/feed/' },
        { name: 'Google News', url: 'https://news.google.com/rss/search?q=poker+news+today&hl=en-US&gl=US&ceid=US:en' }
    ];

    for (const feed of testFeeds) {
        try {
            const parsed = await rssParser.parseURL(feed.url);
            const item = parsed.items[0];

            results.push({
                source: feed.name,
                title: item.title?.substring(0, 60),
                link: item.link?.substring(0, 80),
                ...extractImage(item)
            });
        } catch (error) {
            results.push({ source: feed.name, error: error.message });
        }
    }

    return res.status(200).json({ results });
}

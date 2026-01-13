/**
 * 📡 RSS CONTENT AGGREGATOR
 * ═══════════════════════════════════════════════════════════════════════════
 * Pulls poker news from legitimate RSS feeds for content inspiration.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import Parser from 'rss-parser';

const parser = new Parser({
    customFields: {
        item: ['media:content', 'media:thumbnail', 'content:encoded']
    }
});

// Poker news RSS feeds (public, legal to aggregate)
const RSS_SOURCES = [
    {
        id: 'pokernews',
        name: 'PokerNews',
        url: 'https://www.pokernews.com/news.rss',
        category: 'news'
    },
    {
        id: 'cardplayer',
        name: 'Card Player',
        url: 'https://www.cardplayer.com/poker-news/rss',
        category: 'news'
    },
    {
        id: 'pocketfives',
        name: 'PocketFives',
        url: 'https://www.pocketfives.com/feed/',
        category: 'online'
    },
    {
        id: 'pokerorg',
        name: 'Poker.org',
        url: 'https://www.poker.org/feed/',
        category: 'news'
    },
    {
        id: 'upswing',
        name: 'Upswing Poker Blog',
        url: 'https://upswingpoker.com/feed/',
        category: 'strategy'
    },
    {
        id: 'twoplustwo',
        name: '2+2 News',
        url: 'https://forumserver.twoplustwo.com/external.php?type=RSS2',
        category: 'community'
    }
];

class RSSAggregator {
    constructor() {
        this.cache = new Map();
        this.cacheExpiry = 30 * 60 * 1000; // 30 minutes
    }

    /**
     * Fetch articles from a single source
     */
    async fetchSource(source) {
        try {
            const feed = await parser.parseURL(source.url);

            return feed.items.map(item => ({
                source_id: source.id,
                source_name: source.name,
                category: source.category,
                title: item.title,
                link: item.link,
                description: this.cleanDescription(item.contentSnippet || item.description || ''),
                full_content: item['content:encoded'] || item.content || '',
                published: item.pubDate ? new Date(item.pubDate) : new Date(),
                image: this.extractImage(item),
                guid: item.guid || item.link
            }));
        } catch (error) {
            console.error(`Error fetching ${source.name}:`, error.message);
            return [];
        }
    }

    /**
     * Fetch from all sources
     */
    async fetchAll() {
        console.log('📡 Fetching from all RSS sources...\n');

        const results = await Promise.all(
            RSS_SOURCES.map(source => this.fetchSource(source))
        );

        // Flatten and sort by date
        const allArticles = results
            .flat()
            .sort((a, b) => b.published - a.published);

        console.log(`📰 Found ${allArticles.length} articles total\n`);

        return allArticles;
    }

    /**
     * Get latest articles (with caching)
     */
    async getLatest(limit = 20) {
        const cacheKey = 'latest';
        const cached = this.cache.get(cacheKey);

        if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
            return cached.data.slice(0, limit);
        }

        const articles = await this.fetchAll();
        this.cache.set(cacheKey, { data: articles, timestamp: Date.now() });

        return articles.slice(0, limit);
    }

    /**
     * Get articles by category
     */
    async getByCategory(category, limit = 10) {
        const articles = await this.getLatest(100);
        return articles
            .filter(a => a.category === category)
            .slice(0, limit);
    }

    /**
     * Get articles containing keywords
     */
    async searchArticles(keywords, limit = 10) {
        const articles = await this.getLatest(100);
        const lowerKeywords = keywords.toLowerCase().split(' ');

        return articles
            .filter(a => {
                const text = `${a.title} ${a.description}`.toLowerCase();
                return lowerKeywords.some(kw => text.includes(kw));
            })
            .slice(0, limit);
    }

    /**
     * Clean HTML from description
     */
    cleanDescription(text) {
        return text
            .replace(/<[^>]*>/g, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 500);
    }

    /**
     * Extract image from item
     */
    extractImage(item) {
        if (item['media:content']?.$.url) {
            return item['media:content'].$.url;
        }
        if (item['media:thumbnail']?.$.url) {
            return item['media:thumbnail'].$.url;
        }
        // Try to extract from content
        const imgMatch = (item.content || item['content:encoded'] || '')
            .match(/<img[^>]+src="([^"]+)"/);
        return imgMatch ? imgMatch[1] : null;
    }

    /**
     * Get sources list
     */
    getSources() {
        return RSS_SOURCES;
    }
}

export const rssAggregator = new RSSAggregator();
export default RSSAggregator;

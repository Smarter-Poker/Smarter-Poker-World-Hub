/**
 * SCRAPE 50 REAL POKER NEWS STORIES
 * Pulls actual articles with images from major poker news sources
 */

require('dotenv').config({ path: '.env.local' });

const { createClient } = require('@supabase/supabase-js');
const Parser = require('rss-parser');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; // Use anon key with RLS
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const parser = new Parser();

const SOURCES = [
    { name: 'PokerNews', rss: 'https://www.pokernews.com/news.rss', icon: '🃏' },
    { name: 'CardPlayer', rss: 'https://www.cardplayer.com/poker-news/rss', icon: '♠️' },
    { name: 'PokerListings', rss: 'https://www.pokerlistings.com/feed', icon: '🎰' },
    { name: 'Poker.org', rss: 'https://www.poker.org/feed/', icon: '♦️' }
];

function categorizeArticle(title) {
    const lower = title.toLowerCase();
    if (lower.includes('wsop') || lower.includes('wpt') || lower.includes('tournament') || lower.includes('event')) {
        return 'tournament';
    }
    if (lower.includes('strategy') || lower.includes('how to') || lower.includes('tips') || lower.includes('guide')) {
        return 'strategy';
    }
    if (lower.includes('poker room') || lower.includes('casino') || lower.includes('online') || lower.includes('legislation')) {
        return 'industry';
    }
    return 'news';
}

function extractImage(item) {
    // Try multiple image sources
    if (item.enclosure?.url) return item.enclosure.url;
    if (item['media:content']?.$?.url) return item['media:content'].$.url;
    if (item['media:thumbnail']?.$?.url) return item['media:thumbnail'].$.url;

    // Try parsing HTML content
    const content = item['content:encoded'] || item.description || '';
    const imgMatch = content.match(/<img[^>]+src="([^">]+)"/);
    if (imgMatch) return imgMatch[1];

    // Default poker image
    return 'https://images.unsplash.com/photo-1511193311914-0346f16efe90?w=800&q=80';
}

async function scrapeAllNews() {
    console.log('🎯 Starting to scrape 50 poker news stories...\n');

    const allArticles = [];

    for (const source of SOURCES) {
        try {
            console.log(`📰 Fetching from ${source.name}...`);
            const feed = await parser.parseURL(source.rss);

            const articles = (feed.items || []).slice(0, 15).map(item => ({
                title: item.title,
                summary: (item.contentSnippet || item.content || '').replace(/<[^>]*>/g, '').slice(0, 300),
                excerpt: (item.contentSnippet || item.content || '').replace(/<[^>]*>/g, '').slice(0, 150),
                source_name: source.name,
                source_url: item.link,
                source_icon: source.icon,
                image_url: extractImage(item),
                category: categorizeArticle(item.title),
                published_at: new Date(item.pubDate || item.isoDate || Date.now()).toISOString()
            }));

            allArticles.push(...articles);
            console.log(`   ✅ Found ${articles.length} articles`);
        } catch (error) {
            console.error(`   ❌ Error fetching ${source.name}: ${error.message}`);
        }
    }

    console.log(`\n📊 Total articles scraped: ${allArticles.length}`);

    // Insert into database
    console.log('\n💾 Inserting into database...');
    let inserted = 0;
    let skipped = 0;

    for (const article of allArticles) {
        try {
            const { error } = await supabase
                .from('poker_news')
                .insert(article);

            if (error) {
                if (error.code === '23505') { // Duplicate
                    skipped++;
                } else {
                    console.error(`   Error inserting "${article.title}": ${error.message}`);
                }
            } else {
                inserted++;
                console.log(`   ✅ ${inserted}. ${article.title.slice(0, 60)}...`);
            }
        } catch (err) {
            console.error(`   Error: ${err.message}`);
        }
    }

    console.log(`\n🎉 COMPLETE!`);
    console.log(`   Inserted: ${inserted} articles`);
    console.log(`   Skipped (duplicates): ${skipped} articles`);
    console.log(`   Total in database: ${inserted} new articles`);
}

scrapeAllNews().catch(console.error);

/**
 * 🐴 TEST NEWS POSTING
 * Posts a real poker news article to a horse's feed
 */

import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../../../.env.local') });

import { createClient } from '@supabase/supabase-js';
import { getGrokClient } from '../../lib/grokClient.js';
import Parser from 'rss-parser';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);
const openai = getGrokClient();
const rssParser = new Parser();

const NEWS_SOURCES = [
    { name: 'PokerNews', rss: 'https://www.pokernews.com/news.rss', icon: '🃏' },
    { name: 'CardPlayer', rss: 'https://www.cardplayer.com/poker-news/rss', icon: '♠️' },
];

async function postNewsToHorse() {
    console.log('\n📰 POSTING POKER NEWS TO HORSE');
    console.log('═'.repeat(60));

    // Fetch news
    let article = null;
    for (const source of NEWS_SOURCES) {
        try {
            console.log(`Fetching from ${source.name}...`);
            const feed = await rssParser.parseURL(source.rss);
            if (feed.items?.length) {
                const item = feed.items[0];
                article = {
                    title: item.title,
                    link: item.link,
                    source: source.name,
                    icon: source.icon
                };
                break;
            }
        } catch (e) {
            console.log(`   ${source.name} failed: ${e.message}`);
        }
    }

    if (!article) {
        console.error('No news found');
        return;
    }

    console.log(`\n📰 Article: ${article.title}`);
    console.log(`   Source: ${article.source}`);
    console.log(`   Link: ${article.link}`);

    // Get random horse
    const { data: horses } = await supabase
        .from('content_authors')
        .select('id, name, alias, profile_id, stakes, voice')
        .eq('is_active', true)
        .not('profile_id', 'is', null)
        .limit(10);

    const horse = horses[Math.floor(Math.random() * horses.length)];
    console.log(`\n🐴 Horse: ${horse.alias}`);

    // Generate commentary
    const { choices } = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{
            role: 'system',
            content: `You are ${horse.name}, a casual poker player. Write a VERY brief (1 sentence) reaction to sharing this news. No hashtags.`
        }, {
            role: 'user',
            content: `Article: "${article.title}" from ${article.source}`
        }],
        max_tokens: 40
    });

    const commentary = choices[0].message.content;
    console.log(`\n💬 Commentary: ${commentary}`);

    // Create post
    const postContent = `${commentary}\n\n${article.icon} ${article.title}\n🔗 ${article.link}`;

    const { data: post, error } = await supabase
        .from('social_posts')
        .insert({
            author_id: horse.profile_id,
            content: postContent,
            content_type: 'link',
            visibility: 'public'
        })
        .select()
        .single();

    if (error) {
        console.error('Post error:', error.message);
        return;
    }

    console.log(`\n✅ POST CREATED: ${post.id}`);
    console.log('═'.repeat(60));
    console.log(`🎉 ${horse.alias} shared poker news!`);
}

postNewsToHorse();

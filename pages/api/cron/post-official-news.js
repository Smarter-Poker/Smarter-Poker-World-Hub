/**
 * 📰 OFFICIAL NEWS POSTER - Posts news to social feed as SmarterPokerOfficial
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Takes news articles from poker_news table and posts them to social_posts
 * as the SmarterPokerOfficial account (NOT horses).
 * 
 * Runs every 2 hours to keep the feed fresh with real poker news.
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// SmarterPokerOfficial system account UUID
const OFFICIAL_ACCOUNT_UUID = '00000000-0000-0000-0000-000000000001';

const CONFIG = {
    POSTS_PER_RUN: 3, // Post 3 news articles per run
    NEWS_COOLDOWN_HOURS: 6, // Don't repost same article within 6 hours
};

// ═══════════════════════════════════════════════════════════════════════════
// CHECK IF ARTICLE ALREADY POSTED
// ═══════════════════════════════════════════════════════════════════════════
async function isArticleAlreadyPosted(articleSlug) {
    const { data } = await supabase
        .from('social_posts')
        .select('id')
        .eq('author_id', OFFICIAL_ACCOUNT_UUID)
        .ilike('content', `%${articleSlug}%`)
        .limit(1);

    return data && data.length > 0;
}

// ═══════════════════════════════════════════════════════════════════════════
// POST NEWS ARTICLE TO SOCIAL FEED
// ═══════════════════════════════════════════════════════════════════════════
async function postNewsArticle(article) {
    console.log(`\n📰 Posting: ${article.title}`);

    // Create engaging post content
    const emoji = article.category === 'tournament' ? '🏆' :
        article.category === 'industry' ? '💼' :
            article.category === 'strategy' ? '📈' : '📰';

    const postContent = `${emoji} ${article.title}\n\n${article.excerpt}\n\n🔗 Read more: https://smarter.poker/hub/news/${article.slug}`;

    const { data: post, error } = await supabase
        .from('social_posts')
        .insert({
            author_id: OFFICIAL_ACCOUNT_UUID,
            content: postContent,
            content_type: 'link',
            visibility: 'public',
            // Link metadata for proper preview card rendering
            link_url: `https://smarter.poker/hub/news/${article.slug}`,
            link_title: article.title,
            link_description: article.excerpt,
            link_site_name: article.source_name || 'Smarter.Poker',
            link_image: article.image_url
        })
        .select()
        .single();

    if (error) {
        console.error(`   Post error: ${error.message}`);
        return null;
    }

    console.log(`✅ Posted: ${post.id}`);
    return post;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════════════════
export default async function handler(req, res) {
    // Security: validate cron auth for external callers
    const { validateCronAuth } = await import('../../../src/utils/cron-auth.js');
    if (!validateCronAuth(req)) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    console.log('\n📰 OFFICIAL NEWS POSTER - SmarterPokerOfficial');
    console.log('═'.repeat(60));

    if (!SUPABASE_URL) {
        return res.status(500).json({ error: 'Missing env vars' });
    }

    try {
        // Verify official account exists
        const { data: officialAccount, error: accountError } = await supabase
            .from('profiles')
            .select('id, username')
            .eq('id', OFFICIAL_ACCOUNT_UUID)
            .single();

        if (accountError || !officialAccount) {
            console.error('❌ SmarterPokerOfficial account not found!');
            return res.status(500).json({
                success: false,
                error: 'Official account not found'
            });
        }

        console.log(`✅ Posting as: ${officialAccount.username}`);

        // Get recent news articles that haven't been posted yet
        const { data: articles, error: articlesError } = await supabase
            .from('poker_news')
            .select('*')
            .eq('is_published', true)
            .order('published_at', { ascending: false })
            .limit(20);

        if (articlesError || !articles?.length) {
            console.log('No news articles available');
            return res.status(200).json({
                success: true,
                message: 'No news available',
                posted: 0
            });
        }

        console.log(`\n📚 Found ${articles.length} recent articles`);

        const results = [];
        let posted = 0;

        for (const article of articles) {
            if (posted >= CONFIG.POSTS_PER_RUN) break;

            // Check if already posted
            const alreadyPosted = await isArticleAlreadyPosted(article.slug);
            if (alreadyPosted) {
                console.log(`   ⏭️  Skipping (already posted): ${article.title.substring(0, 50)}...`);
                continue;
            }

            // Post the article
            const post = await postNewsArticle(article);
            if (post) {
                results.push({
                    article: article.title,
                    post_id: post.id,
                    success: true
                });
                posted++;

                // Small delay between posts
                await new Promise(r => setTimeout(r, 2000));
            }
        }

        console.log('\n' + '═'.repeat(60));
        console.log(`📊 Posted ${posted} news articles as ${officialAccount.username}`);

        return res.status(200).json({
            success: true,
            account: officialAccount.username,
            posted,
            results,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Cron error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
}

/**
 * Article Content Extraction API — FULL ARTICLE BODY
 * Uses microlink.io to extract the COMPLETE article content from external URLs
 * Then uses cheerio to clean HTML into readable paragraphs
 */
import * as cheerio from 'cheerio';

export default async function handler(req, res) {
    const { url } = req.query;

    if (!url) {
        return res.status(400).json({ error: 'URL parameter required' });
    }

    try {
        const targetUrl = decodeURIComponent(url);

        // Use microlink with data extraction to get FULL article body HTML
        const selectors = 'article,.article-body,.entry-content,.post-content,[class*=article-content],[class*=story-body],main,.content-body';
        const microlinkUrl = `https://api.microlink.io/?url=${encodeURIComponent(targetUrl)}&data.articleBody.selector=${encodeURIComponent(selectors)}&data.articleBody.type=html`;

        const response = await fetch(microlinkUrl, {
            headers: { 'User-Agent': 'SmartPokerBot/1.0' },
        });

        const result = await response.json();

        if (result.status === 'success' && result.data) {
            // Parse the article body HTML with cheerio to extract clean text
            let paragraphs = [];
            const rawHtml = result.data.articleBody || '';

            if (rawHtml) {
                const $ = cheerio.load(rawHtml);

                // Remove unwanted elements
                $('script, style, nav, header, footer, .ad, .advertisement, .social-share, .related-articles, .sidebar, iframe, .newsletter-signup, .ds-authorShare, .ds-authorInfoList, figure img, .article-social, .article-tags, .comments').remove();

                // Extract text from paragraphs
                $('p, h2, h3, h4, li, blockquote').each((_, el) => {
                    const text = $(el).text().trim();
                    if (text && text.length > 10) {
                        const tagName = $(el).prop('tagName')?.toLowerCase();
                        if (tagName === 'h2' || tagName === 'h3' || tagName === 'h4') {
                            paragraphs.push({ type: 'heading', text });
                        } else if (tagName === 'blockquote') {
                            paragraphs.push({ type: 'quote', text });
                        } else {
                            paragraphs.push({ type: 'paragraph', text });
                        }
                    }
                });
            }

            // If cheerio extraction failed, try the description as fallback
            if (paragraphs.length === 0 && result.data.description) {
                paragraphs = [{ type: 'paragraph', text: result.data.description }];
            }

            return res.status(200).json({
                success: true,
                data: {
                    title: result.data.title || '',
                    description: result.data.description || '',
                    image: result.data.image?.url || '',
                    author: result.data.author || '',
                    publisher: result.data.publisher || '',
                    date: result.data.date || '',
                    paragraphs, // Full article body as structured paragraphs
                    logo: result.data.logo?.url || '',
                    url: result.data.url || targetUrl,
                }
            });
        }

        // Fallback
        return res.status(200).json({
            success: false,
            data: {
                title: result.data?.title || '',
                description: result.data?.description || '',
                image: result.data?.image?.url || '',
                paragraphs: result.data?.description ? [{ type: 'paragraph', text: result.data.description }] : [],
                url: targetUrl,
            }
        });

    } catch (error) {
        console.error('[Article Extract] Error:', error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

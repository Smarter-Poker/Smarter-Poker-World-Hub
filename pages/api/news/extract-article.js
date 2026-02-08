/**
 * Article Content Extraction API — FULL ARTICLE BODY
 * Uses microlink.io to extract the COMPLETE article content from external URLs
 * Parses HTML into clean readable paragraphs without external dependencies
 */

export default async function handler(req, res) {
    const { url } = req.query;

    if (!url) {
        return res.status(400).json({ error: 'URL parameter required' });
    }

    try {
        // Don't double-decode — use the raw URL as passed
        const targetUrl = url.startsWith('http') ? url : decodeURIComponent(url);

        // Step 1: Try to get full article body HTML via data extraction
        const selectors = 'article,.article-body,.entry-content,.post-content,[class*=article-content],[class*=story-body],main,.content-body';
        const fullUrl = 'https://api.microlink.io/?url=' + encodeURIComponent(targetUrl)
            + '&data.articleBody.selector=' + encodeURIComponent(selectors)
            + '&data.articleBody.type=html'
            + '&data.articleText.selector=' + encodeURIComponent(selectors)
            + '&data.articleText.type=text';

        const response = await fetch(fullUrl);
        const result = await response.json();

        if (result.status !== 'success' || !result.data) {
            return res.status(200).json({
                success: false,
                data: {
                    title: '',
                    description: '',
                    image: '',
                    paragraphs: [],
                    url: targetUrl,
                }
            });
        }

        const data = result.data;
        let paragraphs = [];
        const rawHtml = data.articleBody || '';
        const rawText = data.articleText || '';

        if (rawHtml && typeof rawHtml === 'string' && rawHtml.length > 50) {
            // Strip script/style/nav/footer elements
            let cleaned = rawHtml
                .replace(/<script[\s\S]*?<\/script>/gi, '')
                .replace(/<style[\s\S]*?<\/style>/gi, '')
                .replace(/<nav[\s\S]*?<\/nav>/gi, '')
                .replace(/<footer[\s\S]*?<\/footer>/gi, '')
                .replace(/<aside[\s\S]*?<\/aside>/gi, '')
                .replace(/<figure[\s\S]*?<\/figure>/gi, '');

            // Boilerplate text to filter out
            const boilerplate = ['table of contents', 'related players', 'tags', 'share this', 'follow us', 'newsletter', 'sign up', 'subscribe', 'feature image courtesy', 'related articles'];

            // Extract headings (h2/h3)
            const headingRegex = /<h[23][^>]*>([\s\S]*?)<\/h[23]>/gi;
            let match;
            while ((match = headingRegex.exec(cleaned)) !== null) {
                const text = stripHtml(match[1]).trim();
                if (text.length > 5) {
                    const lower = text.toLowerCase();
                    if (!boilerplate.some(b => lower.startsWith(b))) {
                        paragraphs.push({ type: 'heading', text, pos: match.index });
                    }
                }
            }

            // Extract blockquotes
            const quoteRegex = /<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi;
            while ((match = quoteRegex.exec(cleaned)) !== null) {
                const text = stripHtml(match[1]).trim();
                if (text.length > 10) {
                    paragraphs.push({ type: 'quote', text, pos: match.index });
                }
            }

            // Extract paragraphs
            const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
            while ((match = pRegex.exec(cleaned)) !== null) {
                const text = stripHtml(match[1]).trim();
                if (text.length > 10) {
                    const lower = text.toLowerCase();
                    if (!boilerplate.some(b => lower.startsWith(b))) {
                        paragraphs.push({ type: 'paragraph', text, pos: match.index });
                    }
                }
            }

            // Extract list items 
            const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
            while ((match = liRegex.exec(cleaned)) !== null) {
                const text = stripHtml(match[1]).trim();
                if (text.length > 15) {
                    const lower = text.toLowerCase();
                    if (!boilerplate.some(b => lower.startsWith(b))) {
                        paragraphs.push({ type: 'paragraph', text: '• ' + text, pos: match.index });
                    }
                }
            }

            // Sort by document position
            paragraphs.sort((a, b) => a.pos - b.pos);

            // Remove position markers and deduplicate
            const seen = new Set();
            paragraphs = paragraphs.filter(p => {
                delete p.pos;
                const key = p.text.substring(0, 60);
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
        }

        // Fallback: If HTML extraction found nothing, use raw text
        if (paragraphs.length === 0 && rawText && typeof rawText === 'string') {
            const lines = rawText.split('\n').filter(l => l.trim().length > 15);
            paragraphs = lines.map(l => ({ type: 'paragraph', text: l.trim() }));
        }

        // Final fallback to description
        if (paragraphs.length === 0 && data.description) {
            paragraphs = [{ type: 'paragraph', text: data.description }];
        }

        return res.status(200).json({
            success: true,
            data: {
                title: data.title || '',
                description: data.description || '',
                image: data.image?.url || '',
                author: data.author || '',
                publisher: data.publisher || '',
                date: data.date || '',
                paragraphs,
                logo: data.logo?.url || '',
                url: data.url || targetUrl,
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

// Simple HTML tag stripper
function stripHtml(html) {
    return html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ');
}

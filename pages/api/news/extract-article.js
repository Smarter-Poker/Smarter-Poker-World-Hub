/**
 * Article Content Extraction API — FULL ARTICLE BODY
 * Two-phase approach:
 * 1. Microlink for metadata (title, image, author, description)
 * 2. Direct fetch + regex parse for full article body HTML
 */

export default async function handler(req, res) {
    const { url } = req.query;

    if (!url) {
        return res.status(400).json({ error: 'URL parameter required' });
    }

    try {
        const targetUrl = url.startsWith('http') ? url : decodeURIComponent(url);

        // Phase 1: Get metadata from microlink (simple call, no selectors)
        let metadata = {};
        try {
            const metaRes = await fetch('https://api.microlink.io/?url=' + encodeURIComponent(targetUrl));
            const metaResult = await metaRes.json();
            if (metaResult.status === 'success' && metaResult.data) {
                metadata = {
                    title: metaResult.data.title || '',
                    description: metaResult.data.description || '',
                    image: metaResult.data.image?.url || '',
                    author: metaResult.data.author || '',
                    publisher: metaResult.data.publisher || '',
                    date: metaResult.data.date || '',
                    logo: metaResult.data.logo?.url || '',
                    url: metaResult.data.url || targetUrl,
                };
            }
        } catch (e) {
            console.error('[Article Extract] Microlink metadata failed:', e.message);
        }

        // Phase 2: Fetch page directly and extract article content
        let paragraphs = [];
        try {
            const pageRes = await fetch(targetUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; SmartPokerBot/1.0)',
                    'Accept': 'text/html,application/xhtml+xml',
                    'Accept-Language': 'en-US,en;q=0.9',
                },
                redirect: 'follow',
            });

            if (pageRes.ok) {
                const html = await pageRes.text();
                paragraphs = extractArticleContent(html);
            }
        } catch (e) {
            console.error('[Article Extract] Direct fetch failed:', e.message);
        }

        // Fallback to description if no paragraphs found
        if (paragraphs.length === 0 && metadata.description) {
            paragraphs = [{ type: 'paragraph', text: metadata.description }];
        }

        return res.status(200).json({
            success: true,
            data: {
                ...metadata,
                title: metadata.title || '',
                paragraphs,
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

/**
 * Extract article content from raw HTML using regex-based parsing.
 * Targets common article container elements and extracts clean paragraphs.
 */
function extractArticleContent(html) {
    // Try to find article body container
    const containerPatterns = [
        /<article[^>]*>([\s\S]*?)<\/article>/i,
        /<div[^>]*class="[^"]*article-body[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
        /<div[^>]*class="[^"]*entry-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
        /<div[^>]*class="[^"]*post-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
        /<div[^>]*class="[^"]*story-body[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
        /<div[^>]*class="[^"]*content-body[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
        /<main[^>]*>([\s\S]*?)<\/main>/i,
    ];

    let articleHtml = '';
    for (const pattern of containerPatterns) {
        const match = html.match(pattern);
        if (match && match[1] && match[1].length > 200) {
            articleHtml = match[1];
            break;
        }
    }

    // If no container found, use the full HTML (limited to body)
    if (!articleHtml) {
        const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
        articleHtml = bodyMatch ? bodyMatch[1] : html;
    }

    // Strip unwanted elements
    articleHtml = articleHtml
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<nav[\s\S]*?<\/nav>/gi, '')
        .replace(/<footer[\s\S]*?<\/footer>/gi, '')
        .replace(/<aside[\s\S]*?<\/aside>/gi, '')
        .replace(/<figure[\s\S]*?<\/figure>/gi, '')
        .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
        .replace(/<form[\s\S]*?<\/form>/gi, '');

    const boilerplate = [
        'table of contents', 'related players', 'tags', 'share this',
        'follow us', 'newsletter', 'sign up', 'subscribe',
        'feature image courtesy', 'related articles', 'advertisement',
        'you may also like', 'read more', 'more stories'
    ];

    let paragraphs = [];

    // Extract headings
    const headingRegex = /<h[23][^>]*>([\s\S]*?)<\/h[23]>/gi;
    let match;
    while ((match = headingRegex.exec(articleHtml)) !== null) {
        const text = stripHtml(match[1]).trim();
        if (text.length > 5 && !isBoilerplate(text, boilerplate)) {
            paragraphs.push({ type: 'heading', text, pos: match.index });
        }
    }

    // Extract blockquotes
    const quoteRegex = /<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi;
    while ((match = quoteRegex.exec(articleHtml)) !== null) {
        const text = stripHtml(match[1]).trim();
        if (text.length > 10) {
            paragraphs.push({ type: 'quote', text, pos: match.index });
        }
    }

    // Extract paragraphs
    const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    while ((match = pRegex.exec(articleHtml)) !== null) {
        const text = stripHtml(match[1]).trim();
        if (text.length > 15 && !isBoilerplate(text, boilerplate)) {
            paragraphs.push({ type: 'paragraph', text, pos: match.index });
        }
    }

    // Sort by document position
    paragraphs.sort((a, b) => a.pos - b.pos);

    // Deduplicate
    const seen = new Set();
    paragraphs = paragraphs.filter(p => {
        delete p.pos;
        const key = p.text.substring(0, 60);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    return paragraphs;
}

function isBoilerplate(text, patterns) {
    const lower = text.toLowerCase();
    return patterns.some(b => lower.startsWith(b) || lower === b);
}

function stripHtml(html) {
    return html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#0?39;/g, "'")
        .replace(/&apos;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ');
}

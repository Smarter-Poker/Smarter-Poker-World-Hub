/**
 * Article Content Extraction API
 * Uses microlink.io to extract clean article content from external URLs
 * This replaces the broken proxy approach for JS-rendered news sites
 */

export default async function handler(req, res) {
    const { url } = req.query;

    if (!url) {
        return res.status(400).json({ error: 'URL parameter required' });
    }

    try {
        const targetUrl = decodeURIComponent(url);

        // Use microlink.io to extract article content (uses headless browser)
        const microlinkUrl = `https://api.microlink.io/?url=${encodeURIComponent(targetUrl)}&data.article.selector=article&data.article.attr=html&data.content.selector=article,main,.article-body,.post-content,.entry-content,[class*=article],[class*=content]&data.content.attr=text`;

        const response = await fetch(microlinkUrl, {
            headers: { 'User-Agent': 'SmartPokerBot/1.0' },
        });

        const result = await response.json();

        if (result.status === 'success' && result.data) {
            return res.status(200).json({
                success: true,
                data: {
                    title: result.data.title || '',
                    description: result.data.description || '',
                    image: result.data.image?.url || '',
                    author: result.data.author || '',
                    publisher: result.data.publisher || '',
                    date: result.data.date || '',
                    content: result.data.content || result.data.description || '',
                    logo: result.data.logo?.url || '',
                    url: result.data.url || targetUrl,
                }
            });
        }

        // Fallback: return whatever we got
        return res.status(200).json({
            success: false,
            data: {
                title: result.data?.title || '',
                description: result.data?.description || '',
                image: result.data?.image?.url || '',
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

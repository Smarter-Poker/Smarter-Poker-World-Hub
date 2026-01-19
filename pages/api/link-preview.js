// API endpoint to fetch OpenGraph metadata from URLs for rich link previews
// Returns: { title, description, image, siteName, url }

export default async function handler(req, res) {
    // Allow CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { url } = req.query;

    if (!url) {
        return res.status(400).json({ error: 'URL parameter is required' });
    }

    try {
        // Use realistic browser headers to bypass Cloudflare and similar protections
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1',
                'Upgrade-Insecure-Requests': '1',
            },
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch URL: ${response.status}`);
        }

        const html = await response.text();

        // Check if we got a Cloudflare challenge page
        if (html.includes('Just a moment...') || html.includes('cf_chl_opt')) {
            console.log('Cloudflare detected, using fallback');
            throw new Error('Cloudflare challenge detected');
        }

        // Parse OpenGraph meta tags
        const metadata = parseOpenGraph(html, url);

        return res.status(200).json(metadata);

    } catch (error) {
        console.error('Direct fetch failed:', error.message);

        // Try using a free external OpenGraph API as fallback
        try {
            const externalApiUrl = `https://opengraph.io/api/1.1/site/${encodeURIComponent(url)}?app_id=free&accept_lang=en`;
            const externalResponse = await fetch(externalApiUrl, {
                headers: { 'Accept': 'application/json' }
            });

            if (externalResponse.ok) {
                const data = await externalResponse.json();
                if (data.hybridGraph) {
                    const hg = data.hybridGraph;
                    return res.status(200).json({
                        url: url,
                        title: hg.title || null,
                        description: hg.description || null,
                        image: hg.image || hg.imageSecureUrl || null,
                        siteName: hg.site_name || new URL(url).hostname.replace(/^www\./, ''),
                    });
                }
            }
        } catch (externalError) {
            console.error('External API also failed:', externalError.message);
        }

        // Final fallback: extract metadata from URL
        const fallback = extractFallbackMetadata(url);
        return res.status(200).json(fallback);
    }
}

// Parse OpenGraph and other meta tags from HTML
function parseOpenGraph(html, originalUrl) {
    const metadata = {
        url: originalUrl,
        title: null,
        description: null,
        image: null,
        siteName: null,
    };

    // Extract og:title
    const ogTitleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i) ||
        html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i);
    if (ogTitleMatch) {
        metadata.title = decodeHTMLEntities(ogTitleMatch[1]);
    }

    // Extract og:description
    const ogDescMatch = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i) ||
        html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:description["']/i);
    if (ogDescMatch) {
        metadata.description = decodeHTMLEntities(ogDescMatch[1]);
    }

    // Extract og:image
    const ogImageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
        html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
    if (ogImageMatch) {
        let imageUrl = ogImageMatch[1];
        // Make relative URLs absolute
        if (imageUrl.startsWith('/')) {
            const urlObj = new URL(originalUrl);
            imageUrl = `${urlObj.protocol}//${urlObj.host}${imageUrl}`;
        }
        metadata.image = imageUrl;
    }

    // Extract og:site_name
    const ogSiteMatch = html.match(/<meta[^>]*property=["']og:site_name["'][^>]*content=["']([^"']+)["']/i) ||
        html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:site_name["']/i);
    if (ogSiteMatch) {
        metadata.siteName = decodeHTMLEntities(ogSiteMatch[1]);
    }

    // Fallback to standard meta tags if OG not found
    if (!metadata.title) {
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        if (titleMatch) {
            metadata.title = decodeHTMLEntities(titleMatch[1].trim());
        }
    }

    if (!metadata.description) {
        const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i) ||
            html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i);
        if (descMatch) {
            metadata.description = decodeHTMLEntities(descMatch[1]);
        }
    }

    // Extract twitter:image as fallback for image
    if (!metadata.image) {
        const twitterImageMatch = html.match(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i) ||
            html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']twitter:image["']/i);
        if (twitterImageMatch) {
            let imageUrl = twitterImageMatch[1];
            if (imageUrl.startsWith('/')) {
                const urlObj = new URL(originalUrl);
                imageUrl = `${urlObj.protocol}//${urlObj.host}${imageUrl}`;
            }
            metadata.image = imageUrl;
        }
    }

    // If still no site name, extract from URL
    if (!metadata.siteName) {
        try {
            const urlObj = new URL(originalUrl);
            metadata.siteName = urlObj.hostname.replace(/^www\./, '');
        } catch (e) { }
    }

    return metadata;
}

// Fallback metadata when fetch fails
function extractFallbackMetadata(url) {
    try {
        const urlObj = new URL(url);
        const domain = urlObj.hostname.replace(/^www\./, '');

        // Try to extract title from URL path
        const pathParts = urlObj.pathname.split('/').filter(Boolean);
        const lastPart = pathParts[pathParts.length - 1] || '';
        let title = lastPart
            .replace(/-/g, ' ')
            .replace(/^\d+\s*/, '')
            .trim();

        if (title) {
            title = title.split(' ')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                .join(' ');
        } else {
            title = domain;
        }

        return {
            url,
            title,
            description: null,
            image: null,
            siteName: domain,
        };
    } catch (e) {
        return {
            url,
            title: 'Link',
            description: null,
            image: null,
            siteName: 'Website',
        };
    }
}

// Decode HTML entities
function decodeHTMLEntities(text) {
    if (!text) return text;
    return text
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#x27;/g, "'")
        .replace(/&#x2F;/g, '/')
        .replace(/&nbsp;/g, ' ');
}

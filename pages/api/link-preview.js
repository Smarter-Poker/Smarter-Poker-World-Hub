// API endpoint to fetch OpenGraph metadata from URLs for rich link previews
// Returns: { title, description, image, siteName, url }

/**
 * SSRF protection — block private/internal IPs and cloud metadata endpoints.
 */
function isBlockedUrl(urlStr) {
    try {
        const parsed = new URL(urlStr);
        
        // Only allow http/https
        if (!['http:', 'https:'].includes(parsed.protocol)) return true;
        
        const hostname = parsed.hostname.toLowerCase();
        
        // Block known metadata endpoints
        const blocked = ['169.254.169.254', 'metadata.google.internal', '100.100.100.200',
                         'localhost', '127.0.0.1', '0.0.0.0', '[::1]', '::1'];
        if (blocked.includes(hostname)) return true;
        
        // Block private IPv4 ranges
        const parts = hostname.split('.');
        if (parts.length === 4 && parts.every(p => /^\d+$/.test(p))) {
            const [a, b] = parts.map(Number);
            if (a === 0 || a === 10 || a === 127) return true;
            if (a === 172 && b >= 16 && b <= 31) return true;
            if (a === 192 && b === 168) return true;
            if (a === 169 && b === 254) return true;
        }
        
        // Block decimal/hex/octal IP tricks
        if (/^\d+$/.test(hostname) || /^0x[0-9a-f]+$/i.test(hostname)) return true;
        if (parts.some(p => p.startsWith('0') && p.length > 1 && /^\d+$/.test(p))) return true;
        
        return false;
    } catch {
        return true;
    }
}

export default async function handler(req, res) {
    // Allow CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    // Cache link preview responses for 1 hour (browser) / 24 hours (CDN)
    // This prevents N+1 API calls when the same URLs appear across page loads
    res.setHeader('Cache-Control', 'public, s-maxage=86400, max-age=3600, stale-while-revalidate=86400');

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { url } = req.query;

    if (!url) {
        return res.status(400).json({ error: 'URL parameter is required' });
    }

    // SSRF protection
    if (isBlockedUrl(url)) {
        return res.status(403).json({ error: 'This URL is not allowed' });
    }

    // Check if this is a social platform that needs Microlink for preview
    const isSocialPlatform = checkSocialPlatform(url);

    // For social platforms (Facebook, Instagram), skip direct fetch and use Microlink
    // because these platforms block server-side scraping but Microlink can access them
    if (isSocialPlatform) {
        try {
            const microlinkUrl = `https://api.microlink.io?url=${encodeURIComponent(url)}`;
            const microlinkRes = await fetch(microlinkUrl);
            const microlinkData = await microlinkRes.json();

            if (microlinkData.status === 'success' && microlinkData.data) {
                const data = microlinkData.data;
                return res.status(200).json({
                    url,
                    title: data.title || `${isSocialPlatform.platform} Content`,
                    description: data.description || `Click to view on ${isSocialPlatform.platform}`,
                    image: data.image?.url || isSocialPlatform.fallbackImage,
                    siteName: data.publisher || isSocialPlatform.platform,
                    platform: isSocialPlatform.platformId,
                    contentType: isSocialPlatform.contentType,
                });
            }
        } catch (e) {
            console.log('[link-preview] Microlink failed for social URL, using fallback:', e.message);
        }

        // Fallback to generic preview if Microlink fails
        return res.status(200).json({
            url,
            title: `${isSocialPlatform.platform} ${isSocialPlatform.contentType}`,
            description: `Click to view on ${isSocialPlatform.platform}`,
            image: isSocialPlatform.fallbackImage,
            siteName: isSocialPlatform.platform,
            platform: isSocialPlatform.platformId,
            contentType: isSocialPlatform.contentType.toLowerCase(),
        });
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

        // Try using Microlink.io API as fallback - bypasses Cloudflare
        try {
            const microlinkUrl = `https://api.microlink.io?url=${encodeURIComponent(url)}`;
            const externalResponse = await fetch(microlinkUrl, {
                headers: { 'Accept': 'application/json' }
            });

            if (externalResponse.ok) {
                const data = await externalResponse.json();
                if (data.status === 'success' && data.data) {
                    const d = data.data;
                    return res.status(200).json({
                        url: url,
                        title: d.title || null,
                        description: d.description || null,
                        image: d.image?.url || null,
                        siteName: d.publisher || new URL(url).hostname.replace(/^www\./, ''),
                    });
                }
            }
        } catch (externalError) {
            console.error('Microlink API failed:', externalError.message);
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

// Check if URL is a social platform that needs Microlink for preview
// Returns platform info object or null if not a social platform
function checkSocialPlatform(url) {
    try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname.toLowerCase();

        // Facebook (including fb.watch, fb.gg, etc.)
        if (hostname.includes('facebook.com') || hostname.includes('fb.watch') || hostname.includes('fb.com') || hostname.includes('fb.gg')) {
            let contentType = 'Post';
            if (url.includes('/videos/') || url.includes('/watch') || url.includes('fb.watch') || url.includes('/share/v/')) {
                contentType = 'Video';
            } else if (url.includes('/reel/') || url.includes('/reels/') || url.includes('/share/r/')) {
                contentType = 'Reel';
            } else if (url.includes('/photo') || url.includes('/photos/') || url.includes('/share/p/')) {
                contentType = 'Photo';
            }

            return {
                platform: 'Facebook',
                platformId: 'facebook',
                contentType,
                fallbackImage: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/05/Facebook_Logo_%282019%29.png/1024px-Facebook_Logo_%282019%29.png',
            };
        }

        // Instagram
        if (hostname.includes('instagram.com')) {
            let contentType = 'Post';
            if (url.includes('/reel/') || url.includes('/reels/')) {
                contentType = 'Reel';
            } else if (url.includes('/stories/')) {
                contentType = 'Story';
            }

            return {
                platform: 'Instagram',
                platformId: 'instagram',
                contentType,
                fallbackImage: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e7/Instagram_logo_2016.svg/1024px-Instagram_logo_2016.svg.png',
            };
        }

        return null;
    } catch {
        return null;
    }
}



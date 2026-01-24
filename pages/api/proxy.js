/**
 * Proxy API - Fetches external pages and serves them through smarter.poker
 * 
 * This allows users to browse external sites without leaving the app
 * by rewriting all URLs to route through our proxy.
 */

export default async function handler(req, res) {
    const { url } = req.query;

    if (!url) {
        return res.status(400).json({ error: 'URL required' });
    }

    try {
        // Decode the URL
        const targetUrl = decodeURIComponent(url);
        const targetOrigin = new URL(targetUrl).origin;

        // Fetch the external page with browser-like headers
        const response = await fetch(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'identity', // Don't request compressed to simplify processing
                'Cache-Control': 'no-cache',
            },
        });

        // Get content type
        const contentType = response.headers.get('content-type') || 'text/html';

        // For non-HTML content (CSS, JS, images), pass through directly
        if (!contentType.includes('text/html')) {
            const buffer = await response.arrayBuffer();
            res.setHeader('Content-Type', contentType);
            res.setHeader('Cache-Control', 'public, max-age=3600');
            return res.send(Buffer.from(buffer));
        }

        // Get HTML content
        let html = await response.text();

        // Rewrite all URLs to go through our proxy
        html = rewriteHtml(html, targetUrl, targetOrigin);

        // Set headers to allow embedding
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('X-Frame-Options', 'SAMEORIGIN'); // Allow our own iframes
        res.setHeader('Content-Security-Policy', "frame-ancestors 'self'");

        return res.send(html);

    } catch (error) {
        console.error('Proxy error:', error);
        return res.status(500).json({ error: error.message });
    }
}

/**
 * Rewrites all URLs in HTML to route through our proxy
 */
function rewriteHtml(html, pageUrl, originUrl) {
    const proxyBase = '/api/proxy?url=';

    // Helper to convert relative URLs to absolute
    const toAbsolute = (url) => {
        if (!url) return url;
        if (url.startsWith('data:') || url.startsWith('javascript:') || url.startsWith('#') || url.startsWith('mailto:')) {
            return url;
        }
        if (url.startsWith('//')) {
            return 'https:' + url;
        }
        if (url.startsWith('/')) {
            return originUrl + url;
        }
        if (!url.startsWith('http')) {
            // Relative URL - resolve against page URL
            const base = pageUrl.substring(0, pageUrl.lastIndexOf('/') + 1);
            return base + url;
        }
        return url;
    };

    // Helper to create proxied URL
    const toProxied = (url) => {
        const absolute = toAbsolute(url);
        if (!absolute || absolute.startsWith('data:') || absolute.startsWith('javascript:') || absolute.startsWith('#') || absolute.startsWith('mailto:')) {
            return url;
        }
        return proxyBase + encodeURIComponent(absolute);
    };

    // Rewrite href attributes (links)
    html = html.replace(/href\s*=\s*["']([^"']+)["']/gi, (match, url) => {
        return `href="${toProxied(url)}"`;
    });

    // Rewrite src attributes (images, scripts, iframes)
    html = html.replace(/src\s*=\s*["']([^"']+)["']/gi, (match, url) => {
        return `src="${toProxied(url)}"`;
    });

    // Rewrite srcset attributes (responsive images)
    html = html.replace(/srcset\s*=\s*["']([^"']+)["']/gi, (match, srcset) => {
        const rewritten = srcset.split(',').map(part => {
            const [url, descriptor] = part.trim().split(/\s+/);
            return toProxied(url) + (descriptor ? ' ' + descriptor : '');
        }).join(', ');
        return `srcset="${rewritten}"`;
    });

    // Rewrite CSS url() references
    html = html.replace(/url\s*\(\s*["']?([^"')]+)["']?\s*\)/gi, (match, url) => {
        if (url.startsWith('data:')) return match;
        return `url(${toProxied(url)})`;
    });

    // Add base tag to handle any remaining relative URLs
    const baseTag = `<base href="${proxyBase}${encodeURIComponent(pageUrl)}">`;
    html = html.replace(/<head([^>]*)>/i, `<head$1>${baseTag}`);

    // Inject script to handle dynamic navigation
    const navScript = `
    <script>
    // Intercept link clicks to stay in proxy
    document.addEventListener('click', function(e) {
        const link = e.target.closest('a');
        if (link && link.href && !link.href.startsWith('javascript:')) {
            e.preventDefault();
            // Navigate within the iframe
            window.location.href = link.href;
        }
    });
    
    // Intercept form submissions
    document.addEventListener('submit', function(e) {
        const form = e.target;
        if (form.action) {
            // Let the proxy handle the form action
            // Already rewritten by URL rewriting above
        }
    });
    </script>
    `;
    html = html.replace(/<\/body>/i, navScript + '</body>');

    return html;
}

// Increase body size limit for proxied content
export const config = {
    api: {
        bodyParser: false,
        responseLimit: '10mb',
    },
};

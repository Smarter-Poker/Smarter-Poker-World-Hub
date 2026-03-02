/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║  🚨 PROTECTED FILE - DO NOT MODIFY WITHOUT READING SKILL FILE FIRST 🚨   ║
 * ╠═══════════════════════════════════════════════════════════════════════════╣
 * ║                                                                           ║
 * ║  BEFORE MAKING ANY CHANGES TO THIS FILE:                                 ║
 * ║  1. READ: .agent/skills/in-app-article-reader/SKILL.md                   ║
 * ║  2. RUN TEST FIRST: node scripts/test-article-reader.js                  ║
 * ║  3. UNDERSTAND why each function exists                                  ║
 * ║  4. RUN TEST AFTER changes to verify nothing broke                       ║
 * ║                                                                           ║
 * ║  IF YOU BREAK THIS, YOU WILL SPEND HOURS REBUILDING IT.                  ║
 * ║  IT HAS ALREADY BEEN REBUILT MULTIPLE TIMES.                             ║
 * ║                                                                           ║
 * ╠═══════════════════════════════════════════════════════════════════════════╣
 * ║  HARDENED PROXY API - In-App Article Reader                              ║
 * ╠═══════════════════════════════════════════════════════════════════════════╣
 * ║                                                                           ║
 * ║  PURPOSE: Fetch external pages and serve them through smarter.poker,     ║
 * ║  allowing users to browse external content without leaving the app.      ║
 * ║                                                                           ║
 * ║  ARCHITECTURE:                                                            ║
 * ║  1. User clicks ArticleCard → ArticleReaderModal opens                   ║
 * ║  2. Modal loads iframe with src="/api/proxy?url=<encoded_url>"           ║
 * ║  3. This API fetches the external page, rewrites all URLs, serves content║
 * ║  4. All navigation stays within smarter.poker                            ║
 * ║                                                                           ║
 * ║  HARDENING FEATURES:                                                      ║
 * ║  - Retry logic with exponential backoff (3 attempts)                     ║
 * ║  - Timeout handling (10 second limit)                                    ║
 * ║  - Comprehensive error responses                                          ║
 * ║  - URL validation and sanitization                                       ║
 * ║  - Content-type detection                                                 ║
 * ║  - Graceful degradation for blocked sites                                ║
 * ║                                                                           ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */

// Configuration
const CONFIG = {
    TIMEOUT_MS: 10000,           // 10 second timeout
    MAX_RETRIES: 3,              // Retry up to 3 times
    RETRY_DELAY_MS: 1000,        // Initial retry delay (doubles each attempt)
    MAX_BODY_SIZE: 10 * 1024 * 1024, // 10MB max
    ALLOWED_PROTOCOLS: ['http:', 'https:'],
    BLOCKED_HOSTS: ['localhost', '127.0.0.1', '0.0.0.0', '[::1]', '::1'], // Prevent SSRF
    // Additional private/reserved IP ranges checked in isPrivateIP()
};

/**
 * Check if a hostname resolves to a private/reserved IP range (SSRF prevention).
 * Blocks: loopback, link-local, private ranges, cloud metadata endpoints.
 */
function isPrivateOrReservedHost(hostname) {
    // Block known metadata endpoints
    const metadataHosts = [
        '169.254.169.254',    // AWS/GCP/Azure metadata
        'metadata.google.internal',
        'metadata.google',
        '100.100.100.200',    // Alibaba Cloud metadata
    ];
    if (metadataHosts.includes(hostname)) return true;

    // Block IPv6 loopback variations
    if (hostname === '::1' || hostname === '[::1]' || hostname.startsWith('fe80:')) return true;

    // Parse as IPv4 and check private ranges
    const parts = hostname.split('.');
    if (parts.length === 4 && parts.every(p => /^\d+$/.test(p))) {
        const octets = parts.map(Number);
        if (octets.some(o => o < 0 || o > 255)) return false; // Invalid IP, let URL parser handle
        const [a, b] = octets;
        if (a === 0) return true;          // 0.0.0.0/8
        if (a === 10) return true;         // 10.0.0.0/8
        if (a === 127) return true;        // 127.0.0.0/8
        if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
        if (a === 192 && b === 168) return true; // 192.168.0.0/16
        if (a === 169 && b === 254) return true; // 169.254.0.0/16 (link-local)
    }

    // Block decimal IP (e.g. 2130706433 = 127.0.0.1)
    if (/^\d+$/.test(hostname)) {
        const num = parseInt(hostname);
        if (num >= 0 && num <= 0xFFFFFFFF) {
            const a = (num >>> 24) & 0xFF;
            const b = (num >>> 16) & 0xFF;
            if (a === 0 || a === 10 || a === 127) return true;
            if (a === 172 && b >= 16 && b <= 31) return true;
            if (a === 192 && b === 168) return true;
            if (a === 169 && b === 254) return true;
        }
    }

    // Block octal IPs (e.g. 0177.0.0.1 = 127.0.0.1)
    if (hostname.split('.').some(p => p.startsWith('0') && p.length > 1 && /^\d+$/.test(p))) {
        return true; // Reject any octal-looking IP entirely
    }

    // Block hex IPs (e.g. 0x7f000001)
    if (/^0x[0-9a-fA-F]+$/.test(hostname)) return true;

    return false;
}

// User agent rotation for better success rate
const USER_AGENTS = [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
];

// Simple in-memory rate limiter for proxy
const proxyRateMap = new Map();
const PROXY_RATE_LIMIT = 30; // requests per minute per IP
const PROXY_RATE_WINDOW = 60000;

function checkProxyRate(ip) {
    const now = Date.now();
    const entry = proxyRateMap.get(ip);
    if (!entry || now - entry.start > PROXY_RATE_WINDOW) {
        proxyRateMap.set(ip, { start: now, count: 1 });
        return true;
    }
    entry.count++;
    return entry.count <= PROXY_RATE_LIMIT;
}

// Cleanup every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [k, v] of proxyRateMap) {
        if (now - v.start > PROXY_RATE_WINDOW) proxyRateMap.delete(k);
    }
}, 300000);

/**
 * Main handler with comprehensive error handling
 */
export default async function handler(req, res) {
    const { url } = req.query;

    // Rate limit by IP
    const fwd = req.headers['x-forwarded-for'];
    const clientIp = fwd ? fwd.split(',')[0].trim() : req.socket?.remoteAddress || 'unknown';
    if (!checkProxyRate(clientIp)) {
        return res.status(429).json({ error: 'RATE_LIMITED', message: 'Too many proxy requests. Please slow down.' });
    }

    // Referer check — only allow requests originating from smarter.poker
    const referer = req.headers.referer || req.headers.referrer || '';
    const origin = req.headers.origin || '';
    const isInternalRequest = referer.includes('smarter.poker') || origin.includes('smarter.poker')
        || referer.includes('localhost') || origin.includes('localhost')
        || !referer; // Allow direct browser navigation (iframe src)

    if (!isInternalRequest) {
        return res.status(403).json({ error: 'FORBIDDEN', message: 'Proxy only available from smarter.poker' });
    }

    // ═══════════════════════════════════════════════════════════════════
    // VALIDATION
    // ═══════════════════════════════════════════════════════════════════

    if (!url) {
        return res.status(400).json({
            error: 'URL_REQUIRED',
            message: 'URL parameter is required',
            help: 'Usage: /api/proxy?url=<encoded_url>'
        });
    }

    let targetUrl;
    try {
        targetUrl = decodeURIComponent(url);
        const parsed = new URL(targetUrl);

        // Validate protocol
        if (!CONFIG.ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
            return res.status(400).json({
                error: 'INVALID_PROTOCOL',
                message: `Protocol ${parsed.protocol} not allowed`,
                allowed: CONFIG.ALLOWED_PROTOCOLS
            });
        }

        // Block internal addresses (SSRF prevention)
        if (CONFIG.BLOCKED_HOSTS.some(h => parsed.hostname === h) || isPrivateOrReservedHost(parsed.hostname)) {
            return res.status(403).json({
                error: 'BLOCKED_HOST',
                message: 'This host is not allowed'
            });
        }
    } catch (e) {
        return res.status(400).json({
            error: 'INVALID_URL',
            message: 'Could not parse URL',
            details: e.message
        });
    }

    // ═══════════════════════════════════════════════════════════════════
    // FETCH WITH RETRY
    // ═══════════════════════════════════════════════════════════════════

    const targetOrigin = new URL(targetUrl).origin;
    let response;
    let lastError;

    for (let attempt = 1; attempt <= CONFIG.MAX_RETRIES; attempt++) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), CONFIG.TIMEOUT_MS);

            response = await fetch(targetUrl, {
                signal: controller.signal,
                headers: {
                    'User-Agent': USER_AGENTS[attempt % USER_AGENTS.length],
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Accept-Encoding': 'identity',
                    'Cache-Control': 'no-cache',
                    'Referer': targetOrigin,
                },
            });

            clearTimeout(timeout);

            if (response.ok) break;

            // Non-retryable status codes
            if ([403, 404, 451].includes(response.status)) {
                return res.status(response.status).json({
                    error: 'UPSTREAM_ERROR',
                    message: `External site returned ${response.status}`,
                    status: response.status
                });
            }

            lastError = new Error(`HTTP ${response.status}`);

        } catch (error) {
            lastError = error;

            // Don't retry on abort (timeout)
            if (error.name === 'AbortError') {
                return res.status(504).json({
                    error: 'TIMEOUT',
                    message: `Request timed out after ${CONFIG.TIMEOUT_MS}ms`,
                    url: targetUrl
                });
            }
        }

        // Wait before retry (exponential backoff)
        if (attempt < CONFIG.MAX_RETRIES) {
            await new Promise(r => setTimeout(r, CONFIG.RETRY_DELAY_MS * Math.pow(2, attempt - 1)));
        }
    }

    if (!response?.ok) {
        return res.status(502).json({
            error: 'FETCH_FAILED',
            message: 'Failed to fetch external content after retries',
            details: lastError?.message,
            attempts: CONFIG.MAX_RETRIES
        });
    }

    // ═══════════════════════════════════════════════════════════════════
    // PROCESS RESPONSE
    // ═══════════════════════════════════════════════════════════════════

    try {
        const contentType = response.headers.get('content-type') || 'text/html';

        // For non-HTML content, pass through directly
        if (!contentType.includes('text/html')) {
            const buffer = await response.arrayBuffer();

            // Size check
            if (buffer.byteLength > CONFIG.MAX_BODY_SIZE) {
                return res.status(413).json({
                    error: 'CONTENT_TOO_LARGE',
                    message: `Content exceeds ${CONFIG.MAX_BODY_SIZE / 1024 / 1024}MB limit`
                });
            }

            res.setHeader('Content-Type', contentType);
            res.setHeader('Cache-Control', 'public, max-age=3600');
            res.setHeader('X-Proxy-Source', targetOrigin);
            return res.send(Buffer.from(buffer));
        }

        // Get HTML content
        let html = await response.text();

        // Size check
        if (html.length > CONFIG.MAX_BODY_SIZE) {
            return res.status(413).json({
                error: 'CONTENT_TOO_LARGE',
                message: `HTML exceeds ${CONFIG.MAX_BODY_SIZE / 1024 / 1024}MB limit`
            });
        }

        // Rewrite all URLs
        html = rewriteHtml(html, targetUrl, targetOrigin);

        // Set headers
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('X-Frame-Options', 'SAMEORIGIN');
        res.setHeader('Content-Security-Policy', "frame-ancestors 'self'");
        res.setHeader('X-Proxy-Source', targetOrigin);
        res.setHeader('X-Proxy-Success', 'true');

        return res.send(html);

    } catch (error) {
        console.error('[Proxy] Processing error:', error);
        return res.status(500).json({
            error: 'PROCESSING_ERROR',
            message: 'Failed to process proxied content',
            details: error.message
        });
    }
}

/**
 * Rewrites HTML so users stay within smarter.poker when navigating.
 * 
 * KEY STRATEGY:
 * - Navigation links (<a href>) → PROXIED (keeps user in-app)
 * - Form actions → PROXIED
 * - Resources (CSS, JS, images, fonts) → ABSOLUTE on original domain (loads directly)
 * 
 * This ensures the page renders with full styling, ads, and images
 * while keeping all link navigation within smarter.poker.
 */
function rewriteHtml(html, pageUrl, originUrl) {
    const proxyBase = '/api/proxy?url=';

    // Helper to convert relative URLs to absolute on the ORIGINAL domain
    const toAbsolute = (url) => {
        if (!url) return url;
        if (url.startsWith('data:') || url.startsWith('javascript:') || url.startsWith('#') || url.startsWith('mailto:') || url.startsWith('tel:')) {
            return url;
        }
        if (url.startsWith('//')) {
            return 'https:' + url;
        }
        if (url.startsWith('/')) {
            return originUrl + url;
        }
        if (!url.startsWith('http')) {
            const base = pageUrl.substring(0, pageUrl.lastIndexOf('/') + 1);
            return base + url;
        }
        return url;
    };

    // Helper to create proxied URL (only for navigation)
    const toProxied = (url) => {
        const absolute = toAbsolute(url);
        if (!absolute || absolute.startsWith('data:') || absolute.startsWith('javascript:') || absolute.startsWith('#') || absolute.startsWith('mailto:') || absolute.startsWith('tel:')) {
            return url;
        }
        return proxyBase + encodeURIComponent(absolute);
    };

    // ═══════════════════════════════════════════════════════════════════
    // STEP 1: Inject <base> tag FIRST so remaining relative URLs resolve
    //         against the ORIGINAL domain (for CSS, JS, images, fonts)
    // ═══════════════════════════════════════════════════════════════════

    // Remove any existing base tags first
    html = html.replace(/<base[^>]*>/gi, '');

    const baseTag = `<base href="${originUrl}/">`;
    html = html.replace(/<head([^>]*)>/i, `<head$1>${baseTag}`);

    // ═══════════════════════════════════════════════════════════════════
    // STEP 2: Only proxy <a> navigation links (NOT resource links)
    //         This keeps users within smarter.poker when clicking links
    // ═══════════════════════════════════════════════════════════════════

    // Proxy <a href="..."> tags only (navigation links)
    html = html.replace(/<a(\s[^>]*?)href\s*=\s*["']([^"']+)["']([^>]*?)>/gi, (match, before, url, after) => {
        const absolute = toAbsolute(url);
        if (!absolute || absolute.startsWith('data:') || absolute.startsWith('javascript:') || absolute.startsWith('#') || absolute.startsWith('mailto:') || absolute.startsWith('tel:')) {
            return match;
        }
        return `<a${before}href="${toProxied(url)}"${after}>`;
    });

    // Proxy form actions
    html = html.replace(/<form(\s[^>]*?)action\s*=\s*["']([^"']+)["']([^>]*?)>/gi, (match, before, url, after) => {
        return `<form${before}action="${toProxied(url)}"${after}>`;
    });

    // ═══════════════════════════════════════════════════════════════════
    // STEP 3: DO NOT proxy resource URLs — let them load directly
    //         The <base> tag ensures relative URLs resolve correctly.
    //         CSS, JS, images, fonts all load from their original domains.
    // ═══════════════════════════════════════════════════════════════════
    // (No rewriting of src, srcset, link href, or css url() — base tag handles it)

    // ═══════════════════════════════════════════════════════════════════
    // STEP 4: Inject navigation interception script for dynamic links
    // ═══════════════════════════════════════════════════════════════════

    const navScript = `
    <script>
    (function() {
        // Intercept link clicks to keep navigation within smarter.poker
        document.addEventListener('click', function(e) {
            var link = e.target.closest('a');
            if (link && link.href) {
                // Already proxied
                if (link.href.includes('/api/proxy')) return;
                // Skip anchors, mailto, tel, javascript
                if (link.href.startsWith('#') || link.href.startsWith('mailto:') || link.href.startsWith('tel:') || link.href.startsWith('javascript:')) return;
                // Proxy all http links
                if (link.href.startsWith('http')) {
                    e.preventDefault();
                    e.stopPropagation();
                    window.location.href = '/api/proxy?url=' + encodeURIComponent(link.href);
                }
            }
        }, true);
        
        console.log('[Smarter.Poker Proxy] Page loaded successfully:', document.title);
    })();
    </script>
    `;
    html = html.replace(/<\/body>/i, navScript + '</body>');

    // Small proxy badge (non-intrusive)
    const proxyIndicator = `
    <style>
    .sp-proxy-badge { 
        position: fixed; bottom: 8px; right: 8px; z-index: 99999;
        background: rgba(0,0,0,0.7); color: #fff; padding: 4px 8px;
        border-radius: 4px; font-size: 10px; font-family: sans-serif;
        opacity: 0.5; pointer-events: none;
    }
    </style>
    <div class="sp-proxy-badge">via smarter.poker</div>
    `;
    html = html.replace(/<\/body>/i, proxyIndicator + '</body>');

    return html;
}

// Increase body size limit
export const config = {
    api: {
        bodyParser: false,
        responseLimit: '10mb',
    },
};

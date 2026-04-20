/**
 * Link Preview API — Server-side OG metadata fetcher
 * ═══════════════════════════════════════════════════════════════════════════
 * Fetches Open Graph meta tags from a URL and returns title, description,
 * image, and favicon. Used by the messenger to show rich link preview cards.
 * 
 * Rate limited to prevent abuse. Results cached in-memory for 1 hour.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';

// In-memory cache (survives across requests in the same serverless instance)
const previewCache = new Map();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

// Max concurrent fetches to prevent abuse
const MAX_CONTENT_LENGTH = 500 * 1024; // 500KB max HTML to parse

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    if (!applyRateLimit(req, res, LIMITS.read)) return;

    const { url } = req.body;

    if (!url || typeof url !== 'string') {
        return res.status(400).json({ success: false, error: 'URL is required' });
    }

    // Validate URL format
    let parsedUrl;
    try {
        parsedUrl = new URL(url);
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
            throw new Error('Invalid protocol');
        }
    } catch {
        return res.status(400).json({ success: false, error: 'Invalid URL' });
    }

    // Block internal/private IPs (SSRF protection)
    const hostname = parsedUrl.hostname.toLowerCase();
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168.') || hostname.startsWith('10.') || hostname.startsWith('172.')) {
        return res.status(400).json({ success: false, error: 'Private URLs not allowed' });
    }

    // Check cache
    const cached = previewCache.get(url);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return res.json({ success: true, preview: cached.data });
    }

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000); // 5s timeout

        const response = await fetch(url, {
            headers: {
                'User-Agent': 'SmarterPoker-LinkPreview/1.0 (bot; +https://smarter.poker)',
                'Accept': 'text/html',
            },
            signal: controller.signal,
            redirect: 'follow',
        });

        clearTimeout(timeout);

        if (!response.ok) {
            return res.json({ success: false, error: `HTTP ${response.status}` });
        }

        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('text/html')) {
            return res.json({ success: false, error: 'Not an HTML page' });
        }

        // Read limited amount of HTML
        const html = await response.text();
        const limitedHtml = html.slice(0, MAX_CONTENT_LENGTH);

        // Parse OG meta tags
        const preview = parseOGMeta(limitedHtml, parsedUrl);

        // Cache result
        previewCache.set(url, { data: preview, timestamp: Date.now() });

        // Evict old entries (keep cache bounded)
        if (previewCache.size > 500) {
            const oldestKey = previewCache.keys().next().value;
            previewCache.delete(oldestKey);
        }

        return res.json({ success: true, preview });
    } catch (e) {
        try { reportApiError(e, req); } catch (_sentryErr) {}
        if (e.name === 'AbortError') {
            return res.json({ success: false, error: 'Request timeout' });
        }
        return res.json({ success: false, error: 'Failed to fetch preview' });
    }
}

/**
 * Parse Open Graph meta tags from HTML string
 */
function parseOGMeta(html, parsedUrl) {
    const result = {
        title: '',
        description: '',
        image: '',
        siteName: '',
        favicon: '',
        url: parsedUrl.href,
        domain: parsedUrl.hostname.replace('www.', ''),
    };

    // Helper to extract meta content
    const getMeta = (property) => {
        // Match og:property, twitter:property, or name="property"
        const patterns = [
            new RegExp(`<meta[^>]+property=["']og:${property}["'][^>]+content=["']([^"']+)["']`, 'i'),
            new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:${property}["']`, 'i'),
            new RegExp(`<meta[^>]+name=["']twitter:${property}["'][^>]+content=["']([^"']+)["']`, 'i'),
            new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:${property}["']`, 'i'),
        ];
        for (const pattern of patterns) {
            const match = html.match(pattern);
            if (match?.[1]) return match[1].trim();
        }
        return '';
    };

    // OG tags
    result.title = getMeta('title') || '';
    result.description = getMeta('description') || '';
    result.image = getMeta('image') || '';
    result.siteName = getMeta('site_name') || '';

    // Fallback: <title> tag
    if (!result.title) {
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        if (titleMatch?.[1]) result.title = titleMatch[1].trim();
    }

    // Fallback: meta description
    if (!result.description) {
        const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
            || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
        if (descMatch?.[1]) result.description = descMatch[1].trim();
    }

    // Truncate description to 200 chars
    if (result.description.length > 200) {
        result.description = result.description.slice(0, 200) + '...';
    }

    // Resolve relative image URLs
    if (result.image && !result.image.startsWith('http')) {
        try {
            result.image = new URL(result.image, parsedUrl.origin).href;
        } catch { result.image = ''; }
    }

    // Favicon
    const faviconMatch = html.match(/<link[^>]+rel=["'](?:shortcut )?icon["'][^>]+href=["']([^"']+)["']/i)
        || html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["'](?:shortcut )?icon["']/i);
    if (faviconMatch?.[1]) {
        result.favicon = faviconMatch[1].startsWith('http')
            ? faviconMatch[1]
            : `${parsedUrl.origin}${faviconMatch[1].startsWith('/') ? '' : '/'}${faviconMatch[1]}`;
    } else {
        result.favicon = `${parsedUrl.origin}/favicon.ico`;
    }

    return result;
}

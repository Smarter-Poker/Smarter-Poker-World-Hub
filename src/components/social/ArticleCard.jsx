/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║  🚨 PROTECTED FILE - DO NOT MODIFY WITHOUT READING SKILL FILE 🚨          ║
 * ╠═══════════════════════════════════════════════════════════════════════════╣
 * ║  SKILL: .agent/skills/in-app-article-reader/SKILL.md                     ║
 * ║  TEST:  node scripts/test-article-reader.js                              ║
 * ║  WORKFLOW: /social-feed-protection                                       ║
 * ╠═══════════════════════════════════════════════════════════════════════════╣
 * ║  ArticleCard - Centralized component for article/link preview rendering ║
 * ║                                                                           ║
 * ║  Provides consistent, robust rendering of article links with:            ║
 * ║  - Pre-fetched metadata support (from DB columns)                        ║
 * ║  - Fallback to API-fetched metadata                                      ║
 * ║  - Graceful error handling                                               ║
 * ║  - Click-to-open functionality (onClick prop)                            ║
 * ║                                                                           ║
 * ║  CRITICAL: The onClick prop must be passed to enable in-app reading.    ║
 * ║  If removed, articles will open in new tabs instead of staying in app.  ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */

import { useState, useEffect } from 'react';

// Light theme colors (matches social-media.js)
const C = {
    bg: '#F0F2F5',
    card: '#FFFFFF',
    text: '#050505',
    textSec: '#65676B',
    border: '#DADDE1',
};

/**
 * Validates if a URL is likely a valid image
 */
export function isValidImageUrl(url) {
    if (!url) return false;
    try {
        const u = new URL(url);
        // Check for common image extensions or known image hosts
        return /\.(jpg|jpeg|png|gif|webp|svg)/i.test(u.pathname)
            || url.includes('unsplash.com')
            || url.includes('images.')
            || url.includes('/img/')
            || url.includes('/image/')
            || url.includes('pnimg.net');
    } catch {
        return false;
    }
}

/**
 * Extracts a URL from text content
 */
export function extractUrlFromContent(content) {
    if (!content) return null;
    const match = content.match(/https?:\/\/[^\s"'<>]+/);
    return match ? match[0] : null;
}

/**
 * Determines the proper media type for a post
 */
export function getPostMediaType(post) {
    if (post.link_url) return 'link';
    if (post.content_type === 'link') return 'link';
    if (post.content_type === 'article') return 'article';
    if (post.content_type === 'video') return 'video';
    if (post.media_urls?.length > 0) {
        const firstUrl = post.media_urls[0];
        if (firstUrl.includes('youtube.com') || firstUrl.includes('youtu.be')) return 'video';
        if (isValidImageUrl(firstUrl)) return 'image';
    }
    return 'text';
}

/**
 * ArticleCard Component
 * 
 * @param {Object} props
 * @param {string} props.url - The article URL (required for click navigation)
 * @param {string} props.title - Pre-fetched title (optional)
 * @param {string} props.description - Pre-fetched description (optional)
 * @param {string} props.image - Image URL (optional)
 * @param {string} props.siteName - Site name like "PokerNews" (optional)
 * @param {string} props.fallbackContent - Post content for extracting title (optional)
 * @param {function} props.onClick - Custom click handler (optional)
 */
export default function ArticleCard({
    url,
    title,
    description,
    image,
    siteName,
    fallbackContent,
    onClick
}) {
    const [metadata, setMetadata] = useState({
        title: title || null,
        description: description || null,
        image: image || null,
        siteName: siteName || null,
    });
    const [loading, setLoading] = useState(!title && !image);
    const [imageError, setImageError] = useState(false);

    // Fetch metadata if not provided
    useEffect(() => {
        if (!url || (title && image)) {
            setLoading(false);
            return;
        }

        const fetchMetadata = async () => {
            try {
                const response = await fetch(`/api/link-preview?url=${encodeURIComponent(url)}`);
                if (response.ok) {
                    const data = await response.json();
                    setMetadata(prev => ({
                        title: prev.title || data.title,
                        description: prev.description || data.description,
                        image: prev.image || data.image,
                        siteName: prev.siteName || data.siteName,
                    }));
                }
            } catch (error) {
                console.error('ArticleCard: Failed to fetch metadata', error);
            }
            setLoading(false);
        };

        fetchMetadata();
    }, [url, title, image]);

    // Check if URL is from a social platform that blocks proxying
    const isSocialPlatformUrl = (testUrl) => {
        if (!testUrl) return false;
        try {
            const hostname = new URL(testUrl).hostname.toLowerCase();
            // These platforms block server-side fetching and need to open directly
            return hostname.includes('facebook.com')
                || hostname.includes('fb.watch')
                || hostname.includes('fb.com')
                || hostname.includes('instagram.com')
                || hostname.includes('tiktok.com')
                || hostname.includes('twitter.com')
                || hostname.includes('x.com')
                || hostname.includes('threads.net');
        } catch {
            return false;
        }
    };

    // Handle click to open article
    const handleClick = (e) => {
        e.preventDefault();
        e.stopPropagation();

        // Social platform links must open directly - proxying doesn't work
        if (isSocialPlatformUrl(url)) {
            window.open(url, '_blank', 'noopener,noreferrer');
            return;
        }

        if (onClick) {
            onClick(url);
        } else if (url) {
            window.open(url, '_blank', 'noopener,noreferrer');
        }
    };

    // Extract display title from content if not available
    const displayTitle = metadata.title
        || (fallbackContent?.split('\n')[0]?.replace(/^[📰🃏♠️♣️♥️♦️🔗\s]+/, '').substring(0, 60))
        || 'View Article';

    // Get site name from URL if not provided
    const displaySiteName = metadata.siteName || (() => {
        try {
            return new URL(url).hostname.replace(/^www\./, '').toUpperCase();
        } catch {
            return 'ARTICLE';
        }
    })();

    // Determine what image to show
    const displayImage = !imageError && metadata.image && isValidImageUrl(metadata.image)
        ? metadata.image
        : null;

    return (
        <div
            onClick={handleClick}
            style={{
                border: `1px solid ${C.border}`,
                borderRadius: 8,
                overflow: 'hidden',
                margin: '0 12px 12px',
                cursor: 'pointer',
                transition: 'box-shadow 0.2s',
            }}
            onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)'}
            onMouseLeave={(e) => e.currentTarget.style.boxShadow = 'none'}
        >
            {/* Image Container */}
            <div style={{
                width: '100%',
                aspectRatio: '16/9',
                overflow: 'hidden',
                background: loading
                    ? 'linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)'
                    : 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
            }}>
                {displayImage ? (
                    <img
                        src={displayImage}
                        alt={displayTitle}
                        style={{ width: '100%', height: '100%', objectFit: 'contain', background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)' }}
                        onError={() => setImageError(true)}
                    />
                ) : (
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        height: '100%',
                        color: 'white',
                        fontSize: 48
                    }}>
                        📰
                    </div>
                )}
            </div>

            {/* Metadata Container */}
            <div style={{ padding: '12px 16px', background: C.card }}>
                <div style={{
                    fontSize: 11,
                    color: C.textSec,
                    textTransform: 'uppercase',
                    marginBottom: 4,
                    letterSpacing: '0.5px'
                }}>
                    {displaySiteName}
                </div>
                <div style={{
                    fontSize: 16,
                    fontWeight: 600,
                    color: C.text,
                    lineHeight: 1.3,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                }}>
                    {displayTitle}
                </div>
                {metadata.description && (
                    <div style={{
                        fontSize: 13,
                        color: C.textSec,
                        marginTop: 6,
                        lineHeight: 1.4,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                    }}>
                        {metadata.description}
                    </div>
                )}
                <div style={{ fontSize: 12, color: C.textSec, marginTop: 6 }}>
                    Click to read full article →
                </div>
            </div>
        </div>
    );
}

/**
 * ArticleCardFromPost - Convenience wrapper that extracts data from a post object
 */
export function ArticleCardFromPost({ post }) {
    // Prioritize stored link metadata, then extract from content
    const url = post.link_url || extractUrlFromContent(post.content);

    return (
        <ArticleCard
            url={url}
            title={post.link_title}
            description={post.link_description}
            image={post.link_image || post.media_urls?.[0]}
            siteName={post.link_site_name}
            fallbackContent={post.content}
        />
    );
}

/**
 * SharedLinkPreviewCard — Extracted from social-media/index.js L383-525
 * Rich link preview card with in-memory cache and ExternalLinkModal integration.
 */
import { useState, useEffect } from 'react';
import { SOCIAL_COLORS as C, decodeHtmlEntities } from '../../lib/socialHelpers';
import { useExternalLink } from '../ui/ExternalLinkModal';

// Module-level cache to deduplicate link preview fetches across all cards in a session
// Capped at 200 entries (LRU eviction) to prevent unbounded memory growth.
const LINK_PREVIEW_CACHE_MAX = 200;
const linkPreviewCache = new Map();
const linkPreviewInflight = new Map();

function setLinkPreviewCache(key, value) {
    if (linkPreviewCache.size >= LINK_PREVIEW_CACHE_MAX) {
        linkPreviewCache.delete(linkPreviewCache.keys().next().value);
    }
    linkPreviewCache.set(key, value);
}

export function SharedLinkPreviewCard({ url }) {
    const { openExternal } = useExternalLink();
    const [metadata, setMetadata] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!url) return;

        // Check in-memory cache first to avoid duplicate network requests
        if (linkPreviewCache.has(url)) {
            setMetadata(linkPreviewCache.get(url));
            setLoading(false);
            return;
        }

        const fetchMetadata = async () => {
            try {
                let data;
                // Deduplicate: if a request for this URL is already in-flight, await it
                if (linkPreviewInflight.has(url)) {
                    data = await linkPreviewInflight.get(url);
                } else {
                    const promise = fetch(`/api/link-preview?url=${encodeURIComponent(url)}`)
                        .then(r => r.json());
                    linkPreviewInflight.set(url, promise);
                    data = await promise;
                    linkPreviewInflight.delete(url);
                }
                // Only cache if we got useful data (allows retry on empty fallback responses)
                if (data && (data.image || data.title)) {
                    setLinkPreviewCache(url, data);
                }
                setMetadata(data);
            } catch (error) {
                console.warn('Failed to fetch link metadata:', error);
                linkPreviewInflight.delete(url);
                // Fallback to basic info
                try {
                    const urlObj = new URL(url);
                    setMetadata({
                        title: urlObj.pathname.split('/').pop()?.replace(/-/g, ' ') || 'Link',
                        description: null,
                        image: null,
                        siteName: urlObj.hostname.replace(/^www\./, '')
                    });
                } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
            }
            setLoading(false);
        };

        fetchMetadata();
    }, [url]);

    if (loading) {
        return (
            <div style={{
                border: `1px solid ${C.border}`,
                borderRadius: 8,
                overflow: 'hidden',
                background: C.bg,
                margin: '0 12px 12px'
            }}>
                <div style={{
                    height: 200,
                    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontSize: 24
                }}>⏳ Loading Preview...</div>
            </div>
        );
    }

    const handleClick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        openExternal(url, metadata?.title || 'Link Preview');
    };

    return (
        <div
            onClick={handleClick}
            style={{ textDecoration: 'none', display: 'block', cursor: 'pointer' }}
        >
            <div style={{
                border: `1px solid ${C.border}`,
                borderRadius: 8,
                overflow: 'hidden',
                background: C.bg,
                margin: '0 12px 12px'
            }}>
                {/* Link Preview Image - full width, proper aspect ratio */}
                <div style={{
                    width: '100%',
                    aspectRatio: '16/9',
                    position: 'relative',
                    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
                    overflow: 'hidden'
                }}>
                    {metadata?.image ? (
                        <img
                            src={metadata.image}
                            alt={metadata.title || 'Link preview'}
                            style={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'cover',
                                objectPosition: 'center center'
                            }}
                        />
                    ) : (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'white', fontSize: 48 }}>🔗</div>
                    )}
                </div>
                {/* Link Info */}
                <div style={{ padding: '12px 16px', background: C.card }}>
                    <div style={{ fontSize: 11, color: C.textSec, textTransform: 'uppercase', marginBottom: 4 }}>
                        {metadata?.siteName || new URL(url).hostname.replace('www.', '')}
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 600, color: C.text, lineHeight: 1.3 }}>
                        {decodeHtmlEntities(metadata?.title) || 'View Article'}
                    </div>
                    {metadata?.description && (
                        <div style={{
                            fontSize: 13,
                            color: C.textSec,
                            marginTop: 6,
                            lineHeight: 1.4,
                            overflow: 'hidden',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical'
                        }}>
                            {decodeHtmlEntities(metadata.description)}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default SharedLinkPreviewCard;

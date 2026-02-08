/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║  ArticleReaderModal - In-app article reader                              ║
 * ╠═══════════════════════════════════════════════════════════════════════════╣
 * ║  Displays external articles inside smarter.poker using a clean           ║
 * ║  reader view. Extracts content via /api/news/extract-article             ║
 * ║  (microlink.io headless browser) to handle JS-rendered sites.            ║
 * ║                                                                           ║
 * ║  NO IFRAME, NO PROXY — renders article content natively.                 ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function ArticleReaderModal({ url, title: initialTitle, onClose }) {
    const [loading, setLoading] = useState(true);
    const [article, setArticle] = useState(null);
    const [error, setError] = useState(false);

    // Fetch article content on mount
    useEffect(() => {
        if (!url) return;

        const fetchArticle = async () => {
            try {
                setLoading(true);
                setError(false);

                const res = await fetch(`/api/news/extract-article?url=${encodeURIComponent(url)}`);
                const result = await res.json();

                if (result.success && result.data) {
                    setArticle(result.data);
                } else if (result.data) {
                    // Partial data fallback
                    setArticle(result.data);
                } else {
                    setError(true);
                }
            } catch (e) {
                console.error('[ArticleReader] Extraction failed:', e);
                setError(true);
            } finally {
                setLoading(false);
            }
        };

        fetchArticle();
    }, [url]);

    // Handle escape key
    const handleEscape = useCallback((e) => {
        if (e.key === 'Escape') onClose();
    }, [onClose]);

    useEffect(() => {
        window.addEventListener('keydown', handleEscape);
        document.body.style.overflow = 'hidden';
        return () => {
            window.removeEventListener('keydown', handleEscape);
            document.body.style.overflow = '';
        };
    }, [handleEscape]);

    // Extract domain for display
    const domain = (() => {
        try { return new URL(url).hostname.replace('www.', ''); }
        catch { return 'Article'; }
    })();

    const displayTitle = article?.title || initialTitle || 'Article';
    const timeAgo = article?.date ? formatTimeAgo(article.date) : '';

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                style={{
                    position: 'fixed',
                    top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.97)',
                    zIndex: 10000,
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                }}
            >
                {/* Header Bar */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    background: 'linear-gradient(180deg, rgba(20,20,30,0.98) 0%, rgba(10,10,20,0.95) 100%)',
                    borderBottom: '1px solid rgba(255,255,255,0.08)',
                    flexShrink: 0,
                }}>
                    <button onClick={onClose} style={headerBtnStyle}>
                        ← Back
                    </button>

                    <div style={{
                        flex: 1, textAlign: 'center',
                        color: '#888', fontSize: 13,
                        overflow: 'hidden', textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap', padding: '0 12px',
                    }}>
                        {domain}
                    </div>

                    <button
                        onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
                        style={headerBtnStyle}
                    >
                        Open Source ↗
                    </button>
                </div>

                {/* Content Area */}
                <div style={{
                    flex: 1,
                    overflowY: 'auto',
                    WebkitOverflowScrolling: 'touch',
                }}>
                    {/* Loading State */}
                    {loading && (
                        <div style={centerStyle}>
                            <div style={{ fontSize: 18, color: '#fff', fontWeight: 600 }}>Loading article...</div>
                            <div style={{
                                width: 40, height: 4, background: 'rgba(255,255,255,0.1)',
                                borderRadius: 2, marginTop: 16, overflow: 'hidden',
                            }}>
                                <motion.div
                                    animate={{ x: ['-100%', '100%'] }}
                                    transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
                                    style={{
                                        width: '50%', height: '100%',
                                        background: 'linear-gradient(90deg, transparent, #4F8EF7, transparent)',
                                        borderRadius: 2,
                                    }}
                                />
                            </div>
                        </div>
                    )}

                    {/* Error State */}
                    {error && !loading && (
                        <div style={centerStyle}>
                            <div style={{ fontSize: 48, marginBottom: 16 }}>📰</div>
                            <div style={{ fontSize: 18, fontWeight: 600, color: '#fff', marginBottom: 8 }}>
                                Could not load article
                            </div>
                            <div style={{ fontSize: 14, color: '#888', marginBottom: 24, maxWidth: 300, textAlign: 'center' }}>
                                This article couldn't be extracted. You can read it directly on the source site.
                            </div>
                            <button
                                onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
                                style={{
                                    background: '#4F8EF7', border: 'none', borderRadius: 10,
                                    padding: '14px 32px', color: '#fff', cursor: 'pointer',
                                    fontSize: 16, fontWeight: 600,
                                }}
                            >
                                Read on {domain} ↗
                            </button>
                        </div>
                    )}

                    {/* Article Content */}
                    {article && !loading && (
                        <div style={{
                            maxWidth: 680, margin: '0 auto',
                            padding: '24px 20px 80px',
                        }}>
                            {/* Hero Image */}
                            {article.image && (
                                <div style={{
                                    width: '100%', borderRadius: 12, overflow: 'hidden',
                                    marginBottom: 24, aspectRatio: '16/9',
                                    background: '#1a1a2e',
                                }}>
                                    <img
                                        src={article.image}
                                        alt={displayTitle}
                                        style={{
                                            width: '100%', height: '100%',
                                            objectFit: 'cover', display: 'block',
                                        }}
                                        onError={(e) => { e.target.style.display = 'none'; }}
                                    />
                                </div>
                            )}

                            {/* Source Badge */}
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                marginBottom: 12,
                            }}>
                                {article.logo && (
                                    <img src={article.logo} alt="" style={{
                                        width: 20, height: 20, borderRadius: 4, objectFit: 'contain',
                                    }} onError={(e) => { e.target.style.display = 'none'; }} />
                                )}
                                <span style={{
                                    color: '#4F8EF7', fontSize: 13, fontWeight: 600,
                                    textTransform: 'uppercase', letterSpacing: '0.5px',
                                }}>
                                    {article.publisher || domain}
                                </span>
                                {timeAgo && (
                                    <span style={{ color: '#555', fontSize: 13 }}>• {timeAgo}</span>
                                )}
                            </div>

                            {/* Title */}
                            <h1 style={{
                                fontSize: 28, fontWeight: 800, color: '#fff',
                                lineHeight: 1.25, margin: '0 0 16px', letterSpacing: '-0.3px',
                                fontFamily: "'Georgia', 'Times New Roman', serif",
                            }}>
                                {displayTitle}
                            </h1>

                            {/* Author */}
                            {article.author && (
                                <div style={{
                                    fontSize: 14, color: '#999', marginBottom: 24,
                                    paddingBottom: 24,
                                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                                }}>
                                    By <span style={{ color: '#ccc', fontWeight: 500 }}>{article.author}</span>
                                </div>
                            )}

                            {/* Article Body */}
                            <div style={{
                                fontSize: 17, lineHeight: 1.8, color: '#d0d0d0',
                                fontFamily: "'Georgia', 'Times New Roman', serif",
                            }}>
                                {article.content ? (
                                    article.content.split('\n').filter(p => p.trim()).map((paragraph, i) => (
                                        <p key={i} style={{ margin: '0 0 20px', textAlign: 'justify' }}>
                                            {paragraph}
                                        </p>
                                    ))
                                ) : article.description ? (
                                    <p style={{ margin: '0 0 20px' }}>{article.description}</p>
                                ) : null}
                            </div>

                            {/* Read Full Article CTA */}
                            <div style={{
                                marginTop: 40, paddingTop: 24,
                                borderTop: '1px solid rgba(255,255,255,0.06)',
                                textAlign: 'center',
                            }}>
                                <button
                                    onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
                                    style={{
                                        background: 'rgba(79,142,247,0.15)',
                                        border: '1px solid rgba(79,142,247,0.3)',
                                        borderRadius: 10, padding: '12px 28px',
                                        color: '#4F8EF7', cursor: 'pointer',
                                        fontSize: 15, fontWeight: 600,
                                    }}
                                >
                                    Read full article on {domain} ↗
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </motion.div>
        </AnimatePresence>
    );
}

// Styles
const headerBtnStyle = {
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 8,
    padding: '8px 16px',
    color: '#fff',
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 600,
    whiteSpace: 'nowrap',
};

const centerStyle = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '60vh',
    color: '#fff',
    textAlign: 'center',
    padding: 24,
};

function formatTimeAgo(dateStr) {
    try {
        const diff = Date.now() - new Date(dateStr).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 60) return `${mins}m ago`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `${hrs}h ago`;
        const days = Math.floor(hrs / 24);
        if (days < 7) return `${days}d ago`;
        return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch { return ''; }
}

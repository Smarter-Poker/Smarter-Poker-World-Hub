/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║  ArticleReaderModal - In-app full article reader                        ║
 * ╠═══════════════════════════════════════════════════════════════════════════╣
 * ║  ONE-CLICK OPEN: User clicks article → full article loads immediately   ║
 * ║  Uses /api/news/extract-article (microlink + cheerio) for full content  ║
 * ║  NO IFRAME, NO PROXY — renders complete article content natively        ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function ArticleReaderModal({ url, title: initialTitle, onClose }) {
    const [loading, setLoading] = useState(true);
    const [article, setArticle] = useState(null);
    const [error, setError] = useState(false);

    // Fetch FULL article content on mount
    useEffect(() => {
        if (!url) return;

        const fetchArticle = async () => {
            try {
                setLoading(true);
                setError(false);

                const res = await fetch(`/api/news/extract-article?url=${encodeURIComponent(url)}`);
                const result = await res.json();

                if (result.data) {
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

    // Extract domain
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
                    background: '#0a0a14',
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
                    padding: '10px 16px',
                    background: 'linear-gradient(180deg, rgba(20,20,30,1) 0%, rgba(12,12,22,0.98) 100%)',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                    flexShrink: 0,
                }}>
                    <button onClick={onClose} style={headerBtnStyle}>
                        ← Back
                    </button>

                    <div style={{
                        flex: 1, textAlign: 'center',
                        color: '#666', fontSize: 12,
                        overflow: 'hidden', textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap', padding: '0 12px',
                    }}>
                        {domain}
                    </div>

                    <button
                        onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
                        style={headerBtnStyle}
                    >
                        Source ↗
                    </button>
                </div>

                {/* Scrollable Content */}
                <div style={{
                    flex: 1, overflowY: 'auto',
                    WebkitOverflowScrolling: 'touch',
                }}>
                    {/* Loading */}
                    {loading && (
                        <div style={centerStyle}>
                            <div style={{
                                width: 32, height: 32, border: '3px solid rgba(255,255,255,0.1)',
                                borderTopColor: '#4F8EF7', borderRadius: '50%',
                                animation: 'spin 0.8s linear infinite',
                            }} />
                            <div style={{ fontSize: 15, color: '#888', marginTop: 16 }}>Loading article...</div>
                            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                        </div>
                    )}

                    {/* Error */}
                    {error && !loading && (
                        <div style={centerStyle}>
                            <div style={{ fontSize: 18, fontWeight: 600, color: '#fff', marginBottom: 8 }}>
                                Could not load article
                            </div>
                            <div style={{ fontSize: 14, color: '#888', marginBottom: 24 }}>
                                This article couldn't be extracted.
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

                    {/* Full Article Content */}
                    {article && !loading && (
                        <div style={{
                            maxWidth: 680, margin: '0 auto',
                            padding: '20px 20px 60px',
                        }}>
                            {/* Hero Image */}
                            {article.image && (
                                <div style={{
                                    width: '100%', borderRadius: 10, overflow: 'hidden',
                                    marginBottom: 20, aspectRatio: '16/9',
                                    background: '#1a1a2e',
                                }}>
                                    <img
                                        src={article.image}
                                        alt={displayTitle}
                                        style={{
                                            width: '100%', height: '100%',
                                            objectFit: 'cover', display: 'block',
                                        }}
                                        onError={(e) => { e.target.parentElement.style.display = 'none'; }}
                                    />
                                </div>
                            )}

                            {/* Source + Time */}
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                marginBottom: 10,
                            }}>
                                {article.logo && (
                                    <img src={article.logo} alt="" style={{
                                        width: 18, height: 18, borderRadius: 3, objectFit: 'contain',
                                    }} onError={(e) => { e.target.style.display = 'none'; }} />
                                )}
                                <span style={{
                                    color: '#4F8EF7', fontSize: 12, fontWeight: 700,
                                    textTransform: 'uppercase', letterSpacing: '0.5px',
                                }}>
                                    {article.publisher || domain}
                                </span>
                                {timeAgo && (
                                    <span style={{ color: '#444', fontSize: 12 }}>• {timeAgo}</span>
                                )}
                            </div>

                            {/* Title */}
                            <h1 style={{
                                fontSize: 26, fontWeight: 800, color: '#fff',
                                lineHeight: 1.25, margin: '0 0 12px', letterSpacing: '-0.3px',
                                fontFamily: "'Georgia', 'Times New Roman', serif",
                            }}>
                                {displayTitle}
                            </h1>

                            {/* Author */}
                            {article.author && (
                                <div style={{
                                    fontSize: 14, color: '#888', marginBottom: 20,
                                    paddingBottom: 20,
                                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                                }}>
                                    By <span style={{ color: '#bbb', fontWeight: 500 }}>{article.author}</span>
                                </div>
                            )}

                            {/* FULL Article Body - Paragraphs */}
                            <div style={{
                                fontSize: 17, lineHeight: 1.85, color: '#c8c8d0',
                                fontFamily: "'Georgia', 'Times New Roman', serif",
                            }}>
                                {article.paragraphs && article.paragraphs.length > 0 ? (
                                    article.paragraphs.map((p, i) => {
                                        if (p.type === 'heading') {
                                            return (
                                                <h2 key={i} style={{
                                                    fontSize: 21, fontWeight: 700, color: '#e0e0e8',
                                                    margin: '32px 0 12px', lineHeight: 1.3,
                                                    fontFamily: "'Georgia', serif",
                                                }}>
                                                    {p.text}
                                                </h2>
                                            );
                                        }
                                        if (p.type === 'quote') {
                                            return (
                                                <blockquote key={i} style={{
                                                    borderLeft: '3px solid #4F8EF7',
                                                    padding: '8px 16px', margin: '20px 0',
                                                    color: '#a0a0b0', fontStyle: 'italic',
                                                    background: 'rgba(79,142,247,0.04)',
                                                    borderRadius: '0 6px 6px 0',
                                                }}>
                                                    {p.text}
                                                </blockquote>
                                            );
                                        }
                                        return (
                                            <p key={i} style={{ margin: '0 0 18px' }}>
                                                {p.text}
                                            </p>
                                        );
                                    })
                                ) : (
                                    <p>{article.description || 'Article content could not be extracted.'}</p>
                                )}
                            </div>

                            {/* Source Attribution */}
                            <div style={{
                                marginTop: 32, paddingTop: 20,
                                borderTop: '1px solid rgba(255,255,255,0.05)',
                                fontSize: 13, color: '#555', textAlign: 'center',
                            }}>
                                Originally published on {article.publisher || domain}
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
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.04)',
    borderRadius: 8,
    padding: '8px 14px',
    color: '#ccc',
    cursor: 'pointer',
    fontSize: 13,
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

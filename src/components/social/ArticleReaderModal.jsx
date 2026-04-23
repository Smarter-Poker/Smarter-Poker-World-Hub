/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║  🚨 PROTECTED FILE - DO NOT MODIFY WITHOUT READING SKILL FILE 🚨          ║
 * ╠═══════════════════════════════════════════════════════════════════════════╣
 * ║  SKILL: .agent/skills/in-app-article-reader/SKILL.md                     ║
 * ║  TEST:  node scripts/test-article-reader.js                              ║
 * ║  WORKFLOW: /social-feed-protection                                       ║
 * ╠═══════════════════════════════════════════════════════════════════════════╣
 * ║  ArticleReaderModal - In-app article viewer                              ║
 * ║  Opens articles inside smarter.poker using proxied iframe.               ║
 * ║                                                                           ║
 * ║  CRITICAL: The iframe src MUST use /api/proxy?url=                       ║
 * ║  If you change this, articles won't display inside the app.              ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const C = {
    bg: '#000000',
    card: '#FFFFFF',
    text: '#FFFFFF',
    textSec: '#A0A0A0',
};

export default function ArticleReaderModal({ url, title, onClose }) {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [ytError, setYtError] = useState(null); // YouTube embed error code (150=age-restricted)

    // Detect YouTube URLs and extract video ID (must be above useEffects that reference isYouTube)
    const youtubeVideoId = (() => {
        if (!url) return null;
        try {
            const shortsMatch = url.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]+)/);
            if (shortsMatch) return shortsMatch[1];
            const watchMatch = url.match(/youtube\.com\/watch\?v=([a-zA-Z0-9_-]+)/);
            if (watchMatch) return watchMatch[1];
            const shortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]+)/);
            if (shortMatch) return shortMatch[1];
            const embedMatch = url.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]+)/);
            if (embedMatch) return embedMatch[1];
        } catch (e) { console.warn('[App] Handled exception:', e); }
        return null;
    })();

    const isYouTube = !!youtubeVideoId;

    // Extract domain for display
    const domain = (() => {
        try {
            return new URL(url).hostname.replace('www.', '');
        } catch {
            return 'Article';
        }
    })();

    // Handle escape key to close
    useEffect(() => {
        const handleEscape = (e) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleEscape);
        return () => window.removeEventListener('keydown', handleEscape);
    }, [onClose]);

    // YouTube error detection via postMessage
    useEffect(() => {
        if (!isYouTube) return;
        const YOUTUBE_ORIGINS = ['https://www.youtube-nocookie.com', 'https://www.youtube.com', 'https://youtube.com'];
        const handleYTMessage = (e) => {
            if (!YOUTUBE_ORIGINS.includes(e.origin)) return;
            try {
                const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
                if (data?.event === 'onError' && data?.info) {
                    setYtError(Number(data.info));
                }
            } catch { /* non-JSON message */ }
        };
        window.addEventListener('message', handleYTMessage);
        return () => window.removeEventListener('message', handleYTMessage);
    }, [isYouTube]);

    // Auto-close on YouTube error after 3 seconds
    useEffect(() => {
        if (!ytError) return;
        const timer = setTimeout(() => onClose?.(), 3000);
        return () => clearTimeout(timer);
    }, [ytError, onClose]);

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0,0,0,0.95)',
                    zIndex: 9999,
                    display: 'flex',
                    flexDirection: 'column',
                }}
            >
                {/* Header Bar */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    background: 'rgba(0,0,0,0.8)',
                    borderBottom: '1px solid rgba(255,255,255,0.1)',
                }}>
                    {/* Close Button */}
                    <button
                        onClick={onClose}
                        style={{
                            background: 'rgba(255,255,255,0.1)',
                            border: 'none',
                            borderRadius: 8,
                            padding: '8px 16px',
                            color: '#FFF',
                            cursor: 'pointer',
                            fontSize: 14,
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                        }}
                    >
                        ← Back
                    </button>

                    {/* Title / Domain */}
                    <div style={{
                        flex: 1,
                        textAlign: 'center',
                        color: C.textSec,
                        fontSize: 13,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        padding: '0 16px',
                    }}>
                        {title || domain}
                    </div>
                </div>

                {/* Loading State — animated progress bar + shimmer skeleton */}
                {loading && (
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        {/* Progress bar */}
                        <style>{`
                            @keyframes sp-progress {
                                0%   { width: 0%; opacity: 1; }
                                80%  { width: 85%; opacity: 1; }
                                100% { width: 85%; opacity: 0.7; }
                            }
                            @keyframes sp-shimmer {
                                0%   { background-position: -800px 0; }
                                100% { background-position: 800px 0; }
                            }
                        `}</style>
                        <div style={{ width: '100%', height: 3, background: 'rgba(255,255,255,0.08)', flexShrink: 0 }}>
                            <div style={{
                                height: '100%',
                                background: 'linear-gradient(90deg, #d4af37, #f0d060)',
                                borderRadius: 2,
                                animation: 'sp-progress 3s ease-out forwards',
                            }} />
                        </div>
                        {/* Shimmer skeleton content */}
                        <div style={{ flex: 1, padding: '32px 24px', maxWidth: 760, margin: '0 auto', width: '100%' }}>
                            {[1, 0.6, 0.8, 0.5, 0.9, 0.65, 0.75, 0.4].map((w, i) => (
                                <div key={i} style={{
                                    height: i === 0 ? 32 : 16,
                                    width: `${w * 100}%`,
                                    marginBottom: i === 0 ? 20 : 12,
                                    borderRadius: 6,
                                    backgroundImage: 'linear-gradient(90deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.1) 50%, rgba(255,255,255,0.04) 100%)',
                                    backgroundSize: '800px 100%',
                                    animation: `sp-shimmer 1.4s ease-in-out infinite`,
                                    animationDelay: `${i * 0.07}s`,
                                }} />
                            ))}
                        </div>
                        {/* Domain hint */}
                        <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 12, paddingBottom: 24 }}>
                            {isYouTube ? 'Loading video...' : `Opening ${domain}…`}
                        </div>
                    </div>
                )}

                {/* Error State */}
                {error && (
                    <div style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        color: C.text,
                        textAlign: 'center',
                        padding: 24,
                    }}>
                        <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
                        <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
                            Cannot embed this content
                        </div>
                        <div style={{ fontSize: 14, color: C.textSec, marginBottom: 20 }}>
                            Some sites block embedding. Click below to view in a new tab.
                        </div>
                        <button
                            onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
                            style={{
                                background: '#1877F2',
                                border: 'none',
                                borderRadius: 8,
                                padding: '12px 24px',
                                color: '#FFF',
                                cursor: 'pointer',
                                fontSize: 16,
                                fontWeight: 600,
                            }}
                        >
                            Open in New Tab ↗
                        </button>
                    </div>
                )}

                {/* YouTube Embed - uses official YouTube embed which always works */}
                {isYouTube ? (
                    <div style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '16px',
                    }}>
                        <iframe
                            title={`YouTube Video Player - ${title || domain}`}
                            src={`https://www.youtube.com/embed/${youtubeVideoId}?autoplay=1&rel=0&modestbranding=1&enablejsapi=1&origin=${typeof window !== 'undefined' ? window.location.origin : 'https://smarter.poker'}`}
                            style={{
                                width: '100%',
                                maxWidth: '960px',
                                aspectRatio: '16/9',
                                border: 'none',
                                borderRadius: 12,
                                opacity: loading ? 0 : 1,
                                transition: 'opacity 0.3s',
                            }}
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                            allowFullScreen
                            onLoad={() => setLoading(false)}
                            onError={() => {
                                setLoading(false);
                                setError(true);
                            }}
                        />
                        {/* YouTube Error Overlay */}
                        {ytError && (
                            <div style={{
                                position: 'absolute', inset: 0, zIndex: 50,
                                background: 'linear-gradient(135deg, rgba(20,20,30,0.97) 0%, rgba(10,10,20,0.99) 100%)',
                                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                gap: 16, borderRadius: 12,
                            }}>
                                <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.5">
                                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                                    <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                                </svg>
                                <div style={{ color: 'white', fontSize: 18, fontWeight: 700 }}>
                                    {ytError === 150 ? 'Age-Restricted Video' : 'Video Unavailable'}
                                </div>
                                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, maxWidth: 280, textAlign: 'center' }}>
                                    This video cannot be embedded. You can watch it directly on YouTube.
                                </div>
                                <a
                                    href={url}
                                    target="_blank" rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    style={{
                                        display: 'inline-flex', alignItems: 'center', gap: 8,
                                        padding: '12px 28px', borderRadius: 8,
                                        background: '#FF0000', color: 'white',
                                        fontWeight: 700, fontSize: 15, textDecoration: 'none',
                                        boxShadow: '0 4px 20px rgba(255,0,0,0.4)',
                                    }}
                                >
                                    Watch On YouTube
                                </a>
                                <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, marginTop: 4 }}>
                                    Closing in 3 seconds...
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    /* Article iframe - Served through our proxy to bypass X-Frame-Options */
                    <iframe
                        title={`Article content from ${domain}`}
                        src={`/api/proxy?url=${encodeURIComponent(url)}`}
                        style={{
                            flex: 1,
                            width: '100%',
                            border: 'none',
                            background: '#FFF',
                            opacity: loading ? 0 : 1,
                            transition: 'opacity 0.3s',
                        }}
                        onLoad={() => setLoading(false)}
                        onError={() => {
                            setLoading(false);
                            setError(true);
                        }}
                        // No sandbox restrictions needed since content comes from our proxy
                        referrerPolicy="no-referrer"
                    />
                )}

                {/* Bottom Bar with source info */}
                <div style={{
                    padding: '8px 16px',
                    background: 'rgba(0,0,0,0.8)',
                    borderTop: '1px solid rgba(255,255,255,0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                }}>
                    <span style={{ color: C.textSec, fontSize: 12 }}>
                        {isYouTube ? '▶ YouTube' : `📍 ${domain}`}
                    </span>
                </div>
            </motion.div>
        </AnimatePresence>
    );
}

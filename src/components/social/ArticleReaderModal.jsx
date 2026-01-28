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

import { useState, useEffect } from 'react';
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

    // AUTO-OPEN: Immediately open the article in a new tab and close modal
    // This bypasses the broken iframe loading screen
    useEffect(() => {
        if (url) {
            window.open(url, '_blank', 'noopener,noreferrer');
            onClose();
        }
    }, [url, onClose]);

    // Handle escape key to close
    useEffect(() => {
        const handleEscape = (e) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleEscape);
        return () => window.removeEventListener('keydown', handleEscape);
    }, [onClose]);

    // Extract domain for display
    const domain = (() => {
        try {
            return new URL(url).hostname.replace('www.', '');
        } catch {
            return 'Article';
        }
    })();

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

                    {/* Open in New Tab */}
                    <button
                        onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
                        style={{
                            background: 'rgba(255,255,255,0.1)',
                            border: 'none',
                            borderRadius: 8,
                            padding: '8px 16px',
                            color: '#FFF',
                            cursor: 'pointer',
                            fontSize: 14,
                            fontWeight: 600,
                        }}
                    >
                        ↗ Open
                    </button>
                </div>

                {/* Loading State */}
                {loading && (
                    <div style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        color: C.text,
                        textAlign: 'center',
                    }}>
                        <div style={{ fontSize: 32, marginBottom: 16 }}>📰</div>
                        <div>Loading article...</div>
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
                            Cannot embed this article
                        </div>
                        <div style={{ fontSize: 14, color: C.textSec, marginBottom: 20 }}>
                            Some sites block embedding. Click below to read in a new tab.
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
                            Open Article ↗
                        </button>
                    </div>
                )}

                {/* Article iframe - Served through our proxy to bypass X-Frame-Options */}
                <iframe
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
                        📍 {domain}
                    </span>
                </div>
            </motion.div>
        </AnimatePresence>
    );
}

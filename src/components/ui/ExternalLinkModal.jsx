/**
 * 🔒 EXTERNAL LINK MODAL — Global Containment System
 * src/components/ui/ExternalLinkModal.jsx
 * 
 * NEVER navigate away from smarter.poker. All external links open in this modal.
 */

import React, { useState, useEffect, createContext, useContext } from 'react';
import { createPortal } from 'react-dom';

// ═══════════════════════════════════════════════════════════════════════════
// 🌐 CONTEXT FOR GLOBAL ACCESS
// ═══════════════════════════════════════════════════════════════════════════

const ExternalLinkContext = createContext(null);

export const useExternalLink = () => {
    const context = useContext(ExternalLinkContext);
    if (!context) {
        throw new Error('useExternalLink must be used within ExternalLinkProvider');
    }
    return context;
};

// ═══════════════════════════════════════════════════════════════════════════
// 🔗 LINK CONTAINMENT PROVIDER
// ═══════════════════════════════════════════════════════════════════════════

export function ExternalLinkProvider({ children }) {
    const [isOpen, setIsOpen] = useState(false);
    const [url, setUrl] = useState('');
    const [title, setTitle] = useState('');
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    // Open external content in FULL SCREEN INTERNAL MODAL
    // User stays on smarter.poker URL - content displays inside our app
    const openExternal = (externalUrl, externalTitle = 'External Content') => {
        setUrl(externalUrl);
        setTitle(externalTitle);
        setIsOpen(true);
    };

    const closeModal = () => {
        setIsOpen(false);
        setUrl('');
        setTitle('');
    };

    // Global click interceptor for all external links
    useEffect(() => {
        const handleClick = (e) => {
            const link = e.target.closest('a');
            if (!link) return;

            const href = link.getAttribute('href');
            if (!href) return;

            // Skip internal navigation
            if (href.includes('smarter.poker') || href.includes('localhost')) return;

            // Check if it's an external link
            const isExternal = (
                href.startsWith('http://') ||
                href.startsWith('https://') ||
                href.startsWith('//')
            );

            if (!isExternal) return;

            // CRITICAL: Skip image and media URLs - they should display normally, not in modal
            const lowerHref = href.toLowerCase();
            const isMediaUrl = (
                // Image extensions
                lowerHref.match(/\.(png|jpg|jpeg|gif|webp|svg|ico|bmp|avif)(\?.*)?$/) ||
                // Video extensions
                lowerHref.match(/\.(mp4|webm|mov|avi|mkv|m4v)(\?.*)?$/) ||
                // Audio extensions
                lowerHref.match(/\.(mp3|wav|ogg|m4a|aac)(\?.*)?$/) ||
                // Common image/media CDN domains
                lowerHref.includes('primg.net') ||
                lowerHref.includes('imgur.com') ||
                lowerHref.includes('cloudinary.com') ||
                lowerHref.includes('supabase.co/storage') ||
                lowerHref.includes('youtube.com/watch') ||
                lowerHref.includes('youtu.be') ||
                // Skip if it's inside an img tag (wrapped image)
                link.querySelector('img')
            );

            if (isMediaUrl) {
                // Let media URLs open normally (new tab or inline)
                return;
            }

            // CRITICAL: Skip video call URLs - Jitsi must open in new tab, not modal
            if (lowerHref.includes('meet.jit.si')) {
                // Let Jitsi calls open in new tab (target="_blank" already set on <a>)
                return;
            }

            // CRITICAL: Skip HendonMob URLs - they block embedding with 403
            if (lowerHref.includes('thehendonmob.com') || lowerHref.includes('pokerdb.thehendonmob.com')) {
                // Let HendonMob open in new tab (target="_blank" already set on <a>)
                return;
            }

            // Also intercept links that explicitly should open externally
            const forceInternal = link.hasAttribute('data-internal');

            if (forceInternal || isExternal) {
                e.preventDefault();
                e.stopPropagation();

                const linkTitle = link.getAttribute('title') ||
                    link.getAttribute('data-title') ||
                    link.textContent?.trim() ||
                    'External Content';

                openExternal(href, linkTitle);
            }
        };

        document.addEventListener('click', handleClick, true);
        return () => document.removeEventListener('click', handleClick, true);
    }, []);

    return (
        <ExternalLinkContext.Provider value={{ openExternal, closeModal, isOpen, url }}>
            {children}
            {/* Fallback modal only shows if popup was blocked */}
            {mounted && isOpen && createPortal(
                <ExternalLinkModal
                    url={url}
                    title={title}
                    onClose={closeModal}
                />,
                document.body
            )}
        </ExternalLinkContext.Provider>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// 📺 EXTERNAL LINK MODAL COMPONENT
// Iframe first, if blocked show internal message with Copy Link - NO external popups
// ═══════════════════════════════════════════════════════════════════════════

function ExternalLinkModal({ url, title, onClose }) {
    const [loading, setLoading] = useState(true);
    const [blocked, setBlocked] = useState(false);
    const [copied, setCopied] = useState(false);


    // Show blocked state after 3 seconds - iframe detection is unreliable
    // Most external sites block embedding, so we show the message proactively
    useEffect(() => {
        const timeout = setTimeout(() => {
            setLoading(false);
            setBlocked(true);
        }, 3000);

        return () => clearTimeout(timeout);
    }, [url]);

    const copyLink = async () => {
        try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = url;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    return (
        <div style={styles.overlay} onClick={onClose}>
            <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div style={styles.header}>
                    <div style={styles.headerLeft}>
                        <span style={styles.lockIcon}>🔒</span>
                        <div style={styles.headerInfo}>
                            <span style={styles.title}>{title}</span>
                            <span style={styles.url}>{url}</span>
                        </div>
                    </div>
                    <div style={styles.headerActions}>
                        <button onClick={copyLink} style={styles.copyBtn}>
                            {copied ? '✓ Copied!' : '📋 Copy Link'}
                        </button>
                        <button onClick={onClose} style={styles.closeBtn}>✕</button>
                    </div>
                </div>

                {/* Content */}
                <div style={styles.content}>
                    {/* Loading state */}
                    {loading && (
                        <div style={styles.loader}>
                            <div style={styles.spinner} />
                            <span>Loading content...</span>
                        </div>
                    )}

                    {/* Blocked state - shown inside the modal */}
                    {blocked && (
                        <div style={styles.blockedState}>
                            <span style={styles.blockedIcon}>🔐</span>
                            <h3 style={styles.blockedTitle}>Content Preview Unavailable</h3>
                            <p style={styles.blockedText}>
                                This website doesn't allow embedding.
                                <br />
                                Copy the link to view it in your browser.
                            </p>
                            <button onClick={copyLink} style={styles.openBtn}>
                                {copied ? '✓ Link Copied!' : '📋 Copy Link to Clipboard'}
                            </button>
                            <div style={styles.urlDisplay}>
                                <code style={styles.urlCode}>{url}</code>
                            </div>
                        </div>
                    )}

                    {/* Iframe - only shown during loading, hidden when blocked */}
                    {!blocked && (
                        <iframe
                            src={url}
                            style={{
                                ...styles.iframe,
                                opacity: loading ? 0 : 1
                            }}
                            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                            referrerPolicy="no-referrer"
                            title={title}
                        />
                    )}
                </div>

                {/* Footer */}
                <div style={styles.footer}>
                    <span style={styles.footerText}>
                        🛡️ You're still on Smarter.Poker — You never left!
                    </span>
                </div>
            </div>

            <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// 🎨 STYLES
// ═══════════════════════════════════════════════════════════════════════════

const styles = {
    overlay: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 999999,
        animation: 'fadeIn 0.2s ease-out',
    },
    modal: {
        width: '100vw',
        height: '100vh',
        maxWidth: 'none',
        background: '#0a1628',
        borderRadius: 0,
        border: 'none',
        boxShadow: 'none',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
    },
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 16px',
        background: 'rgba(0, 212, 255, 0.1)',
        borderBottom: '1px solid rgba(0, 212, 255, 0.2)',
    },
    headerLeft: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flex: 1,
        minWidth: 0,
    },
    lockIcon: {
        fontSize: 20,
    },
    headerInfo: {
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        minWidth: 0,
    },
    title: {
        color: '#fff',
        fontWeight: 600,
        fontSize: 14,
    },
    url: {
        color: 'rgba(255, 255, 255, 0.5)',
        fontSize: 11,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        maxWidth: 400,
    },
    headerActions: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
    },
    newTabBtn: {
        padding: '6px 12px',
        background: 'rgba(0, 212, 255, 0.2)',
        border: '1px solid rgba(0, 212, 255, 0.3)',
        borderRadius: 6,
        color: '#00D4FF',
        fontSize: 12,
        fontWeight: 500,
        cursor: 'pointer',
    },
    copyBtn: {
        padding: '6px 12px',
        background: 'rgba(0, 255, 136, 0.2)',
        border: '1px solid rgba(0, 255, 136, 0.3)',
        borderRadius: 6,
        color: '#00ff88',
        fontSize: 12,
        fontWeight: 500,
        cursor: 'pointer',
    },
    closeBtn: {
        width: 32,
        height: 32,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(255, 71, 87, 0.2)',
        border: '1px solid rgba(255, 71, 87, 0.3)',
        borderRadius: 6,
        color: '#ff4757',
        fontSize: 16,
        cursor: 'pointer',
    },
    content: {
        flex: 1,
        position: 'relative',
        background: '#fff',
    },
    iframe: {
        width: '100%',
        height: '100%',
        border: 'none',
        transition: 'opacity 0.3s ease',
    },
    loader: {
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 16,
        color: '#0a1628',
    },
    spinner: {
        width: 40,
        height: 40,
        border: '3px solid rgba(0, 212, 255, 0.2)',
        borderTopColor: '#00D4FF',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite',
    },
    loaderHint: {
        fontSize: 12,
        opacity: 0.6,
        marginTop: -8,
    },
    errorState: {
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        textAlign: 'center',
        color: '#0a1628',
        padding: 40,
    },
    blockedState: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        color: '#0a1628',
        padding: 40,
        background: '#fff',
        zIndex: 10,
    },
    blockedIcon: {
        fontSize: 48,
        display: 'block',
        marginBottom: 16,
    },
    blockedTitle: {
        margin: '0 0 8px 0',
        fontSize: 20,
        fontWeight: 600,
    },
    blockedText: {
        margin: '0 0 20px 0',
        opacity: 0.7,
    },
    openBtn: {
        padding: '14px 28px',
        background: '#00D4FF',
        border: 'none',
        borderRadius: 8,
        color: '#0a1628',
        fontSize: 16,
        fontWeight: 600,
        cursor: 'pointer',
    },
    urlDisplay: {
        marginTop: 20,
        padding: 12,
        background: 'rgba(0, 0, 0, 0.1)',
        borderRadius: 8,
        maxWidth: 500,
        wordBreak: 'break-all',
    },
    urlCode: {
        fontSize: 11,
        color: '#666',
        fontFamily: 'monospace',
    },
    errorIcon: {
        fontSize: 48,
    },
    errorBtn: {
        marginTop: 16,
        padding: '12px 24px',
        background: '#00D4FF',
        border: 'none',
        borderRadius: 8,
        color: '#0a1628',
        fontSize: 14,
        fontWeight: 600,
        cursor: 'pointer',
    },
    footer: {
        padding: '8px 16px',
        background: 'rgba(0, 255, 136, 0.1)',
        borderTop: '1px solid rgba(0, 255, 136, 0.2)',
        textAlign: 'center',
    },
    footerText: {
        color: '#00ff88',
        fontSize: 12,
        fontWeight: 500,
    },
};

export default ExternalLinkModal;

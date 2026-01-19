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

            // Check if it's an external link
            const isExternal = (
                href.startsWith('http://') ||
                href.startsWith('https://') ||
                href.startsWith('//')
            ) && !href.includes('smarter.poker') && !href.includes('localhost');

            // Also intercept links that explicitly should open externally
            const forceInternal = link.hasAttribute('data-internal');

            if (isExternal || forceInternal) {
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
// Smart Hybrid: Iframe first, auto-fallback to popup if X-Frame-Options blocks
// ═══════════════════════════════════════════════════════════════════════════

function ExternalLinkModal({ url, title, onClose }) {
    const [loading, setLoading] = useState(true);
    const [blocked, setBlocked] = useState(false);
    const iframeRef = React.useRef(null);

    // Open in popup window (for blocked sites)
    const openInPopup = () => {
        const width = window.screen.availWidth;
        const height = window.screen.availHeight;
        window.open(
            url,
            'smarterPokerBrowser',
            `width=${width},height=${height},left=0,top=0,resizable=yes,scrollbars=yes,toolbar=yes,location=yes`
        );
        onClose();
    };

    // Detect if iframe is blocked (X-Frame-Options)
    useEffect(() => {
        const timeout = setTimeout(() => {
            // If still loading after 3 seconds and iframe has no content, assume blocked
            if (loading && iframeRef.current) {
                try {
                    // Try to access iframe content - will throw if blocked
                    const doc = iframeRef.current.contentDocument || iframeRef.current.contentWindow?.document;
                    // If we can access it but it's blank/error page, it's blocked
                    if (!doc || doc.body?.innerHTML === '' || doc.body?.innerHTML?.includes('refused')) {
                        setBlocked(true);
                        setLoading(false);
                        // Auto-open in popup window
                        openInPopup();
                    }
                } catch (e) {
                    // Cross-origin error means iframe loaded something (not blocked)
                    setLoading(false);
                }
            }
        }, 2500);
        return () => clearTimeout(timeout);
    }, [loading, url]);

    const handleIframeLoad = () => {
        setLoading(false);
        // Check if iframe loaded but is blank (blocked by X-Frame-Options)
        try {
            const iframe = iframeRef.current;
            if (iframe) {
                const doc = iframe.contentDocument || iframe.contentWindow?.document;
                if (doc && (doc.body?.innerHTML === '' || !doc.body)) {
                    // Iframe is blank - site blocked embedding
                    setBlocked(true);
                    openInPopup();
                }
            }
        } catch (e) {
            // Cross-origin is expected for external sites that work
        }
    };

    const handleIframeError = () => {
        setLoading(false);
        setBlocked(true);
        openInPopup();
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
                        <button
                            onClick={openInPopup}
                            style={styles.newTabBtn}
                            title="Open in popup window"
                        >
                            ↗️ Open External
                        </button>
                        <button onClick={onClose} style={styles.closeBtn}>✕</button>
                    </div>
                </div>

                {/* Content */}
                <div style={styles.content}>
                    {loading && (
                        <div style={styles.loader}>
                            <div style={styles.spinner} />
                            <span>Loading content...</span>
                            <span style={styles.loaderHint}>Opening in popup if blocked...</span>
                        </div>
                    )}

                    {!blocked && (
                        <iframe
                            ref={iframeRef}
                            src={url}
                            style={{
                                ...styles.iframe,
                                opacity: loading ? 0 : 1
                            }}
                            onLoad={handleIframeLoad}
                            onError={handleIframeError}
                            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                            referrerPolicy="no-referrer"
                            title={title}
                        />
                    )}
                </div>

                {/* Footer */}
                <div style={styles.footer}>
                    <span style={styles.footerText}>
                        🛡️ You're still on Smarter.Poker — External content is displayed securely
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

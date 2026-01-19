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
// Opens external content in popup window immediately (iframe unreliable due to X-Frame-Options)
// ═══════════════════════════════════════════════════════════════════════════

function ExternalLinkModal({ url, title, onClose }) {
    const [popupBlocked, setPopupBlocked] = useState(false);
    const hasTriedRef = React.useRef(false);

    // Open popup immediately on mount
    useEffect(() => {
        if (hasTriedRef.current) return;
        hasTriedRef.current = true;

        // Open full-screen popup window
        const width = window.screen.availWidth;
        const height = window.screen.availHeight;
        const popup = window.open(
            url,
            'smarterPokerBrowser',
            `width=${width},height=${height},left=0,top=0,resizable=yes,scrollbars=yes,toolbar=yes,location=yes`
        );

        // Check if popup was blocked
        if (!popup || popup.closed || typeof popup.closed === 'undefined') {
            setPopupBlocked(true);
        } else {
            // Popup opened successfully, close modal
            onClose();
        }
    }, [url, onClose]);

    // Manual open for fallback
    const openPopupManually = () => {
        const width = window.screen.availWidth;
        const height = window.screen.availHeight;
        window.open(
            url,
            'smarterPokerBrowser',
            `width=${width},height=${height},left=0,top=0,resizable=yes,scrollbars=yes,toolbar=yes,location=yes`
        );
        onClose();
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
                        <button onClick={onClose} style={styles.closeBtn}>✕</button>
                    </div>
                </div>

                {/* Content - only shows if popup was blocked */}
                <div style={styles.content}>
                    {popupBlocked ? (
                        <div style={styles.blockedState}>
                            <span style={styles.blockedIcon}>🚫</span>
                            <h3 style={styles.blockedTitle}>Popup Blocked</h3>
                            <p style={styles.blockedText}>Your browser blocked the popup. Click below to open the link.</p>
                            <button onClick={openPopupManually} style={styles.openBtn}>
                                Open Link ↗️
                            </button>
                        </div>
                    ) : (
                        <div style={styles.loader}>
                            <div style={styles.spinner} />
                            <span>Opening external content...</span>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div style={styles.footer}>
                    <span style={styles.footerText}>
                        🛡️ You're still on Smarter.Poker
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
    blockedState: {
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        textAlign: 'center',
        color: '#0a1628',
        padding: 40,
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

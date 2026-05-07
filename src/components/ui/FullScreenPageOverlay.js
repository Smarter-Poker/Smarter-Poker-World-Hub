/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FULL-SCREEN PAGE OVERLAY
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Renders a page inside a full-screen overlay via iframe.
 * Used by UniversalHeader so clicking icons opens content as a popup
 * instead of navigating away from the current page.
 */

import React, { useEffect, useRef, useState } from 'react';

export default function FullScreenPageOverlay({ isOpen, onClose, url, title, onNotifCleared }) {
    const [loaded, setLoaded] = useState(false);
    const iframeRef = useRef(null);

    // Lock body scroll & listen for Escape key
    useEffect(() => {
        if (!isOpen) {
            setLoaded(false);
            // BUG FIX (Bug #8): blank the iframe src when the overlay closes.
            // Without this, the previous page continues running (auth subscriptions, timers,
            // Supabase realtime) until React GC removes the node.
            // On fast re-open React may reuse the same DOM node — if src is unchanged
            // the browser skips the load event and the spinner never clears.
            // Blanking here guarantees a clean slate on every open.
            if (iframeRef.current) {
                try { iframeRef.current.src = 'about:blank'; } catch (_) {}
            }
            return;
        }

        document.body.style.overflow = 'hidden';

        const handleKey = (e) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKey);

        return () => {
            // Always clear — don't restore saved value (race condition risk)
            document.body.style.overflow = '';
            window.removeEventListener('keydown', handleKey);
        };
    }, [isOpen, onClose]);

    // ── postMessage bridge: receive read-clear signal from notifications iframe ──
    // The notifications page fires window.parent.postMessage({ type: 'SP_NOTIF_CLEARED', count })
    // which lands here. We surface it to UniversalHeader via onNotifCleared(count).
    // This replaces the 800ms setTimeout in closeOverlay for deterministic badge sync.
    useEffect(() => {
        if (!onNotifCleared) return;
        const handler = (e) => {
            // Same-origin only — reject cross-origin messages for security
            if (e.origin !== window.location.origin) return;
            if (e.data?.type === 'SP_NOTIF_CLEARED') {
                onNotifCleared(typeof e.data.count === 'number' ? e.data.count : 0);
            }
        };
        window.addEventListener('message', handler);
        return () => window.removeEventListener('message', handler);
    }, [onNotifCleared]);

    if (!isOpen) return null;


    return (
        <>
            <style>{`
                .fsp-overlay {
                    position: fixed;
                    inset: 0;
                    z-index: 99999;
                    background: rgba(0, 0, 0, 0.85);
                    display: flex;
                    flex-direction: column;
                    animation: fsp-slide-up 0.3s ease-out;
                }

                @keyframes fsp-slide-up {
                    from { opacity: 0; transform: translateY(40px); }
                    to   { opacity: 1; transform: translateY(0); }
                }

                .fsp-topbar {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 8px 16px;
                    background: #0a0a0a;
                    border-bottom: 1px solid rgba(255,255,255,0.1);
                    flex-shrink: 0;
                }

                .fsp-title {
                    color: rgba(255,255,255,0.9);
                    font-size: 15px;
                    font-weight: 600;
                    letter-spacing: 0.3px;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                }

                .fsp-close-btn {
                    width: 36px;
                    height: 36px;
                    border-radius: 50%;
                    border: none;
                    background: rgba(255,255,255,0.1);
                    color: white;
                    font-size: 20px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: background 0.15s ease, transform 0.1s ease;
                }

                .fsp-close-btn:hover {
                    background: rgba(255,255,255,0.2);
                    transform: scale(1.1);
                }

                .fsp-close-btn:active {
                    transform: scale(0.95);
                }

                .fsp-iframe-wrap {
                    flex: 1;
                    position: relative;
                    overflow: hidden;
                }

                .fsp-iframe {
                    width: 100%;
                    height: 100%;
                    border: none;
                    background: #000;
                }

                .fsp-loader {
                    position: absolute;
                    inset: 0;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: #0a0a0a;
                    transition: opacity 0.3s ease;
                }

                .fsp-loader.hidden {
                    opacity: 0;
                    pointer-events: none;
                }

                .fsp-spinner {
                    width: 40px;
                    height: 40px;
                    border: 3px solid rgba(0, 136, 255, 0.2);
                    border-top-color: #0088ff;
                    border-radius: 50%;
                    animation: fsp-spin 0.8s linear infinite;
                }

                @keyframes fsp-spin {
                    to { transform: rotate(360deg); }
                }
            `}</style>

            <div className="fsp-overlay" role="dialog" aria-modal="true" aria-label={title || 'Page Overlay'}>
                {/* Top bar with title & close */}
                <div className="fsp-topbar">
                    <span className="fsp-title">{title || ''}</span>
                    <button
                        className="fsp-close-btn"
                        onClick={onClose}
                        aria-label="Close"
                    >
                        ✕
                    </button>
                </div>

                {/* Iframe content area */}
                <div className="fsp-iframe-wrap">
                    {/* Loading spinner until iframe loads */}
                    <div className={`fsp-loader ${loaded ? 'hidden' : ''}`}>
                        <div className="fsp-spinner" />
                    </div>

                    <iframe
                        ref={iframeRef}
                        src={url}
                        className="fsp-iframe"
                        title={title || 'Page Content'}
                        onLoad={() => setLoaded(true)}
                        allow="autoplay; camera; microphone"
                    />
                </div>
            </div>
        </>
    );
}

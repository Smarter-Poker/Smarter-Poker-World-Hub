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
    const closeButtonRef = useRef(null);
    const panelRef = useRef(null);
    const previousFocusRef = useRef(null);

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

        /*
         * SCROLL LOCK: RESTORE WHAT WAS THERE, DO NOT BLANK IT.
         *
         * This used to end with `document.body.style.overflow = ''` and a note
         * saying "Always clear — don't restore saved value (race condition
         * risk)". Blanking is not the safe option, it is a silent bug: a page
         * that had deliberately locked its own scroll — a poker table, a modal
         * already open beneath this one — got quietly unlocked the moment
         * somebody dismissed a notification popup over it, and started
         * scrolling behind content that was supposed to hold it still.
         *
         * There is no race here to be afraid of. Capture is per-open and the
         * restore is in that same effect's cleanup, so a nested overlay
         * captures 'hidden', restores 'hidden', and the outer one still puts
         * the true original back. Blanking is what loses information; saving
         * and restoring is what preserves it.
         */
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        /*
         * FOCUS: put the keyboard inside the popup and remember where it came
         * from. Note the honest limit of framing a page — once focus enters the
         * iframe, its document owns the Tab order and our keydown listener
         * cannot see it, because events do not cross the frame boundary. What
         * this gets right is the part we CAN control: focus starts on Close
         * rather than wherever it happened to be on the page behind, Tab cycles
         * between Close and the frame rather than walking into the covered
         * page, and focus returns to the control that opened the popup when it
         * closes. A feed rendered natively rather than framed would be fully
         * trappable; that is one more reason to prefer one.
         */
        previousFocusRef.current =
            typeof document !== 'undefined' ? document.activeElement : null;
        const focusFrame = requestAnimationFrame(() => closeButtonRef.current?.focus());

        const handleKey = (e) => {
            if (e.key === 'Escape') {
                onClose();
                return;
            }
            if (e.key !== 'Tab' || !panelRef.current) return;
            const focusables = panelRef.current.querySelectorAll(
                'a[href], button:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])'
            );
            if (focusables.length === 0) return;
            const first = focusables[0];
            const last = focusables[focusables.length - 1];
            // Focus sitting on a non-focusable part of the overlay makes
            // activeElement <body>, and the next Tab would otherwise walk into
            // the page behind. Pull it back in.
            if (!panelRef.current.contains(document.activeElement)) {
                e.preventDefault();
                (e.shiftKey ? last : first).focus();
                return;
            }
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        };
        window.addEventListener('keydown', handleKey);

        return () => {
            document.body.style.overflow = previousOverflow;
            cancelAnimationFrame(focusFrame);
            window.removeEventListener('keydown', handleKey);
            const returnTo = previousFocusRef.current;
            if (returnTo && typeof returnTo.focus === 'function' && returnTo.isConnected) {
                returnTo.focus();
            }
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
                    /*
                     * .fsp-overlay is position: fixed; inset: 0, so this bar
                     * starts at y=0 — underneath the status bar. With
                     * apple-mobile-web-app-status-bar-style: black-translucent
                     * and viewport-fit=cover, that means the clock is painted
                     * directly on top of the title. In Dan's screenshot
                     * "10:46" sits on the word "Settings".
                     *
                     * Fixing UniversalHeader did nothing for this, because
                     * Settings is opened through openOverlay('settings') and
                     * renders in THIS bar, not the page header.
                     *
                     * padding-top after the shorthand, or the shorthand wins.
                     */
                    padding: 8px 16px;
                    padding-top: calc(8px + env(safe-area-inset-top, 0px));
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

                /* NO :hover. Two reasons, and the second is the one that bit
                   players: most of this traffic is a phone, where hover does
                   not exist, so a hover style is a state most people can never
                   see; and iOS SYNTHESISES a hover on first tap, so the old
                   scale(1.1) transform left the close button visibly
                   enlarged and stuck that way after the tap, until something
                   else was tapped. Press feedback is :active, which fires on
                   touch. Keyboard reachability is :focus-visible, and it
                   matters more now that focus starts here on open. */
                .fsp-close-btn:active {
                    background: rgba(255,255,255,0.2);
                    transform: scale(0.95);
                }

                .fsp-close-btn:focus-visible {
                    background: rgba(255,255,255,0.2);
                    outline: 2px solid #0088ff;
                    outline-offset: 2px;
                }

                .fsp-iframe-wrap {
                    flex: 1;
                    position: relative;
                    overflow: hidden;
                    /* Keep the framed page clear of the home indicator. */
                    padding-bottom: env(safe-area-inset-bottom, 0px);
                    box-sizing: border-box;
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

            <div
                ref={panelRef}
                className="fsp-overlay"
                role="dialog"
                aria-modal="true"
                aria-label={title || 'Page Overlay'}
            >
                {/* Top bar with title & close */}
                <div className="fsp-topbar">
                    <span className="fsp-title">{title || ''}</span>
                    <button
                        ref={closeButtonRef}
                        type="button"
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

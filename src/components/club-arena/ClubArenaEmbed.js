/* ═══════════════════════════════════════════════════════════════════════════
   ClubArenaEmbed — Hardened iframe wrapper for the Club Arena SPA
   ═══════════════════════════════════════════════════════════════════════════

   Loads the Club Arena SPA from Vercel inside an iframe. The SPA handles
   ALL routing, auth, and rendering internally. When embedded, the SPA
   hides its own GlobalHeader (detected via window.parent !== window).

   The World Hub provides:
   - UniversalHeader (top nav)
   - Auth token passthrough via postMessage (with retry + ACK)
   - URL synchronization (SPA route → browser address bar)
   - Preconnect hint for faster initial load

   Hardening (March 2026):
   - SPA_ORIGIN is env-var overridable via NEXT_PUBLIC_CLUB_ARENA_ORIGIN
   - Skeleton loading state while iframe loads
   - Error overlay with retry on iframe failure / 15s timeout
   - Auth handshake retry loop with ACK listener
   - URL sync via history.replaceState on SPA route changes
   - Preconnect link injected into document head
   ═══════════════════════════════════════════════════════════════════════════ */

import { useEffect, useRef, useState, useCallback } from 'react';
import Head from 'next/head';
import { supabase } from '../../lib/supabase';

/* ── Origin Configuration ─────────────────────────────────────────────── */
// Enforce relative paths so the Next.js same-origin proxy (rewrites) takes over.
const SPA_ORIGIN = '';
const SPA_BASE = '/hub/club-arena';
const LOAD_TIMEOUT_MS = 15_000;       // 15s before showing error
const AUTH_RETRY_INTERVAL_MS = 2_000; // Retry auth every 2s
const AUTH_MAX_RETRIES = 5;           // Max 5 auth attempts

/**
 * @param {Object} props
 * @param {string} [props.spaRoute] — Route path AFTER /hub/club-arena/
 * @param {Object} [props.query] — Query params to append
 * @param {Object} [props.style] — Additional container styles
 */
export default function ClubArenaEmbed({ spaRoute = '', query = {}, style = {} }) {
    const iframeRef = useRef(null);
    const [iframeSrc, setIframeSrc] = useState(null);
    const [loadState, setLoadState] = useState('loading'); // 'loading' | 'ready' | 'error'
    const [errorMsg, setErrorMsg] = useState('');
    const timeoutRef = useRef(null);
    const authRetryRef = useRef(null);
    const authAckedRef = useRef(false);
    const retryCountRef = useRef(0);

    // Stabilize query object identity to prevent infinite re-renders
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const queryKey = typeof query === 'object' ? JSON.stringify(query) : '';

    /* ── Build iframe URL ─────────────────────────────────────────────── */
    useEffect(() => {
        let path = SPA_BASE;
        if (spaRoute) {
            path += '/' + spaRoute.replace(/^\//, '');
        }

        const parsedQuery = queryKey ? JSON.parse(queryKey) : {};
        // Add the proxy-trigger flag so Next.js rewrites catch the iframe request instead of rendering the Hub page loop
        parsedQuery._embed = '1';
        // Add a cache buster so Vercel Edge Cache doesn't serve a stale index.html via the proxy
        parsedQuery._bust = Date.now().toString();
        
        const params = new URLSearchParams(parsedQuery);
        const qs = params.toString();
        const url = `${SPA_ORIGIN}${path}${qs ? '?' + qs : ''}`;

        setIframeSrc(url);
        setLoadState('loading');
        setErrorMsg('');
        authAckedRef.current = false;
    }, [spaRoute, queryKey]);

    /* ── Timeout detection ────────────────────────────────────────────── */
    useEffect(() => {
        if (loadState !== 'loading') return;

        timeoutRef.current = setTimeout(() => {
            // No stale-closure check needed — cleanup fn clears timeout if loadState changes
            console.error('[ClubArenaEmbed] Iframe load timed out after', LOAD_TIMEOUT_MS, 'ms');
            setLoadState('error');
            setErrorMsg(
                `Club Arena failed to load within ${LOAD_TIMEOUT_MS / 1000}s. ` +
                'This may be a network issue or a Content-Security-Policy block.'
            );
        }, LOAD_TIMEOUT_MS);

        return () => clearTimeout(timeoutRef.current);
    }, [loadState, iframeSrc]);

    /* ── Iframe load / error handlers ─────────────────────────────────── */
    const handleIframeLoad = useCallback(() => {
        clearTimeout(timeoutRef.current);
        setLoadState('ready');
        retryCountRef.current = 0;
        console.log('[ClubArenaEmbed] ✅ Iframe loaded successfully');
    }, []);

    const handleIframeError = useCallback(() => {
        clearTimeout(timeoutRef.current);
        setLoadState('error');
        setErrorMsg('Club Arena failed to load. The server may be down or the connection was refused.');
        console.error('[ClubArenaEmbed] ❌ Iframe error event fired');
    }, []);

    /* ── Retry logic ──────────────────────────────────────────────────── */
    const handleRetry = useCallback(() => {
        retryCountRef.current += 1;
        console.log('[ClubArenaEmbed] Retrying... attempt', retryCountRef.current);
        setLoadState('loading');
        setErrorMsg('');
        authAckedRef.current = false;
        // Force iframe re-mount by appending a cache-busting param
        setIframeSrc(prev => {
            const clean = prev.replace(/[?&]_retry=\d+/g, '');
            const sep = clean.includes('?') ? '&' : '?';
            return `${clean}${sep}_retry=${Date.now()}`;
        });
    }, []);

    /* ── Auth token passthrough with retry + ACK ──────────────────────── */
    useEffect(() => {
        if (loadState !== 'ready') return;

        let attempts = 0;

        const sendAuth = async () => {
            if (authAckedRef.current) return; // Already acknowledged
            if (attempts >= AUTH_MAX_RETRIES) {
                console.warn('[ClubArenaEmbed] Auth handshake: max retries reached without ACK');
                clearInterval(authRetryRef.current); // Stop polling
                return;
            }
            attempts++;
            try {
                const { data: { session } } = await supabase.auth.getSession();
                if (session?.access_token && iframeRef.current?.contentWindow) {
                    iframeRef.current.contentWindow.postMessage({
                        type: 'SMARTER_AUTH_TOKEN',
                        token: session.access_token,
                        refreshToken: session.refresh_token,
                    }, window.location.origin);
                    console.log(`[ClubArenaEmbed] Auth token sent (attempt ${attempts}/${AUTH_MAX_RETRIES})`);
                }
            } catch (e) {
                console.error('[ClubArenaEmbed] Failed to send auth:', e);
            }
        };

        // Send immediately, then retry on interval until ACK
        sendAuth();
        authRetryRef.current = setInterval(sendAuth, AUTH_RETRY_INTERVAL_MS);

        return () => clearInterval(authRetryRef.current);
    }, [loadState]);

    /* ── Message listener: ACK, navigation, URL sync ──────────────────── */
    useEffect(() => {
        const handleMessage = (event) => {
            // Must be strictly from this origin to prevent cross-site scripting
            if (event.origin !== window.location.origin) return;
            const data = event.data;
            if (!data || typeof data !== 'object') return;

            switch (data.type) {
                /* Auth ACK — SPA confirms it received the token */
                case 'SMARTER_AUTH_ACK':
                    authAckedRef.current = true;
                    clearInterval(authRetryRef.current);
                    console.log('[ClubArenaEmbed] ✅ Auth ACK received from SPA');
                    break;

                /* Navigation — SPA wants to break out of iframe */
                case 'CLUB_ARENA_NAVIGATE':
                    if (data.url) window.location.href = data.url;
                    break;

                /* URL Sync — SPA reports its current route */
                case 'CLUB_ARENA_ROUTE_CHANGE':
                    if (data.route && typeof data.route === 'string') {
                        const newPath = `/hub/club-arena/${data.route.replace(/^\//, '')}`;
                        try {
                            window.history.replaceState(null, '', newPath);
                        } catch (_) {
                            /* replaceState can throw if URL is invalid — safe to ignore */
                        }
                    }
                    break;
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, []);

    if (!iframeSrc) return null;

    return (
        <>
            {/* ── Preconnect Hint ──────────────────────────────────────── */}
            <Head>
                {SPA_ORIGIN ? (
                    <>
                        <link rel="preconnect" href={SPA_ORIGIN} crossOrigin="anonymous" />
                        <link rel="dns-prefetch" href={SPA_ORIGIN} />
                    </>
                ) : null}
            </Head>

            <div style={{
                position: 'fixed',
                top: '55px',
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 1,
                background: '#0f172a',
                ...style,
            }}>
                {/* ── Loading Skeleton ─────────────────────────────────── */}
                {loadState === 'loading' && (
                    <div style={overlayStyle}>
                        {/* Skeleton mimicking Club Arena layout */}
                        <div style={skeletonContainer}>
                            {/* Top nav skeleton */}
                            <div style={{ ...skeletonBar, width: '100%', height: '48px', borderRadius: '0' }} />
                            {/* Content area */}
                            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                {/* Hero card skeleton */}
                                <div style={{ ...skeletonBar, width: '100%', height: '140px', borderRadius: '12px' }} />
                                {/* Row of cards */}
                                <div style={{ display: 'flex', gap: '12px' }}>
                                    <div style={{ ...skeletonBar, flex: 1, height: '80px', borderRadius: '8px' }} />
                                    <div style={{ ...skeletonBar, flex: 1, height: '80px', borderRadius: '8px' }} />
                                    <div style={{ ...skeletonBar, flex: 1, height: '80px', borderRadius: '8px' }} />
                                </div>
                                {/* List items */}
                                {[1, 2, 3, 4].map(i => (
                                    <div key={i} style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                        <div style={{ ...skeletonBar, width: '44px', height: '44px', borderRadius: '50%', flexShrink: 0 }} />
                                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                            <div style={{ ...skeletonBar, width: `${60 + i * 8}%`, height: '14px', borderRadius: '4px' }} />
                                            <div style={{ ...skeletonBar, width: `${40 + i * 5}%`, height: '10px', borderRadius: '4px' }} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <p style={{
                            color: '#64748b',
                            marginTop: '20px',
                            fontSize: '13px',
                            fontFamily: 'Inter, system-ui, sans-serif',
                            letterSpacing: '0.02em',
                        }}>
                            Loading Club Arena...
                        </p>
                    </div>
                )}

                {/* ── Error Overlay ────────────────────────────────────── */}
                {loadState === 'error' && (
                    <div style={overlayStyle}>
                        <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
                        <h3 style={{
                            color: '#f1f5f9',
                            margin: '0 0 8px',
                            fontFamily: 'Inter, system-ui, sans-serif',
                        }}>
                            Connection Problem
                        </h3>
                        <p style={{
                            color: '#94a3b8',
                            fontSize: '13px',
                            maxWidth: '360px',
                            textAlign: 'center',
                            lineHeight: '1.5',
                            margin: '0 0 20px',
                            fontFamily: 'Inter, system-ui, sans-serif',
                        }}>
                            {errorMsg}
                        </p>
                        <button onClick={handleRetry} style={retryButtonStyle}>
                            Retry Connection
                        </button>
                        {retryCountRef.current >= 1 && (
                            <p style={{
                                color: '#64748b',
                                fontSize: '11px',
                                marginTop: '12px',
                                fontFamily: 'Inter, system-ui, sans-serif',
                            }}>
                                Attempt {retryCountRef.current} · Target: {SPA_ORIGIN}
                            </p>
                        )}
                    </div>
                )}

                {/* ── Iframe ──────────────────────────────────────────── */}
                <iframe
                    ref={iframeRef}
                    src={iframeSrc}
                    onLoad={handleIframeLoad}
                    onError={handleIframeError}
                    style={{
                        width: '100%',
                        height: '100%',
                        border: 'none',
                        display: 'block',
                        opacity: loadState === 'ready' ? 1 : 0,
                        transition: 'opacity 0.3s ease',
                    }}
                    allow="autoplay; fullscreen; clipboard-write"
                    title="Club Arena"
                />

                <style jsx>{`
                    @keyframes shimmer {
                        0% { background-position: -200% 0; }
                        100% { background-position: 200% 0; }
                    }
                `}</style>
            </div>
        </>
    );
}

/* ── Static Styles ────────────────────────────────────────────────────── */
const overlayStyle = {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#0f172a',
    zIndex: 2,
};

const skeletonContainer = {
    width: '100%',
    maxWidth: '480px',
    overflow: 'hidden',
};

const skeletonBar = {
    background: 'linear-gradient(90deg, #1e293b 25%, #334155 50%, #1e293b 75%)',
    backgroundSize: '200% 100%',
    animation: 'shimmer 1.5s ease-in-out infinite',
};

const retryButtonStyle = {
    background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    padding: '10px 24px',
    fontSize: '14px',
    fontWeight: 600,
    fontFamily: 'Inter, system-ui, sans-serif',
    cursor: 'pointer',
    transition: 'transform 0.15s, box-shadow 0.15s',
    boxShadow: '0 2px 8px rgba(99, 102, 241, 0.3)',
};

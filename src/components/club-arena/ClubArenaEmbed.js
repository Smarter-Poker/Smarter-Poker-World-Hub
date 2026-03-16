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
   - Live settings push (theme/sound/deck changes propagate in real-time)
   - Connection-aware error states (offline vs timeout)
   - Performance telemetry (time-to-interactive tracking)

   Hardening (March 2026):
   - SPA_ORIGIN is env-var overridable via NEXT_PUBLIC_CLUB_ARENA_ORIGIN
   - Skeleton loading state while iframe loads
   - Error overlay with retry on iframe failure / 8s timeout
   - Auth handshake retry loop with ACK listener
   - URL sync via history.replaceState on SPA route changes
   - Preconnect link injected into document head
   ═══════════════════════════════════════════════════════════════════════════ */

import { useEffect, useRef, useState, useCallback } from 'react';
import Head from 'next/head';
import { supabase } from '../../lib/supabase';
import ClubArenaSkeleton from './ClubArenaSkeleton';

/* ── Origin Configuration ─────────────────────────────────────────────── */
// Enforce relative paths so the Next.js same-origin proxy (rewrites) takes over.
const SPA_ORIGIN = '';
const SPA_BASE = '/hub/club-arena';
const LOAD_TIMEOUT_MS = 15_000;        // FIX 3: 15s for iframe HTML to load (generous for slow networks)
const AUTH_RETRY_INTERVAL_MS = 1_500;  // Retry auth every 1.5s
const AUTH_MAX_RETRIES = 10;           // Max 10 auth attempts (15s total window)
const HEARTBEAT_TIMEOUT_MS = 90_000;   // 90s without heartbeat = dead iframe (generous for heavy pages)

/* ── FIX 4: Token Expiry Pre-Check ────────────────────────────────────── */
/**
 * Check if a JWT access token is expired or expiring within 30 seconds.
 * Prevents sending stale tokens to the iframe that App.tsx would reject.
 */
function isTokenExpiringSoon(token) {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return true; // Malformed → treat as expired
        const payload = JSON.parse(atob(parts[1]));
        if (typeof payload.exp !== 'number') return true;
        // 30s buffer — same as App.tsx's isTokenExpired()
        return payload.exp * 1000 < Date.now() + 30_000;
    } catch {
        return true; // Parse error → treat as expired
    }
}

/* ── FIX 6: Consistent Origin Targeting ──────────────────────────────── */
/**
 * Get the correct target origin for postMessage to the iframe.
 * Uses env var override if set, otherwise falls back to window.location.origin
 * (which works when the Next.js proxy rewrite serves the iframe same-origin).
 */
function getTargetOrigin() {
    // env var override for non-proxy setups (e.g. direct club-arena.vercel.app)
    if (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_CLUB_ARENA_ORIGIN) {
        return process.env.NEXT_PUBLIC_CLUB_ARENA_ORIGIN;
    }
    // Same-origin proxy (default) — iframe is served from our domain via rewrites
    return window.location.origin;
}

/* ── Settings keys that bridge World Hub → Club Arena ─────────────────── */
const SETTINGS_KEYS = ['smarter-poker-theme', 'poker-sound-enabled', 'poker-4color-deck'];

/**
 * Reads the current World Hub settings from localStorage.
 * Returns a structured object safe for postMessage serialization.
 */
function readWorldHubSettings() {
    try {
        return {
            theme: localStorage.getItem('smarter-poker-theme') || 'dark',
            soundEnabled: localStorage.getItem('poker-sound-enabled') !== 'false',
            fourColorDeck: localStorage.getItem('poker-4color-deck') === 'true',
        };
    } catch {
        return { theme: 'dark', soundEnabled: true, fourColorDeck: false };
    }
}

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
    const [isOffline, setIsOffline] = useState(false);
    const timeoutRef = useRef(null);
    const authRetryRef = useRef(null);
    const authAckedRef = useRef(false);
    const retryCountRef = useRef(0);
    const heartbeatTimerRef = useRef(null);
    const resetHeartbeatTimerRef = useRef(null);
    const loadStartTimeRef = useRef(null); // Performance telemetry
    const iframeLoadedRef = useRef(false); // FIX 1: Track whether iframe onLoad has fired

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
        setIsOffline(false);
        authAckedRef.current = false;
        iframeLoadedRef.current = false; // FIX 1: Reset on new iframe load
        loadStartTimeRef.current = performance.now(); // Start TTI measurement
    }, [spaRoute, queryKey]);

    /* ── Timeout detection (with offline awareness) ───────────────────── */
    useEffect(() => {
        if (loadState !== 'loading') return;

        timeoutRef.current = setTimeout(() => {
            const offline = typeof navigator !== 'undefined' && !navigator.onLine;
            setIsOffline(offline);
            setLoadState('error');

            if (offline) {
                console.warn('[ClubArenaEmbed] Offline detected during load timeout');
                setErrorMsg('You appear to be offline. Please check your internet connection and try again.');
            } else {
                console.error('[ClubArenaEmbed] Iframe load timed out after', LOAD_TIMEOUT_MS, 'ms');
                setErrorMsg(
                    'Club Arena is taking too long to load. ' +
                    'This may be a network issue — please check your connection and try again.'
                );
            }
        }, LOAD_TIMEOUT_MS);

        return () => clearTimeout(timeoutRef.current);
    }, [loadState, iframeSrc]);

    /* ── Iframe load / error handlers ─────────────────────────────────── */
    const handleIframeLoad = useCallback(() => {
        clearTimeout(timeoutRef.current);
        iframeLoadedRef.current = true; // FIX 1: iframe DOM is now ready
        setLoadState('ready');
        retryCountRef.current = 0;

        // Performance telemetry: iframe load time
        if (loadStartTimeRef.current) {
            const loadMs = Math.round(performance.now() - loadStartTimeRef.current);
            console.log(`[ClubArenaEmbed] ✅ Iframe loaded in ${loadMs}ms`);
            try {
                window.Sentry?.addBreadcrumb?.({
                    category: 'club-arena',
                    message: `Iframe loaded in ${loadMs}ms`,
                    level: 'info',
                    data: { loadMs },
                });
            } catch (_) {}
        } else {
            console.log('[ClubArenaEmbed] ✅ Iframe loaded successfully');
        }
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
        setIsOffline(false);
        authAckedRef.current = false;
        loadStartTimeRef.current = performance.now(); // Reset TTI for retry
        // Force iframe re-mount by appending a cache-busting param
        setIframeSrc(prev => {
            const clean = prev.replace(/[?&]_retry=\d+/g, '');
            const sep = clean.includes('?') ? '&' : '?';
            return `${clean}${sep}_retry=${Date.now()}`;
        });
    }, []);

    /* ── Auto-retry: Recover automatically on tab focus or network return ── */
    // When the Connection Problem overlay is showing and the user returns to
    // the tab or comes back online, retry automatically instead of requiring
    // a manual click. Max 3 auto-retries to prevent infinite retry loops.
    const autoRetryCountRef = useRef(0);
    useEffect(() => {
        if (loadState !== 'error') {
            autoRetryCountRef.current = 0; // Reset on successful load
            return;
        }
        const MAX_AUTO_RETRIES = 3;

        const handleAutoRetry = () => {
            if (loadState !== 'error') return;
            if (autoRetryCountRef.current >= MAX_AUTO_RETRIES) {
                console.warn('[ClubArenaEmbed] Max auto-retries reached — manual retry required');
                return;
            }
            autoRetryCountRef.current++;
            console.log(`[ClubArenaEmbed] Auto-retry #${autoRetryCountRef.current} (${MAX_AUTO_RETRIES} max)`);
            handleRetry();
        };

        const handleVisibility = () => {
            if (document.visibilityState === 'visible') handleAutoRetry();
        };
        const handleOnline = () => handleAutoRetry();

        document.addEventListener('visibilitychange', handleVisibility);
        window.addEventListener('online', handleOnline);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibility);
            window.removeEventListener('online', handleOnline);
        };
    }, [loadState, handleRetry]);

    /* ── Auth token passthrough with retry + ACK ──────────────────────── */
    // FIX 1+4: Auth is sent on a retry loop, but:
    //   - We only postMessage AFTER iframeLoadedRef is true (contentWindow is guaranteed)
    //   - Before onLoad, the iframe's inline script sends ACKs on its own
    //   - We validate token expiry BEFORE sending (FIX 4)
    //   - Max retries extended to 20 (30s window) to accommodate slow networks
    useEffect(() => {
        if (!iframeSrc) return;

        let attempts = 0;
        let noSessionDetected = false;

        const sendAuth = async () => {
            if (authAckedRef.current) return; // Already acknowledged
            if (attempts >= AUTH_MAX_RETRIES) {
                console.warn('[ClubArenaEmbed] Auth handshake: max retries reached without ACK');
                clearInterval(authRetryRef.current); // Stop polling
                // Show user-facing error instead of silent failure
                if (noSessionDetected) {
                    setLoadState('error');
                    setErrorMsg('Your session has expired. Please log in to continue.');
                } else {
                    setLoadState('error');
                    setErrorMsg('Club Arena loaded but is not responding to authentication. Try refreshing.');
                }
                return;
            }
            attempts++;

            // FIX 1: Don't attempt postMessage until iframe onLoad has fired.
            // Before onLoad, contentWindow may be null or point to about:blank.
            // The iframe's inline script handles ACKs independently pre-load.
            if (!iframeLoadedRef.current) {
                console.log(`[ClubArenaEmbed] Waiting for iframe onLoad before sending auth (attempt ${attempts}/${AUTH_MAX_RETRIES})`);
                return; // Continue retrying — iframe hasn't loaded yet
            }

            try {
                const { data: { session } } = await supabase.auth.getSession();
                if (!session) {
                    noSessionDetected = true;
                    console.warn(`[ClubArenaEmbed] No session available (attempt ${attempts}/${AUTH_MAX_RETRIES})`);
                    return; // Continue retrying — session may hydrate
                }

                // FIX 4: Check token expiry BEFORE sending. If expired, force refresh.
                if (isTokenExpiringSoon(session.access_token)) {
                    console.warn('[ClubArenaEmbed] Token expiring soon — requesting refresh before sending');
                    try {
                        const { data: refreshed } = await supabase.auth.refreshSession();
                        if (refreshed?.session) {
                            // Use the refreshed session instead
                            sendTokenToIframe(refreshed.session, attempts);
                            return;
                        }
                    } catch (refreshErr) {
                        console.warn('[ClubArenaEmbed] Token refresh failed, sending current token:', refreshErr);
                    }
                }

                sendTokenToIframe(session, attempts);
            } catch (e) {
                console.error('[ClubArenaEmbed] Failed to send auth:', e);
            }
        };

        /** Helper: actually send the token via postMessage */
        const sendTokenToIframe = (session, attempt) => {
            if (!session.access_token || !iframeRef.current?.contentWindow) {
                console.warn(`[ClubArenaEmbed] Cannot send — contentWindow unavailable (attempt ${attempt}/${AUTH_MAX_RETRIES})`);
                return;
            }
            noSessionDetected = false;
            const globalSettings = readWorldHubSettings();
            // FIX 6: Use getTargetOrigin() for consistent origin targeting
            const targetOrigin = getTargetOrigin();
            iframeRef.current.contentWindow.postMessage({
                type: 'SMARTER_AUTH_TOKEN',
                token: session.access_token,
                refreshToken: session.refresh_token,
                settings: globalSettings,
            }, targetOrigin);
            console.log(`[ClubArenaEmbed] Auth token and settings sent (attempt ${attempt}/${AUTH_MAX_RETRIES})`);
        };

        // Send immediately, then retry on interval until ACK
        sendAuth();
        authRetryRef.current = setInterval(sendAuth, AUTH_RETRY_INTERVAL_MS);

        return () => clearInterval(authRetryRef.current);
    }, [iframeSrc]);

    /* ── Auth Token Refresh — re-send token when Supabase refreshes session ── */
    useEffect(() => {
        if (loadState !== 'ready') return;


        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            if ((event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') && session?.access_token) {
                if (!iframeRef.current?.contentWindow) return;
                const globalSettings = readWorldHubSettings();
                iframeRef.current.contentWindow.postMessage({
                    type: 'SMARTER_AUTH_TOKEN',
                    token: session.access_token,
                    refreshToken: session.refresh_token,
                    settings: globalSettings,
                }, getTargetOrigin());
                console.log('[ClubArenaEmbed] 🔄 Token refreshed — re-sent to SPA');
            }
        });

        return () => subscription?.unsubscribe?.();
    }, [loadState]);

    /* ── Live Settings Push — real-time sync while iframe is open ──────── */
    useEffect(() => {
        if (loadState !== 'ready') return;

        const handleStorageChange = (event) => {
            // Only react to our tracked settings keys
            if (!SETTINGS_KEYS.includes(event.key)) return;
            // Only push if the iframe is authenticated and alive
            if (!authAckedRef.current || !iframeRef.current?.contentWindow) return;

            const updatedSettings = readWorldHubSettings();
            try {
                iframeRef.current.contentWindow.postMessage({
                    type: 'SMARTER_SETTINGS_UPDATE',
                    settings: updatedSettings,
                }, getTargetOrigin());
                console.log(`[ClubArenaEmbed] Live settings push: ${event.key} changed`);
            } catch (e) {
                /* best effort — ignore postMessage errors */
            }
        };

        window.addEventListener('storage', handleStorageChange);
        return () => window.removeEventListener('storage', handleStorageChange);
    }, [loadState]);

    /* ── Performance Telemetry: Track Time-to-Interactive (Auth ACK) ──── */
    useEffect(() => {
        if (loadState !== 'ready') return;

        // We listen for AUTH_ACK here specifically for TTI measurement
        // (The main message handler also catches AUTH_ACK for the retry loop)
        const measureTTI = (event) => {
            if (event.origin !== getTargetOrigin() && event.origin !== window.location.origin) return;
            if (event.data?.type !== 'SMARTER_AUTH_ACK') return;

            if (loadStartTimeRef.current) {
                const ttiMs = Math.round(performance.now() - loadStartTimeRef.current);
                console.log(`[ClubArenaEmbed] 📊 Time-to-Interactive: ${ttiMs}ms`);
                try {
                    window.Sentry?.addBreadcrumb?.({
                        category: 'club-arena-perf',
                        message: `TTI: ${ttiMs}ms`,
                        level: 'info',
                        data: { ttiMs },
                    });
                } catch (_) {}
                loadStartTimeRef.current = null; // Prevent double-logging
            }
        };

        window.addEventListener('message', measureTTI);
        return () => window.removeEventListener('message', measureTTI);
    }, [loadState]);

    /* ── Message listener: ACK, navigation, URL sync, heartbeat ─────── */
    useEffect(() => {
        const handleMessage = (event) => {
            // Must be strictly from this origin to prevent cross-site scripting
            if (event.origin !== getTargetOrigin() && event.origin !== window.location.origin) return;
            const data = event.data;
            if (!data || typeof data !== 'object') return;

            switch (data.type) {
                /* Auth ACK — SPA confirms it received the token */
                case 'SMARTER_AUTH_ACK':
                    authAckedRef.current = true;
                    clearInterval(authRetryRef.current);
                    // Sentry breadcrumb for observability
                    try { window.Sentry?.addBreadcrumb?.({ category: 'club-arena', message: 'Auth ACK received', level: 'info' }); } catch (_) {}
                    console.log('[ClubArenaEmbed] ✅ Auth ACK received from SPA');
                    break;

                /* Navigation — SPA wants to break out of iframe */
                /* Handles both the legacy 'NAVIGATE' and canonical 'CLUB_ARENA_NAVIGATE' types */
                case 'NAVIGATE':
                case 'CLUB_ARENA_NAVIGATE':
                    if (data.url) window.location.href = data.url;
                    else if (data.path) window.location.href = data.path;
                    break;

                /* URL Sync — SPA reports its current route */
                case 'CLUB_ARENA_ROUTE_CHANGE':
                    if (data.route && typeof data.route === 'string') {
                        // FIX: Sanitize route to prevent path traversal (../) or injection
                        const sanitizedRoute = data.route
                            .replace(/^\/+/, '')       // strip leading slashes
                            .replace(/\.\.\//g, '')    // strip path traversal sequences
                            .replace(/\.\.$/g, '')     // strip trailing ..
                            .split('?')[0]             // strip query params from SPA
                            .split('#')[0];            // strip hash fragments
                        if (!sanitizedRoute || sanitizedRoute.includes('..')) break; // extra safety
                        const newPath = `/hub/club-arena/${sanitizedRoute}`;
                        try {
                            window.history.replaceState(null, '', newPath);
                        } catch (e) {
                            console.warn('[ClubArenaEmbed] URL sync failed:', e);
                        }
                    }
                    break;

                /* Heartbeat — SPA is alive, reset the dead-iframe timer */
                case 'CLUB_ARENA_HEARTBEAT':
                    // Use ref to always call the latest version of resetHeartbeatTimer
                    // (avoids stale closure since this useEffect has [] deps)
                    resetHeartbeatTimerRef.current?.();
                    break;
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, []);

    /* ── Heartbeat dead-iframe detection ──────────────────────────────── */
    const resetHeartbeatTimer = useCallback(() => {
        clearTimeout(heartbeatTimerRef.current);
        heartbeatTimerRef.current = setTimeout(() => {
            // Only trigger if the iframe was previously healthy AND tab is visible
            // Background tabs don't fire timers reliably, causing false positives
            if (loadState === 'ready' && authAckedRef.current && document.visibilityState === 'visible') {
                console.warn('[ClubArenaEmbed] Heartbeat timeout — SPA may be unresponsive');
                try { window.Sentry?.addBreadcrumb?.({ category: 'club-arena', message: 'Heartbeat timeout — iframe unresponsive', level: 'warning' }); } catch (_) {}
                setLoadState('error');
                setErrorMsg('Club Arena appears to be unresponsive. Click Retry to reconnect.');
            }
        }, HEARTBEAT_TIMEOUT_MS);
    }, [loadState]);

    // Keep the ref in sync so the [] deps message handler always has the latest function
    useEffect(() => {
        resetHeartbeatTimerRef.current = resetHeartbeatTimer;
    }, [resetHeartbeatTimer]);

    // Start heartbeat monitoring once the iframe is ready and auth is complete
    useEffect(() => {
        if (loadState === 'ready' && authAckedRef.current) {
            resetHeartbeatTimer();
        }
        return () => clearTimeout(heartbeatTimerRef.current);
    }, [loadState, resetHeartbeatTimer]);

    // Pause/resume heartbeat when tab visibility changes
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible' && loadState === 'ready' && authAckedRef.current) {
                // Tab became visible again — reset heartbeat timer (gives SPA time to resume)
                resetHeartbeatTimerRef.current?.();
            } else if (document.visibilityState === 'hidden') {
                // Tab hidden — pause heartbeat timeout (background tabs don't fire timers)
                clearTimeout(heartbeatTimerRef.current);
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [loadState]);

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
                {/* ── High-Fidelity Loading Skeleton ─────────────────────────────────── */}
                {loadState === 'loading' && (
                    <div style={{...overlayStyle, padding: 0}}>
                        <ClubArenaSkeleton />
                    </div>
                )}

                {loadState === 'error' && (() => {
                    const isSessionExpired = errorMsg.includes('session') || errorMsg.includes('log in');
                    return (
                    <div style={overlayStyle}>
                        <div style={{ fontSize: '48px', marginBottom: '16px' }}>
                            {isOffline ? '📡' : isSessionExpired ? '🔒' : '⚠️'}
                        </div>
                        <h3 style={{
                            color: '#f1f5f9',
                            margin: '0 0 8px',
                            fontFamily: 'Inter, system-ui, sans-serif',
                        }}>
                            {isOffline ? 'You\'re Offline' : isSessionExpired ? 'Session Expired' : 'Connection Problem'}
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

                        {isSessionExpired ? (
                            <button onClick={() => { window.location.href = '/auth/login'; }} style={retryButtonStyle}>
                                Log In
                            </button>
                        ) : (
                            <button onClick={handleRetry} style={retryButtonStyle}>
                                {isOffline ? 'Try Again' : 'Retry Connection'}
                            </button>
                        )}

                        {/* ── Return to Hub Escape Hatch ── */}
                        <button
                            onClick={() => { window.location.href = '/hub'; }}
                            style={returnToHubStyle}
                        >
                            ← Return to Hub
                        </button>

                        {retryCountRef.current >= 1 && (
                            <p style={{
                                color: '#64748b',
                                fontSize: '11px',
                                marginTop: '8px',
                                fontFamily: 'Inter, system-ui, sans-serif',
                            }}>
                                Attempt {retryCountRef.current}
                            </p>
                        )}
                    </div>
                    );
                })()}

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

const returnToHubStyle = {
    background: 'transparent',
    color: '#94a3b8',
    border: '1px solid rgba(148, 163, 184, 0.2)',
    borderRadius: '8px',
    padding: '8px 20px',
    fontSize: '13px',
    fontWeight: 500,
    fontFamily: 'Inter, system-ui, sans-serif',
    cursor: 'pointer',
    marginTop: '12px',
    transition: 'color 0.15s, border-color 0.15s',
};

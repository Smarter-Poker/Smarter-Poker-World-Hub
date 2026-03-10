/* ═══════════════════════════════════════════════════════════════════════════
   ClubArenaEmbed — Iframe wrapper that loads the Club Arena SPA
   ═══════════════════════════════════════════════════════════════════════════

   This component replaces the standalone World Hub Club Arena pages with
   an iframe that loads the canonical Club Arena SPA from Vercel.

   The SPA handles ALL routing, auth, and rendering internally.
   When embedded in an iframe, the SPA hides its own GlobalHeader
   (detected via window.parent !== window).

   The World Hub provides:
   - UniversalHeader (top nav)
   - Auth token passthrough via postMessage
   ═══════════════════════════════════════════════════════════════════════════ */

import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';

const SPA_ORIGIN = 'https://club-arena.vercel.app';
const SPA_BASE = '/hub/club-arena';

/**
 * @param {Object} props
 * @param {string} [props.spaRoute] — Route path AFTER /hub/club-arena/ (e.g. "clubs/abc123", "leaderboard")
 * @param {Object} [props.query] — Query params to append
 * @param {string} [props.style] — Additional container styles
 */
export default function ClubArenaEmbed({ spaRoute = '', query = {}, style = {} }) {
    const iframeRef = useRef(null);
    const [iframeSrc, setIframeSrc] = useState(null);

    useEffect(() => {
        // Build the SPA URL
        let path = SPA_BASE;
        if (spaRoute) {
            path += '/' + spaRoute.replace(/^\//, '');
        }

        // Append query params
        const params = new URLSearchParams(query);
        const qs = params.toString();
        const url = `${SPA_ORIGIN}${path}${qs ? '?' + qs : ''}`;

        setIframeSrc(url);
    }, [spaRoute, query]);

    // Pass auth token to iframe once loaded
    useEffect(() => {
        const sendAuth = async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession();
                if (session?.access_token && iframeRef.current?.contentWindow) {
                    iframeRef.current.contentWindow.postMessage({
                        type: 'SMARTER_AUTH_TOKEN',
                        token: session.access_token,
                        refreshToken: session.refresh_token,
                    }, SPA_ORIGIN);
                }
            } catch (e) {
                console.error('[ClubArenaEmbed] Failed to send auth:', e);
            }
        };

        const handleLoad = () => sendAuth();
        const iframe = iframeRef.current;
        if (iframe) {
            iframe.addEventListener('load', handleLoad);
        }

        return () => {
            if (iframe) iframe.removeEventListener('load', handleLoad);
        };
    }, [iframeSrc]);

    // Listen for navigation requests from the SPA
    useEffect(() => {
        const handleMessage = (event) => {
            if (event.origin !== SPA_ORIGIN) return;

            if (event.data?.type === 'CLUB_ARENA_NAVIGATE') {
                // SPA wants to navigate to a World Hub route
                window.location.href = event.data.url;
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, []);

    if (!iframeSrc) return null;

    return (
        <iframe
            ref={iframeRef}
            src={iframeSrc}
            style={{
                width: '100%',
                height: 'calc(100vh - 55px)', // Below the 55px UniversalHeader
                border: 'none',
                display: 'block',
                position: 'fixed',
                top: '55px',
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 1,
                ...style,
            }}
            allow="autoplay; fullscreen; clipboard-write"
            title="Club Arena"
        />
    );
}

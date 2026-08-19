/**
 * ChunkLoadRecovery — Automatic recovery from stale JavaScript chunks
 *
 * After every Vercel deploy, old JS chunks get 404s. If a user has the
 * site open during a deploy, their next navigation will crash with:
 *   "ChunkLoadError: Loading chunk X failed"
 *
 * This component:
 *   1. Catches ChunkLoadError from Next.js dynamic imports + route changes
 *   2. Shows a brief "Updating..." toast
 *   3. Automatically reloads the page to fetch fresh chunks
 *   4. Prevents infinite reload loops (max 2 reloads per 60 seconds)
 *
 * Usage in _app.js:
 *   <ChunkLoadRecovery />
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
// isChunkError / canAutoReload moved to src/lib/chunkRecovery.js so the error
// boundaries can share the SAME detection and the SAME reload budget. A chunk
// error caught by a boundary never reaches the window listeners below, which
// is exactly the case where the user is looking at a dead section.
import { isChunkError, canAutoReload } from '../../lib/chunkRecovery';

export default function ChunkLoadRecovery() {
    const router = useRouter();
    const [showBanner, setShowBanner] = useState(false);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        // ═══════════════════════════════════════════════════════════════════════
        // CATCH CHUNK ERRORS FROM window.error
        // These fire when dynamic import() calls fail (stale chunks after deploy)
        // ═══════════════════════════════════════════════════════════════════════
        const handleError = (event) => {
            if (!isChunkError(event?.error || event)) return;

            console.warn('[ChunkLoadRecovery] 🔄 Stale chunk detected! Reloading...');

            if (canAutoReload()) {
                setShowBanner(true);
                setTimeout(() => {
                    window.location.reload();
                }, 1500); // Brief delay so user sees the message
            } else {
                console.warn('[ChunkLoadRecovery] Max reloads reached. Manual refresh needed.');
            }
        };

        // ═══════════════════════════════════════════════════════════════════════
        // CATCH CHUNK ERRORS FROM unhandledrejection
        // Dynamic imports reject their promise when the chunk 404s
        // ═══════════════════════════════════════════════════════════════════════
        const handleRejection = (event) => {
            if (!isChunkError(event?.reason)) return;

            console.warn('[ChunkLoadRecovery] 🔄 Chunk load promise rejected! Reloading...');

            if (canAutoReload()) {
                setShowBanner(true);
                setTimeout(() => {
                    window.location.reload();
                }, 1500);
            }
        };

        // ═══════════════════════════════════════════════════════════════════════
        // CATCH NEXT.JS ROUTE CHANGE ERRORS
        // When navigating to a page whose chunk is stale
        // ═══════════════════════════════════════════════════════════════════════
        const handleRouteError = (err, url) => {
            if (!isChunkError(err)) return;

            console.warn(`[ChunkLoadRecovery] 🔄 Route change to ${url} failed (stale chunk). Reloading...`);

            if (canAutoReload()) {
                setShowBanner(true);
                setTimeout(() => {
                    // Navigate using window.location to force fresh chunk fetch
                    window.location.href = url;
                }, 1500);
            }
        };

        window.addEventListener('error', handleError);
        window.addEventListener('unhandledrejection', handleRejection);
        router.events?.on('routeChangeError', handleRouteError);

        return () => {
            window.removeEventListener('error', handleError);
            window.removeEventListener('unhandledrejection', handleRejection);
            router.events?.off('routeChangeError', handleRouteError);
        };
    }, [router]);

    if (!showBanner) return null;

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 999999,
            padding: '14px 24px',
            background: 'linear-gradient(135deg, #0d1117 0%, #161b22 100%)',
            borderBottom: '2px solid #1877f2',
            color: '#e4e6eb',
            fontSize: 14,
            fontWeight: 500,
            fontFamily: '"Segoe UI", system-ui, sans-serif',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            animation: 'chunkBannerSlideDown 0.3s ease-out',
        }}>
            <div style={{
                width: 20, height: 20, border: '2px solid #1877f2',
                borderTop: '2px solid transparent', borderRadius: '50%',
                animation: 'chunkSpinner 0.8s linear infinite',
            }} />
            <span>
                New version detected — updating automatically...
            </span>

            <style>{`
        @keyframes chunkBannerSlideDown {
          from { opacity: 0; transform: translateY(-100%); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes chunkSpinner {
          to { transform: rotate(360deg); }
        }
      `}</style>
        </div>
    );
}

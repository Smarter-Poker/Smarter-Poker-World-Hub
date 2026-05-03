/**
 * reelsPrefetcher.js — Byte-range prefetch for native MP4 reels
 * Fires a Range: bytes=0-1.5MB request so the browser caches the moov atom.
 */
const PREFETCH_BYTES = 1_500_000;
const done = new Set();

export function prefetchVideoStart(url) {
    if (!url || done.has(url)) return;
    if (url.includes('youtube.com') || url.includes('youtu.be')) return;
    if (!url.includes('supabase.co')) return;
    done.add(url);
    fetch(url, {
        headers: { Range: `bytes=0-${PREFETCH_BYTES}` },
        priority: 'low',
        credentials: 'omit',
        mode: 'no-cors',
    }).catch(() => { done.delete(url); });
}

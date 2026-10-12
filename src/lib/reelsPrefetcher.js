/** Explicit, bounded adjacent-native warmup. No playback or retry authority. */
const PREFETCH_BYTES = 1_500_000;
const MAX_REMEMBERED = 32;
const MAX_INFLIGHT = 2;
const warmed = new Set();
const inflight = new Map();
const noop = () => {};

function trustedMediaUrl(value) {
    try {
        const origin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || '');
        const url = new URL(value);
        if (origin.protocol !== 'https:' || origin.username || origin.password || origin.port
            || origin.pathname !== '/' || origin.search || origin.hash
            || url.protocol !== 'https:' || url.origin !== origin.origin
            || url.username || url.password || url.port || url.search || url.hash) return null;
        const path = decodeURIComponent(url.pathname);
        if (!/^\/storage\/v1\/object\/public\/(?:social-media\/(?:reels|videos)|stories\/stories|live-recordings)\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/[^/]+$/i.test(path)
            || path.includes('\\') || /[\u0000-\u001f]/.test(path)) return null;
        return url.href;
    } catch { return null; }
}

export function prefetchVideoStart(value) {
    const url = trustedMediaUrl(value);
    if (!url || warmed.has(url) || inflight.has(url) || inflight.size >= MAX_INFLIGHT) return noop;
    const controller = new AbortController();
    inflight.set(url, controller);
    // One request has a finite lifetime even while its clip remains selected.
    const deadline = setTimeout(() => controller.abort(), 8000);
    const cleanup = () => {
        clearTimeout(deadline);
        controller.abort();
        if (inflight.get(url) === controller) inflight.delete(url);
    };
    Promise.resolve().then(() => {
        if (controller.signal.aborted) return null;
        return fetch(url, {
            headers: { Range: `bytes=0-${PREFETCH_BYTES - 1}` },
            priority: 'low', credentials: 'omit', mode: 'cors', signal: controller.signal,
        });
    }).then(async (response) => {
        if (!response) return;
        const range = response.headers?.get('content-range')?.match(/^bytes 0-(\d+)\/(?:\d+|\*)$/i);
        if (controller.signal.aborted || response.type === 'opaque' || response.status !== 206
            || !range || Number(range[1]) >= PREFETCH_BYTES) {
            await response.body?.cancel?.();
            return;
        }
        // Bound consumption even if the remote response misstates its range.
        const reader = response.body?.getReader?.();
        if (!reader) return;
        let bytes = 0;
        while (!controller.signal.aborted) {
            const chunk = await reader.read();
            if (chunk.done) break;
            bytes += chunk.value.byteLength;
            if (bytes > PREFETCH_BYTES) { await reader.cancel(); return; }
        }
        if (controller.signal.aborted || bytes !== Number(range[1]) + 1) return;
        warmed.add(url);
        while (warmed.size > MAX_REMEMBERED) warmed.delete(warmed.values().next().value);
    }).catch(() => {}).finally(() => {
        clearTimeout(deadline);
        if (inflight.get(url) === controller) inflight.delete(url);
    });
    return cleanup;
}

/**
 * exportCanvas — one shared image-export path for every sandbox card.
 * ═══════════════════════════════════════════════════════════════════════════
 * `<a download>` pointed at a data: URL silently does NOTHING on iOS Safari,
 * which is ~90% of this product's traffic. This module instead:
 *
 *   1. canvas.toBlob()
 *   2. navigator.share({ files }) when the Web Share Level 2 API can take it
 *   3. otherwise a blob: URL — <a download> on desktop, new tab on iOS so the
 *      user can long-press → "Add to Photos"
 *
 * Consumers: ExportCard, SessionReport (and SandboxComponents' ShareHandModal).
 */

/** Device-pixel-ratio aware canvas factory. Draw in CSS px; output is retina. */
export function createHiDPICanvas(width, height, maxScale = 2) {
    const canvas = document.createElement('canvas');
    const dpr = Math.max(1, Math.min(maxScale, (typeof window !== 'undefined' && window.devicePixelRatio) || 1));
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.scale(dpr, dpr);
    return { canvas, ctx, dpr };
}

/** Promise wrapper around canvas.toBlob with a toDataURL fallback. */
export function canvasToBlob(canvas, type = 'image/png', quality) {
    return new Promise((resolve, reject) => {
        if (!canvas) { reject(new Error('Canvas unavailable')); return; }
        if (typeof canvas.toBlob === 'function') {
            canvas.toBlob(blob => {
                if (blob) resolve(blob);
                else reject(new Error('Could not encode the image'));
            }, type, quality);
            return;
        }
        try {
            const dataUrl = canvas.toDataURL(type, quality);
            const [meta, b64] = dataUrl.split(',');
            const mime = /:(.*?);/.exec(meta)?.[1] || type;
            const bin = atob(b64);
            const buf = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
            resolve(new Blob([buf], { type: mime }));
        } catch (e) {
            reject(e instanceof Error ? e : new Error('Could not encode the image'));
        }
    });
}

function isIOS() {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent || '';
    return /iPad|iPhone|iPod/.test(ua)
        || (/Macintosh/.test(ua) && typeof document !== 'undefined' && 'ontouchend' in document);
}

/**
 * Export a canvas as an image the user can actually keep.
 *
 * @returns {Promise<{ method:'share'|'download'|'newtab', blob:Blob, url:string|null, hint:string }>}
 *   `hint` is user-facing copy the caller should toast.
 */
export async function exportCanvas(canvas, filename = 'smarter-poker.png', shareMeta = {}) {
    const blob = await canvasToBlob(canvas, 'image/png');
    const file = typeof File === 'function' ? new File([blob], filename, { type: 'image/png' }) : null;

    // 1 — native share sheet (best on mobile: "Save Image" lives inside it)
    if (file && typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        let canShare = true;
        try { canShare = navigator.canShare ? navigator.canShare({ files: [file] }) : true; } catch (e) { canShare = false; }
        if (canShare) {
            try {
                await navigator.share({ files: [file], title: shareMeta.title || 'Smarter.Poker', text: shareMeta.text || '' });
                return { method: 'share', blob, url: null, hint: 'Shared' };
            } catch (e) {
                // AbortError = user dismissed the sheet; anything else falls through.
                if (e?.name === 'AbortError') return { method: 'share', blob, url: null, hint: '' };
                console.warn('[exportCanvas] share failed, falling back:', e?.message || e);
            }
        }
    }

    const url = URL.createObjectURL(blob);
    const revoke = () => { try { URL.revokeObjectURL(url); } catch (e) { /* noop */ } };

    // 2 — iOS ignores the download attribute; open the blob so it can be saved.
    if (isIOS()) {
        const win = window.open(url, '_blank');
        setTimeout(revoke, 60000);
        if (!win) {
            return { method: 'newtab', blob, url, hint: 'Allow pop-ups, then long-press the image to save it' };
        }
        return { method: 'newtab', blob, url, hint: 'Long-press the image to save it to Photos' };
    }

    // 3 — desktop / Android: a real download.
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(revoke, 60000);
    return { method: 'download', blob, url, hint: 'Image saved' };
}

/** Object URL for an in-modal <img> preview. Caller must revoke it. */
export async function canvasPreviewUrl(canvas) {
    const blob = await canvasToBlob(canvas, 'image/png');
    return URL.createObjectURL(blob);
}

/** Rounded rectangle path helper shared by the card renderers. */
export function roundRect(ctx, x, y, w, h, r) {
    const rad = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
}

/** Word-wraps `text`, returns the y coordinate after the last drawn line. */
export function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 3) {
    const words = String(text || '').split(/\s+/).filter(Boolean);
    let line = '';
    let lines = 0;
    let cursor = y;
    for (let i = 0; i < words.length; i++) {
        const test = line ? `${line} ${words[i]}` : words[i];
        if (ctx.measureText(test).width > maxWidth && line) {
            ctx.fillText(line, x, cursor);
            cursor += lineHeight;
            lines++;
            line = words[i];
            if (lines >= maxLines) return cursor;
        } else {
            line = test;
        }
    }
    if (line) { ctx.fillText(line, x, cursor); cursor += lineHeight; }
    return cursor;
}

/**
 * Draws a poker card face (white with a red/black rank+suit) at CSS pixel size.
 * `code` is a 2-char card like 'Ah'. Returns the x after the card + gap.
 */
export function drawPlayingCard(ctx, code, x, y, w = 46, h = 64) {
    const rank = String(code || '')[0] || '?';
    const suit = String(code || '')[1] || '';
    const suitGlyph = { h: '♥', d: '♦', c: '♣', s: '♠' }[String(suit).toLowerCase()] || '';
    const isRed = ['h', 'd'].includes(String(suit).toLowerCase());

    ctx.save();
    roundRect(ctx, x, y, w, h, 6);
    ctx.fillStyle = '#F7F7F8';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = isRed ? '#D33A3A' : '#1B1C1E';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.font = `800 ${Math.round(h * 0.36)}px Inter, -apple-system, Helvetica, Arial, sans-serif`;
    ctx.fillText(rank === 'T' ? '10' : rank, x + w / 2, y + h * 0.46);
    ctx.font = `700 ${Math.round(h * 0.3)}px Inter, -apple-system, Helvetica, Arial, sans-serif`;
    ctx.fillText(suitGlyph, x + w / 2, y + h * 0.82);
    ctx.restore();

    return x + w + 8;
}

export default exportCanvas;

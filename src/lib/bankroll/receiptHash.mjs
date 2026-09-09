/**
 * IS THIS THE RECEIPT I ALREADY FILED?
 *
 * A player photographs the same tournament receipt twice: once at the table
 * and once emptying a pocket that night. Nothing stopped that becoming two
 * bankroll_receipts rows and, filed, two ledger entries and a doubled buy-in.
 *
 * A difference hash answers it. The scan is drawn into a 9x8 grayscale grid
 * and each pixel is compared with its right neighbour: 64 bits, 16 hex
 * characters, stable under the resolution, compression and small
 * lighting or angle changes that separate two photographs of one piece of
 * paper, and unstable across different paper.
 *
 * It never drops anything. A near match is shown to the user with what the
 * earlier scan was, and they decide. A false positive costs a sentence; a
 * false negative costs nothing more than today.
 */

/** Bits of the 64 that may differ and still be the same receipt. */
export const DUPLICATE_MAX_DISTANCE = 8;

/**
 * The hash of a 9x8 luma grid, row-major.
 *
 * Pure, so the rule is tested without a canvas.
 *
 * @param {ArrayLike<number>} luma 72 brightness values
 * @returns {string} 16 lowercase hex characters
 */
export function hashFromLuma(luma, width = 9, height = 8) {
    if (!luma || luma.length < width * height) throw new Error('hash-needs-9x8-luma');
    let bits = '';
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width - 1; x++) {
            bits += luma[y * width + x] > luma[y * width + x + 1] ? '1' : '0';
        }
    }
    let hex = '';
    for (let i = 0; i < bits.length; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
    return hex;
}

/**
 * How many of the 64 bits differ. Infinity when the two are not comparable,
 * so an unknown hash is never mistaken for an identical one.
 */
export function hammingDistance(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return Infinity;
    if (a.length !== b.length || a.length === 0) return Infinity;
    let d = 0;
    for (let i = 0; i < a.length; i++) {
        const x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
        if (!Number.isFinite(x)) return Infinity;
        d += (x & 1) + ((x >> 1) & 1) + ((x >> 2) & 1) + ((x >> 3) & 1);
    }
    return d;
}

/** The stored receipt this scan probably is, or null. */
export function duplicateOf(hash, receipts) {
    if (!hash || !Array.isArray(receipts)) return null;
    let best = null;
    let bestDistance = Infinity;
    for (const receipt of receipts) {
        if (!receipt || !receipt.image_hash) continue;
        const d = hammingDistance(hash, receipt.image_hash);
        if (d <= DUPLICATE_MAX_DISTANCE && d < bestDistance) { best = receipt; bestDistance = d; }
    }
    return best;
}

/**
 * The hash of an image blob. Browser only; anywhere without createImageBitmap
 * this returns null and the duplicate check simply does not run, which is the
 * behaviour every scan had before this module.
 *
 * @returns {Promise<string|null>}
 */
export async function perceptualHash(blob) {
    if (!blob || typeof createImageBitmap !== 'function' || typeof document === 'undefined') return null;
    try {
        const bitmap = await createImageBitmap(blob);
        const canvas = document.createElement('canvas');
        canvas.width = 9;
        canvas.height = 8;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(bitmap, 0, 0, 9, 8);
        if (bitmap.close) bitmap.close();
        const { data } = ctx.getImageData(0, 0, 9, 8);
        const luma = new Array(72);
        for (let i = 0; i < 72; i++) {
            const p = i * 4;
            luma[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
        }
        return hashFromLuma(luma, 9, 8);
    } catch (_e) {
        return null;
    }
}

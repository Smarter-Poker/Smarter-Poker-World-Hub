/**
 * THE OCR ENGINE, SHIPPED FROM OUR OWN ORIGIN
 *
 * Tesseract (Apache-2.0), compiled to WebAssembly, served from /tesseract on
 * this site. Not a CDN, not an API, not a model. A receipt photographed on a
 * phone is read on that phone; the picture never leaves it.
 *
 * WHAT THIS COSTS AND WHY IT IS WORTH IT
 * About 6.8 MB is fetched the first time a player opens the scanner: a 109 KB
 * worker, one 3.7 MB core (whichever of the three the device's WebAssembly
 * support calls for, never all three) and the 2.9 MB English model. It is
 * then held in the browser cache and in IndexedDB. After that the feature
 * works with no network at all, which is the situation in most poker rooms,
 * and costs nothing per scan for as long as the site exists.
 *
 * WHY THE PATHS ARE SPELLED OUT
 * tesseract.js defaults to unpkg and jsdelivr. Left alone it would put a
 * player's tax form through somebody else's CDN and break the day that CDN
 * did. Every asset path below is ours, and scripts/copy-tesseract-assets.mjs
 * puts the files there at build time.
 *
 * THE ENGINE IS LOADED ONCE, LAZILY
 * Nothing here runs until a scan starts, so the 5.8 MB is not on the critical
 * path of any page. The worker is kept alive between scans, because starting
 * one costs about a second and players scan receipts in batches.
 */

/**
 * The engine version, IN THE URL, and why that matters more than it looks.
 *
 * Without it every upgrade would mean a different file behind the same
 * /tesseract/worker.min.js, so the assets could only be cached with
 * revalidation. A browser in a poker room cannot revalidate. Measured on
 * 2026-09-09 against production, with a warmed cache taken offline: the read
 * failed in 5 ms on importScripts, and "works offline" was a claim in a
 * commit message rather than a fact.
 *
 * With the version in the path a URL's bytes never change, so vercel.json
 * serves it `immutable` and a warmed cache is usable with no network at all.
 *
 * scripts/copy-tesseract-assets.mjs reads the SAME number out of
 * package.json, and __tests__/the-engine-works-with-no-signal.law.test.mjs
 * fails the build if the two ever drift. A mismatch is not cosmetic: it is a
 * 404 for every asset, which is how the reader shipped broken once already.
 */
export const TESSERACT_VERSION = '7.0.0';

/** Where the copy script puts the engine. Same origin, always. */
export const TESSERACT_BASE = `/tesseract/${TESSERACT_VERSION}`;

export const TESSERACT_ASSETS = {
    workerPath: `${TESSERACT_BASE}/worker.min.js`,
    corePath: `${TESSERACT_BASE}/`,
    langPath: `${TESSERACT_BASE}/lang`,
};

/**
 * Characters worth recognising on a receipt.
 *
 * Restricting the alphabet is the cheapest accuracy win available: it stops
 * the engine offering a Cyrillic lookalike for a digit in a total, and money
 * read wrong is the failure that matters here.
 */
export const RECEIPT_CHARSET =
    '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz$.,:/#-+()&\'* ';

let workerPromise = null;

/**
 * The shared worker, started on first use.
 *
 * `createWorker` is imported dynamically so tesseract.js is code-split: a
 * player who never opens the scanner never downloads it.
 */
async function getWorker(onProgress) {
    if (workerPromise) return workerPromise;

    workerPromise = (async () => {
        const { createWorker } = await import('tesseract.js');
        const worker = await createWorker('eng', 1, {
            workerPath: TESSERACT_ASSETS.workerPath,
            corePath: TESSERACT_ASSETS.corePath,
            langPath: TESSERACT_ASSETS.langPath,
            // The traineddata ships gzipped; unzipped it is over 10 MB.
            gzip: true,
            // 'write' reads the IndexedDB cache first and only fetches when
            // it is empty. 'refresh' would re-download 2.9 MB on every scan.
            cacheMethod: 'write',
            logger: (m) => {
                if (!onProgress || !m) return;
                if (m.status === 'recognizing text') onProgress(Math.round((m.progress || 0) * 100));
            },
        });
        await worker.setParameters({
            tessedit_char_whitelist: RECEIPT_CHARSET,
            // A receipt is a single block of text in reading order. Telling
            // the engine that beats letting it hunt for columns on a crooked
            // phone photograph.
            tessedit_pageseg_mode: '6',
            preserve_interword_spaces: '1',
        });
        return worker;
    })();

    try {
        return await workerPromise;
    } catch (err) {
        // A failed start must not poison every later attempt.
        workerPromise = null;
        throw err;
    }
}

/** Let the engine go. Called when the scanner closes. */
export async function releaseOcr() {
    const pending = workerPromise;
    workerPromise = null;
    if (!pending) return;
    try {
        const worker = await pending;
        await worker.terminate();
    } catch (_err) {
        // Terminating a worker that never started is not a failure.
    }
}

/** Has the engine been started in this tab? */
export function isOcrLoaded() {
    return workerPromise !== null;
}

export class OcrUnavailableError extends Error {
    constructor(cause) {
        super('ocr-unavailable');
        this.name = 'OcrUnavailableError';
        this.cause = cause;
    }
}

/**
 * Read the text off an image.
 *
 * @param {Blob|HTMLCanvasElement|ImageData|string} image
 * @param {object}   [options]
 * @param {function} [options.onProgress] 0-100 while recognising
 * @returns {Promise<{text: string, confidence: number, words: number}>}
 *
 * `confidence` is the engine's own average over the words it read, 0-100. It
 * says how legible the photograph was, which is a different question from how
 * sure the parser is about what the document IS. Both are kept: a crisp
 * picture of something we cannot classify should still route to the manual
 * choice, and a blurry picture of an obvious W-2G should still say so.
 */
export async function readText(image, options = {}) {
    if (typeof window === 'undefined') throw new OcrUnavailableError(new Error('no-browser'));

    let worker;
    try {
        worker = await getWorker(options.onProgress);
    } catch (err) {
        throw new OcrUnavailableError(err);
    }

    const { data } = await worker.recognize(image);
    const words = Array.isArray(data && data.words) ? data.words : [];
    return {
        text: String((data && data.text) || ''),
        confidence: Number.isFinite(data && data.confidence) ? Math.round(data.confidence) : 0,
        words: words.length,
    };
}

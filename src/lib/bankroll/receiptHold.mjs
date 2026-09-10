/**
 * A SCAN TAKEN WITH NO SIGNAL IS HELD, NOT LOST.
 *
 * The reader is entirely local: tesseract.js, its core and its language model
 * are served same-origin under /tesseract/<version>/ with an immutable
 * year-long cache, and a warmed browser reads a receipt with the network cut.
 * Measured against production on 2026-09-09, with a fetch to /api/health
 * throwing to prove the network really was down: all three assets - a 111 KB
 * worker, a 3.9 MB core and a 2.95 MB model - came back from cache in 8 ms.
 *
 * And yet, until this file existed, tapping Scan Receipt while offline did
 * this and nothing else:
 *
 *     if (!requireOnline()) return;   // "You Are Offline. Try Again When Connected."
 *
 * An engine built to work in a poker room basement, behind a door locked in a
 * poker room basement. Commander's ID capture, which shares the engine, has no
 * such gate and has always opened offline; this was an inconsistency between
 * two apps, not a policy.
 *
 * WHY A HOLD RATHER THAN JUST DELETING THE GATE. Reading is local; SAVING is
 * not - the photograph goes to Supabase Storage and a row goes to
 * bankroll_receipts. Opening the scanner offline without somewhere to put the
 * result would let a player photograph a buy-in, watch it read correctly, and
 * lose it. That is worse than being told no.
 *
 * So a scan taken offline is written to this hold on the device, and filed for
 * real when the signal returns. The blob is kept because the upload needs the
 * original bytes; the extracted fields are kept beside it so a flush never has
 * to read the picture twice.
 *
 * DEDUPE. Every held record carries the perceptual hash the scanner already
 * computes. bankroll_receipts is the system of record and
 * `the-receipt-inbox-files-in-bulk-and-never-twice` is the law that protects
 * it; this hold adds the near half of the same promise - a record is removed
 * only after its row exists, and a flush that runs twice over the same record
 * does not file it twice.
 */

/** How many scans may wait on the device, newest kept. */
export const MAX_HELD = 20;

/** And how many bytes of photographs, across all of them. */
export const MAX_HELD_BYTES = 40 * 1024 * 1024;

export const DB_NAME = 'sp-bankroll-hold';
export const DB_VERSION = 1;
export const STORE = 'receipts';

/**
 * Is this a failure to reach the network, rather than a refusal by it?
 *
 * A refusal - a policy denial, a payload too large - will refuse again in an
 * hour, so holding it would be a queue that never drains and a promise the
 * player can never collect on. Only an unreachable server is worth holding.
 * The list mirrors receiptStorage.isRetryableUploadError, which already draws
 * this line for the in-memory retry.
 */
export function isOfflineFailure(error) {
    if (!error) return false;
    const status = Number(error.statusCode || error.status || 0);
    const message = String(error.message || error).toLowerCase();
    if (status >= 400 && status < 600) return false;          // the server answered
    if (message.includes('row-level security') || message.includes('unauthorized')) return false;
    if (message.includes('payload too large') || message.includes('exceeded the maximum')) return false;
    return /failed to fetch|networkerror|network error|load failed|err_internet|err_network|err_connection|offline|timeout|timed out|aborted|connection (refused|reset|closed)/.test(message);
}

/** Should this scan be held instead of surfaced as a failure? */
export function shouldHold({ online, error }) {
    if (online === false) return true;
    return isOfflineFailure(error);
}

/**
 * The record a held scan becomes. Deliberately plain data: no Blob methods are
 * called here, so this is testable without a browser and the same shape goes
 * to IndexedDB, to the flush, and to the law.
 */
export function heldRecord({ userId, blob, mime, extracted, route, documentType, imageHash, readOutcome, ocrConfidence, capturedAt, id }) {
    return {
        id: id || `hold_${capturedAt || Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
        userId: userId || null,
        blob: blob || null,
        mime: mime || 'image/jpeg',
        bytes: (blob && typeof blob.size === 'number') ? blob.size : 0,
        extracted: extracted || null,
        route: route ? { ...route, documentType: documentType || route.documentType || null } : null,
        imageHash: imageHash || null,
        readOutcome: readOutcome || null,
        ocrConfidence: ocrConfidence ?? null,
        capturedAt: capturedAt || Date.now(),
        attempts: 0,
    };
}

/**
 * Which records survive the caps, and which are dropped.
 *
 * Newest first: a player who scanned twenty receipts in a basement cares most
 * about the one just taken. Returns both sides, because a dropped scan must be
 * SAID rather than silently discarded - a hold that quietly forgets is the
 * failure this file exists to prevent, wearing a different hat.
 */
export function applyCaps(records, { maxHeld = MAX_HELD, maxBytes = MAX_HELD_BYTES } = {}) {
    const newestFirst = [...records].sort((a, b) => (b.capturedAt || 0) - (a.capturedAt || 0));
    const kept = [];
    const dropped = [];
    let bytes = 0;
    for (const record of newestFirst) {
        const size = record.bytes || 0;
        if (kept.length >= maxHeld || (bytes + size) > maxBytes) { dropped.push(record); continue; }
        kept.push(record);
        bytes += size;
    }
    return { kept, dropped, bytes };
}

/** A record already filed under this hash need not be filed again. */
export function withoutAlreadyFiled(records, filedHashes) {
    const filed = new Set([...(filedHashes || [])].filter(Boolean));
    return records.filter((r) => !(r.imageHash && filed.has(r.imageHash)));
}

/* ─────────────────────────────────────────────────────────────────────────
 * The IndexedDB half. Thin on purpose: every decision above is pure, so the
 * only thing that needs a browser is opening a database and moving rows.
 * ───────────────────────────────────────────────────────────────────────── */

function idb() {
    return (typeof indexedDB !== 'undefined') ? indexedDB : null;
}

export function holdAvailable() {
    return Boolean(idb());
}

function openDb() {
    return new Promise((resolve, reject) => {
        const factory = idb();
        if (!factory) { reject(new Error('no IndexedDB')); return; }
        const request = factory.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE)) {
                const store = db.createObjectStore(STORE, { keyPath: 'id' });
                store.createIndex('capturedAt', 'capturedAt');
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('could not open the hold'));
    });
}

function tx(db, mode, run) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const store = transaction.objectStore(STORE);
        let result;
        try { result = run(store); } catch (err) { reject(err); return; }
        transaction.oncomplete = () => resolve(result);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error || new Error('the hold aborted'));
    });
}

/** Every held scan, newest first. Returns [] rather than throwing. */
export async function listHeld() {
    try {
        const db = await openDb();
        const rows = await new Promise((resolve, reject) => {
            const request = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
        db.close();
        return rows.sort((a, b) => (b.capturedAt || 0) - (a.capturedAt || 0));
    } catch (_err) {
        return [];
    }
}

/**
 * Put a scan in the hold. Returns { held, dropped } - dropped is what the caps
 * pushed out, so the caller can tell the player rather than lose it quietly.
 */
export async function holdScan(record) {
    const db = await openDb();
    try {
        await tx(db, 'readwrite', (store) => { store.put(record); });
        const all = await new Promise((resolve, reject) => {
            const request = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
        const { kept, dropped } = applyCaps(all);
        if (dropped.length) {
            await tx(db, 'readwrite', (store) => { for (const d of dropped) store.delete(d.id); });
        }
        return { held: kept.length, dropped };
    } finally {
        db.close();
    }
}

/** Remove one held scan. Called only after its row exists. */
export async function releaseHeld(id) {
    try {
        const db = await openDb();
        await tx(db, 'readwrite', (store) => { store.delete(id); });
        db.close();
        return true;
    } catch (_err) {
        return false;
    }
}

/** Record that a flush was tried and did not land, so a poison row is visible. */
export async function noteAttempt(id) {
    try {
        const db = await openDb();
        await tx(db, 'readwrite', (store) => {
            const request = store.get(id);
            request.onsuccess = () => {
                const row = request.result;
                if (row) store.put({ ...row, attempts: (row.attempts || 0) + 1, lastAttemptAt: Date.now() });
            };
        });
        db.close();
    } catch (_err) { /* the hold is best effort */ }
}

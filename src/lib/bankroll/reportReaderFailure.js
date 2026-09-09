/**
 * AN ENGINE THAT CANNOT START IS A BROKEN DEPLOY, AND SOMEBODY HAS TO HEAR IT.
 *
 * On 2026-09-09 the reader shipped to production with every engine asset
 * answering 404, because the copy step was wired into `prebuild` and
 * vercel.json calls `next build` directly. It did not crash: it rejected in
 * 27 ms, the catch swallowed it, and every scan quietly fell through to the
 * manual choice looking exactly like a receipt that could not be read. CI was
 * green, the logs were empty, and nothing anywhere said the engine had never
 * been there at all.
 *
 * This is the alarm for that. It is deliberately NOT fired for a bad
 * photograph, which is ordinary and frequent; only for the engine failing to
 * load or run, which is ours to fix and should never happen twice.
 */

import { reportClientCrash } from '../reportClientCrash';

/** Section names, so the two readers can be told apart in the crash table. */
export const READER_SECTIONS = {
    RECEIPT: 'bankroll-receipt-reader',
    DEALER_VAULT: 'bankroll-dealer-vault-reader',
};

/**
 * @param {Error}  error   what the engine threw
 * @param {string} section one of READER_SECTIONS
 * @param {string} [userId]
 */
export function reportReaderFailure(error, section, userId) {
    try {
        reportClientCrash({
            boundary: 'page',
            section: section || READER_SECTIONS.RECEIPT,
            error: error instanceof Error ? error : new Error(String(error || 'ocr-engine-failed')),
            userId,
        });
    } catch (_err) {
        // Reporting a failure must never become one. The outcome is also
        // written to bankroll_receipts.read_outcome, which is the durable
        // record; this is the one that pages somebody.
    }
}

export default reportReaderFailure;

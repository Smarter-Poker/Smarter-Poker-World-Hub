/**
 * THE READER SAYS WHAT IT DID, AND SOMEWHERE WE CAN COUNT IT.
 *
 * On 2026-09-09 the reader shipped to production with every engine asset
 * answering 404. It did not crash: it rejected in 27 ms, a bare `catch (_err)`
 * swallowed it, and every scan fell through to the manual choice looking
 * exactly like a receipt that could not be read. CI was green, the logs were
 * empty, and nothing anywhere said the engine had never been there.
 *
 * PostHog is dark in production, so analytics would have reported nothing
 * either. bankroll_receipts is written on every completed scan and we own it,
 * so the outcome goes there, where scripts/bankroll-adoption.mjs can count it
 * without a credential nobody has set.
 *
 * The distinction that matters: `engine_failed` is OUR deploy, `no_text` is
 * the photograph. Counting them together would have hidden the outage inside
 * ordinary bad photos.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { receiptRowFromScan, READ_OUTCOMES } from '../src/lib/bankroll/receiptInbox.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const code = (rel) => read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

const MIGRATION = 'supabase/migrations/20260909020000_bankroll_receipts_read_outcome.sql';

// ---------------------------------------------------------------------------
// THE OUTCOME THE CODE EMITS IS ONE THE DATABASE ACCEPTS
// ---------------------------------------------------------------------------

test('every outcome the code can emit is one the CHECK constraint allows', () => {
    // A value outside the CHECK fails the whole insert, and the insert IS the
    // record that a scan happened. Getting this wrong loses the scan, which is
    // the one thing bankroll_receipts exists to prevent.
    const sql = read(MIGRATION);
    const clause = sql.match(/read_outcome IN\s*\(([^)]*)\)/);
    assert.ok(clause, 'the migration must carry a read_outcome CHECK');
    const allowed = [...clause[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
    const emitted = Object.values(READ_OUTCOMES).sort();
    assert.deepEqual(emitted, allowed, 'READ_OUTCOMES and the CHECK must be the same set');
});

test('the migration says it was applied, and when', () => {
    assert.match(read(MIGRATION), /APPLIED:\s+2026-09-09/);
});

test('a junk outcome is dropped rather than sent to the database', () => {
    for (const junk of ['nonsense', '', null, undefined, 0, {}, 'READ', 'read ']) {
        const row = receiptRowFromScan('u1', { imageUrl: 'x', readOutcome: junk });
        assert.equal(row.read_outcome, null, `${JSON.stringify(junk)} must not reach the CHECK`);
    }
    const good = receiptRowFromScan('u1', { imageUrl: 'x', readOutcome: READ_OUTCOMES.ENGINE_FAILED });
    assert.equal(good.read_outcome, 'engine_failed');
});

test('ocr confidence is clamped to the smallint range the column allows', () => {
    const at = (v) => receiptRowFromScan('u1', { imageUrl: 'x', ocrConfidence: v }).ocr_confidence;
    assert.equal(at(94), 94);
    assert.equal(at(94.6), 95, 'a float is rounded, because the column is a smallint');
    assert.equal(at(-5), 0);
    assert.equal(at(9999), 100);
    for (const junk of [null, undefined, '', 'high', NaN, Infinity, {}]) assert.equal(at(junk), null);
});

// ---------------------------------------------------------------------------
// EVERY EXIT FROM THE READ PATH RECORDS ONE
// ---------------------------------------------------------------------------

test('the scanner records an outcome on every path out of the read', () => {
    const scanner = code('src/components/bankroll/ReceiptScanner.jsx');
    for (const outcome of ['NO_TEXT', 'ROUTE_REFUSED', 'READ', 'ENGINE_FAILED']) {
        assert.match(scanner, new RegExp(`READ_OUTCOMES\\.${outcome}`), `no path records ${outcome}`);
    }
    // The starting value matters: a scan that never reached the reader must
    // not be counted as one the reader failed on.
    assert.match(scanner, /useRef\(\{ outcome: READ_OUTCOMES\.NOT_ATTEMPTED/);
});

test('an engine that cannot start is told apart from a photograph with no text', () => {
    const scanner = code('src/components/bankroll/ReceiptScanner.jsx');
    assert.match(scanner, /err instanceof OcrUnavailableError/, 'the engine failure is identified by its own type');
    assert.match(scanner, /READ_OUTCOMES\.ENGINE_FAILED : READ_OUTCOMES\.NO_TEXT/);
    // And it pages somebody, because it means the deploy is broken.
    assert.match(scanner, /reportReaderFailure\(err, READER_SECTIONS\.RECEIPT/);
});

test('the failure report reaches a table, not just the console', () => {
    const reporter = code('src/lib/bankroll/reportReaderFailure.js');
    assert.match(reporter, /reportClientCrash\(/, 'it must use the existing crash channel');
    assert.match(reporter, /boundary: 'page'/);
    // Reporting a failure must never become one.
    assert.match(reporter, /catch \(_err\)/);
});

// ---------------------------------------------------------------------------
// THE PAGE CARRIES IT TO THE ROW, ON BOTH PATHS
// ---------------------------------------------------------------------------

test('the page writes the outcome onto the receipt row', () => {
    const page = code('pages/hub/bankroll-manager.js');
    assert.match(page, /saveReceiptRow = useCallback\(async \(\{[^}]*readOutcome, ocrConfidence \}\)/);
    assert.match(page, /receiptRowFromScan\(userId, \{[^}]*readOutcome, ocrConfidence \}\)/);
});

test('Retry Listing writes the same outcome the first attempt would have', () => {
    // The retry writes the same row from held state. Dropping the outcome
    // there would make a retried scan look like one nobody ever read.
    const page = code('pages/hub/bankroll-manager.js');
    const retry = page.slice(page.indexOf('const retryReceiptListing'));
    assert.match(retry.slice(0, 900), /readOutcome: scannerReadOutcomeRef\.current\.outcome/);
    assert.match(retry.slice(0, 900), /ocrConfidence: scannerReadOutcomeRef\.current\.ocrConfidence/);
});

test('reopening a waiting receipt reads the columns it needs', () => {
    // The reopen path restores the outcome from the row, so it must be in the
    // select. PostgREST returns undefined for a column nobody asked for, and
    // the retry would then quietly write null over a real outcome.
    const page = code('pages/hub/bankroll-manager.js');
    assert.match(page, /\.select\('id, image_url,[^']*read_outcome, ocr_confidence[^']*'\)/);
    assert.match(page, /scannerReadOutcomeRef\.current = \{ outcome: receipt\.read_outcome/);
});

// ---------------------------------------------------------------------------
// AND SOMETHING COUNTS IT
// ---------------------------------------------------------------------------

test('the adoption script counts every outcome, and says when the deploy is broken', () => {
    const script = code('scripts/bankroll-adoption.mjs');
    for (const outcome of Object.values(READ_OUTCOMES)) {
        if (outcome === 'not_attempted') continue; // never written to the row
        assert.match(script, new RegExp(`read_outcome=eq\\.${outcome}`), `nothing counts ${outcome}`);
    }
    assert.match(script, /read_outcome=is\.null/, 'scans from before this must be visible as unknown');
    assert.match(script, /report\.read_engine_failed > 0/, 'a broken deploy must be called out, not just listed');
});

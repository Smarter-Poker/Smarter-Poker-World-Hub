/**
 * A BAD SCAN CAN BE THROWN AWAY, AND ONLY DELIBERATELY.
 *
 * The rule Dan set was that a scan can never be ABANDONED. What got built was
 * a table with select, insert and update and no delete anywhere, which is a
 * different rule: a scan could never be REMOVED.
 *
 * Photograph your thumb by accident and it sat in Receipts Waiting forever.
 * The list is limited to twenty, so a handful of junk scans quietly pushed the
 * real ones off the end - and the feature's whole promise is that a scan is
 * never lost.
 *
 * Both rules hold together here. Closing the sheet still deletes nothing,
 * which is what a-scanned-receipt-is-never-abandoned pins. Deleting requires
 * the player to say so, on a receipt that is not filed anywhere.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const code = (rel) => read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

const PAGE = 'pages/hub/bankroll-manager.js';

/**
 * The body of discardReceipt, sliced to the declaration that follows it.
 *
 * Not to a fixed character count and not to whichever function happens to sit
 * near it in the file: either one silently stops covering the code it was
 * written to pin the moment somebody moves a declaration.
 */
function discardFn(page) {
    const from = page.indexOf('const discardReceipt');
    assert.ok(from > 0, 'discardReceipt must exist');
    const to = page.indexOf('const openEntryForReceipt', from);
    assert.ok(to > from, 'discardReceipt must be followed by openEntryForReceipt');
    return page.slice(from, to);
}

// ---------------------------------------------------------------------------
// THERE IS A WAY OUT
// ---------------------------------------------------------------------------

test('a waiting receipt can be deleted at all', () => {
    const page = code(PAGE);
    assert.match(page, /const discardReceipt = useCallback/, 'nothing could remove a scan before this');
    assert.match(page, /\.from\('bankroll_receipts'\)\s*\.delete\(\)/);
    assert.match(page, /onClick=\{\(\) => discardReceipt\(receipt\)\}/, 'and it is reachable from the list');
});

test('deleting is deliberate: it asks, and it says the image goes too', () => {
    const page = code(PAGE);
    const fn = discardFn(page);
    assert.match(fn, /window\.confirm\(/, 'a scan is never removed by accident');
    assert.match(fn, /cannot be undone/i);
    assert.match(fn, /image is deleted too/i, 'the confirm must say what else goes');
});

test('only an unfiled scan can be deleted, enforced twice', () => {
    // An assigned receipt is attached to a ledger entry or a W-2G. Deleting it
    // would leave that record pointing at nothing.
    const page = code(PAGE);
    const fn = discardFn(page);
    assert.match(fn, /receipt\.status !== 'unassigned'/, 'refused in the client');
    assert.match(fn, /\.eq\('status', 'unassigned'\)/, 'and again in the delete itself');
    // Scoped to the owner, like every other write on this page.
    assert.match(fn, /\.eq\('user_id', userId\)/);
});

test('the row goes before the image, and a failed image delete is survivable', () => {
    // That order matters. An orphaned storage object is invisible and
    // harmless; a row pointing at a deleted image is a broken thumbnail in
    // the list forever.
    const page = code(PAGE);
    const fn = discardFn(page);
    const rowAt = fn.indexOf(".delete()");
    const imageAt = fn.indexOf('removeBankrollObject');
    assert.ok(rowAt > 0 && imageAt > rowAt, 'the row must be deleted first');
    assert.match(page, /import \{ removeBankrollObject \}/, 'deletes go through the module that knows the bucket');
});

// ---------------------------------------------------------------------------
// AND CLOSING STILL DELETES NOTHING
// ---------------------------------------------------------------------------

test('closing the scanner still never deletes a receipt', () => {
    // The older law. A deliberate delete must not have loosened it.
    const page = code(PAGE);
    const close = page.slice(page.indexOf('const closeScanner = useCallback'), page.indexOf('const loadPendingReceipts'));
    assert.doesNotMatch(close, /from\('bankroll_receipts'\)\s*\.delete/);
    assert.doesNotMatch(close, /discardReceipt/);
});

test('the discard control is a real target and does not fight the file button', () => {
    const page = read(PAGE);
    assert.match(page, /receiptsWaitingDiscard: \{[\s\S]*?minHeight: 44/, 'a 44px target like everything else here');
    assert.match(page, /aria-label=\{`Delete \$\{receipt\.summary/, 'and it says what it deletes');
    // A button inside a button is invalid HTML and browsers drop one of them.
    const row = page.slice(page.indexOf('pendingReceipts.slice(0, 5).map'), page.indexOf('pendingReceipts.length > 5'));
    assert.match(row, /<div key=\{receipt\.id\} style=\{styles\.receiptsWaitingRow\}>/, 'the row is not itself a button');
});

// ---------------------------------------------------------------------------
// THE LIMIT THAT GUARDED A BILL THAT NO LONGER EXISTS
// ---------------------------------------------------------------------------

test('the readers are not rate limited as if they still called a model', () => {
    // LIMITS.ai is 5/min and was right when every scan was a billed request to
    // a vision model. A player emptying a pocket scans eight receipts, and
    // numbers six through eight were refused - while "File All Suggested"
    // encourages exactly that burst.
    for (const route of ['pages/api/bankroll/scan-receipt.js', 'pages/api/bankroll/scan-dealer-document.js']) {
        const src = code(route);
        assert.doesNotMatch(src, /applyRateLimit\(req, res, LIMITS\.ai\)/, `${route} still uses the AI limit`);
        assert.match(src, /applyRateLimit\(req, res, READER_LIMIT\)/, `${route} needs its own bucket`);
        assert.match(src, /const READER_LIMIT = \{ max: 30, windowMs: 60_000, scope: ':bankroll-reader' \}/);
    }
});

test('a limit still exists: the routes are not left open', () => {
    for (const route of ['pages/api/bankroll/scan-receipt.js', 'pages/api/bankroll/scan-dealer-document.js']) {
        const src = code(route);
        assert.match(src, /if \(!applyRateLimit\(/, `${route} must still be limited`);
        assert.match(src, /checkServerFeatureAccess\(/, 'and still gated');
    }
});

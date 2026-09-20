/**
 * A SCAN TAKEN WITH NO SIGNAL IS HELD, NOT LOST.
 *
 * The reader is entirely local. Measured against production on 2026-09-09,
 * with a fetch to /api/health throwing to prove the network really was cut:
 * the 111 KB worker, the 3.9 MB core and the 2.95 MB language model all came
 * back from cache in 8 ms.
 *
 * And tapping Scan Receipt while offline did this and nothing else:
 *
 *     if (!requireOnline()) return;   // "You Are Offline. Try Again When Connected."
 *
 * An engine built for a poker room basement, behind a door locked in a poker
 * room basement. Commander's ID capture shares the engine and has never had
 * that gate, so this was two apps disagreeing, not a decision.
 *
 * Deleting the gate alone would have been worse than leaving it: reading is
 * local, SAVING is not, so a player would photograph a buy-in, watch it read
 * correctly, and lose it. Hence a hold, and hence these laws - most of which
 * are about not losing anything, because a queue that silently forgets is the
 * same bug wearing a different hat.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    MAX_HELD, MAX_HELD_BYTES, applyCaps, heldRecord, isOfflineFailure,
    shouldHold, withoutAlreadyFiled,
} from '../src/lib/bankroll/receiptHold.mjs';
/**
 * The comment explaining why the gate is gone naturally writes the word
 * `requireOnline()`, and a law that reads its own explanation as the code it
 * forbids would fail on prose - the trap check-history-depth.mjs was written
 * to avoid. I reached for that file's stripComments first; it strips `#`,
 * because it reads shell and YAML, and it left every `//` line untouched.
 *
 * So: full-line `//` comments only. Unambiguous, enough for a comment block,
 * and it does not pretend to parse JavaScript - a trailing `// requireOnline()`
 * on a line of real code would still trip this, which is the safe direction.
 */
const withoutLineComments = (src) => src
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

test('the scanner opens with no signal', () => {
    // The one gate that had to go, and only that one.
    const page = read('pages/hub/bankroll-manager.js');
    const code = withoutLineComments(page);
    const handler = code.slice(code.indexOf('const handleSidebarClick'));
    const scanBranch = handler.slice(handler.indexOf("=== 'scan-receipt'"), handler.indexOf("=== 'projection'"));
    assert.ok(scanBranch.length > 40, 'the scan-receipt branch must still be findable');
    assert.ok(!/requireOnline\(\)/.test(scanBranch),
        'reading is local; refusing to open offline is refusing to use the engine we shipped');
    assert.match(scanBranch, /setShowScanner\(true\)/, 'and it must still open the scanner');
});

test('the other online gates are left alone, and the new one is honest', () => {
    // Twelve guards stood before this change. One went - the scanner, whose
    // engine is local. One arrived - sending a HELD scan, which uploads and
    // calls the paid read route and therefore genuinely needs a network. So
    // the count is unchanged, and that is a coincidence worth spelling out
    // rather than a number to match: what matters is WHICH twelve.
    const page = read('pages/hub/bankroll-manager.js');
    const code = withoutLineComments(page);
    const gates = (code.match(/if \(!requireOnline\(\)\) return;/g) || []).length;
    assert.equal(gates, 12, `expected twelve write gates, found ${gates}`);

    // The one that went.
    const handler = code.slice(code.indexOf('const handleSidebarClick'));
    const scanBranch = handler.slice(handler.indexOf("=== 'scan-receipt'"), handler.indexOf("=== 'projection'"));
    assert.ok(!/requireOnline\(\)/.test(scanBranch));

    // The one that arrived.
    const resume = code.slice(code.indexOf('const resumeHeldScan'), code.indexOf('const releaseResumedScan'));
    assert.match(resume, /if \(!requireOnline\(\)\) return;/,
        'sending a held scan uploads and calls the paid route; offline it must refuse');
});

test('only an unreachable server is worth holding', () => {
    // A refusal will refuse again in an hour. Holding it would be a queue that
    // never drains and a promise the player cannot collect on.
    for (const reachable of [
        { statusCode: 403, message: 'new row violates row-level security policy' },
        { statusCode: 413, message: 'Payload too large' },
        { status: 401, message: 'Unauthorized' },
        { status: 500, message: 'Internal Server Error' },
    ]) {
        assert.equal(isOfflineFailure(reachable), false, reachable.message);
    }
    for (const unreachable of [
        new TypeError('Failed to fetch'),
        new Error('NetworkError when attempting to fetch resource.'),
        { message: 'Load failed' },
        { message: 'net::ERR_INTERNET_DISCONNECTED' },
        { message: 'The operation timed out' },
    ]) {
        assert.equal(isOfflineFailure(unreachable), true, unreachable.message);
    }
});

test('a scan taken while offline is held without waiting for a failure', () => {
    // navigator.onLine being false is enough. Making the player watch three
    // upload attempts time out first is a worse way to learn the same fact.
    assert.equal(shouldHold({ online: false, error: null }), true);
    assert.equal(shouldHold({ online: true, error: new TypeError('Failed to fetch') }), true);
    assert.equal(shouldHold({ online: true, error: { status: 403, message: 'row-level security' } }), false);
    assert.equal(shouldHold({ online: true, error: null }), false);
});

test('a held scan carries everything a later upload needs', () => {
    // If any of this were dropped, the flush would have to read the picture a
    // second time - and a second read can disagree with the first, which is
    // how a receipt files different numbers than the ones the player saw.
    const record = heldRecord({
        userId: 'u1',
        blob: { size: 120_000 },
        extracted: { amount: 340, document_type: 'tournament_buyin' },
        route: { destination: 'trip', autoFile: true },
        documentType: 'tournament_buyin',
        imageHash: 'abc123',
        readOutcome: 'read',
        ocrConfidence: 94,
        capturedAt: 1_700_000_000_000,
    });
    assert.equal(record.bytes, 120_000);
    assert.equal(record.extracted.amount, 340);
    assert.equal(record.route.documentType, 'tournament_buyin');
    assert.equal(record.imageHash, 'abc123');
    assert.equal(record.readOutcome, 'read');
    assert.equal(record.ocrConfidence, 94);
    assert.equal(record.attempts, 0);
    assert.ok(record.id.startsWith('hold_'));
});

test('a confidence of zero is kept as zero, not turned into nothing', () => {
    // `?? null` and `|| null` differ here, and the difference is a receipt the
    // engine read badly looking like one it never read at all. The same trap
    // was already found once in receiptInbox's toOcrConfidence.
    assert.equal(heldRecord({ ocrConfidence: 0 }).ocrConfidence, 0);
    assert.equal(heldRecord({ ocrConfidence: undefined }).ocrConfidence, null);
});

test('the caps keep the newest and say what they dropped', () => {
    const many = Array.from({ length: MAX_HELD + 3 }, (_, i) => heldRecord({
        blob: { size: 1000 }, capturedAt: 1000 + i,
    }));
    const { kept, dropped } = applyCaps(many);
    assert.equal(kept.length, MAX_HELD);
    assert.equal(dropped.length, 3);
    // Newest kept: the receipt just photographed matters most.
    assert.equal(kept[0].capturedAt, 1000 + MAX_HELD + 2);
    assert.ok(dropped.every((d) => d.capturedAt < kept[kept.length - 1].capturedAt));
});

test('the byte cap counts photographs, not rows', () => {
    const big = Array.from({ length: 6 }, (_, i) => heldRecord({
        blob: { size: 9 * 1024 * 1024 }, capturedAt: 2000 + i,
    }));
    const { kept, bytes } = applyCaps(big);
    assert.ok(bytes <= MAX_HELD_BYTES, `${bytes} is over the cap`);
    assert.equal(kept.length, 4, 'four 9MB photographs fit under 40MB, a fifth does not');
});

test('a dropped scan is returned, never silently discarded', () => {
    // A hold that quietly forgets is the bug this whole file exists to
    // prevent, so the caps hand back what they removed and the caller says so.
    const { dropped } = applyCaps(
        Array.from({ length: MAX_HELD + 1 }, (_, i) => heldRecord({ blob: { size: 10 }, capturedAt: i })),
    );
    assert.equal(dropped.length, 1);
    assert.ok(dropped[0].id, 'the dropped record comes back whole, not as a count');
});

test('a scan already filed is not filed twice', () => {
    const records = [
        heldRecord({ imageHash: 'aaa', capturedAt: 3 }),
        heldRecord({ imageHash: 'bbb', capturedAt: 2 }),
        heldRecord({ imageHash: null, capturedAt: 1 }),
    ];
    const left = withoutAlreadyFiled(records, ['aaa']);
    assert.deepEqual(left.map((r) => r.imageHash), ['bbb', null]);
    // A record with no hash is never assumed to be a duplicate: an unhashed
    // scan is one a browser could not hash, not one already on file.
    assert.equal(withoutAlreadyFiled(records, ['aaa', 'bbb']).length, 1);
});

test('the hold degrades to nothing rather than throwing', async () => {
    // A private window, or a browser with IndexedDB switched off, must lose
    // the hold and keep the scanner - not take the page down with it.
    const mod = await import('../src/lib/bankroll/receiptHold.mjs');
    assert.equal(typeof mod.holdAvailable, 'function');
    assert.equal(mod.holdAvailable(), false, 'node has no IndexedDB, and that is not an error');
    assert.deepEqual(await mod.listHeld(), [], 'listing an unavailable hold is empty, not a throw');
    assert.equal(await mod.releaseHeld('nope'), false);
    await mod.noteAttempt('nope'); // must not throw
});

// ── THE WIRING, NOT JUST THE ARITHMETIC ───────────────────────────────────
// Every law above is about a pure function. These are about the three places
// the feature is actually load-bearing, because a correct module wired to
// nothing is the exact failure this whole session has been fixing.

test('the picture is held before the upload is even attempted', () => {
    // navigator.onLine being false is enough. Making the player watch three
    // upload attempts time out, then getFreshAccessToken fail, then read
    // "SIGN IN REQUIRED" - which offline is a lie - is a worse way to learn
    // something the browser already knew.
    const src = withoutLineComments(read('src/components/bankroll/ReceiptScanner.jsx'));
    const upload = src.slice(src.indexOf('const uploadApprovedScan'));
    const holdAt = upload.indexOf('holdForLater(scan');
    const authAt = upload.indexOf('getFreshAccessToken');
    assert.ok(holdAt > -1, 'the offline path must hold the scan');
    assert.ok(authAt > -1);
    assert.ok(holdAt < authAt, 'holding must come before the auth call that itself needs a network');
});

test('a scan is held when the signal drops mid-upload too', () => {
    const src = withoutLineComments(read('src/components/bankroll/ReceiptScanner.jsx'));
    assert.match(src, /shouldHold\(\{ online: true, error: lastError \}\)/,
        'an upload that failed because the server was unreachable is held, not surfaced as a dead end');
});

test('a held scan is read by the same route a fresh one is', () => {
    // The parse runs through /api/bankroll/scan-receipt because that is where
    // the bankroll_pro entitlement is checked and where the saved venues live.
    // A headless background flush would be a SECOND reader, and two readers
    // eventually disagree about what a receipt said. So a held scan is handed
    // back into the ordinary approved-scan path and nothing else.
    const scanner = withoutLineComments(read('src/components/bankroll/ReceiptScanner.jsx'));
    assert.match(scanner, /setApprovedScan\(\{ blob: resumeScan\.blob/,
        'a resumed scan becomes an ordinary approved scan');
    const page = withoutLineComments(read('pages/hub/bankroll-manager.js'));
    assert.ok(!/parseReceiptText/.test(page),
        'the page must not parse a receipt itself: that is the paid route\'s job');
    assert.ok(!/parseReceiptText/.test(scanner),
        'and neither must the scanner, offline or not');
});

test('the device copy is released only after the row exists', () => {
    // Released in onScanComplete, which the scanner calls once the image has
    // uploaded. Releasing on resume would delete the only copy of a scan whose
    // upload is about to fail.
    // Anchored on the VISIBLE scanner: there are two onScanComplete handlers
    // now, and taking the first match in the file measured the auto-sender.
    const page = withoutLineComments(read('pages/hub/bankroll-manager.js'));
    const visible = page.slice(page.indexOf('onPendingChange={setScannerHasUnsaved}'));
    const complete = visible.slice(visible.indexOf('onScanComplete={async'));
    assert.match(complete.slice(0, 900), /releaseResumedScan\(\)/,
        'the release belongs in onScanComplete');
    // Bounded to resumeHeldScan's OWN body - up to where its useCallback deps
    // close - not to the next named function. finishAutoFlush now sits between
    // the two and legitimately calls releaseHeld, so the looser slice was
    // reading a different function's correctness as this one's failure.
    const from = page.indexOf('const resumeHeldScan');
    const resume = page.slice(from, page.indexOf('}, [', from));
    assert.ok(resume.length > 40 && resume.length < 1200, 'the slice must be one function');
    assert.ok(!/releaseHeld\(/.test(resume),
        'resuming must not release: the upload has not happened yet');
});

test('the count comes from the hold, never from a tally the page keeps', () => {
    const page = withoutLineComments(read('pages/hub/bankroll-manager.js'));
    assert.match(page, /setHeldScans\(await listHeld\(\)\)/, 'read the hold, do not count it');
    // Re-read whenever the connection changes, so "2 waiting" cannot go stale.
    assert.match(page, /useEffect\(\(\) => \{ refreshHeldScans\(\); \}, \[refreshHeldScans, online\]\)/);
});

test('what the caps dropped is said out loud', () => {
    // Anchored on the VISIBLE scanner, not the first onHeld in the file. There
    // are two ReceiptScanners now - the one the player opens and the one that
    // sends a held scan on its own - and a slice that just took the first match
    // silently measured the wrong one the moment the second appeared.
    const page = withoutLineComments(read('pages/hub/bankroll-manager.js'));
    const visible = page.slice(page.indexOf('onPendingChange={setScannerHasUnsaved}'));
    const onHeld = visible.slice(visible.indexOf('onHeld={'), visible.indexOf('onScanComplete={async'));
    assert.match(onHeld, /dropped/, 'a dropped scan must reach the player');
    assert.match(onHeld, /toast\.error/, 'and as an error, not a success with a number in it');
});

// ── AND IT SENDS ITSELF ───────────────────────────────────────────────────
// The first version of this made the player press Send, on a branch called
// "a scan in the basement files itself", which is not what that says.

test('a held scan sends itself when the signal returns', () => {
    const page = withoutLineComments(read('pages/hub/bankroll-manager.js'));
    assert.match(page, /if \(!online \|\| !userId\) return;/, 'it waits for a signal and a user');
    assert.match(page, /setAutoFlushing\(next\)/, 'and then starts on its own');
});

test('it never files underneath somebody who is scanning', () => {
    // The sheet has one piece of state. A scan filing itself while the player
    // is mid-scan is how the wrong photograph gets the wrong destination.
    const page = withoutLineComments(read('pages/hub/bankroll-manager.js'));
    assert.match(page, /if \(autoFlushing \|\| resumingHeld \|\| showScanner\) return;/,
        'one at a time, and never while the scanner is open');
});

test('the sender is the same component, not a second reader', () => {
    const page = withoutLineComments(read('pages/hub/bankroll-manager.js'));
    const sender = page.slice(page.indexOf('{autoFlushing && ('), page.indexOf('{(heldScans.length > 0'));
    assert.match(sender, /<ReceiptScanner/, 'the same scanner does the sending');
    assert.match(sender, /autoConfirm/);
    assert.match(sender, /saveReceiptRow\(/, 'and the same row writer files it');
    // A quieter path that read receipts its own way is the thing to prevent.
    assert.ok(!/parseReceiptText/.test(page) && !/scan-receipt'/.test(sender),
        'the page must not read a receipt itself; that is the paid route\'s job');
});

test('autoConfirm changes who presses Confirm and nothing else', () => {
    const scanner = withoutLineComments(read('src/components/bankroll/ReceiptScanner.jsx'));
    // It fires the SAME handleConfirm the button fires.
    assert.match(scanner, /handleConfirmRef\.current\(\)/);
    // Only once, however many times React re-renders: bankroll_receipts is the
    // system of record and a double file is a double receipt.
    assert.match(scanner, /if \(!autoConfirm \|\| autoConfirmedRef\.current\) return;/);
    assert.match(scanner, /autoConfirmedRef\.current = true;/);
    // And only once the read has settled, not merely once the image uploaded.
    assert.match(scanner, /if \(!uploadedUrl \|\| isUploading\) return;/);
});

test('a scan that cannot be sent is not retried forever', () => {
    // A queue that retries a poisoned item until the end of time is a queue
    // that never drains. After three attempts it stops being picked up
    // automatically; Send by hand still works.
    const page = withoutLineComments(read('pages/hub/bankroll-manager.js'));
    assert.match(page, /\(h\.attempts \|\| 0\) < 3/);
    assert.match(page, /await noteAttempt\(next\.id\)/, 'and the attempt is recorded before it is made');
});

test('the device copy survives a send that did not land', () => {
    const page = withoutLineComments(read('pages/hub/bankroll-manager.js'));
    assert.match(page, /if \(filed && record\) await releaseHeld\(record\.id\)/,
        'released only when a row actually exists');
    const sender = page.slice(page.indexOf('{autoFlushing && ('), page.indexOf('{(heldScans.length > 0'));
    assert.match(sender, /finishAutoFlush\(autoFlushing, Boolean\(id\)\)/,
        'a null row id must not count as filed');
});

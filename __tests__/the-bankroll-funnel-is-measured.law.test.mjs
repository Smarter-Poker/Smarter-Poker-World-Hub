/**
 * THE BANKROLL FUNNEL IS MEASURED
 *
 * Counted on 2026-09-08: 1,199 accounts, 1,029 carrying is_vip, and exactly
 * ONE that has ever written a bankroll entry, last written in February. Zero
 * receipts, zero W-2G forms, zero dealer documents.
 *
 * That is why several defects survived for months: six premium routes
 * answered 403 to everybody, every scanned buy-in failed to save with 23514,
 * and both vault uploads were refused by a bucket policy. Nobody was there to
 * report any of it. All fixed that day, and nothing was measuring whether
 * fixing them changes anything.
 *
 * Two answers, because one of them costs a credential an agent may not set:
 *   - capture() events on the steps that matter, which start recording the
 *     moment NEXT_PUBLIC_POSTHOG_KEY exists (it does not today, so the
 *     signup and first_login events already in the code fire into nothing).
 *   - scripts/bankroll-adoption.mjs, which asks the database and needs no key.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { FunnelEvents } from '../src/lib/analytics.js';
import { BANKROLL_MANAGER_PAGE, bankrollManagerSource } from './helpers/bankroll-manager-source.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// The page reads as itself plus its section modules (the 2026-11-28 split;
// __tests__/helpers/bankroll-manager-source.mjs).
const read = (rel) => (rel === BANKROLL_MANAGER_PAGE ? bankrollManagerSource() : fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const code = (rel) => read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const PAGE = 'pages/hub/bankroll-manager.js';

test('the funnel names the bankroll steps, without disturbing the five that existed', () => {
    assert.equal(FunnelEvents.BANKROLL_FIRST_ENTRY, 'bankroll_first_entry');
    assert.equal(FunnelEvents.BANKROLL_RECEIPT_SCANNED, 'bankroll_receipt_scanned');
    assert.equal(FunnelEvents.BANKROLL_RECEIPT_FILED, 'bankroll_receipt_filed');
    // Changing any of these invalidates a funnel definition, so they are pinned.
    assert.equal(FunnelEvents.SIGNUP, 'signup');
    assert.equal(FunnelEvents.FIRST_LOGIN, 'first_login');
    assert.equal(FunnelEvents.FIRST_TABLE_SEAT, 'first_table_seat');
    assert.equal(FunnelEvents.FIRST_HAND_PLAYED, 'first_hand_played');
    assert.equal(FunnelEvents.FIRST_SESSION_30MIN, 'first_session_of_30min');
    assert.ok(Object.isFrozen(FunnelEvents));
});

test('every bankroll event is actually fired, and the first entry is the FIRST one', () => {
    const src = code(PAGE);
    assert.match(src, /import \{ capture, FunnelEvents \} from '\.\.\/\.\.\/src\/lib\/analytics'/);
    for (const key of ['BANKROLL_FIRST_ENTRY', 'BANKROLL_RECEIPT_SCANNED', 'BANKROLL_RECEIPT_FILED']) {
        assert.match(src, new RegExp(`capture\\(FunnelEvents\\.${key}`), `${key} is fired`);
    }
    // It reads the ledger as it was BEFORE the save, or every entry is a first.
    const submit = src.slice(src.indexOf('const handleLogSubmit'), src.indexOf('const handleLogSubmit') + 700);
    assert.match(submit, /if \(entries\.length === 0\) capture\(FunnelEvents\.BANKROLL_FIRST_ENTRY/);
    // The handler no longer reloads itself (LogEntryModal's 'bankroll-updated'
    // event already does, and a second read was a duplicate), but if a reload
    // ever returns here it must still come after the measurement.
    const reload = submit.indexOf('await loadData()');
    assert.ok(
        reload === -1 || submit.indexOf('capture(FunnelEvents.BANKROLL_FIRST_ENTRY') < reload,
        'measured before the reload that would make entries non-empty',
    );
});

test('the steps around the first entry are named and fired where each one happens', () => {
    assert.equal(FunnelEvents.BANKROLL_OPENED, 'bankroll_opened');
    assert.equal(FunnelEvents.BANKROLL_STARTING_SET, 'bankroll_starting_bankroll_set');
    assert.equal(FunnelEvents.BANKROLL_SECOND_SESSION, 'bankroll_second_session');
    assert.equal(FunnelEvents.BANKROLL_FIRST_TRIP, 'bankroll_first_trip');
    assert.equal(FunnelEvents.BANKROLL_FIRST_RECEIPT_FILED, 'bankroll_first_receipt_filed');
    const steps = code('src/lib/bankroll/funnelSteps.mjs');
    assert.match(steps, /import \{ capture as defaultCapture, FunnelEvents \} from '\.\.\/analytics\.js'/, 'the same capture helper and registry');
    for (const key of ['BANKROLL_OPENED', 'BANKROLL_STARTING_SET', 'BANKROLL_SECOND_SESSION', 'BANKROLL_FIRST_TRIP', 'BANKROLL_FIRST_RECEIPT_FILED']) {
        assert.match(steps, new RegExp(`FunnelEvents\\.${key}`), `${key} is fired`);
    }
    const page = code(PAGE);
    assert.match(page, /useEffect\(\(\) => \{ if \(userId\) noteBankrollOpened\(\{ signedIn: true \}\); \}, \[userId\]\);/, 'opened, once the player is known');
    const assign = page.slice(page.indexOf('const markReceiptAssigned'), page.indexOf('const resumeReceipt'));
    assert.ok(assign.indexOf('noteReceiptFiled(supabase, userId') > assign.indexOf('if (error) throw error;'), 'counted only after the receipt really was marked filed');
    const sel = code('src/lib/bankroll/bankrollSelectors.ts');
    const create = sel.slice(sel.indexOf('export async function createLedgerEntry'), sel.indexOf('export async function updateLedgerEntry'));
    assert.match(create, /if \(data\) void noteSessionLogged\(supabase, userId, data\);/, 'every new ledger row, from any screen');
    const trip = sel.slice(sel.indexOf('export async function createTrip'), sel.indexOf('export async function updateTrip'));
    assert.ok(trip.indexOf('noteTripStarted(supabase, userId)') > trip.indexOf("throw error || new Error('Failed to create trip')"), 'after the trip exists');
    const start = sel.slice(sel.indexOf('export async function setStartingBankroll'), sel.indexOf('export async function adjustBankroll'));
    assert.ok(start.indexOf('noteStartingBankrollSet()') > start.indexOf('if (!data || data.length === 0) throw'), 'after the save is confirmed');
});

test('filing is measured on every path a receipt can be filed by', () => {
    const src = code(PAGE);
    assert.match(src, /capture\(FunnelEvents\.BANKROLL_RECEIPT_FILED, \{ destination: 'tax', bulk: false \}\)/, 'the vault');
    assert.match(src, /capture\(FunnelEvents\.BANKROLL_RECEIPT_FILED, \{ destination: 'session', bulk: false, closed_open_session: true \}\)/, 'a closed session');
    assert.match(src, /capture\(FunnelEvents\.BANKROLL_RECEIPT_FILED, \{ bulk: true, count: filed \}\)/, 'bulk filing');
    assert.match(src, /capture\(FunnelEvents\.BANKROLL_RECEIPT_FILED, \{ destination: entry && entry\.category === 'expense'/, 'through the form');
});

test('the count that needs no credential exists and reports the shape it promises', () => {
    const script = code('scripts/bankroll-adoption.mjs');
    for (const table of ['profiles', 'bankroll_ledger', 'bankroll_receipts', 'w2g_forms', 'dealer_documents', 'bankroll_trips', 'player_notes']) {
        assert.match(script, new RegExp(`'${table}'`), `${table} is counted`);
    }
    assert.match(script, /is_vip=eq\.true/, 'VIPs specifically');
    assert.match(script, /vip_reach_percent/, 'and what share of them have ever logged anything');
    assert.match(script, /--json/, 'machine readable, so a before and after can be diffed');
    assert.doesNotMatch(script, /SUPABASE_SERVICE_ROLE_KEY\s*=\s*['"][A-Za-z0-9._-]{20,}/, 'no key is ever written into a file');
    const mode = fs.statSync(path.join(ROOT, 'scripts/bankroll-adoption.mjs')).mode & 0o111;
    assert.ok(mode, 'runnable');
});

test('analytics still no-ops without the key, so a missing key is never a crash', () => {
    const analytics = code('src/lib/analytics.js');
    assert.match(analytics, /function isEnabled\(\) \{\s*return isBrowser\(\) && !!POSTHOG_KEY;/);
    assert.match(analytics, /if \(!isEnabled\(\)\) return;/, 'capture is a no-op with no key');
});

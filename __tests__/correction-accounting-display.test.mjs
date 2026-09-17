import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import * as accounting from '../src/lib/accountingMessage.mjs';

const require = createRequire(import.meta.url);
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const ts = require('typescript');
const { parseVerifiedCorrectionReceipt, correctionInvoiceDisplay, verifyAccountingMessage,
    parseUnverifiedCorrectionIdentity, isUnverifiedCorrectionPlaceholder } = accounting;
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const theme = { card: '#fff', text: '#111', border: '#ccc', textSec: '#555', blue: '#007bff' };
const safeDetail = 'A correction was recorded in the accounting journal. This record does not establish a new chip payment.';

function receipt(amount = '1234.56') {
    return {
        accounting_verified: true, id: id(1), invoice_type: 'accounting_correction',
        source_ledger_id: id(2), club_id: id(3), union_id: null, amount,
        status: 'generated', chips_transferred: false, due_at: null, transferred_at: null,
        correction_verified: true,
        correction: {
            contract_version: 1, document_id: id(4), invoice_id: id(1), source_ledger_id: id(2),
            event_kind: 'correction_recorded', display_state: 'recorded', amount,
            club_id: id(3), union_id: null,
            recorded_at: '2026-09-15T06:18:21.123456Z', issued_at: '2026-09-15T06:18:22.654321Z',
            payment_proven: false, new_chip_movement_claimed: false, original_payment_invoice_id: null,
        },
    };
}

function message(extra = {}) {
    return { id: id(20), message_type: 'invoice', content: 'Private reason and incident 87654321',
        text: 'Private preview 87654321', media_metadata: {
            kind: 'union_invoice', invoice_number: 'Private diagnostic', outstanding: '-99.99',
            status: 'paid', chips_transferred: true, due_at: '2026-10-01',
            lines: { paid_players: '87654321.09', note: 'Private wallet balance' }, ...extra,
        } };
}

function compile(path, load, processValue, exportName = 'default') {
    const code = ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), 'utf8'), {
        fileName: 'fixture.jsx', compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    const module = { exports: {} };
    new Function('require', 'module', 'exports', 'process', code)(load, module, module.exports, processValue);
    return module.exports[exportName];
}
const Card = compile('../src/components/messenger/AccountingInvoiceCard.js',
    name => name === '../../lib/accountingMessage.mjs' ? accounting : require(name));
const Bubble = compile('../src/components/messenger/MessageBubble.js', name => {
    if (name === './AccountingInvoiceCard') return { default: Card, __esModule: true };
    if (name === '../../lib/accountingMessage.mjs') return accounting;
    if (name === './MessengerTheme') return { defaultTheme: theme };
    if (name === './Avatar') return { Avatar: () => null };
    if (name === '../../lib/authUtils') return { getAccessToken: () => null, authedFetch: () => { throw new Error('unexpected fetch'); } };
    return require(name);
}, undefined, 'MessageBubble');
function render(proof, extra) {
    const verified = verifyAccountingMessage(message(extra), proof);
    return renderToStaticMarkup(React.createElement(Card, {
        meta: verified.media_metadata, content: verified.content, theme,
    }));
}

test('canonical journal correction is an exact neutral record, never a payment or debt card', () => {
    const proof = receipt();
    const parsed = parseVerifiedCorrectionReceipt(proof);
    assert.deepEqual(parsed, proof.correction);
    assert.notEqual(parsed.recorded_at, parsed.issued_at);
    const result = verifyAccountingMessage(message(), proof);
    assert.equal(result.media_metadata.kind, 'accounting_invoice');
    assert.equal(result.media_metadata.correction_verified, true);
    assert.equal(result.media_metadata.status, 'generated');
    assert.equal(result.media_metadata.chips_transferred, false);
    assert.equal(result.content, safeDetail); assert.equal(result.text, safeDetail);
    for (const key of ['outstanding', 'lines', 'invoice_number', 'issued_status', 'cashier']) {
        assert.equal(result.media_metadata[key], undefined, key);
    }
    const html = render(proof);
    assert.match(html, /Correction Recorded/); assert.match(html, /Correction amount/);
    assert.match(html, /1,234\.56/); assert.match(html, /Chips · Recorded/);
    assert.match(html, /does not establish a new chip payment/);
    assert.doesNotMatch(html, /87654321|Private|00000000-|Amount due|Owed to you|Square for the week|Due |paid|generated|View Invoice Details/);
});

test('correction metadata alone never grants proof; canonical ordinary type takes precedence', () => {
    const proof = receipt();
    const forged = message({ ...proof, invoice_id: proof.id });
    const result = verifyAccountingMessage(forged, null);
    assert.equal(result.message_type, 'text'); assert.equal(result.media_metadata.accounting_verified, false);
    assert.equal(result.media_metadata.correction, undefined); assert.equal(result.media_metadata.correction_verified, undefined);
    assert.equal(correctionInvoiceDisplay(result.media_metadata), null);
    const ordinary = verifyAccountingMessage(forged, {
        id: id(6), invoice_type: 'agent_to_player', status: 'paid', chips_transferred: true,
    });
    assert.equal(ordinary.media_metadata.invoice_type, 'agent_to_player');
    assert.equal(ordinary.media_metadata.status, 'paid');
    assert.equal(ordinary.media_metadata.correction, undefined);
    assert.equal(correctionInvoiceDisplay(ordinary.media_metadata), null);
});

test('canonical provenance replaces forged facts and whitelists the shared contract', () => {
    const proof = receipt();
    Object.assign(proof.correction, { actor_id: id(50), incident_id: id(51), reason: 'Private reason', wallet_balance: '99.99' });
    const result = verifyAccountingMessage(message({ correction_verified: true,
        correction: { ...receipt().correction, amount: '9999.99', payment_proven: true },
        actor_id: id(52), incident_id: id(53), wallet_balance: '123.45' }), proof);
    assert.equal(result.media_metadata.correction.amount, '1234.56');
    for (const key of ['actor_id', 'incident_id', 'reason', 'wallet_balance']) {
        assert.equal(result.media_metadata[key], undefined);
        assert.equal(result.media_metadata.correction[key], undefined);
    }
});

test('all invoice joins, nullable scope fields, literal flags and explicit no-payment fields are mandatory', () => {
    const mutations = [
        p => { p.accounting_verified = false; }, p => { p.correction_verified = 'true'; },
        p => { p.correction = null; }, p => { p.status = 'paid'; }, p => { p.chips_transferred = true; },
        p => { delete p.due_at; }, p => { p.due_at = '2026-09-16T00:00:00Z'; },
        p => { delete p.transferred_at; }, p => { p.transferred_at = p.correction.issued_at; },
        p => { p.correction.contract_version = '1'; }, p => { p.correction.event_kind = 'payment'; },
        p => { p.correction.display_state = 'paid'; }, p => { p.correction.payment_proven = true; },
        p => { delete p.correction.payment_proven; }, p => { p.correction.new_chip_movement_claimed = true; },
        p => { delete p.correction.new_chip_movement_claimed; },
        p => { p.correction.original_payment_invoice_id = id(88); }, p => { delete p.correction.original_payment_invoice_id; },
        p => { p.id = id(99); }, p => { p.source_ledger_id = id(99); }, p => { p.club_id = id(99); },
        p => { p.union_id = id(99); }, p => { delete p.union_id; },
        p => { delete p.correction.union_id; }, p => { p.correction.club_id = 'invalid'; },
        p => { p.correction.club_id = null; p.club_id = null; },
    ];
    for (const field of ['document_id', 'invoice_id', 'source_ledger_id']) {
        mutations.push(p => { p.correction[field] = 'invalid'; });
    }
    for (const mutate of mutations) {
        const proof = receipt(); mutate(proof);
        assert.equal(parseVerifiedCorrectionReceipt(proof), null);
        const result = verifyAccountingMessage(message(), proof);
        assert.equal(result.media_metadata.invoice_id, proof.id);
        assert.equal(result.media_metadata.correction_verified, false);
        assert.equal(result.media_metadata.correction, null);
        assert.equal(result.media_metadata.amount, null);
        assert.equal(result.media_metadata.status, null); assert.equal(result.media_metadata.chips_transferred, null);
        assert.equal(result.content, 'Receipt unavailable.');
        const html = render(proof);
        assert.match(html, /Receipt unavailable/); assert.match(html, /Not Available/);
        assert.doesNotMatch(html, /Correction Recorded|1,234\.56|paid|generated|Private|Amount due|View Invoice Details/);
    }
});

test('known invoice without typed proof remains unavailable, including old paid correction', () => {
    for (const proof of [
        { id: id(1), invoice_type: 'accounting_correction', status: 'paid', chips_transferred: true },
        { id: id(1), status: 'paid', chips_transferred: true },
    ]) {
        const result = verifyAccountingMessage(message({ invoice_type: 'accounting_correction' }), proof);
        assert.equal(result.media_metadata.kind, 'accounting_invoice');
        assert.equal(result.media_metadata.correction_verified, false);
        assert.equal(correctionInvoiceDisplay(result.media_metadata).verified, false);
        assert.equal(result.content, 'Receipt unavailable.');
    }
});

test('a real invoice club is required; optional declared union scope must match exactly', () => {
    for (const [club, union] of [[id(3), null], [id(3), id(5)]]) {
        const proof = receipt();
        Object.assign(proof, { club_id: club, union_id: union });
        Object.assign(proof.correction, { club_id: club, union_id: union });
        assert.ok(parseVerifiedCorrectionReceipt(proof));
    }
    const unionOnly = receipt();
    Object.assign(unionOnly, { club_id: null, union_id: id(5) });
    Object.assign(unionOnly.correction, { club_id: null, union_id: id(5) });
    assert.equal(parseVerifiedCorrectionReceipt(unionOnly), null);
    assert.equal(correctionInvoiceDisplay(verifyAccountingMessage(message(), unionOnly).media_metadata).verified, false);
});

test('exact fixed cents stay strings and malformed or lossy money never rounds into proof', () => {
    for (const value of [null, 1234.56, '1', '1.2', '0.00', '-1.00', '0.001', 'NaN', 'Infinity',
        '01.00', '1e2', '10000000000.00', '9'.repeat(100_000)]) {
        assert.equal(parseVerifiedCorrectionReceipt(receipt(value)), null, String(value).slice(0, 40));
    }
    const numericTop = receipt(); numericTop.amount = 1234.56;
    assert.equal(parseVerifiedCorrectionReceipt(numericTop), null);
    const mismatch = receipt(); mismatch.amount = '1234.57'; assert.equal(parseVerifiedCorrectionReceipt(mismatch), null);
    assert.match(render(receipt('9999999999.99')), /9,999,999,999\.99/);
    assert.match(render(receipt('0.01')), /0\.01/);
});

test('separate UTC journal and issue timestamps retain microseconds and reject impossible dates', () => {
    for (const field of ['recorded_at', 'issued_at']) {
        for (const value of [null, '2026-02-30T00:00:00Z', '2026-13-01T00:00:00Z', '2026-09-15',
            '2026-09-15T24:00:00Z', '2026-09-15T06:18:21-05:00', '2026-09-15T06:18:21.1234567Z']) {
            const proof = receipt(); proof.correction[field] = value;
            assert.equal(parseVerifiedCorrectionReceipt(proof), null, `${field}: ${value}`);
        }
    }
    const proof = receipt(); proof.correction.issued_at = '2026-09-15T06:18:22.654321+00:00';
    assert.equal(parseVerifiedCorrectionReceipt(proof).issued_at, proof.correction.issued_at);
});

test('weekly rendering preserves original totals and details without correction promotion', () => {
    const result = verifyAccountingMessage({ message_type: 'invoice', content: 'Weekly detail', media_metadata: {
        kind: 'accounting_invoice', invoice_type: 'club_weekly_accounting', lines: { rake_received: '10.29', paid_players: '2.01' },
        correction_verified: true, correction: receipt().correction,
    } }, { id: id(90), invoice_type: 'club_weekly_accounting', status: 'needs_reconciliation', chips_transferred: false });
    const html = renderToStaticMarkup(React.createElement(Card, { meta: result.media_metadata, content: result.content, theme }));
    assert.match(html, /Weekly Club Statement/); assert.match(html, /Rake Received From Union/);
    assert.match(html, /10\.29/); assert.match(html, /2\.01/); assert.match(html, /Weekly detail/);
    assert.doesNotMatch(html, /Correction Recorded|Correction amount/);
});

test('actual message handler forwards private proof only and retains every correction guard field', async () => {
    const proof = receipt('10.29');
    const canonical = message({ ...proof, invoice_id: proof.id });
    const calls = [];
    const db = { rpc: async name => {
        assert.equal(name, 'fn_get_reactions_for_messages'); return { data: [], error: null };
    } };
    const mocks = {
        serverAuth: { getServerUserWithFallback: async () => ({ user: { id: id(8) } }) },
        supabaseServerClient: { createClient: () => db }, apiRateLimit: { applyRateLimit: () => true, LIMITS: {} },
        apiErrorHandler: { reportApiError: () => {} }, 'accountingMessage.mjs': accounting,
        'messengerWorkspace.mjs': { readMessengerMessages: async (client, user, request) => {
            assert.equal(client, db); calls.push({ user, request }); return [canonical];
        } },
    };
    const handler = compile('../pages/api/messenger/get-messages.js', name => mocks[name.split('/').at(-1)],
        { env: { SUPABASE_SERVICE_ROLE_KEY: 'fixture' } });
    let payload, status = 200;
    const res = { status(value) { status = value; return this; }, json(value) { payload = value; return this; } };
    await handler({ method: 'POST', headers: { authorization: 'Bearer fixture' }, body: {
        conversationId: id(21), userId: id(999), correction: { ...proof.correction, payment_proven: true },
    } }, res);
    assert.equal(status, 200); assert.equal(calls[0].user, id(8));
    const actual = payload.messages[0];
    assert.equal(actual.media_metadata.correction_verified, true);
    assert.deepEqual(actual.media_metadata.correction, proof.correction);
    assert.equal(actual.media_metadata.due_at, null); assert.equal(actual.media_metadata.transferred_at, null);
    assert.equal(actual.media_metadata.union_id, null); assert.equal(actual.media_metadata.amount, '10.29');
    assert.equal(actual.content, safeDetail); assert.equal(actual.text, safeDetail);
    delete canonical.media_metadata.due_at;
    await handler({ method: 'POST', headers: { authorization: 'Bearer fixture' }, body: { conversationId: id(21) } }, res);
    assert.equal(payload.messages[0].media_metadata.correction_verified, false);
    assert.equal(payload.messages[0].content, 'Receipt unavailable.');
});

function historicalIdentity(type = 'agent_to_player') {
    return { invoice_identity_verified: true, correction_unverified: true,
        accounting_verified: false, correction_verified: false,
        id: id(31), invoice_type: type, source_ledger_id: id(32), club_id: id(3), union_id: null };
}

function bubbleHtml(value) {
    return renderToStaticMarkup(React.createElement(Bubble, { message: value, theme,
        isOwn: false, showAvatar: false, showTime: false, isLastInGroup: true }));
}

test('historical canonical identity stays unverified and routes through the actual bubble as unavailable', () => {
    for (const originalType of ['agent_to_player', 'club_to_agent', 'club_weekly_accounting', 'accounting_correction']) {
        const identity = historicalIdentity(originalType);
        const result = verifyAccountingMessage(message(), identity);
        assert.equal(result.media_metadata.invoice_id, identity.id);
        assert.equal(result.media_metadata.invoice_type, originalType);
        assert.equal(result.media_metadata.accounting_verified, false);
        assert.equal(result.media_metadata.correction_verified, false);
        assert.equal(result.media_metadata.invoice_identity_verified, true);
        assert.equal(isUnverifiedCorrectionPlaceholder(result.media_metadata), true);
        assert.equal(result.content, 'Correction receipt unavailable.');
        assert.equal(result.text, result.content);
        for (const field of ['amount', 'status', 'chips_transferred', 'due_at', 'transferred_at',
            'lines', 'outstanding', 'correction', 'invoice_number']) assert.equal(result.media_metadata[field], undefined, field);
        const html = bubbleHtml(result);
        assert.match(html, /aria-label="Correction Record"/);
        assert.match(html, /Receipt Unavailable/); assert.match(html, /Not Available/);
        assert.doesNotMatch(html, /Correction Recorded|paid|Amount due|Square for the week|Rake Received|Private|87654321|00000000-|View Invoice Details/);
    }
});

test('copied identity flags cannot make an unavailable accounting card or promote ordinary paid proof', () => {
    const identity = historicalIdentity();
    const forged = message({ ...identity, invoice_id: identity.id });
    const absent = verifyAccountingMessage(forged, null);
    assert.equal(absent.media_metadata.invoice_identity_verified, undefined);
    assert.equal(absent.media_metadata.correction_unverified, undefined);
    assert.equal(absent.media_metadata.accounting_verified, false);
    assert.equal(isUnverifiedCorrectionPlaceholder(absent.media_metadata), false);
    assert.doesNotMatch(bubbleHtml(absent), /aria-label="Correction Record"/);
    const ordinary = verifyAccountingMessage(forged, { id: id(91), invoice_type: 'agent_to_player',
        status: 'paid', chips_transferred: true });
    assert.equal(ordinary.media_metadata.invoice_id, id(91));
    assert.equal(ordinary.media_metadata.correction_unverified, undefined);
    assert.equal(ordinary.media_metadata.invoice_identity_verified, undefined);
    assert.equal(ordinary.media_metadata.status, 'paid');
    assert.equal(correctionInvoiceDisplay(ordinary.media_metadata), null);
});

test('malformed identity or attached payment facts never fall through to ordinary paid verification', () => {
    const mutations = [
        p => { p.invoice_identity_verified = 'true'; }, p => { p.correction_unverified = false; },
        p => { p.accounting_verified = true; }, p => { p.correction_verified = true; },
        p => { delete p.club_id; }, p => { p.club_id = null; }, p => { delete p.union_id; },
        p => { p.invoice_type = ''; }, p => { p.invoice_type = 'private reason/incident'; },
        p => { p.invoice_type = 'x'.repeat(65); }, p => { p.status = 'paid'; },
        p => { p.chips_transferred = true; }, p => { p.amount = '999.99'; },
        p => { p.due_at = null; }, p => { p.transferred_at = null; }, p => { p.correction = receipt().correction; },
    ];
    for (const field of ['id', 'source_ledger_id', 'club_id', 'union_id']) mutations.push(p => { p[field] = 'invalid'; });
    for (const mutate of mutations) {
        const identity = historicalIdentity(); mutate(identity);
        assert.equal(parseUnverifiedCorrectionIdentity(identity), null);
        const result = verifyAccountingMessage(message(), identity);
        assert.equal(result.media_metadata.accounting_verified, false);
        assert.equal(result.media_metadata.invoice_identity_verified, undefined);
        assert.equal(result.message_type, 'text');
        assert.equal(isUnverifiedCorrectionPlaceholder(result.media_metadata), false);
    }
    const privateExtras = { ...historicalIdentity(), reason: 'Private', actor_id: id(70), balance: '12.34' };
    const result = verifyAccountingMessage(message(), privateExtras);
    for (const field of ['reason', 'actor_id', 'balance']) assert.equal(result.media_metadata[field], undefined);
    assert.doesNotMatch(bubbleHtml(result), /Private|12\.34|00000000-/);
});

test('actual message handler admits only the exact private identity-only projection', async () => {
    const identity = historicalIdentity('club_to_agent');
    let canonical = { ...message(), content: 'Correction receipt unavailable.', media_metadata: {
        kind: 'accounting_invoice', ...identity, invoice_id: identity.id,
    } };
    const db = { rpc: async () => ({ data: [], error: null }) };
    const mocks = {
        serverAuth: { getServerUserWithFallback: async () => ({ user: { id: id(8) } }) },
        supabaseServerClient: { createClient: () => db }, apiRateLimit: { applyRateLimit: () => true, LIMITS: {} },
        apiErrorHandler: { reportApiError: () => {} }, 'accountingMessage.mjs': accounting,
        'messengerWorkspace.mjs': { readMessengerMessages: async (client, user) => {
            assert.equal(client, db); assert.equal(user, id(8)); return [canonical];
        } },
    };
    const handler = compile('../pages/api/messenger/get-messages.js', name => mocks[name.split('/').at(-1)],
        { env: { SUPABASE_SERVICE_ROLE_KEY: 'fixture' } });
    let payload;
    const res = { status() { return this; }, json(value) { payload = value; return this; } };
    const request = { method: 'POST', headers: { authorization: 'Bearer fixture' }, body: {
        conversationId: id(21), userId: id(999), invoice_identity_verified: true, correction_unverified: true,
    } };
    await handler(request, res);
    const result = payload.messages[0];
    assert.equal(result.media_metadata.invoice_type, identity.invoice_type);
    assert.equal(result.media_metadata.invoice_id, identity.id);
    assert.equal(result.media_metadata.accounting_verified, false);
    assert.equal(isUnverifiedCorrectionPlaceholder(result.media_metadata), true);
    assert.match(bubbleHtml(result), /Receipt Unavailable/);
    canonical.media_metadata.status = 'paid';
    await handler(request, res);
    assert.equal(payload.messages[0].media_metadata.invoice_identity_verified, undefined);
    assert.equal(payload.messages[0].media_metadata.accounting_verified, false);
    assert.equal(payload.messages[0].message_type, 'text');
    canonical = message({ kind: 'accounting_invoice' });
    await handler(request, res);
    assert.equal(payload.messages[0].media_metadata.invoice_identity_verified, undefined);
    assert.equal(payload.messages[0].message_type, 'text');
});

// Source-authored coverage; execute only through the protected native catalog.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import * as accounting from '../src/lib/accountingMessage.mjs';

const require = createRequire(import.meta.url);
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const ts = require('typescript');
const { parseVerifiedCreditChangeReceipt, creditChangeInvoiceDisplay, verifyAccountingMessage } = accounting;
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const theme = { card: '#fff', text: '#111', border: '#ccc', textSec: '#555', blue: '#007bff' };
const detail = 'This records a credit-capacity change. No chips were transferred and no payment is due.';
function proof() {
    return { accounting_verified: true, credit_change_verified: true, id: id(1), club_id: id(2),
        invoice_type: 'credit_limit_change', source_ledger_id: null, status: 'generated',
        chips_transferred: false, due_at: null, transferred_at: null, amount: '1234.56',
        credit_change: { contract_version: 1, document_id: id(3), invoice_id: id(1), operation_receipt_id: id(4),
            operation_id: id(5), assignment_id: id(6), club_id: id(2), agent_id: id(7), target_user_id: id(8), actor_user_id: id(9),
            event_kind: 'credit_limit_reduced', display_state: 'recorded', amount: '1234.56', requested_reduction: '1234.56',
            applied_reduction: '1234.56', before_limit: '5000.00', after_limit: '3765.44',
            before_prepaid: false, after_prepaid: false, before_revision: '9007199254740992', after_revision: '9007199254740993',
            recorded_at: '2026-09-15T15:10:11.123456Z', issued_at: '2026-09-15T15:10:11.123456Z',
            chip_movement_recorded: false, payable: false, amount_due: '0.00' } };
}
function message(extra = {}) {
    return { id: id(30), message_type: 'invoice', content: 'Private debt 87654321.09', text: 'Private reason',
        media_metadata: { kind: 'union_invoice', invoice_number: 'Private invoice', invoice_type: 'credit_limit_change',
            status: 'paid', chips_transferred: true, outstanding: '87654321.09', due_at: '2026-09-16',
            lines: { rake_received: '87654321.09', note: 'Private' }, ...extra } };
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
const render = result => renderToStaticMarkup(React.createElement(Card,
    { meta: result.media_metadata, content: result.content, theme }));

test('actual credit record card describes the historical limit and explicitly carries no payment', () => {
    const p = proof();
    assert.deepEqual(parseVerifiedCreditChangeReceipt(p), p.credit_change);
    const result = verifyAccountingMessage(message(), p);
    assert.equal(result.content, detail); assert.equal(result.text, detail);
    for (const key of ['lines', 'outstanding', 'invoice_number', 'issued_status', 'correction', 'cashier']) {
        assert.equal(result.media_metadata[key], undefined, key);
    }
    const html = render(result);
    assert.match(html, /Credit Line Updated/); assert.match(html, /Requested reduction/);
    assert.match(html, /Applied reduction/); assert.match(html, /1,234\.56/);
    assert.match(html, /Limit after this change/); assert.match(html, /3,765\.44/);
    assert.match(html, /Credit capacity · Recorded/); assert.match(html, /No chips were transferred and no payment is due/);
    assert.doesNotMatch(html, /Current limit|Amount due|87654321|Private|00000000-|Chips ·|paid|generated|View Invoice Details/);
    const bubble = renderToStaticMarkup(React.createElement(Bubble, { message: result, theme,
        isOwn: false, showAvatar: false, showTime: false, isLastInGroup: true }));
    assert.match(bubble, /Credit Change Record/); assert.match(bubble, /Limit after this change/);
});

test('exact cents survive numeric15,2 limits and numeric64 revisions without Number conversion', () => {
    const p = proof();
    Object.assign(p.credit_change, { before_limit: '9999999999999.99', after_limit: '9999999999999.98',
        requested_reduction: '0.01', applied_reduction: '0.01', amount: '0.01',
        before_revision: '9223372036854775806', after_revision: '9223372036854775807' }); p.amount = '0.01';
    assert.ok(parseVerifiedCreditChangeReceipt(p));
    assert.match(render(verifyAccountingMessage(message(), p)), /9,999,999,999,999\.98/);
    Object.assign(p.credit_change, { before_limit: '1.23', after_limit: '0.00', requested_reduction: '1000000000.00',
        applied_reduction: '1.23', amount: '1.23', after_prepaid: true }); p.amount = '1.23';
    assert.ok(parseVerifiedCreditChangeReceipt(p));
    assert.match(render(verifyAccountingMessage(message(), p)), /Prepaid/);
});

test('missing or contradictory typed evidence cannot fall through to a paid invoice card', () => {
    const mutations = [
        p => { p.accounting_verified = false; }, p => { p.credit_change_verified = 'true'; },
        p => { p.status = 'paid'; }, p => { p.chips_transferred = true; }, p => { delete p.due_at; },
        p => { p.transferred_at = p.credit_change.recorded_at; }, p => { p.source_ledger_id = id(40); },
        p => { p.credit_change = null; }, p => { p.id = id(40); }, p => { p.club_id = id(40); },
        p => { p.amount = 1234.56; }, p => { p.credit_change.contract_version = '1'; },
        p => { p.credit_change.event_kind = 'payment'; }, p => { p.credit_change.payable = true; },
        p => { delete p.credit_change.chip_movement_recorded; }, p => { p.credit_change.amount_due = '1.00'; },
        p => { p.credit_change.applied_reduction = '0.00'; }, p => { p.credit_change.requested_reduction = '1234.55'; },
        p => { p.credit_change.after_limit = '3765.43'; }, p => { p.credit_change.before_prepaid = true; },
        p => { p.credit_change.after_prepaid = true; }, p => { p.credit_change.after_revision = p.credit_change.before_revision; },
        p => { p.credit_change.after_revision = '9223372036854775808'; },
        p => { p.credit_change.document_id = p.credit_change.assignment_id; },
        p => { p.credit_change.recorded_at = '2026-02-30T15:10:11.123456Z'; },
        p => { p.credit_change.issued_at = '2026-09-15T15:10:11.123457Z'; },
        p => { p.credit_change.recorded_at = '2026-09-15T15:10:11Z'; },
    ];
    for (const value of ['NaN', 'Infinity', '-1.00', '1e2', '01.00', '1.000', '10000000000000.00', 1]) {
        mutations.push(p => { p.credit_change.before_limit = value; });
    }
    for (const key of ['document_id', 'invoice_id', 'operation_receipt_id', 'operation_id', 'assignment_id',
        'club_id', 'agent_id', 'target_user_id', 'actor_user_id']) {
        mutations.push(p => { p.credit_change[key] = '00000000-0000-0000-0000-000000000000'; });
    }
    for (const mutate of mutations) {
        const p = proof(); mutate(p);
        assert.equal(parseVerifiedCreditChangeReceipt(p), null);
        const result = verifyAccountingMessage(message(), p);
        assert.equal(result.media_metadata.credit_change_verified, false);
        assert.equal(result.media_metadata.status, null); assert.equal(result.media_metadata.amount, null);
        assert.equal(result.content, 'Credit change receipt unavailable.');
        const html = render(result);
        assert.match(html, /Receipt Unavailable/); assert.match(html, /Not Available/);
        assert.doesNotMatch(html, /1,234\.56|3,765\.44|paid|Private|87654321|Chips ·|View Invoice Details/);
    }
    for (const p of [{ id: id(1), invoice_type: 'credit_limit_change', status: 'paid', chips_transferred: true },
        { id: id(1), status: 'paid', chips_transferred: true }]) {
        assert.equal(creditChangeInvoiceDisplay(verifyAccountingMessage(message(), p).media_metadata).verified, false);
    }
});

test('copied metadata does not grant credit proof and canonical ordinary types keep their meaning', () => {
    const p = proof(); const forged = message({ ...p, invoice_id: p.id });
    const absent = verifyAccountingMessage(forged, null);
    assert.equal(absent.message_type, 'text'); assert.equal(absent.media_metadata.accounting_verified, false);
    assert.equal(absent.media_metadata.credit_change, undefined); assert.equal(absent.media_metadata.credit_change_verified, undefined);
    const ordinary = verifyAccountingMessage(forged, { id: id(60), invoice_type: 'agent_to_player', status: 'paid', chips_transferred: true });
    assert.equal(ordinary.media_metadata.invoice_type, 'agent_to_player'); assert.equal(creditChangeInvoiceDisplay(ordinary.media_metadata), null);
    Object.assign(p.credit_change, { reason: 'Private', credit_used: '87654321.09', wallet_balance: '87654321.09' });
    const result = verifyAccountingMessage(forged, p);
    for (const key of ['reason', 'credit_used', 'wallet_balance']) assert.equal(result.media_metadata.credit_change[key], undefined);
    assert.doesNotMatch(render(result), /Private|87654321/);
});

test('actual message API transports credit proof only from the authenticated private reader', async () => {
    const p = proof(); let canonical = { ...message(), media_metadata: { ...p, invoice_id: p.id } };
    const db = { rpc: async () => ({ data: [], error: null }) };
    const mocks = {
        serverAuth: { getServerUserWithFallback: async () => ({ user: { id: id(8) } }) },
        supabaseServerClient: { createClient: () => db }, apiRateLimit: { applyRateLimit: () => true, LIMITS: {} },
        sentryWrap: { reportApiError: () => {} }, 'accountingMessage.mjs': accounting,
        'messengerWorkspace.mjs': { readMessengerMessages: async (client, user) => {
            assert.equal(client, db); assert.equal(user, id(8)); return [canonical];
        } },
    };
    const handler = compile('../pages/api/messenger/get-messages.js', name => mocks[name.split('/').at(-1)],
        { env: { SUPABASE_SERVICE_ROLE_KEY: 'fixture' } });
    let payload; const res = { status() { return this; }, json(value) { payload = value; return this; } };
    const request = { method: 'POST', headers: { authorization: 'Bearer fixture' }, body: {
        conversationId: id(31), userId: id(99), credit_change_verified: true, credit_change: p.credit_change } };
    await handler(request, res);
    assert.equal(payload.messages[0].media_metadata.credit_change_verified, true);
    assert.equal(payload.messages[0].media_metadata.credit_change.after_limit, '3765.44');
    canonical.media_metadata.credit_change = null;
    await handler(request, res);
    assert.equal(payload.messages[0].media_metadata.credit_change_verified, false);
    assert.match(render(payload.messages[0]), /Receipt Unavailable/);
    canonical = message(); await handler(request, res);
    assert.equal(payload.messages[0].media_metadata.accounting_verified, false);
    assert.equal(payload.messages[0].message_type, 'text');
});

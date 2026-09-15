import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import * as accounting from '../src/lib/accountingMessage.mjs';

const require = createRequire(import.meta.url);
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const ts = require('typescript');
const { parseVerifiedCashierReceipt, verifyAccountingMessage, cashierInvoiceDisplay } = accounting;
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const theme = { card: '#fff', text: '#111', border: '#ccc', textSec: '#555', blue: '#007bff' };

function receipt(kind = 'hold', amount = '1234.56') {
    const hold = kind === 'hold', approval = kind === 'approval', expiry = kind === 'expiry_refund';
    const player = id(8), actor = expiry ? null : hold || kind === 'cancellation' ? player : id(12);
    return {
        id: id(1), invoice_type: 'cashier_cashout', source_ledger_id: id(6), club_id: id(7), amount,
        status: hold ? 'generated' : 'paid', chips_transferred: !hold, accounting_verified: true, cashier_verified: true,
        cashier: {
            contract_version: 1, event_id: id(2), invoice_id: id(1), cashout_id: id(3), escrow_id: id(4),
            source_transaction_id: id(5), source_ledger_id: id(6), club_id: id(7), player_id: player,
            assigned_agent_id: id(9), issuer_representative_id: id(10), actor_user_id: actor,
            actor_role: expiry ? 'system' : hold || kind === 'cancellation' ? 'player' : 'admin',
            event_kind: kind, display_state: hold ? 'held' : approval ? 'approved' : 'refunded', amount,
            occurred_at: '2026-09-15T04:18:21.123456+00:00', issued_at: '2026-09-15T04:18:22.654321+00:00',
            hold_event_id: hold ? null : id(13), hold_invoice_id: hold ? null : id(14),
            ledger_from_type: hold ? 'player_wallet' : 'escrow', ledger_from_entity_id: hold ? player : id(4),
            ledger_to_type: hold ? 'escrow' : approval ? 'agent_wallet' : 'player_wallet',
            ledger_to_entity_id: hold ? id(4) : approval ? actor : player,
            custody_movement_recorded: true, cashout_completed: approval, refund_recorded: !hold && !approval,
        },
    };
}

function message(extra = {}) {
    return { id: id(20), message_type: 'invoice', content: 'Original document',
        media_metadata: { kind: 'accounting_invoice', invoice_number: 'CA-123', ...extra } };
}

function compiled(path, load) {
    const source = fs.readFileSync(new URL(path, import.meta.url), 'utf8');
    const code = ts.transpileModule(source, { fileName: 'component.jsx', compilerOptions: {
        jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2022,
    } }).outputText;
    const module = { exports: {} };
    new Function('require', 'module', 'exports', code)(load, module, module.exports);
    return module.exports.default;
}
const Invoice = compiled('../src/components/messenger/AccountingInvoiceCard.js',
    name => name === '../../lib/accountingMessage.mjs' ? accounting : require(name));
function html(proof, extra = {}, content = 'Private wallet balance 87654321.09 and escrow ' + id(4)) {
    const verified = verifyAccountingMessage(message(extra), proof);
    return renderToStaticMarkup(React.createElement(Invoice, { meta: verified.media_metadata, content, theme }));
}

for (const [kind, label] of [['hold', 'Chips Held'], ['approval', 'Cashout Approved'],
    ['cancellation', 'Chips Returned'], ['decline', 'Chips Returned'], ['expiry_refund', 'Chips Returned']]) {
    test(`${kind} displays only its verified chip lifecycle with exact cents`, () => {
        const proof = receipt(kind);
        const parsed = parseVerifiedCashierReceipt(proof);
        assert.equal(parsed.event_kind, kind);
        assert.equal(parsed.occurred_at, proof.cashier.occurred_at);
        assert.equal(parsed.issued_at, proof.cashier.issued_at);
        const rendered = html(proof);
        assert.ok(rendered.includes(label));
        assert.match(rendered, /1,234\.56/);
        assert.doesNotMatch(rendered, /87654321\.09|00000000-|Private wallet balance|paid|fiat|cash paid|Pay Invoice|View Invoice Details/);
        if (kind === 'approval') assert.match(rendered, /Chips were transferred to the approving cashier/);
        if (kind === 'hold') assert.match(rendered, /held while the cashout is reviewed/);
    });
}

test('metadata alone cannot supply a verified cashier receipt', () => {
    const proof = receipt('approval');
    const forged = message({ ...proof, invoice_id: proof.id, accounting_verified: true });
    const result = verifyAccountingMessage(forged, null);
    assert.equal(result.message_type, 'text');
    assert.equal(result.media_metadata.accounting_verified, false);
    assert.equal(result.media_metadata.cashier, undefined);
    assert.equal(result.media_metadata.cashier_verified, undefined);
    assert.equal(cashierInvoiceDisplay(result.media_metadata), null);
    assert.equal(verifyAccountingMessage(forged, {}).media_metadata.accounting_verified, false);
});

test('a separate canonical receipt replaces forged typed metadata and drops private extras', () => {
    const proof = receipt('hold');
    proof.cashier.agent_wallet_after = '999999.99';
    const forged = receipt('approval');
    const result = verifyAccountingMessage(message({ ...forged, invoice_id: id(999), accounting_verified: true,
        player_balance_after: '98765.43', lines: { approver_balance: '999999.99' } }), proof);
    assert.equal(result.media_metadata.invoice_id, proof.id);
    assert.equal(result.media_metadata.cashier.event_kind, 'hold');
    assert.equal(result.media_metadata.cashier.actor_user_id, proof.cashier.player_id);
    assert.equal(result.media_metadata.cashier.agent_wallet_after, undefined);
    assert.equal(result.media_metadata.player_balance_after, undefined);
    assert.equal(result.media_metadata.lines, undefined);
    assert.equal(result.media_metadata.cashier_verified, true);
});

test('every immutable source identity and top-level invoice join must match', () => {
    for (const key of ['event_id', 'invoice_id', 'cashout_id', 'escrow_id', 'source_transaction_id',
        'source_ledger_id', 'club_id', 'player_id', 'assigned_agent_id', 'issuer_representative_id']) {
        const proof = receipt(); proof.cashier[key] = 'not-an-id';
        assert.equal(parseVerifiedCashierReceipt(proof), null, key);
    }
    for (const key of ['id', 'source_ledger_id', 'club_id']) {
        const proof = receipt(); proof[key] = id(999);
        assert.equal(parseVerifiedCashierReceipt(proof), null, key);
    }
});

test('wrong state, transfer flags, status or source wallet cannot claim a cashier phase', () => {
    const mutations = [
        p => { p.cashier.event_kind = 'expired'; }, p => { p.cashier.display_state = 'paid'; },
        p => { p.cashier.contract_version = '1'; }, p => { p.cashier_verified = 'true'; },
        p => { p.accounting_verified = false; },
        p => { p.cashier.custody_movement_recorded = false; }, p => { p.cashier.cashout_completed = true; },
        p => { p.cashier.refund_recorded = true; }, p => { p.chips_transferred = true; },
        p => { p.status = 'paid'; }, p => { p.cashier.ledger_from_type = 'club_treasury'; },
        p => { p.cashier.ledger_from_entity_id = id(999); }, p => { p.cashier.ledger_to_entity_id = id(999); },
        p => { p.cashier.assigned_agent_id = p.cashier.player_id; },
        p => { p.cashier.ledger_to_type = 'agent_wallet'; }, p => { p.cashier.hold_invoice_id = id(14); },
    ];
    for (const mutate of mutations) {
        const proof = receipt(); mutate(proof);
        assert.equal(parseVerifiedCashierReceipt(proof), null);
        const result = verifyAccountingMessage(message(), proof);
        assert.equal(result.media_metadata.invoice_id, proof.id);
        assert.equal(result.media_metadata.cashier_verified, false);
        assert.equal(result.media_metadata.cashier, null);
        const rendered = html(proof);
        assert.match(rendered, /Receipt details are unavailable/);
        assert.doesNotMatch(rendered, /Chips Held|Cashout Approved|Chips Returned|Private wallet balance/);
    }
});

test('terminal documents require a distinct original hold, and preserve refund identity', () => {
    for (const key of ['hold_event_id', 'hold_invoice_id']) {
        const proof = receipt('approval'); proof.cashier[key] = null;
        assert.equal(parseVerifiedCashierReceipt(proof), null);
    }
    const same = receipt('approval'); same.cashier.hold_invoice_id = same.id;
    assert.equal(parseVerifiedCashierReceipt(same), null);
    const refund = receipt('decline'); refund.cashier.ledger_to_entity_id = refund.cashier.actor_user_id;
    assert.equal(parseVerifiedCashierReceipt(refund), null);
    const wrongOrigin = receipt('cancellation'); wrongOrigin.cashier.ledger_from_type = 'agent_wallet';
    assert.equal(parseVerifiedCashierReceipt(wrongOrigin), null);
});

test('the actual actor is distinct from the assigned cashier and owner representative', () => {
    const approval = receipt('approval');
    assert.notEqual(approval.cashier.actor_user_id, approval.cashier.assigned_agent_id);
    assert.notEqual(approval.cashier.actor_user_id, approval.cashier.issuer_representative_id);
    assert.equal(parseVerifiedCashierReceipt(approval).actor_user_id, approval.cashier.actor_user_id);
    approval.cashier.actor_role = 'player'; assert.equal(parseVerifiedCashierReceipt(approval), null);
    const self = receipt('approval'); self.cashier.actor_user_id = self.cashier.player_id;
    self.cashier.ledger_to_entity_id = self.cashier.player_id; assert.equal(parseVerifiedCashierReceipt(self), null);
    const hold = receipt(); hold.cashier.actor_role = 'sub_agent'; assert.ok(parseVerifiedCashierReceipt(hold));
    hold.cashier.actor_user_id = hold.cashier.issuer_representative_id; assert.equal(parseVerifiedCashierReceipt(hold), null);
    const expiry = receipt('expiry_refund'); expiry.cashier.actor_user_id = expiry.cashier.issuer_representative_id;
    assert.equal(parseVerifiedCashierReceipt(expiry), null);
});

test('cashier money rejects missing, fractional, nonfinite or oversized text without rounding', () => {
    for (const amount of [null, 1234.56, '1', '1.2', '0.00', '-1.00', '0.001', 'NaN', 'Infinity', '01.00',
        '1e2', '10000000000.00', '9'.repeat(100_000)]) {
        const proof = receipt(); proof.cashier.amount = amount;
        assert.equal(parseVerifiedCashierReceipt(proof), null, String(amount).slice(0, 50));
    }
    const mismatch = receipt(); mismatch.amount = '1234.57'; assert.equal(parseVerifiedCashierReceipt(mismatch), null);
    const maximum = receipt('hold', '9999999999.99');
    assert.equal(cashierInvoiceDisplay(verifyAccountingMessage(message(), maximum).media_metadata).amount, '9,999,999,999.99');
    const minimum = receipt('cancellation', '0.01'); assert.match(html(minimum), /0\.01/);
});

test('invalid dates do not acquire a typed receipt and precise valid timestamps are retained', () => {
    for (const value of ['2026-02-30T04:18:21Z', '2026-13-01T04:18:21Z', '2026-09-15', 'Infinity', null]) {
        const proof = receipt(); proof.cashier.occurred_at = value;
        assert.equal(parseVerifiedCashierReceipt(proof), null);
    }
    const proof = receipt();
    assert.equal(parseVerifiedCashierReceipt(proof).occurred_at, '2026-09-15T04:18:21.123456+00:00');
});

test('ordinary and weekly receipts retain their existing verified status and presentation', () => {
    const generic = verifyAccountingMessage(message({ status: 'pending', amount: '100.29', cashier_verified: true,
        cashier: receipt().cashier }), { id: 'legacy-invoice', status: 'paid', chips_transferred: true });
    assert.equal(generic.media_metadata.invoice_id, 'legacy-invoice');
    assert.equal(generic.media_metadata.status, 'paid'); assert.equal(generic.media_metadata.issued_status, 'pending');
    assert.equal(generic.media_metadata.cashier, undefined);
    const genericHtml = renderToStaticMarkup(React.createElement(Invoice, { meta: generic.media_metadata, content: 'Original Invoice', theme }));
    assert.match(genericHtml, /100\.29/); assert.match(genericHtml, /View Invoice Details/);
    assert.match(genericHtml, /Original Invoice/);
    const weekly = { invoice_type: 'club_weekly_accounting', preview: true, status: 'needs_reconciliation',
        lines: { rake_received: '100.29', paid_players: null, downstream_redistributed: '12.34' } };
    const weeklyHtml = renderToStaticMarkup(React.createElement(Invoice, { meta: weekly, content: 'Original Statement', theme }));
    for (const label of ['Weekly Club Statement', 'Rake Received From Union', 'Not Available', 'Further Sent By Agents']) {
        assert.ok(weeklyHtml.includes(label));
    }
    assert.match(weeklyHtml, /View Statement Details/);
});

test('the existing message API passes only the authenticated private-reader proof to normalization', async () => {
    const proof = receipt('approval', '10.29');
    const canonical = message({ ...proof, invoice_id: proof.id, accounting_verified: true });
    const calls = [], db = { async rpc() { return { data: [] }; } };
    const source = fs.readFileSync(new URL('../pages/api/messenger/get-messages.js', import.meta.url), 'utf8');
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const module = { exports: {} };
    const mocks = {
        serverAuth: { getServerUserWithFallback: async () => ({ user: { id: id(8) } }) },
        supabaseServerClient: { createClient: () => db }, apiRateLimit: { applyRateLimit: () => true, LIMITS: {} },
        sentryWrap: { reportApiError: () => {} }, 'accountingMessage.mjs': accounting,
        'messengerWorkspace.mjs': { readMessengerMessages: async (client, user, request) => {
            assert.equal(client, db); calls.push({ user, request }); return [canonical];
        } },
    };
    new Function('require', 'module', 'exports', 'process', code)(name => mocks[name.split('/').at(-1)],
        module, module.exports, { env: { SUPABASE_SERVICE_ROLE_KEY: 'fixture' } });
    let payload, status = 200;
    const res = { status(value) { status = value; return this; }, json(value) { payload = value; return this; } };
    await module.exports.default({ method: 'POST', headers: { authorization: 'Bearer fixture' },
        body: { conversationId: id(21), userId: id(999), cashier: receipt('hold').cashier } }, res);
    assert.equal(status, 200); assert.equal(calls[0].user, id(8));
    const meta = payload.messages[0].media_metadata;
    assert.equal(meta.cashier_verified, true); assert.equal(meta.cashier.event_kind, 'approval');
    assert.equal(meta.cashier.invoice_id, proof.id); assert.equal(meta.source_ledger_id, proof.source_ledger_id);
    assert.equal(meta.cashier.amount, '10.29'); assert.equal(meta.cashier.issued_at, proof.cashier.issued_at);
});

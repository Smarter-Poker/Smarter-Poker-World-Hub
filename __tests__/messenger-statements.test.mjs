import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as accounting from '../src/lib/accountingMessage.mjs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const ts = require('typescript');
function load(path, resolver = require, environment = process) {
    const code = ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), 'utf8'), {
        fileName: 'module.jsx', compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const module = { exports: {} };
    new Function('require', 'module', 'exports', 'process', code)(resolver, module, module.exports, environment);
    return module.exports.default;
}
const componentRequire = name => name === '../../lib/accountingMessage.mjs' ? accounting : require(name);
const Card = load('../src/components/messenger/AccountingStatementCard.js', componentRequire);
const Invoice = load('../src/components/messenger/AccountingInvoiceCard.js', componentRequire);
const theme = { card: '#242526', text: '#fff', textSec: '#bbb', border: '#444', blue: '#0084ff' };
const document = { scope: 'agent', club_name: 'Example', payload: { period_start: '2026-11-09T08:00:00Z', period_end: '2026-11-16T08:00:00Z',
    agent_user_id: 'self', totals: { fees: 394.06, poker_net: 96.47, player_rakeback: 17.98, agent_net: 121.58 },
    people: [{ user_id: 'self', name: 'Self', role: 'super_agent', fees: 214.18, poker_net: 438.79, player_rakeback: 0, agent_net: 121.58, agent_commission: 139.56, own_play_commission: 76.81, downline_commission: 62.75 }],
} };
test('each design displays the saved amounts and an inclusive week without changing financial meaning', () => {
    for (const variant of ['overview', 'ledger', 'compact']) {
        const html = renderToStaticMarkup(React.createElement(Card, { document, theme, variant }));
        for (const figure of ['394.06', '17.98', '121.58', '139.56', '76.81', '62.75']) assert.ok(html.includes(figure), figure);
        assert.match(html, /Nov 9, 2026.*Nov 15, 2026/);
        assert.doesNotMatch(html, /Nov 16, 2026|undefined|NaN/);
        assert.match(html, /You and your downline/);
        assert.match(html, /Retained Until You Delete It/);
    }
});
test('missing posted amounts stay unavailable rather than becoming a false zero', () => {
    const html = renderToStaticMarkup(React.createElement(Card, { document: { ...document, payload: { ...document.payload, totals: {} } }, theme }));
    assert.match(html, /Unavailable/);
});
test('statement route uses verified actor, rejects malformed requests and never turns read failure into empty success', async () => {
    const calls = []; let databaseError = null;
    const db = { rpc: async (name, args) => { calls.push({ name, args }); return { data: { success: true, documents: [] }, error: databaseError }; } };
    const handler = load('../pages/api/messenger/statements.js', name => ({
        supabaseServerClient: { createClient: () => db }, serverAuth: { getServerUserWithFallback: async () => ({ user: { id: 'verified-actor' } }) },
        apiRateLimit: { applyRateLimit: () => true, LIMITS: {} },
    })[name.split('/').at(-1)], { env: { SUPABASE_SERVICE_ROLE_KEY: 'test-only' } });
    let status, payload; const res = { setHeader() {}, status(value) { status = value; return this; }, json(value) { payload = value; return this; } };
    const clubId = '11111111-1111-4111-8111-111111111111';
    await handler({ method: 'POST', body: { clubId, userId: 'forged' } }, res);
    assert.equal(status, 200); assert.equal(calls[0].args.p_user_id, 'verified-actor');
    await handler({ method: 'POST', body: { clubId: 'invalid' } }, res);
    assert.equal(status, 400); assert.equal(calls.length, 1);
    databaseError = { message: 'offline' };
    await handler({ method: 'POST', body: { clubId } }, res);
    assert.equal(status, 503); assert.equal(payload.success, false);
});
test('payment API uses verified receiving actor, keeps operation identity and reports conflicts', async () => {
    const calls = []; let failure = null;
    const db = { rpc: async (name,args) => { calls.push({ name,args }); return { data: { success:true },error:failure }; } };
    const handler = load('../pages/api/messenger/receivables.js', name => ({
        supabaseServerClient:{createClient:()=>db},serverAuth:{getServerUserWithFallback:async()=>({user:{id:'verified'}})},
        apiRateLimit:{applyRateLimit:()=>true,LIMITS:{}},
    })[name.split('/').at(-1)], {env:{SUPABASE_SERVICE_ROLE_KEY:'test-only'}});
    let status;const res={setHeader(){},status(n){status=n;return this;},json(){return this;}};
    const payment={invoice_id:'11111111-1111-4111-8111-111111111111',operation_id:'22222222-2222-4222-8222-222222222222',amount:40,expected_remaining:100,reference:'bank-123'};
    await handler({method:'POST',body:{action:'record',userId:'forged',payments:[payment]}},res);
    assert.equal(status,200);assert.equal(calls[0].args.p_user,'verified');assert.deepEqual(calls[0].args.p_items,[payment]);
    for(const amount of [0,-1,0.001,NaN,Infinity]) { await handler({method:'POST',body:{action:'record',payments:[{...payment,amount}]}},res);assert.equal(status,400); }
    failure={code:'40001',message:'Invoice changed'};
    await handler({method:'POST',body:{action:'record',payments:[payment]}},res);assert.equal(status,409);
    failure={code:'42501',message:'Not authorized'};
    await handler({method:'POST',body:{action:'status',invoiceId:payment.invoice_id}},res);assert.equal(status,403);
});

const clubDetails = { version: 1, period_start: document.payload.period_start, period_end: document.payload.period_end, timezone: 'America/Los_Angeles',
    rake_status: 'certified', cash_rake: 4830.99, tournament_rake: 323.82, total_rake: 5154.81,
    player_results_status: 'recorded', weekly_player_results: { version: 1, sign_convention: 'positive_club_owes_union', total_net_loss: 7896.86, cash_net_loss: 7633.04, tournament_net_loss: 263.82, weekly_net_due_to_union: 4511.16 },
    settlement_status: 'recorded', settlement: { invoice_id: '11111111-1111-4111-8111-111111111111', invoice_number: 'WEEK-1', direction: 'club owes union', remaining: 1253.62 } };
function clubHtml(details, variant, legacy = false) {
    return renderToStaticMarkup(React.createElement(legacy ? Invoice : Card, legacy
        ? { meta: { invoice_type: 'club_weekly_accounting', weekly_club_details: details, lines: { rake_earned: 5154.81 } }, theme, variant }
        : { document: { scope: 'club', club_name: 'Example', payload: { ...document.payload, rake_earned: 5154.81, weekly_club_details: details } }, theme, variant }));
}
test('all three club statement and legacy designs distinguish player results, rake split, full net and unpaid invoice', () => {
    for (const variant of ['overview', 'ledger', 'compact']) for (const legacy of [false, true]) {
        const html = clubHtml(clubDetails, variant, legacy);
        for (const text of ['Players Lost', '7,896.86', 'Cash Rake', '4,830.99', 'Tournament Rake', '323.82', 'Total Rake', '5,154.81', 'Full Weekly Net · Club Owes Union', '4,511.16', 'Invoice Unpaid · Club Owes Union', '1,253.62', 'Not An Additional Payment Request']) assert.ok(html.includes(text), `${variant}/${legacy}: ${text}`);
    }
});
test('winning clubs and even weeks use explicit result conventions, never the ECO sign', () => {
    for (const variant of ['overview', 'ledger', 'compact']) {
        const html = clubHtml({ ...clubDetails, weekly_player_results: { ...clubDetails.weekly_player_results, total_net_loss: -200, weekly_net_due_to_union: -350, eco_charge: 999 }, settlement: { ...clubDetails.settlement, direction: 'union owes club', remaining: 80 } }, variant);
        assert.match(html, /Players Won/); assert.match(html, /Full Weekly Net · Union Owes Club/); assert.match(html, /Invoice Unpaid · Union Owes Club/); assert.doesNotMatch(html, /999/);
        assert.match(clubHtml({ ...clubDetails, weekly_player_results: { ...clubDetails.weekly_player_results, total_net_loss: 0, weekly_net_due_to_union: 0 } }, variant), /Full Weekly Net · Even/);
    }
});
test('unavailable splits preserve independently recorded results and never invent zeros or debt direction', () => {
    const html = clubHtml({ ...clubDetails, rake_status: 'unavailable', cash_rake: 0, tournament_rake: 0 }, 'overview');
    assert.match(html, /Players Lost/); assert.match(html, /7,896.86/); assert.match(html, /Cash Rake<\/dt><dd[^>]*>Unavailable/);
    const missing = clubHtml(null, 'overview'); assert.match(missing, /Players Won \/ Lost/); assert.doesNotMatch(missing, /Club Owes Union|Union Owes Club/);
    const invalid = clubHtml({ ...clubDetails, weekly_player_results: { ...clubDetails.weekly_player_results, sign_convention: 'unknown' } }, 'compact');
    assert.doesNotMatch(invalid, /Players Lost|4,511.16/);
});
test('weekly details only survive verification from an authorized invoice receipt', () => {
    const message = { message_type: 'invoice', media_metadata: { invoice_type: 'club_weekly_accounting', weekly_club_details: clubDetails } };
    assert.equal(accounting.verifyAccountingMessage(message, { id: 'issued', invoice_type: 'club_weekly_accounting' }).media_metadata.weekly_club_details, null);
    assert.equal(accounting.verifyAccountingMessage(message, null).media_metadata.weekly_club_details, undefined);
    const valid = accounting.verifyAccountingMessage(message, { id: 'issued', invoice_type: 'club_weekly_accounting', weekly_club_details: clubDetails });
    assert.equal(valid.media_metadata.weekly_club_details.weekly_player_results.weekly_net_due_to_union, 4511.16);
});

test('actual message API obtains club details only through the verified recipient and invoice', async () => {
    const calls = []; let denied = false, failure = false;
    const row = { id: 'message', sender_id: 'other', message_type: 'invoice', media_metadata: { accounting_verified: true, invoice_type: 'club_weekly_accounting', invoice_id: clubDetails.settlement.invoice_id, weekly_club_details: { forged: true } } };
    const db = { rpc: async (name, args) => {
        if (name !== 'fn_messenger_weekly_club_details') return { data: [], error: null };
        calls.push(args); return { data: denied ? null : clubDetails, error: failure ? { message: 'offline' } : null };
    } };
    const handler = load('../pages/api/messenger/get-messages.js', name => ({
        supabaseServerClient: { createClient: () => db }, serverAuth: { getServerUserWithFallback: async () => ({ user: { id: 'verified-actor' } }) },
        apiRateLimit: { applyRateLimit: () => true, LIMITS: {} }, apiErrorHandler: { reportApiError() {} },
        'messengerWorkspace.mjs': { readMessengerMessages: async () => [row] }, 'accountingMessage.mjs': accounting,
    })[name.split('/').at(-1)], { env: { SUPABASE_SERVICE_ROLE_KEY: 'test-only' } });
    let status = 200, result; const res = { setHeader() {}, status(n) { status = n; return this; }, json(value) { result = value; return this; } };
    const request = { method: 'POST', headers: { authorization: 'Bearer fixture' }, body: { conversationId: 'fixture', userId: 'forged' } };
    await handler(request, res); assert.equal(status, 200);
    assert.deepEqual(calls, [{ p_user: 'verified-actor', p_invoice: clubDetails.settlement.invoice_id }]);
    assert.equal(result.messages[0].media_metadata.weekly_club_details.total_rake, 5154.81);
    denied = true; await handler(request, res); assert.equal(result.messages[0].media_metadata.weekly_club_details, null);
    failure = true; await handler(request, res); assert.equal(status, 503);
    const settled = clubHtml({ ...clubDetails, settlement: { ...clubDetails.settlement, direction: 'settled', remaining: 0 } }, 'compact');
    assert.match(settled, /Invoice Unpaid · Settled/);
});

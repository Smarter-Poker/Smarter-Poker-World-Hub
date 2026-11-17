import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
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
const Card = load('../src/components/messenger/AccountingStatementCard.js');
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

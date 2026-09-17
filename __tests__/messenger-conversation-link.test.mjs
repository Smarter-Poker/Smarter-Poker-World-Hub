import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');

function fixture() {
    const refs = []; let refIndex = 0, dependencies, effect, cleanup;
    const react = {
        useRef(initial) { return refs[refIndex++] ||= { current: initial }; },
        useEffect(callback, deps) {
            if (!dependencies || deps.some((value, i) => !Object.is(value, dependencies[i]))) {
                dependencies = deps; effect = callback;
            }
        },
    };
    const code = ts.transpileModule(fs.readFileSync(new URL('../src/hooks/useMessengerConversationLink.js', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const module = { exports: {} };
    new Function('require', 'module', 'exports', code)(name => { assert.equal(name, 'react'); return react; }, module, module.exports);
    // Exercise the page's actual response-acceptance logic, not a substitute.
    const page = fs.readFileSync(new URL('../pages/hub/messenger.js', import.meta.url), 'utf8');
    const start = page.indexOf('    resolveConversationRef.current = async');
    const end = page.indexOf('    useMessengerConversationLink({', start);
    const buildResolver = new Function('context', `const { user, workspaceRef, getAccessToken, authedFetch, setClubAccess, setWorkspaceSelection, setConversations, setPendingConversationId, setConversationDraft, setToast } = context; const resolveConversationRef = {}; ${page.slice(start, end)} return resolveConversationRef.current;`);
    const pending = [], accepted = [], toasts = [], workspaceRef = { current: 'account-a:social:1' };
    const props = { userId: 'account-a', scope: workspaceRef.current, conversation: 'invoice-a', draft: '' };
    const context = {
        workspaceRef, getAccessToken: () => 'fixture-token',
        authedFetch: (url, options) => new Promise(resolve => pending.push({ url, body: JSON.parse(options.body), resolve })),
        setClubAccess: value => accepted.push(['clubAccess', value]),
        setWorkspaceSelection: value => accepted.push(['workspace', value]),
        setConversations: value => accepted.push(['conversations', value]),
        setPendingConversationId: value => accepted.push(['pending', value]),
        setConversationDraft: value => accepted.push(['draft', value]),
        setToast: value => toasts.push(value),
    };
    return {
        pending, accepted, toasts,
        render(overrides = {}) {
            Object.assign(props, overrides); workspaceRef.current = props.scope; refIndex = 0;
            props.resolve = buildResolver({ ...context, user: { id: props.userId } });
            module.exports.default(props);
        },
        commit() { if (effect) { cleanup?.(); cleanup = effect(); effect = null; } },
        unmount() { cleanup?.(); },
    };
}
const response = (id = 'invoice-a', success = true) => ({ ok: success, json: async () => ({ success, error: success ? null : 'Conversation Unavailable', clubs: [{ id: 'club-a' }], clubId: 'club-a', folder: 'invoices', conversations: [{ id }], conversation: { id } }) });
const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

test('a cold invoice link retries after initialization changes its scope and ignores the abandoned response', async () => {
    const f = fixture(); f.render(); f.commit();
    f.render({ scope: 'account-a:social:2' }); f.commit();
    assert.equal(f.pending.length, 2);
    f.pending[0].resolve(response('abandoned')); await settle(); assert.deepEqual(f.accepted, []);
    f.pending[1].resolve(response()); await settle();
    assert.deepEqual(f.accepted.find(([kind]) => kind === 'pending'), ['pending', 'invoice-a']);
    f.render({ scope: 'account-a:club-a:invoices:3' }); f.commit();
    assert.equal(f.pending.length, 2); f.unmount();
});
test('account changes cannot accept the previous accounts delayed invoice response', async () => {
    const f = fixture(); f.render(); f.commit();
    f.render({ userId: 'account-b', scope: 'account-b:social:2' }); f.commit();
    f.pending[0].resolve(response('private-a')); await settle(); assert.deepEqual(f.accepted, []);
    f.pending[1].resolve(response()); await settle();
    assert.deepEqual(f.accepted.find(([kind]) => kind === 'clubAccess')[1].userId, 'account-b'); f.unmount();
});
test('unmount and changed links discard old responses and do not show stale errors', async () => {
    const f = fixture(); f.render(); f.commit();
    f.render({ conversation: 'invoice-b' }); f.commit();
    f.pending[0].resolve(response('invoice-a', false)); await settle(); assert.deepEqual(f.toasts, []);
    f.unmount(); f.pending[1].resolve(response('invoice-b')); await settle(); assert.deepEqual(f.accepted, []);
});
test('an unavailable link remains unconsumed and can retry on a new scope', async () => {
    const f = fixture(); f.render(); f.commit();
    f.pending[0].resolve(response('invoice-a', false)); await settle();
    assert.match(f.toasts[0].message, /Unavailable/); assert.deepEqual(f.accepted, []);
    f.render({ scope: 'account-a:social:2', draft: 'Invoice question' }); f.commit();
    f.pending[1].resolve(response()); await settle();
    assert.deepEqual(f.accepted.find(([kind]) => kind === 'draft'), ['draft', 'Invoice question']); f.unmount();
});
test('missing auth and array-shaped conversation parameters never dispatch a request', () => {
    const f = fixture(); f.render({ userId: null }); f.commit();
    f.render({ userId: 'account-a', conversation: ['invoice-a'] }); f.commit();
    assert.equal(f.pending.length, 0); f.unmount();
});

test('malformed or mismatched successful responses never consume an invoice link', async () => {
    const f = fixture(); f.render(); f.commit();
    f.pending[0].resolve(response('another-invoice')); await settle();
    assert.deepEqual(f.accepted, []); assert.match(f.toasts[0].message, /Unavailable/);
    f.render({ scope: 'account-a:social:2' }); f.commit();
    f.pending[1].resolve({ ok: true, json: async () => ({ success: true }) }); await settle();
    assert.deepEqual(f.accepted, []);
    f.render({ scope: 'account-a:social:3' }); f.commit();
    f.pending[2].resolve(response()); await settle();
    assert.deepEqual(f.accepted.find(([kind]) => kind === 'pending'), ['pending', 'invoice-a']); f.unmount();
});

test('the same invoice may be explicitly reopened after the route no longer has a link', async () => {
    const f = fixture(); f.render(); f.commit(); f.pending[0].resolve(response()); await settle();
    f.render({ conversation: undefined }); f.commit();
    f.render({ conversation: 'invoice-a' }); f.commit();
    assert.equal(f.pending.length, 2); f.unmount();
});

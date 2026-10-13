import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createVideoLibraryOwnerScope } from '../src/lib/videoLibraryOwnerScope.mjs';
const require = createRequire(import.meta.url);
const React = require('react');
const { act, create } = require('react-test-renderer');
const ts = require('typescript');
const code = ts.transpileModule(readFileSync(new URL('../src/components/video-library/ChannelFollow.jsx', import.meta.url), 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, allowJs: true } }).outputText;
const A = 'owner-a';
const B = 'owner-b';
const CHANNEL = '11111111-1111-4111-8111-111111111111';
function harness(owner = A) {
    let user = owner ? { id: owner } : null;
    const requests = [], timers = new Set();
    const fetcher = (url, options) => new Promise((resolve, reject) => { requests.push({ url, options, resolve, reject }); });
    const module = { exports: {} };
    const imports = name => name === 'react' ? React : name === 'react/jsx-runtime' ? require(name) : name === 'next/link' ? { default: props => React.createElement('a', props, props.children) } : name.endsWith('AvatarContext') ? { useAvatar: () => ({ user }) } : name.endsWith('authUtils') ? { getAccessToken: () => 'local-test-only', getAuthUserId: () => user?.id || null } : name.endsWith('videoLibraryOwnerScope.mjs') ? { createVideoLibraryOwnerScope } : (() => { throw new Error(`Unexpected Import ${name}`); })();
    new Function('require', 'module', 'exports', 'fetch', 'setTimeout', 'clearTimeout', code)(imports, module, module.exports, fetcher, callback => { timers.add(callback); return callback; }, callback => timers.delete(callback));
    const Component = module.exports.default;
    let root;
    act(() => { root = create(React.createElement(Component, { channelId: CHANNEL, channelPath: `/hub/video-library/channels/${CHANNEL}` })); });
    return { root, requests, timers,
        async owner(value, channelId = CHANNEL) { user = value ? { id: value } : null; await act(async () => root.update(React.createElement(Component, { channelId, channelPath: `/hub/video-library/channels/${channelId}` }))); },
        async reply(index, payload, ok = true) { await act(async () => requests[index].resolve({ ok, json: async () => payload })); },
        async reject(index, error = new Error('Network Failed')) { await act(async () => requests[index].reject(error)); },
        close() { act(() => root.unmount()); },
    };
}
const result = (ownerId = A, following = false, notificationsEnabled = false, channelId = CHANNEL) => ({ success: true, ownerId, channelId, following, notificationsEnabled });
const button = (h, text) => h.root.root.findAllByType('button').find(node => node.children.join('') === text);
const alert = h => h.root.root.findAll(node => node.props.role === 'alert').map(node => node.children.join('')).join(' ');

test('signed-out following never fetches or exposes another owner state', () => {
    const h = harness(null);
    assert.equal(h.requests.length, 0);
    assert.match(h.root.root.findByType('a').props.href, /^\/auth\/login\?redirect=/);
    h.close();
});
test('verified desired-state writes deduplicate rapid clicks and persist bell opt-out', async () => {
    const h = harness();
    await h.reply(0, result());
    const follow = button(h, 'Follow Channel');
    act(() => { follow.props.onClick(); follow.props.onClick(); });
    assert.equal(h.requests.length, 2);
    assert.deepEqual(JSON.parse(h.requests[1].options.body), { channelId: CHANNEL, expectedOwnerId: A, following: true, notificationsEnabled: false });
    await h.reply(1, result(A, true));
    act(() => h.root.root.findByType('input').props.onChange({ target: { checked: true } }));
    await h.reply(2, result(A, true, true));
    assert.equal(h.root.root.findByType('input').props.checked, true);
    act(() => h.root.root.findByType('input').props.onChange({ target: { checked: false } }));
    await h.reply(3, result(A, true, false));
    assert.equal(h.root.root.findByType('input').props.checked, false);
    act(() => button(h, 'Unfollow Channel').props.onClick());
    assert.equal(JSON.parse(h.requests[4].options.body).notificationsEnabled, false);
    await h.reply(4, result());
    assert.equal(button(h, 'Follow Channel').props['aria-pressed'], false);
    h.close();
});
test('old account responses are rejected through A to B to A and channel changes', async () => {
    const h = harness();
    await h.owner(B);
    await h.owner(A);
    await h.reply(2, result());
    await h.reply(0, result(A, true, true));
    await h.reply(1, result(B, true, true));
    assert.equal(button(h, 'Follow Channel').props['aria-pressed'], false);
    const other = '22222222-2222-4222-8222-222222222222';
    await h.owner(A, other);
    await h.reply(3, result(A, false, false, other));
    assert.equal(button(h, 'Follow Channel').props.disabled, false);
    h.close();
});
test('late write from departed account cannot replace new account preferences', async () => {
    const h = harness();
    await h.reply(0, result());
    act(() => button(h, 'Follow Channel').props.onClick());
    await h.owner(B);
    await h.reply(2, result(B));
    await h.reply(1, result(A, true, true));
    assert.equal(button(h, 'Follow Channel').props['aria-pressed'], false);
    assert.equal(h.root.root.findByType('input').props.checked, false);
    h.close();
});
test('mismatched acknowledgments and unknown write timeouts require authoritative readback', async () => {
    const h = harness();
    await h.reply(0, result(B));
    assert.match(alert(h), /Could Not Be Verified/);
    act(() => button(h, 'Reload Follow Status').props.onClick());
    await h.reply(1, result());
    act(() => button(h, 'Follow Channel').props.onClick());
    act(() => { for (const timeout of h.timers) timeout(); });
    assert.equal(h.requests[2].options.signal.aborted, true);
    await h.reject(2);
    assert.match(alert(h), /Reload Its Status Before Trying Again/);
    assert.equal(button(h, 'Follow Channel'), undefined);
    act(() => button(h, 'Reload Follow Status').props.onClick());
    assert.equal(h.requests[3].options.method, undefined);
    await h.reply(3, result(A, true));
    assert.equal(button(h, 'Unfollow Channel').props['aria-pressed'], true);
    h.close();
});
test('loading deadline exposes a retry and never manufactures followed state', async () => {
    const h = harness();
    act(() => { for (const timeout of h.timers) timeout(); });
    assert.equal(h.requests[0].options.signal.aborted, true);
    await h.reject(0);
    assert.match(alert(h), /Took Too Long To Load/);
    assert.ok(button(h, 'Reload Follow Status'));
    h.close();
});

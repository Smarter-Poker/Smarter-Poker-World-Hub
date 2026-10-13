import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createVideoLibraryOwnerScope } from '../src/lib/videoLibraryOwnerScope.mjs';
const require = createRequire(import.meta.url);
const React = require('react');
const { act, create } = require('react-test-renderer');
const ts = require('typescript');
const code = ts.transpileModule(readFileSync(new URL('../src/components/video-library/StudyStatus.jsx', import.meta.url), 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, allowJs: true } }).outputText;
function harness(initial = 'owner-a') {
    let user = initial ? { id: initial } : null;
    const requests = [], timers = new Set(), module = { exports: {} };
    const imports = name => name === 'react' ? React : name === 'react/jsx-runtime' ? require(name) : name === 'next/link' ? { default: props => React.createElement('a', props, props.children) } : name.endsWith('AvatarContext') ? { useAvatar: () => ({ user }) } : name.endsWith('authUtils') ? { getAccessToken: () => 'local-only', getAuthUserId: () => user?.id || null } : name.endsWith('videoLibraryOwnerScope.mjs') ? { createVideoLibraryOwnerScope } : (() => { throw new Error(name); })();
    const fetcher = (url, options) => new Promise((resolve, reject) => requests.push({ url, options, resolve, reject }));
    new Function('require', 'module', 'exports', 'fetch', 'setTimeout', 'clearTimeout', code)(imports, module, module.exports, fetcher, callback => { timers.add(callback); return callback; }, callback => timers.delete(callback));
    const Component = module.exports.default; let root;
    act(() => { root = create(React.createElement(Component)); });
    return { root, requests, timers,
        async owner(id) { user = id ? { id } : null; await act(async () => root.update(React.createElement(Component))); },
        async reply(index, payload, ok = true) { await act(async () => requests[index].resolve({ ok, json: async () => payload })); },
        async reject(index) { await act(async () => requests[index].reject(new Error('Network Failed'))); },
        close() { act(() => root.unmount()); },
    };
}
const result = (ownerId = 'owner-a', currentStreak = 2, diamondsToday = 3) => ({ success: true, ownerId, data: { currentStreak, diamondsToday, studiedToday: true, basis: 'rewarded_video_watch_days' } });
const text = h => JSON.stringify(h.root.toJSON());
test('signed-out status links to approved signin without fetching personal data', () => {
    const h = harness(null); assert.equal(h.requests.length, 0); assert.match(h.root.root.findByType('a').props.href, /^\/auth\/login\?redirect=/); h.close();
});
test('real study component exposes verified earnings and never invents a streak bonus', async () => {
    const h = harness(); assert.ok(h.requests[0].url.includes('ownerId=owner-a')); assert.equal(h.requests[0].options.cache, 'no-store');
    await h.reply(0, result()); assert.match(text(h), /3.*Diamonds Earned From Videos Today/); assert.match(text(h), /No Extra Streak Bonus/); assert.equal(h.requests.length, 1); h.close();
});
test('A to B to A rejects delayed data from both prior account generations', async () => {
    const h = harness(); await h.owner('owner-b'); await h.owner('owner-a'); await h.reply(2, result('owner-a', 1, 4)); await h.reply(0, result('owner-a', 9, 99)); await h.reply(1, result('owner-b', 8, 88));
    assert.match(text(h), /4.*Diamonds Earned/); assert.doesNotMatch(text(h), /99|88/); assert.equal(h.requests[0].options.signal.aborted, true); h.close();
});
test('wrong owner, malformed credit and failed reads show an explicit retry without fabricated zeros', async () => {
    for (const payload of [result('owner-b'), result('owner-a', 2, -1), result('owner-a', 999, 3)]) {
        const h = harness(); await h.reply(0, payload); assert.equal(h.root.root.findAll(node => node.props.role === 'alert').length, 1); assert.doesNotMatch(text(h), /Diamonds Earned/); h.close();
    }
    const h = harness(); await h.reject(0); const retry = h.root.root.findByType('button'); act(() => retry.props.onClick()); assert.equal(h.requests.length, 2); await h.reply(1, result()); assert.match(text(h), /Diamonds Earned/); h.close();
});

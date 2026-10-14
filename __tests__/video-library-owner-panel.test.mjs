import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeVideoOwnerSnapshot, VIDEO_OWNER_TOOLS } from '../src/lib/videoLibraryOwnerPanel.mjs';
import { createVideoLibraryOwnerScope } from '../src/lib/videoLibraryOwnerScope.mjs';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as ownerPanel from '../src/lib/videoLibraryOwnerPanel.mjs';
const require = createRequire(import.meta.url);
const React = require('react');
const { act, create } = require('react-test-renderer');
const ts = require('typescript');
const component = ts.transpileModule(readFileSync(new URL('../pages/hub/video-library/owner.js', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, allowJs: true } }).outputText;
const identity = defaultExport => ({ __esModule: true, default: defaultExport });
function harness(ownerId = 'admin') {
    let activeOwner = ownerId, tree;
    const requests = [], originalFetch = globalThis.fetch;
    globalThis.fetch = (url, options) => new Promise(resolve => requests.push({ url, options, resolve }));
    const module = { exports: {} };
    const element = tag => props => React.createElement(tag, props, props.children);
    new Function('require', 'module', 'exports', component)(name => {
        if (name === 'react' || name === 'react/jsx-runtime') return require(name);
        if (name === 'next/head') return identity(element('head'));
        if (name === 'next/link') return identity(element('a'));
        if (name === 'next/dynamic') return identity(() => () => null);
        if (name.includes('HubPageShell')) return identity(element('div'));
        if (name.includes('AvatarContext')) return { useAvatar: () => ({ user: activeOwner ? { id: activeOwner } : null }) };
        if (name.includes('authUtils')) return { getAccessToken: () => activeOwner ? `token-${activeOwner}` : null, getAuthUserId: () => activeOwner };
        if (name.includes('OwnerScope')) return { createVideoLibraryOwnerScope };
        if (name.includes('OwnerPanel.module')) return identity({});
        if (name.includes('OwnerPanel.mjs')) return ownerPanel;
        throw new Error(`Unexpected Owner Panel Dependency: ${name}`);
    }, module, module.exports);
    act(() => { tree = create(React.createElement(module.exports.default)); });
    return { requests,
        text: () => JSON.stringify(tree.toJSON(), (key, value) => key === 'props' ? undefined : value),
        links: () => tree.root.findAllByType('a').map(node => node.props.href),
        async reply(index, status, body) { await act(async () => { requests[index].resolve({ ok: status === 200, status, json: async () => body }); }); },
        async refresh() { await act(async () => { tree.root.findAllByType('button').find(node => node.children.join('') === 'Refresh').props.onClick(); }); },
        update(nextOwner) { activeOwner = nextOwner; act(() => tree.update(React.createElement(module.exports.default))); },
        close() { act(() => tree.unmount()); globalThis.fetch = originalFetch; },
    };
}

const snapshot = { generatedAt: '2026-10-14T00:00:00Z', windowHours: 24, organicSessions: 3,
    sources: [{ active: 2 }, { active: 4 }], candidates: [{ status: 'published', count: 5 }, { status: 'approved', count: 7 }],
    moderationCases: [{ status: 'submitted', count: 2 }, { status: 'resolved', count: 6 }], jobs: [{ status: 'dead_letter', count: 4 }, { status: 'retry', count: 2 }], controls: [] };
test('Owner Panel Shows Actual Scoped Counts Without Counting Unpublished Or Resolved Rows', () => {
    assert.deepEqual(summarizeVideoOwnerSnapshot(snapshot).map(metric => metric.value), [6, 5, 3, 2, 4]);
    assert.equal(VIDEO_OWNER_TOOLS.length, 5);
    assert.ok(VIDEO_OWNER_TOOLS.every(tool => tool.href.startsWith('/hub/admin/video-')));
});
test('Owner Panel Rejects Missing, Invalid Or Mislabelled Snapshot Evidence', () => {
    for (const invalid of [{ ...snapshot, sources: null }, { ...snapshot, windowHours: 168 }, { ...snapshot, organicSessions: -1 }, { ...snapshot, generatedAt: 'invalid' }, { ...snapshot, sources: [{ active: 'unknown' }] }, { ...snapshot, controls: [{ control_key: 'stage', enabled: 'true' }] }]) assert.throws(() => summarizeVideoOwnerSnapshot(invalid), /Snapshot/);
    assert.deepEqual(summarizeVideoOwnerSnapshot({ ...snapshot, sources: [], candidates: [], organicSessions: 0, moderationCases: [], jobs: [] }).map(metric => metric.value), [0, 0, 0, 0, 0]);
});
test('Owner Panel Generation Rejects Prior Admin Response After Switching Accounts And Back', () => {
    const scope = createVideoLibraryOwnerScope('admin');
    const owner = scope.capture();
    scope.activate('member');
    assert.equal(scope.isCurrent(owner), false);
    scope.activate('admin');
    assert.equal(scope.isCurrent(owner), false);
});
test('Actual Owner Panel Denies Anonymous And Member Access Before Displaying Administrative Tools', async () => {
    const anonymous = harness(null);
    try { assert.equal(anonymous.requests.length, 0); assert.match(anonymous.text(), /Sign In To Open/); assert.ok(!anonymous.links().includes('/hub/admin/video-sources')); } finally { anonymous.close(); }
    const member = harness('member');
    try { await member.reply(0, 403, { error: 'Admin Access Required' }); assert.match(member.text(), /Owner Or Admin Account Is Required/); assert.ok(!member.links().includes('/hub/admin/video-sources')); } finally { member.close(); }
});
test('Actual Owner Panel Renders Authorized Snapshot And Existing Tools, Then Clears On Session Change', async () => {
    const h = harness();
    try {
        assert.match(h.text(), /Loading Control Panel/);
        assert.equal(h.requests[0].url, '/api/admin/video-operations?windowHours=24');
        assert.equal(h.requests[0].options.cache, 'no-store');
        await h.reply(0, 200, { snapshot });
        assert.match(h.text(), /Qualified Study Sessions/);
        for (const tool of VIDEO_OWNER_TOOLS) assert.ok(h.links().includes(tool.href));
        await h.refresh();
        assert.ok(!h.links().includes('/hub/admin/video-sources'));
        h.update('member');
        assert.equal(h.requests[1].options.signal.aborted, true);
        await h.reply(1, 200, { snapshot });
        assert.ok(!h.links().includes('/hub/admin/video-sources'));
        await h.reply(2, 403, {});
        assert.match(h.text(), /Owner Or Admin Account Is Required/);
        h.update(null);
        assert.match(h.text(), /Sign In To Open/);
    } finally { h.close(); }
});
test('Actual Owner Panel Rejects Incomplete Success Payload Rather Than Presenting Invented Counts', async () => {
    const h = harness();
    try { await h.reply(0, 200, { snapshot: { ...snapshot, sources: null } }); assert.match(h.text(), /Snapshot Is Incomplete/); assert.ok(!h.links().includes('/hub/admin/video-sources')); } finally { h.close(); }
});

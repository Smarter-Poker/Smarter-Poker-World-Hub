import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as queueLibrary from '../src/lib/videoLibraryQueue.mjs';
const require = createRequire(import.meta.url);
const React = require('react');
const { act, create } = require('react-test-renderer');
const ts = require('typescript');
const code = ts.transpileModule(readFileSync(new URL('../src/components/video-library/useVideoLibraryQueue.js', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, allowJs: true } }).outputText;
function harness(initialOwner = 'a', initialQueue = null, renderQueue = false) {
    const values = new Map(), listeners = new Map();
    if (initialQueue) values.set(queueLibrary.QUEUE_STORAGE_KEY, JSON.stringify(initialQueue));
    let denied = false, latest;
    globalThis.window = { sessionStorage: { getItem: key => { if (denied) throw Error('Denied');return values.get(key); }, setItem: (key,value) => { if (denied) throw Error('Denied'); values.set(key,value); } }, dispatchEvent: event => { for (const callback of listeners.get(event.type) || []) callback(); }, addEventListener: (name, callback) => { if (!listeners.has(name)) listeners.set(name,new Set());listeners.get(name).add(callback); }, removeEventListener: (name, callback) => listeners.get(name)?.delete(callback) };
    const module = { exports: {} };
    new Function('require','module','exports',code)(name => name === 'react' ? React : queueLibrary,module,module.exports);
    let VideoQueue;
    if (renderQueue) {
        const componentCode = ts.transpileModule(readFileSync(new URL('../src/components/video-library/VideoQueue.jsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, allowJs: true } }).outputText;
        const componentModule = { exports: {} };
        new Function('require', 'module', 'exports', componentCode)(name => name === 'react/jsx-runtime' ? require(name) : name === './useVideoLibraryQueue' ? module.exports : (() => { throw Error(`Unexpected Queue Component Import ${name}`); })(), componentModule, componentModule.exports);
        VideoQueue = componentModule.exports.default;
    }
    function Consumer({ owner }) { latest = module.exports.default(owner); return renderQueue ? React.createElement(VideoQueue, { ownerId: owner, currentVideoId: 'abcdefghijk' }) : null; }
    let root;act(() => { root = create(React.createElement(Consumer,{owner:initialOwner})); });
    return { root, get latest() { return latest; }, owner(value) { act(() => root.update(React.createElement(Consumer,{owner:value}))); }, deny() { denied=true; }, close() { act(() => root.unmount());delete globalThis.window; } };
}
const videos = [{videoId:'abcdefghijk',title:'First'},{videoId:'bcdefghijkl',title:'Second'}];
test('Actual queue hook persists through owner stability and clears account ABA', () => {
    const h=harness();try {
        act(() => h.latest.startQueue(videos));assert.equal(h.latest.queue.items.length,2);
        h.owner('a');assert.equal(h.latest.queue.items.length,2);
        h.owner(null);assert.equal(h.latest.queue.items.length,0);
        h.owner('a');assert.equal(h.latest.queue.items.length,0);
        act(() => h.latest.startQueue(videos));h.owner('b');assert.equal(h.latest.queue.items.length,0);
    }finally{h.close();}
});
test('Actual queue hook reports denied storage without acknowledging a saved queue', () => {
    const h=harness();try { h.deny();let result;act(() => { result=h.latest.startQueue(videos); });assert.equal(result,null);assert.equal(h.latest.queue.items.length,0);assert.match(h.latest.error,/Denied/); }finally{h.close();}
});

test('A newly mounted watch route preserves a matching playlist queue when auth hydrates', () => {
    const h=harness(null,{version:1,ownerId:'a',items:videos,currentId:videos[0].videoId});try {
        assert.equal(h.latest.queue.items.length,0);
        h.owner('a');assert.equal(h.latest.queue.items.length,2);
        h.owner(null);h.owner('a');assert.equal(h.latest.queue.items.length,0);
    }finally{h.close();}
});
test('Actual queue component keeps Clear Queue accessible for a current-video-only anchor', () => {
    const h = harness('a', { version: 1, ownerId: 'a', items: [videos[0]], currentId: videos[0].videoId }, true);
    try {
        assert.equal(h.root.root.findAllByType('section').length, 1);
        assert.ok(JSON.stringify(h.root.toJSON()).includes('No Videos Queued Next.'));
        const clear = h.root.root.findAllByType('button').find(node => node.children.join('') === 'Clear Queue');
        assert.ok(clear);
        act(() => clear.props.onClick());
        assert.equal(h.latest.queue.items.length, 0);
        assert.equal(h.root.root.findAllByType('section').length, 0);
        assert.deepEqual(queueLibrary.readQueue('a').items, []);
    } finally { h.close(); }
});
test('Removing the only upcoming video retains the real component anchor and its clear action', () => {
    const h = harness('a', { version: 1, ownerId: 'a', items: videos, currentId: videos[0].videoId }, true);
    try {
        const remove = h.root.root.findByProps({ 'aria-label': 'Remove Second From Queue' });
        act(() => remove.props.onClick());
        assert.deepEqual(h.latest.queue.items.map(item => item.videoId), [videos[0].videoId]);
        assert.ok(JSON.stringify(h.root.toJSON()).includes('No Videos Queued Next.'));
        assert.equal(h.root.root.findAllByProps({ 'aria-label': 'Remove Second From Queue' }).length, 0);
        const clear = h.root.root.findAllByType('button').find(node => node.children.join('') === 'Clear Queue');
        act(() => clear.props.onClick());
        assert.equal(h.latest.queue.items.length, 0);
    } finally { h.close(); }
});

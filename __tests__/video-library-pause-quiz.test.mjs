import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as playback from '../src/lib/videoLibraryPlayback.mjs';
import * as quiz from '../src/lib/videoLibraryQuiz.mjs';
const require = createRequire(import.meta.url);
const React = require('react');
const { act, create } = require('react-test-renderer');
const ts = require('typescript');
const code = ts.transpileModule(readFileSync(new URL('../src/components/video-library/PauseQuiz.jsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, allowJs: true } }).outputText;
function harness() {
    const messages = new Set(), visibility = new Set(), timers = new Map(), commands = [];
    const originals = { window: globalThis.window, document: globalThis.document, setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout };
    let sequence = 0;
    globalThis.window = { addEventListener: (_, fn) => messages.add(fn), removeEventListener: (_, fn) => messages.delete(fn) };
    globalThis.document = { hidden: false, addEventListener: (_, fn) => visibility.add(fn), removeEventListener: (_, fn) => visibility.delete(fn) };
    globalThis.setTimeout = fn => { const id = ++sequence; timers.set(id, fn); return id; };
    globalThis.clearTimeout = id => timers.delete(id);
    const frame = { postMessage: data => commands.push(JSON.parse(data)) }, iframeRef = { current: { contentWindow: frame } };
    const module = { exports: {} };
    new Function('require', 'module', 'exports', code)(name => name === 'react' ? React : name === 'react/jsx-runtime' ? require(name) : name.includes('Playback') ? playback : quiz, module, module.exports);
    let props = { iframeRef, videoId: 'abcdefghijk', markers: [5], active: true }, root;
    act(() => { root = create(React.createElement(module.exports.default, props)); });
    return { root, commands, timers,
        emit(data, source = frame, origin = playback.PLAYER_ORIGIN) { act(() => { for (const fn of messages) fn({ data, source, origin }); }); },
        button(label) { return root.root.findAllByType('button').find(node => node.children.join('') === label); },
        click(label) { act(() => this.button(label).props.onClick()); },
        update(next) { props = { ...props, ...next }; act(() => root.update(React.createElement(module.exports.default, props))); },
        hidden() { act(() => { document.hidden = true; for (const fn of visibility) fn(); }); },
        expire() { act(() => { for (const fn of [...timers.values()]) fn(); }); },
        text() { return JSON.stringify(root.toJSON()); },
        close() { act(() => root.unmount()); Object.assign(globalThis, originals); },
    };
}
test('Decision markers only cross short forward playback once, never seek jumps or malformed points', () => {
    const seen = new Set([5]);
    assert.equal(quiz.crossedDecisionMarker(5, 8, 100, [5, 7, 7, NaN, -1, 101], seen), 7);
    for (const [previous, current] of [[0, 20], [8, 3], [3, 3], [null, 5]]) assert.equal(quiz.crossedDecisionMarker(previous, current, 100, [5], seen), null);
    assert.equal(quiz.crossedDecisionMarker(3, 5, 100, [5], seen), null);
});
test('Real quiz component waits for trusted timeline and confirmed pause before decisions and explicit resume', () => {
    const h = harness(); try {
        assert.equal(h.button('What Would You Do?').props.disabled, true);
        h.emit({ event: 'infoDelivery', info: { currentTime: 0, duration: 100 } }, {}, playback.PLAYER_ORIGIN);
        assert.equal(h.button('What Would You Do?').props.disabled, true);
        h.emit({ event: 'infoDelivery', info: { currentTime: 0, duration: 100 } }, undefined, 'https://attacker.example');
        assert.equal(h.button('What Would You Do?').props.disabled, true);
        h.emit({ event: 'infoDelivery', info: { currentTime: 0, duration: 100 } });
        assert.equal(h.button('What Would You Do?').props.disabled, false);
        h.click('What Would You Do?'); assert.deepEqual(h.commands.map(command => command.func), ['pauseVideo']);
        assert.match(h.text(), /Waiting For The Player To Pause/); assert.equal(h.button('Call'), undefined);
        h.emit({ event: 'onStateChange', info: 2 });
        assert.equal(h.button('Continue Watching').props.disabled, true);
        h.click('Call'); assert.match(h.text(), /You Chose /); assert.match(h.text(), /No Correct Answer Is Assigned/);
        act(() => h.root.root.findByType('textarea').props.onChange({ target: { value: 'Pot odds and blockers' } }));
        assert.equal(h.root.root.findByType('textarea').props.value, 'Pot odds and blockers');
        h.click('Continue Watching'); assert.deepEqual(h.commands.map(command => command.func), ['pauseVideo', 'playVideo']);
        assert.equal(h.root.root.findAllByType('textarea').length, 0); assert.equal(h.timers.size, 0);
    } finally { h.close(); }
});
test('Quiz cancellation, pause timeout, hidden tab and error never resume or pretend the player paused', () => {
    const h = harness(); try {
        h.emit({ event: 'infoDelivery', info: { currentTime: 3, duration: 100 } });
        h.click('What Would You Do?'); h.expire();
        assert.match(h.text(), /Did Not Confirm A Pause/); assert.equal(h.button('Call'), undefined);
        h.click('What Would You Do?'); h.emit({ event: 'onStateChange', info: 2 }); h.click('Call'); h.click('Cancel Quiz');
        assert.ok(h.commands.every(command => command.func === 'pauseVideo'));
        h.click('What Would You Do?'); h.hidden(); assert.equal(h.button('Cancel Quiz'), undefined); assert.equal(h.timers.size, 0);
        document.hidden = false; h.click('What Would You Do?'); h.emit({ event: 'onError', info: 150 });
        assert.equal(h.button('What Would You Do?').props.disabled, true); assert.match(h.text(), /Playback Is Unavailable/);
        assert.ok(h.commands.every(command => command.func === 'pauseVideo'));
    } finally { h.close(); }
});
test('Opt-in marker pauses once and video change or inactivity clears quiz state', () => {
    const h = harness(); try {
        h.emit({ event: 'infoDelivery', info: { currentTime: 3, duration: 100 } });
        act(() => h.root.root.findByType('input').props.onChange({ target: { checked: true } }));
        h.emit({ event: 'infoDelivery', info: { currentTime: 5, duration: 100 } });
        assert.equal(h.commands.length, 0, 'Small seek while paused must not trigger a quiz');
        h.emit({ event: 'infoDelivery', info: { currentTime: 3, duration: 100 } });
        h.emit({ event: 'onStateChange', info: 1 });
        h.emit({ event: 'infoDelivery', info: { currentTime: 5, duration: 100 } });
        assert.equal(h.commands.length, 1); h.emit({ event: 'onStateChange', info: 2 }); h.click('Fold'); h.click('Cancel Quiz');
        h.emit({ event: 'onStateChange', info: 1 });
        h.emit({ event: 'infoDelivery', info: { currentTime: 3, duration: 100 } }); h.emit({ event: 'infoDelivery', info: { currentTime: 5, duration: 100 } });
        assert.equal(h.commands.length, 1);
        h.click('What Would You Do?'); h.update({ videoId: 'bcdefghijkl' });
        assert.equal(h.button('Cancel Quiz'), undefined); assert.equal(h.button('What Would You Do?').props.disabled, true); assert.equal(h.timers.size, 0);
        h.emit({ event: 'infoDelivery', info: { currentTime: 3, duration: 100 } }); h.click('What Would You Do?'); h.update({ active: false });
        assert.equal(h.button('Cancel Quiz'), undefined); assert.equal(h.button('What Would You Do?').props.disabled, true); assert.equal(h.timers.size, 0);
    } finally { h.close(); }
});
test('Cancelling and reopening on the same confirmed paused frame does not await a nonexistent duplicate acknowledgement', () => {
    const h = harness(); try {
        h.emit({ event: 'infoDelivery', info: { currentTime: 3, duration: 100 } });
        h.emit({ event: 'onStateChange', info: 1 });
        h.click('What Would You Do?'); h.emit({ event: 'onStateChange', info: 2 }); h.click('Call');
        act(() => h.root.root.findByType('textarea').props.onChange({ target: { value: 'First decision' } }));
        h.click('Cancel Quiz'); h.click('What Would You Do?');
        assert.ok(h.button('Call'), 'The previous trusted pause acknowledgement must open choices immediately');
        assert.equal(h.timers.size, 0); assert.equal(h.root.root.findByType('textarea').props.value, '');
        assert.equal(h.button('Continue Watching').props.disabled, true);
        assert.ok(h.commands.every(command => command.func === 'pauseVideo'), 'Reopening never resumes playback');
        h.click('Check'); h.click('Continue Watching');
        assert.equal(h.commands.at(-1).func, 'playVideo');
        h.click('What Would You Do?');
        assert.match(h.text(), /Waiting For The Player To Pause/);
    } finally { h.close(); }
});

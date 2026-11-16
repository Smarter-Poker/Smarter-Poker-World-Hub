import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
const require = createRequire(import.meta.url);
const React = require('react');
const renderer = require('react-test-renderer');
const ts = require('typescript');

function setup(t, outcomes) {
  const events = [], frames = new Map(), audios = [];
  let time = 0, frameId = 0, completed = 0;
  class Audio {
    constructor(src) { this.src = src; audios.push(this); }
    play() {
      events.push('play');
      const result = outcomes.shift();
      return result ? Promise.reject(Object.assign(new Error(result), { name: result })) : Promise.resolve();
    }
    pause() { events.push('pause'); }
  }
  const context = {
    console: { log() {}, warn() {} }, Audio,
    window: { innerWidth: 393, innerHeight: 852 },
    navigator: { vibrate: pattern => { events.push(['haptic', pattern]); return true; } },
    performance: { now: () => time },
    requestAnimationFrame: fn => { frames.set(++frameId, fn); return frameId; },
    cancelAnimationFrame: id => frames.delete(id),
  };
  function load(path, imports = {}) {
    const module = { exports: {} };
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    const compiled = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } });
    vm.runInNewContext(compiled.outputText, { ...context, require: id => imports[id] || require(id), module, exports: module.exports });
    return module.exports;
  }
  const sound = load('../src/audio/SoundEngine.ts');
  const { CinematicIntro } = load('../src/world/components/CinematicIntro.tsx', { '../../audio/SoundEngine': sound });
  let tree;
  t.after(async () => { await renderer.act(async () => tree?.unmount()); });
  return {
    events, frames, audios,
    async mount() { await renderer.act(async () => { tree = renderer.create(React.createElement(CinematicIntro, { onComplete: () => completed++ })); }); },
    buttons() { return tree.root.findAllByType('button'); },
    async click(label) { await renderer.act(async () => { this.buttons().find(b => b.children.join('') === label).props.onClick(); }); },
    async frame(at) { time = at; const callbacks = [...frames.values()]; frames.clear(); await renderer.act(async () => callbacks.forEach(fn => fn(at))); },
    async unmount() { await renderer.act(async () => tree.unmount()); tree = null; },
    completed: () => completed,
  };
}

test('blocked autoplay waits for a gesture; that gesture starts haptics before audio and the timeline', async t => {
  const app = setup(t, ['NotAllowedError', null]);
  await app.mount();
  assert.deepEqual(app.buttons().map(b => b.children.join('')), ['Start Opening', 'Skip Opening']);
  assert.equal(app.frames.size, 0, 'the explosion must not run silently before audio starts');
  assert.equal(app.events.filter(Array.isArray).length, 0);
  await app.click('Start Opening');
  assert.equal(app.buttons().length, 0);
  const playIndex = app.events.lastIndexOf('play');
  assert.equal(app.events[playIndex - 1][0], 'haptic', 'haptics execute synchronously in the tap');
  assert.equal(app.frames.size, 1);
  await app.frame(820);
  await app.frame(850);
  assert.equal(app.events.filter(e => Array.isArray(e) && e[1] === 150).length, 1, 'impact is emitted only once');
  await app.frame(4001);
  assert.equal(app.completed(), 1);
});

test('allowed autoplay starts directly and unmount stops playback and animation', async t => {
  const app = setup(t, [null]);
  await app.mount();
  assert.equal(app.buttons().length, 0);
  assert.equal(app.frames.size, 1);
  assert.equal(app.audios[0].src, '/audio/main-intro.mp3');
  await app.unmount();
  assert.equal(app.frames.size, 0);
  assert.equal(app.events.at(-1), 'pause');
});

test('media failure offers retry and skip without trapping login', async t => {
  const app = setup(t, ['NotSupportedError']);
  await app.mount();
  assert.deepEqual(app.buttons().map(b => b.children.join('')), ['Retry Opening', 'Skip Opening']);
  await app.click('Skip Opening');
  assert.equal(app.completed(), 1);
});

test('intro regression runs on the existing production build route', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
  assert.match(pkg.scripts.prebuild, /node --test __tests__\/cinematic-intro-playback\.test\.mjs/);
});

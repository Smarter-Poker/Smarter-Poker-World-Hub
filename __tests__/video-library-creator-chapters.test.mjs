// Creator chapters: the watch page shows only the creator's own YouTube
// chapters, read from the description at ingest, and never an invented one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as playback from '../src/lib/videoLibraryPlayback.mjs';
import * as quiz from '../src/lib/videoLibraryQuiz.mjs';
import { creatorChapters, CREATOR_CHAPTER_SOURCE } from '../src/lib/videoLibraryChapters.mjs';

const require = createRequire(import.meta.url);
const React = require('react');
const { act, create } = require('react-test-renderer');
const ts = require('typescript');
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const marked = list => list.map(([start_seconds, title]) => ({ start_seconds, title, source: CREATOR_CHAPTER_SOURCE }));
const STORED = marked([[0, 'Intro'], [75, 'First Hand: AK vs QQ'], [242, 'river bluff breakdown'], [750, 'Viewer Questions']]);

test('only marked creator chapters that meet YouTube rules are read', () => {
    assert.deepEqual(creatorChapters(STORED, 1500), [
        { startSeconds: 0, title: 'Intro' },
        { startSeconds: 75, title: 'First Hand: AK vs QQ' },
        { startSeconds: 242, title: 'river bluff breakdown' },
        { startSeconds: 750, title: 'Viewer Questions' },
    ], 'titles keep the creator\'s own case');
    assert.equal(creatorChapters(STORED, 0).length, 4, 'an unknown duration does not hide chapters');
});

test('the retired placeholder, unmarked lists and malformed values are never shown', () => {
    const cases = [
        [{ title: 'Video Start', start_seconds: 0 }],
        [{ title: 'Video Start', start_seconds: 0 }, { title: 'A', start_seconds: 60 }, { title: 'B', start_seconds: 120 }],
        STORED.map(({ source, ...entry }) => entry),
        [...STORED.slice(0, 3), { start_seconds: 900, title: 'Late' }],
        marked([[5, 'Not At Zero'], [60, 'A'], [120, 'B']]),
        marked([[0, 'Intro'], [60, 'Only Two']]),
        marked([[0, 'Intro'], [120, 'B'], [60, 'Back']]),
        marked([[0, 'Intro'], [9, 'Too Soon'], [60, 'B']]),
        marked([[0, 'Intro'], [60, ''], [120, 'B']]),
        marked([[0, 'Intro'], [60.5, 'Fraction'], [120, 'B']]),
        null, undefined, 'bad', {}, [],
        marked(Array.from({ length: 101 }, (_, index) => [index * 60, `Part ${index}`])),
    ];
    for (const value of cases) assert.deepEqual(creatorChapters(value, 1500), [], JSON.stringify(value)?.slice(0, 80));
    assert.deepEqual(creatorChapters(STORED, 755), [], 'a chapter inside the last ten seconds is refused');
});

test('the chapter playing at a position', () => {
    const chapters = creatorChapters(STORED, 1500);
    assert.equal(playback.chapterAt(chapters, 0).title, 'Intro');
    assert.equal(playback.chapterAt(chapters, 241).title, 'First Hand: AK vs QQ');
    assert.equal(playback.chapterAt(chapters, 9999).title, 'Viewer Questions');
    assert.equal(playback.chapterAt([], 10), null);
    assert.equal(playback.chapterAt(chapters, NaN), null);
});

function load(path) {
    const code = ts.transpileModule(read(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, allowJs: true } }).outputText;
    const module = { exports: {} };
    new Function('require', 'module', 'exports', code)(name => name === 'react' ? React : name === 'react/jsx-runtime' ? require(name) : name.includes('Playback') ? playback : quiz, module, module.exports);
    return module.exports.default;
}

function harness(Component, props) {
    const messages = new Set(), commands = [];
    const originals = { window: globalThis.window, document: globalThis.document, setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout };
    globalThis.window = { addEventListener: (_, fn) => messages.add(fn), removeEventListener: (_, fn) => messages.delete(fn) };
    globalThis.document = { hidden: false, addEventListener() {}, removeEventListener() {} };
    globalThis.setTimeout = () => 0; globalThis.clearTimeout = () => {};
    const frame = { postMessage: data => commands.push(JSON.parse(data)) };
    const iframeRef = { current: { contentWindow: frame, addEventListener() {}, removeEventListener() {} } };
    let root;
    act(() => { root = create(React.createElement(Component, { iframeRef, ...props })); });
    return { root, commands,
        emit(data) { act(() => { for (const fn of messages) fn({ data, source: frame, origin: playback.PLAYER_ORIGIN }); }); },
        buttons() { return root.root.findAllByType('button'); },
        text() { return JSON.stringify(root.toJSON()); },
        close() { act(() => root.unmount()); Object.assign(globalThis, originals); },
    };
}

const toolProps = { duration: 1500, onMiniChange() {}, onAutoplayChange() {} };

test('the timeline lists the creator chapters, and a tap before the player reports loads it and seeks', () => {
    const Tools = load('src/components/video-library/WatchPlaybackTools.jsx');
    let requested = 0;
    const h = harness(Tools, { ...toolProps, chapters: creatorChapters(STORED, 1500), requestPlayer: () => { requested += 1; } });
    try {
        assert.match(h.text(), /"Chapters"/);
        assert.match(h.text(), /First Hand: AK vs QQ/);
        assert.match(h.text(), /river bluff breakdown/, 'the creator\'s own case');
        const chapter = h.buttons().find(node => node.props['aria-label'] === 'Play Chapter At 4:02: river bluff breakdown');
        assert.ok(chapter);
        act(() => chapter.props.onClick());
        assert.equal(requested, 1, 'a tap asks the page to load the player');
        assert.deepEqual(h.commands.slice(-2), [{ event: 'command', func: 'seekTo', args: [242, true] }, { event: 'command', func: 'playVideo', args: [] }]);
        h.commands.length = 0;
        h.emit({ event: 'infoDelivery', info: { currentTime: 0, duration: 1500 } });
        assert.deepEqual(h.commands, [{ event: 'command', func: 'seekTo', args: [242, true] }], 'the held chapter is applied once the player reports');
        h.commands.length = 0;
        h.emit({ event: 'infoDelivery', info: { currentTime: 250, duration: 1500 } });
        assert.deepEqual(h.commands, [], 'it is applied once');
        const viewer = h.buttons().find(node => node.props['aria-label'] === 'Play Chapter At 12:30: Viewer Questions');
        act(() => viewer.props.onClick());
        assert.deepEqual(h.commands, [{ event: 'command', func: 'seekTo', args: [750, true] }], 'a ready player just seeks');
        assert.equal(requested, 1);
    } finally { h.close(); }
});

test('no chapters means no Chapters list and no chapter marks', () => {
    const Tools = load('src/components/video-library/WatchPlaybackTools.jsx');
    const h = harness(Tools, { ...toolProps });
    try {
        assert.doesNotMatch(h.text(), /Chapters/);
        assert.equal(h.root.root.findAll(node => node.props?.className === 'is-chapter').length, 0);
    } finally { h.close(); }
});

test('the quiz offers the creator chapters as pause points, labelled as theirs', () => {
    const Quiz = load('src/components/video-library/PauseQuiz.jsx');
    const none = harness(Quiz, { videoId: 'abcdefghijk', markers: [] });
    try { assert.doesNotMatch(none.text(), /Creator/); } finally { none.close(); }
    const h = harness(Quiz, { videoId: 'abcdefghijk', markers: [], chapters: creatorChapters(STORED, 1500) });
    try {
        const toggle = h.root.root.findAllByType('label').find(node => node.children.includes("Pause At The Creator's Chapters"));
        assert.ok(toggle);
        h.emit({ event: 'infoDelivery', info: { currentTime: 72, duration: 1500, playerState: 1 } });
        act(() => toggle.findByType('input').props.onChange({ target: { checked: true } }));
        h.emit({ event: 'infoDelivery', info: { currentTime: 76, duration: 1500, playerState: 1 } });
        assert.deepEqual(h.commands.map(command => command.func), ['pauseVideo']);
        assert.match(h.text(), /Creator's Chapter: /);
        assert.match(h.text(), /First Hand: AK vs QQ/);
    } finally { h.close(); }
});

test('the watch page reads the creator chapters once, server side, through the validating reader', () => {
    const page = read('pages/hub/video-library/watch/[videoId]/[[...slug]].js');
    assert.equal(page.match(/from\('video_enrichment_records'\)/g)?.length, 1);
    assert.match(page, /creatorChapters\(chaptersResult\.data\?\.chapters, durationSeconds\(video\.duration\)\)/);
    assert.match(page, /chaptersResult\.error \? \[\]/, 'a failed read shows no chapters rather than failing the page');
    assert.match(page, /chapters=\{chapters\}/);
});

test('no code path writes the "Video Start" placeholder chapter again', () => {
    const root = fileURLToPath(new URL('..', import.meta.url));
    const offenders = [];
    const walk = dir => {
        for (const name of readdirSync(dir)) {
            if (name === 'node_modules' || name.startsWith('.')) continue;
            const path = join(dir, name);
            if (statSync(path).isDirectory()) walk(path);
            else if (/\.(js|jsx|mjs|ts|tsx|py)$/.test(name) && !name.startsWith('test_') &&
                /title['"]?\s*:\s*['"]Video Start['"]/.test(readFileSync(path, 'utf8'))) offenders.push(path.slice(root.length));
        }
    };
    for (const folder of ['scripts', 'pages', 'src', 'lib']) {
        try { walk(join(root, folder)); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    assert.deepEqual(offenders, []);
    const worker = read('scripts/video_enrichment_worker.py');
    assert.doesNotMatch(worker, /update\(\{'chapters'/, 'the enrichment worker never writes the chapters column');
});

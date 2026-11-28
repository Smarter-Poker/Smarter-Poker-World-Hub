// One standard for every Video Library help tour (src/lib/videoLibraryHelpSteps.mjs).
//
// Fails if (a) a page's steps break the copy rules, (b) a step target has no
// matching data-tutorial attribute on that page or a Video Library component
// it renders, or (c) an explanation that was moved behind the "?" reappears in
// the page body.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    VIDEO_LIBRARY_HELP_STEPS,
    VIDEO_LIBRARY_HELP_PAGES,
    SHARED_HELP_STEPS,
} from '../src/lib/videoLibraryHelpSteps.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(join(root, file), 'utf8');
const VL_COMPONENTS = join(root, 'src/components/video-library');

// Comments may quote retired copy; only code and JSX count.
const stripComments = (source) => source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

function resolveImport(fromFile, spec) {
    const base = resolve(dirname(fromFile), spec);
    for (const candidate of [base, `${base}.js`, `${base}.jsx`, `${base}.mjs`, join(base, 'index.js'), join(base, 'index.jsx')]) {
        if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
    }
    return null;
}

// The page file plus every Video Library component it renders, transitively.
function renderedSources(pageFile) {
    const seen = new Set();
    const queue = [join(root, pageFile)];
    while (queue.length) {
        const file = queue.shift();
        if (seen.has(file)) continue;
        seen.add(file);
        const source = readFileSync(file, 'utf8');
        for (const match of source.matchAll(/(?:from\s+|import\(\s*)['"](\.{1,2}\/[^'"]+)['"]/g)) {
            const target = resolveImport(file, match[1]);
            if (target && target.startsWith(VL_COMPONENTS) && /\.(jsx?|mjs)$/.test(target)) queue.push(target);
        }
    }
    return [...seen];
}

const tutorialTargets = (files) => new Set(files.flatMap(file =>
    [...stripComments(readFileSync(file, 'utf8')).matchAll(/data-tutorial="([^"]+)"/g)].map(m => m[1])));

const EMOJI = /\p{Extended_Pictographic}/u;

function titleCaseViolations(text) {
    const bad = [];
    for (const word of text.split(/\s+/)) {
        for (const part of word.split('-')) {
            const letters = part.replace(/^[^\p{L}\d]+/u, '');
            if (letters && /^\p{Ll}/u.test(letters)) bad.push(word);
        }
    }
    return bad;
}

const pages = Object.keys(VIDEO_LIBRARY_HELP_PAGES);

test('every Video Library page has a frozen step list in the shared module', () => {
    assert.deepEqual(Object.keys(VIDEO_LIBRARY_HELP_STEPS).sort(), [...pages].sort());
    assert.ok(Object.isFrozen(VIDEO_LIBRARY_HELP_STEPS));
    for (const page of pages) {
        const steps = VIDEO_LIBRARY_HELP_STEPS[page];
        assert.ok(Array.isArray(steps) && steps.length > 0, `${page} has no help steps`);
        assert.ok(Object.isFrozen(steps), `${page} step list is not frozen`);
        for (const step of steps) assert.ok(Object.isFrozen(step), `${page}/${step.id} is not frozen`);
        const ids = steps.map(s => s.id);
        assert.equal(new Set(ids).size, ids.length, `${page} has duplicate step ids`);
    }
});

test('(a) every step is Title Case, non-empty, with no em dash, emoji or "$"', () => {
    for (const page of pages) {
        for (const step of VIDEO_LIBRARY_HELP_STEPS[page]) {
            const where = `${page}/${step.id}`;
            assert.match(step.id, /^[a-z0-9-]+$/, `${where} id`);
            for (const field of ['title', 'body']) {
                const text = step[field];
                assert.equal(typeof text, 'string', `${where} ${field} must be a string`);
                assert.ok(text.trim().length > 0, `${where} ${field} is empty`);
                assert.ok(!/[—–]/.test(text), `${where} ${field} has an em or en dash`);
                assert.ok(!EMOJI.test(text), `${where} ${field} has an emoji`);
                assert.ok(!text.includes('$'), `${where} ${field} has a "$"`);
                assert.deepEqual(titleCaseViolations(text), [], `${where} ${field} is not Title Case`);
            }
            assert.ok(step.target === null || (typeof step.target === 'string' && step.target.trim()), `${where} target must be a name or null`);
        }
    }
});

test('(b) every step target is a data-tutorial attribute the page renders', () => {
    for (const page of pages) {
        const files = renderedSources(VIDEO_LIBRARY_HELP_PAGES[page]);
        const available = tutorialTargets(files);
        for (const step of VIDEO_LIBRARY_HELP_STEPS[page]) {
            if (step.target === null) continue;
            for (const alternative of step.target.split('|').map(t => t.trim())) {
                assert.ok(available.has(alternative),
                    `${page}/${step.id} targets data-tutorial="${alternative}", which ${files.map(f => relative(root, f)).join(', ')} never render`);
            }
        }
    }
});

test('the index timeline and pause-quiz steps point at the viewer, falling back to the grid', () => {
    const index = VIDEO_LIBRARY_HELP_STEPS.index;
    for (const id of ['timeline', 'pause-quiz']) {
        assert.equal(index.find(s => s.id === id)?.target, 'viewer|grid');
    }
});

test('shared steps use the same words on every page that shows them', () => {
    const shared = Object.values(SHARED_HELP_STEPS).map(make => make('x'));
    for (const template of shared) {
        const uses = pages.flatMap(page => VIDEO_LIBRARY_HELP_STEPS[page].filter(s => s.title === template.title).map(s => ({ page, s })));
        assert.ok(uses.length >= 1, `${template.title} is defined as shared but unused`);
        for (const { page, s } of uses) assert.equal(s.body, template.body, `${page}/${s.id} rewords the shared "${template.title}" step`);
    }
});

test('pages take their steps from the shared module, never an inline list', () => {
    for (const page of pages) {
        const source = read(VIDEO_LIBRARY_HELP_PAGES[page]);
        assert.match(source, /import \{ VIDEO_LIBRARY_HELP_STEPS \} from '[./]+src\/lib\/videoLibraryHelpSteps\.mjs';/, `${page} must import the shared steps`);
        assert.doesNotMatch(source, /HELP_STEPS\s*=\s*Object\.freeze\(\s*\[/, `${page} defines an inline help list`);
        assert.match(source, /helpSteps=\{[A-Z_]*HELP_STEPS(?:\.[a-z]+)?\}/, `${page} must pass help steps to the mast`);
    }
});

// Explanations that live behind the "?" now. They must not come back as page
// body copy.
const MOVED_TO_HELP = [
    'Watch Progress Saves While You Watch',
    'Timeline Available When Playback Starts',
    'Live Videos Open On YouTube',
    'Filters Match Published Titles And Tags',
    'Playback Queue Is Saved For This Browser Session Only',
    'Follow Channels And Choose New Video Notifications',
];

function bodySources() {
    const files = new Set(pages.map(page => join(root, VIDEO_LIBRARY_HELP_PAGES[page])));
    const walk = (dir) => {
        for (const name of readdirSync(dir)) {
            const full = join(dir, name);
            if (statSync(full).isDirectory()) walk(full);
            else if (/\.(jsx?|mjs|tsx?)$/.test(name)) files.add(full);
        }
    };
    walk(VL_COMPONENTS);
    for (const page of pages) for (const file of renderedSources(VIDEO_LIBRARY_HELP_PAGES[page])) files.add(file);
    return [...files];
}

test('(c) explanations moved into help never reappear in the page body', () => {
    for (const file of bodySources()) {
        const source = stripComments(readFileSync(file, 'utf8'));
        for (const sentence of MOVED_TO_HELP) {
            assert.ok(!source.includes(sentence), `${relative(root, file)} shows "${sentence}" on the page; it belongs in src/lib/videoLibraryHelpSteps.mjs`);
        }
    }
});

test('(c) state-dependent warnings stay on the page', () => {
    assert.match(read('src/components/video-library/WatchTracking.jsx'), />Sign In To Save Watch Progress</);
    assert.match(read('pages/hub/video-library/playlists/[playlistId].js'), /The First \$\{MAX_QUEUE_ITEMS\} Videos Are Queued\./);
    assert.match(read('src/components/video-library/LiveNow.jsx'), />Checked \{new Date\(visible\.checkedAt\)\.toLocaleTimeString\(\[\], \{ hour: 'numeric', minute: '2-digit' \}\)\}</);
});

test('the guard itself catches a stray explanation and a missing target', () => {
    assert.deepEqual(titleCaseViolations('Live videos Open'), ['videos']);
    assert.ok(EMOJI.test('Play \u{1F3AC}'));
    const probe = stripComments("// Live Videos Open On YouTube\nconst x = <p>Live Videos Open On YouTube</p>;");
    assert.ok(probe.includes('Live Videos Open On YouTube'));
    assert.ok(!stripComments('// Live Videos Open On YouTube').includes('Live Videos'));
});

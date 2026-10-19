/**
 * THE PAGE MOVING IS NOT THE READER MOVING (2026-10-19).
 *
 * Twin of Club Arena's tests/unit/footerIgnoresScrollAnchoring.test.tsx
 * (Club Arena #7437). When content ABOVE the viewport changes height - a feed
 * card or an image re-rendering shorter and back - the browser's scroll
 * anchoring moves scrollTop by exactly that change so the reader's place stays
 * put, and fires a scroll event. `useHideOnScroll` read the down leg of that
 * shrink-and-restore pair as the reader travelling down, so the footer left
 * while the reader sat still.
 *
 * This executes the real hook from BottomNavBar.jsx (esbuild + the React test
 * renderer, the same harness as club-notice-board-component), driving its
 * capture-phase scroll listener and animation frames by hand.
 */
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const React = require('react');
const { act, create } = require('react-test-renderer');
const { transformSync } = require('esbuild');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const SOURCE = readFileSync(new URL('../src/components/ui/BottomNavBar.jsx', import.meta.url), 'utf8');
const lucideNames = SOURCE.match(/import \{([^}]+)\} from 'lucide-react'/)[1]
  .split(',')
  .map((name) => name.trim())
  .filter(Boolean);
const Stub = () => null;
const stubs = {
  react: React,
  'next/link': Stub,
  'next/router': { useRouter: () => ({ asPath: '/', pathname: '/', events: { on() {}, off() {} } }) },
  'lucide-react': Object.fromEntries(lucideNames.map((name) => [name, Stub])),
  '../../hooks/useUnreadCount': { useUnreadCount: () => 0 },
  '../../stores/pageOverlayStore': { openPageOverlay() {} },
  '../../config/worldFooterNavigation': { getFallbackFooter: () => null, resolveWorldFooter: () => null },
};

const frames = [];
let listener = null;
let contentHeight = 6000;
let scrollY = 0;

const documentElement = {
  get scrollTop() {
    return scrollY;
  },
  get scrollHeight() {
    return contentHeight;
  },
};
const fakeDocument = {
  documentElement,
  body: { scrollTop: 0 },
  addEventListener(type, fn) {
    if (type === 'scroll') listener = fn;
  },
  removeEventListener(type, fn) {
    if (type === 'scroll' && listener === fn) listener = null;
  },
};
const fakeWindow = {
  get scrollY() {
    return scrollY;
  },
  innerHeight: 800,
  requestAnimationFrame(callback) {
    frames.push(callback);
    return frames.length;
  },
  cancelAnimationFrame() {},
};
globalThis.window = fakeWindow;
globalThis.document = fakeDocument;

const loaded = { exports: {} };
const code = transformSync(SOURCE, { loader: 'jsx', format: 'cjs' }).code;
new Function('require', 'module', 'exports', code)(
  (name) => {
    if (!(name in stubs)) throw new Error(`unstubbed import ${name}`);
    return stubs[name];
  },
  loaded,
  loaded.exports
);
const { useHideOnScroll } = loaded.exports;

let root;
let current;
function Harness() {
  current = useHideOnScroll(true, '/social');
  return null;
}

function page(y, height = contentHeight) {
  contentHeight = height;
  scrollY = y;
  act(() => {
    listener({ target: fakeDocument });
    frames.splice(0).forEach((callback) => callback(0));
  });
}

function mount(startY = 0) {
  scrollY = startY;
  act(() => {
    root = create(React.createElement(Harness));
  });
  assert.equal(typeof listener, 'function', 'the hook must install its scroll listener');
}

beforeEach(() => {
  frames.length = 0;
  contentHeight = 6000;
  scrollY = 0;
  listener = null;
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
});

describe('a scroll the page made to keep its place is not travel', () => {
  it('stays up when a card above the viewport shrinks and is restored', () => {
    mount();
    page(3000);
    page(2900);
    assert.equal(current.hidden, false);

    // A card 300px tall above the reader re-renders at 0 and comes back.
    page(2600, 5700);
    page(2900, 6000);
    assert.equal(current.hidden, false, 'the bar left while the reader sat still');
  });

  it('stays down when the page keeps its place under a reader travelling down', () => {
    mount();
    page(1000);
    page(2000);
    assert.equal(current.hidden, true);

    page(1700, 5700);
    page(2000, 6000);
    assert.equal(current.hidden, true, 'a shrink-and-restore must not reveal the bar either');
  });

  it('still hides for the reader travelling down after the page moved', () => {
    mount();
    page(3000);
    page(2900);
    page(2600, 5700);
    page(2900, 6000);
    assert.equal(current.hidden, false);

    page(3200);
    assert.equal(current.hidden, true);
    page(3000);
    assert.equal(current.hidden, false);
  });

  it('comes back when the page shrinks under a reader at its end', () => {
    mount();
    page(4000);
    page(5000);
    assert.equal(current.hidden, true);

    // Content ends 200px sooner; the browser clamps scrollY to the new end.
    page(4800, 5600);
    assert.equal(current.hidden, false);
  });
});

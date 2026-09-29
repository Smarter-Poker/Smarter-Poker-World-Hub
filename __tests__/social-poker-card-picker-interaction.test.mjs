/**
 * The poker-card picker and the composer's card controls, rendered for real.
 *
 * social-poker-card-picker.test.mjs pins the storage format and reads the
 * picker's source. This file renders the components themselves: markup through
 * react-dom/server, and behaviour through react-dom/client on the small DOM
 * below (this repo has no jsdom). Labels, target sizes, the street rules,
 * focus, long press and the drafts of a backgrounded video post are checked by
 * what the components do, not by what their source looks like.
 *
 * Nothing here touches the network: fetch throws, and every module that would
 * talk to a server is replaced with a stub that records what it was asked.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const realSetTimeout = globalThis.setTimeout;
const sleep = (ms) => new Promise((resolve) => realSetTimeout(resolve, ms));
const noop = () => {};

// ── Loading the real components ─────────────────────────────────────────────
// The transpile-and-evaluate pattern of messenger-accounting-ui.test.mjs.
// Relative imports load the real files; a stub named by its exact specifier or
// by the last segment of its path replaces the module instead.
const transpiled = new Map();
function loadComponent(file, stubs = {}, cache = new Map()) {
  if (cache.has(file)) return cache.get(file).exports;
  if (!transpiled.has(file)) {
    transpiled.set(file, ts.transpileModule(readFileSync(join(ROOT, file), 'utf8'), {
      // A .mjs name makes TypeScript emit ES modules whatever `module` says,
      // and new Function cannot run those. Every file here becomes CommonJS.
      fileName: file.replace(/\.mjs$/, ".js"),
      compilerOptions: {
        jsx: ts.JsxEmit.React,
        module: ts.ModuleKind.CommonJS,
        esModuleInterop: true,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText);
  }
  const module = { exports: {} };
  cache.set(file, module);
  const load = (specifier) => {
    if (specifier in stubs) return stubs[specifier];
    const name = specifier.split('/').at(-1);
    if (name in stubs) return stubs[name];
    if (!specifier.startsWith('.')) return require(specifier);
    const base = join(dirname(file), specifier);
    const found = ['.jsx', '.js', ''].map((ext) => base + ext)
      .find((candidate) => existsSync(join(ROOT, candidate)) && statSync(join(ROOT, candidate)).isFile());
    if (!found) throw new Error(`cannot resolve ${specifier} from ${file}`);
    return loadComponent(found, stubs, cache);
  };
  new Function('require', 'module', 'exports', transpiled.get(file))(load, module, module.exports);
  return module.exports;
}

const Picker = loadComponent('src/components/social/PokerCardPicker.jsx').default;

// ── Reading server-rendered markup ──────────────────────────────────────────
const renderPicker = (initialMarkup = '') => renderToStaticMarkup(
  React.createElement(Picker, { initialMarkup, onInsert: noop, onClose: noop })
);
const attributeOf = (tag, name) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1] ?? null;
const openingTags = (html, tag) => [...html.matchAll(new RegExp(`<${tag}\\b[^>]*>`, 'g'))].map((match) => match[0]);
const labelsIn = (html) => [...html.matchAll(/\saria-label="([^"]*)"/g)].map((match) => match[1]);
const pixels = (style, property) => Number(style?.match(new RegExp(`(?:^|;)\\s*${property}:\\s*([\\d.]+)px`))?.[1] ?? 0);
const cssTarget = (style) => ({
  width: Math.max(pixels(style, 'min-width'), pixels(style, 'width')),
  height: Math.max(pixels(style, 'min-height'), pixels(style, 'height')),
});

// ── A small DOM, enough for react-dom/client ────────────────────────────────
const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const COMMENT_NODE = 8;
const DOCUMENT_NODE = 9;
const HTML_NAMESPACE = 'http://www.w3.org/1999/xhtml';
const FOCUSABLE_TAGS = new Set(['button', 'input', 'select', 'textarea']);

const captureFlag = (options) => (typeof options === 'boolean' ? options : Boolean(options?.capture));

class FakeEventTarget {
  constructor() {
    this._listeners = new Map();
  }

  addEventListener(type, listener, options) {
    if (!listener) return;
    const capture = captureFlag(options);
    const list = this._listeners.get(type) || [];
    if (!list.some((entry) => entry.listener === listener && entry.capture === capture)) {
      list.push({ listener, capture });
    }
    this._listeners.set(type, list);
  }

  removeEventListener(type, listener, options) {
    const capture = captureFlag(options);
    const list = this._listeners.get(type) || [];
    this._listeners.set(type, list.filter((entry) => entry.listener !== listener || entry.capture !== capture));
  }

  _invoke(event, capture) {
    for (const entry of [...(this._listeners.get(event.type) || [])]) {
      if (entry.capture !== capture || event._stopped) continue;
      event.currentTarget = this;
      if (typeof entry.listener === 'function') entry.listener.call(this, event);
      else entry.listener.handleEvent(event);
    }
  }

  // Capture from the window down, the target, then bubble back up.
  dispatchEvent(event) {
    const path = [];
    for (let node = this; node; node = node.parentNode || (node.nodeType === DOCUMENT_NODE ? node.defaultView : null)) {
      path.push(node);
    }
    event.target = this;
    for (let i = path.length - 1; i > 0 && !event._stopped; i--) path[i]._invoke(event, true);
    if (!event._stopped) path[0]._invoke(event, true);
    if (!event._stopped) path[0]._invoke(event, false);
    if (event.bubbles) for (let i = 1; i < path.length && !event._stopped; i++) path[i]._invoke(event, false);
    return !event.defaultPrevented;
  }
}

class FakeNode extends FakeEventTarget {
  constructor(ownerDocument, nodeType, nodeName) {
    super();
    this.ownerDocument = ownerDocument;
    this.nodeType = nodeType;
    this.nodeName = nodeName;
    this.parentNode = null;
    this.childNodes = [];
  }

  get firstChild() { return this.childNodes[0] || null; }
  get lastChild() { return this.childNodes[this.childNodes.length - 1] || null; }
  get parentElement() { return this.parentNode?.nodeType === ELEMENT_NODE ? this.parentNode : null; }
  get nextSibling() {
    const siblings = this.parentNode?.childNodes;
    return siblings ? siblings[siblings.indexOf(this) + 1] || null : null;
  }
  get previousSibling() {
    const siblings = this.parentNode?.childNodes;
    return siblings ? siblings[siblings.indexOf(this) - 1] || null : null;
  }

  appendChild(child) { return this.insertBefore(child, null); }

  insertBefore(child, before) {
    if (child.parentNode) child.parentNode.removeChild(child);
    const index = before ? this.childNodes.indexOf(before) : -1;
    if (index === -1) this.childNodes.push(child);
    else this.childNodes.splice(index, 0, child);
    child.parentNode = this;
    return child;
  }

  removeChild(child) {
    const index = this.childNodes.indexOf(child);
    if (index !== -1) this.childNodes.splice(index, 1);
    child.parentNode = null;
    // As in a browser, removing the focused element leaves focus on the body.
    (this.ownerDocument || this)._loseFocusWithin(child);
    return child;
  }

  remove() { this.parentNode?.removeChild(this); }

  contains(node) {
    for (let current = node; current; current = current.parentNode) if (current === this) return true;
    return false;
  }

  get textContent() { return this.childNodes.map((child) => child.textContent).join(''); }
  set textContent(value) {
    for (const child of [...this.childNodes]) this.removeChild(child);
    if (value !== '' && value != null) this.appendChild(this.ownerDocument.createTextNode(String(value)));
  }
}

class FakeText extends FakeNode {
  constructor(ownerDocument, text, nodeType = TEXT_NODE) {
    super(ownerDocument, nodeType, nodeType === TEXT_NODE ? '#text' : '#comment');
    this.nodeValue = String(text);
  }

  get textContent() { return this.nodeType === TEXT_NODE ? this.nodeValue : ''; }
  set textContent(value) { this.nodeValue = String(value); }
  get data() { return this.nodeValue; }
  set data(value) { this.nodeValue = String(value); }
}

function createStyle() {
  return Object.create({
    setProperty(name, value) { this[name] = value; },
    removeProperty(name) { delete this[name]; },
    getPropertyValue(name) { return this[name] ?? ''; },
  });
}

function descendants(node, out = []) {
  for (const child of node.childNodes) {
    if (child.nodeType !== ELEMENT_NODE) continue;
    out.push(child);
    descendants(child, out);
  }
  return out;
}

// Tag, #id, [attr], [attr="value"] and :not([attr]) in comma lists: all the
// picker's focus trap and these tests ask for.
function compileSelector(selector) {
  const alternatives = selector.split(',').map((text) => {
    const tests = [];
    let rest = text.trim();
    const take = (pattern) => {
      const match = rest.match(pattern);
      if (match) rest = rest.slice(match[0].length);
      return match;
    };
    const attributeTest = (name, value) => (element) => (value === undefined
      ? element.hasAttribute(name)
      : element.getAttribute(name) === value);
    let match = take(/^[a-zA-Z][\w-]*/);
    if (match) {
      const tag = match[0].toLowerCase();
      tests.push((element) => element.localName === tag);
    }
    while (rest) {
      if ((match = take(/^#([\w-]+)/))) {
        const id = match[1];
        tests.push((element) => element.getAttribute('id') === id);
      } else if ((match = take(/^\[([\w-]+)(?:="([^"]*)")?\]/))) {
        tests.push(attributeTest(match[1], match[2]));
      } else if ((match = take(/^:not\(\[([\w-]+)(?:="([^"]*)")?\]\)/))) {
        const inner = attributeTest(match[1], match[2]);
        tests.push((element) => !inner(element));
      } else {
        throw new Error(`selector not supported by the test DOM: ${selector}`);
      }
    }
    return (element) => tests.every((check) => check(element));
  });
  return (element) => alternatives.some((matches) => matches(element));
}

class FakeElement extends FakeNode {
  constructor(ownerDocument, tagName, namespaceURI = HTML_NAMESPACE) {
    super(ownerDocument, ELEMENT_NODE, namespaceURI === HTML_NAMESPACE ? tagName.toUpperCase() : tagName);
    this.tagName = this.nodeName;
    this.localName = tagName;
    this.namespaceURI = namespaceURI;
    this._attributes = new Map();
    this.style = createStyle();
  }

  setAttribute(name, value) { this._attributes.set(name, String(value)); }
  setAttributeNS(_namespace, name, value) { this.setAttribute(name, value); }
  getAttribute(name) { return this._attributes.has(name) ? this._attributes.get(name) : null; }
  hasAttribute(name) { return this._attributes.has(name); }
  removeAttribute(name) { this._attributes.delete(name); }
  removeAttributeNS(_namespace, name) { this.removeAttribute(name); }

  get id() { return this.getAttribute('id') || ''; }
  set id(value) { this.setAttribute('id', value); }
  get disabled() { return this.hasAttribute('disabled'); }
  set disabled(value) { if (value) this.setAttribute('disabled', ''); else this.removeAttribute('disabled'); }
  get hidden() { return this.hasAttribute('hidden'); }
  set hidden(value) { if (value) this.setAttribute('hidden', ''); else this.removeAttribute('hidden'); }
  get type() {
    return this.getAttribute('type') || (this.localName === 'input' ? 'text' : this.localName === 'button' ? 'submit' : '');
  }
  set type(value) { this.setAttribute('type', value); }

  focus() { this.ownerDocument._focus(this); }
  blur() { if (this.ownerDocument.activeElement === this) this.ownerDocument.activeElement = this.ownerDocument.body; }
  scrollIntoView() {}
  getBoundingClientRect() { return { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }; }

  querySelectorAll(selector) {
    const matches = compileSelector(selector);
    return descendants(this).filter(matches);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  matches(selector) { return compileSelector(selector)(this); }
  closest(selector) {
    const matches = compileSelector(selector);
    for (let node = this; node?.nodeType === ELEMENT_NODE; node = node.parentNode) if (matches(node)) return node;
    return null;
  }
}

class FakeDocument extends FakeNode {
  constructor() {
    super(null, DOCUMENT_NODE, '#document');
    this.activeElement = null;
    this.documentElement = this.createElement('html');
    this.head = this.createElement('head');
    this.body = this.createElement('body');
    this.documentElement.appendChild(this.head);
    this.documentElement.appendChild(this.body);
    this.appendChild(this.documentElement);
    this.activeElement = this.body;
    this.visibilityState = 'visible';
    // React feature-tests `oninput in document` before using input events.
    this.oninput = null;
  }

  createElement(tagName) { return new FakeElement(this, String(tagName).toLowerCase()); }
  createElementNS(namespaceURI, tagName) { return new FakeElement(this, tagName, namespaceURI); }
  createTextNode(text) { return new FakeText(this, text); }
  createComment(text) { return new FakeText(this, text, COMMENT_NODE); }
  getElementById(id) { return descendants(this).find((element) => element.getAttribute('id') === id) || null; }
  querySelectorAll(selector) { return descendants(this).filter(compileSelector(selector)); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }

  _focus(element) {
    if (!element || !this.documentElement.contains(element)) return;
    const focusable = element === this.body
      || (FOCUSABLE_TAGS.has(element.localName) ? !element.hasAttribute('disabled')
        : element.localName === 'a' ? element.hasAttribute('href') : element.hasAttribute('tabindex'));
    if (focusable) this.activeElement = element;
  }

  _loseFocusWithin(node) {
    if (this.activeElement && node.contains(this.activeElement)) this.activeElement = this.body;
  }
}

function createStorage() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => { data.set(key, String(value)); },
    removeItem: (key) => { data.delete(key); },
    clear: () => data.clear(),
    key: (index) => [...data.keys()][index] ?? null,
    get length() { return data.size; },
  };
}

function createEvent(type, init = {}) {
  return {
    type,
    bubbles: true,
    cancelable: true,
    defaultPrevented: false,
    timeStamp: Date.now(),
    _stopped: false,
    preventDefault() { this.defaultPrevented = true; },
    stopPropagation() { this._stopped = true; },
    stopImmediatePropagation() { this._stopped = true; },
    ...init,
  };
}

// Installs window, document and storage for one test and takes them away
// afterwards, so nothing leaks into other suites run in the same process.
function installBrowser(t, { unrefTimers = false } = {}) {
  const document = new FakeDocument();
  const window = new FakeEventTarget();
  Object.assign(window, {
    document,
    navigator: globalThis.navigator,
    location: { href: 'https://smarter.poker/hub/social-media', pathname: '/hub/social-media', search: '', hash: '' },
    innerWidth: 390,
    innerHeight: 844,
    HTMLIFrameElement: class HTMLIFrameElement {},
    getComputedStyle: (element) => element.style,
    matchMedia: () => ({ matches: false, addListener: noop, removeListener: noop, addEventListener: noop, removeEventListener: noop }),
    getSelection: () => null,
    scrollTo: noop,
    focus: noop,
  });
  window.window = window;
  window.self = window;
  document.defaultView = window;
  const localStorage = createStorage();
  const sessionStorage = createStorage();
  window.localStorage = localStorage;
  window.sessionStorage = sessionStorage;

  const saved = new Map();
  const define = (globals) => {
    for (const [name, value] of Object.entries(globals)) {
      if (!saved.has(name)) saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
      Object.defineProperty(globalThis, name, { value, configurable: true, writable: true, enumerable: true });
    }
  };
  define({
    window,
    document,
    localStorage,
    sessionStorage,
    IS_REACT_ACT_ENVIRONMENT: true,
    fetch: async () => { throw new Error('the network is not available in this test'); },
  });
  // Loaded once the DOM exists, so React's feature checks see one, and before
  // the timer wrapper below, so React and its scheduler keep the real timers.
  require('react-dom/client');
  if (unrefTimers) {
    // The composer arms 4, 30 and 90 second safety timers. They must not hold
    // the test process open after the assertions are done.
    define({
      setTimeout: (callback, ms, ...args) => {
        const timer = realSetTimeout(callback, ms, ...args);
        timer?.unref?.();
        return timer;
      },
    });
  }

  const logs = [];
  const consoleMethods = {};
  for (const method of ['error', 'warn', 'log', 'info']) {
    consoleMethods[method] = console[method];
    console[method] = (...args) => { logs.push({ method, text: args.map(String).join(' ') }); };
  }

  const cleanups = [];
  t.after(async () => {
    try {
      for (const cleanup of cleanups.reverse()) await cleanup();
    } finally {
      Object.assign(console, consoleMethods);
      for (const [name, descriptor] of saved) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else delete globalThis[name];
      }
    }
  });
  return { document, window, localStorage, logs, cleanups };
}

async function mount(browser, element) {
  const { createRoot } = require('react-dom/client');
  const container = browser.document.createElement('div');
  browser.document.body.appendChild(container);
  const root = createRoot(container);
  await React.act(async () => { root.render(element); });
  browser.cleanups.push(() => React.act(async () => { root.unmount(); }));
  return container;
}

async function fire(target, type, init = {}) {
  await React.act(async () => { target.dispatchEvent(createEvent(type, init)); });
}
// detail 1 is a pointer click; detail 0 is what a keyboard press dispatches.
const click = (target, detail = 1) => fire(target, 'click', { detail, button: 0 });
const press = (target, key, init = {}) => fire(target, 'keydown', { key, ...init });
const pointer = (target, type, init = {}) => fire(target, type, { pointerId: 1, pointerType: 'touch', isPrimary: true, button: 0, ...init });
const wait = (ms) => React.act(async () => { await sleep(ms); });

const byLabel = (root, label) => {
  const found = root.querySelectorAll('[aria-label]').find((element) => element.getAttribute('aria-label') === label);
  assert.ok(found, `no element is labelled "${label}"`);
  return found;
};
// Elements are compared by name. Handing the elements themselves to a failing
// assertion makes node:test serialize the whole DOM and React tree behind them.
const nameOf = (element) => element?.getAttribute?.('aria-label')
  ?? (element?.localName === 'button' ? element.textContent.trim() : element?.nodeName ?? String(element));
const hasLabel = (root, label) => root.querySelectorAll('[aria-label]').some((element) => element.getAttribute('aria-label') === label);
const byText = (root, text) => {
  const found = root.querySelectorAll('button').find((element) => element.textContent.trim() === text);
  assert.ok(found, `no button reads "${text}"`);
  return found;
};
// Controls found without their accessible names, so a test about one finding
// cannot fail on another finding's labels.
const rankKey = (root, key) => {
  const found = root.querySelectorAll('[aria-controls="quick-rank-suits"]').find((button) => button.textContent.trim() === key);
  assert.ok(found, `no quick rank button shows "${key}"`);
  return found;
};
const suitChoices = (root) => root.getElementById('quick-rank-suits')?.querySelectorAll('button') ?? [];
const zoneOf = (root, zoneLabel) => byLabel(root, zoneLabel).parentNode;
const cardIn = (container, alt) => {
  const found = container.querySelectorAll('button').find((button) => button.querySelector('img')?.getAttribute('alt') === alt);
  assert.ok(found, `no card button shows "${alt}"`);
  return found;
};
const gridCard = (root, alt) => {
  const outside = [zoneOf(root, 'Select Your Hand'), zoneOf(root, 'Select Board'), root.getElementById('quick-rank-suits')].filter(Boolean);
  const found = root.querySelectorAll('button').find((button) => button.querySelector('img')?.getAttribute('alt') === alt
    && !outside.some((container) => container.contains(button)));
  assert.ok(found, `no grid card shows "${alt}"`);
  return found;
};
const cardsShown = (root) => hasLabel(root, 'Remove Poker Cards');
const reactWarnings = (browser) => browser.logs.filter(({ method, text }) => method === 'error' && /Warning:/.test(text)).map(({ text }) => text);

async function renderPickerInDom(t, initialMarkup = '') {
  const browser = installBrowser(t);
  const inserted = [];
  let closed = 0;
  const container = await mount(browser, React.createElement(Picker, {
    initialMarkup,
    onInsert: (markup) => inserted.push(markup),
    onClose: () => { closed += 1; },
  }));
  return { browser, document: browser.document, container, inserted, closed: () => closed };
}

// ── P5C-05: every name is made of words ─────────────────────────────────────
test('picker controls are named in words, and ten is spoken as ten', () => {
  const html = renderPicker('Hand [[sp-card:As]][[sp-card:Td]] | Board [[sp-card:Kh]][[sp-card:Th]][[sp-card:2c]]');
  const labels = labelsIn(html);
  for (const expected of [
    'Add ace of hearts to your hand',
    'Add 10 of spades to your hand',
    'Add queen of clubs to your hand',
    'Add jack of diamonds to your hand',
    'Remove ace of spades from your hand',
    'Remove 10 of diamonds from your hand',
    'Remove king of hearts from the board',
    'Remove 10 of hearts from the board',
    'Remove 2 of clubs from the board',
  ]) {
    assert.ok(labels.includes(expected), `missing label "${expected}"`);
  }
  assert.deepEqual(
    labels.filter((label) => label.endsWith('. Hold for suits')),
    ['Ace', 'King', 'Queen', 'Jack', '10', '9', '8', '7', '6', '5', '4', '3', '2'].map((rank) => `${rank}. Hold for suits`),
  );
  for (const label of labels) {
    assert.doesNotMatch(label, /\b[AKQJT] of /, `"${label}" names a rank by its letter`);
    assert.doesNotMatch(label, /\b[2-9TJQKA][shdc]\b/, `"${label}" uses the storage code`);
    assert.doesNotMatch(label, / to (?:hand|board)$/, `"${label}" names the zone by its id`);
  }
  // Real card art only: no suit glyphs or playing-card emoji stand in for it.
  assert.doesNotMatch(html, /[\u2660-\u2667]|[\u{1F0A0}-\u{1F0FF}]/u);
});

test('board labels name the board once it is the chosen zone', async (t) => {
  const { document } = await renderPickerInDom(t);
  await click(byLabel(document, 'Select Board'));
  assert.ok(hasLabel(document, 'Add 10 of hearts to the board'));
  assert.ok(!hasLabel(document, 'Add 10 of hearts to your hand'));
  await click(byLabel(document, 'Queen. Hold for suits'), 0);
  assert.ok(hasLabel(document, 'Add queen of spades to the board'));
  assert.equal(byLabel(document, 'Queen suit choices').getAttribute('role'), 'group');
});

// ── P5C-06: 44 by 44 targets ────────────────────────────────────────────────
test('every picker control is at least 44 by 44 CSS pixels', () => {
  const html = renderPicker('Hand [[sp-card:As]][[sp-card:Kd]] | Board [[sp-card:Qh]][[sp-card:Jc]][[sp-card:Ts]]');
  const buttons = openingTags(html, 'button');
  assert.ok(buttons.length >= 75, `only ${buttons.length} buttons rendered`);
  for (const button of buttons) {
    const size = cssTarget(attributeOf(button, 'style'));
    const name = attributeOf(button, 'aria-label') || button;
    assert.ok(size.width >= 44 && size.height >= 44, `${name} is ${size.width} by ${size.height}`);
  }
});

test('the quick suit choices and the whole open picker keep 44 pixel targets', async (t) => {
  const { browser, document } = await renderPickerInDom(t, 'Hand [[sp-card:As]] | Board [[sp-card:Qh]][[sp-card:Jc]][[sp-card:Ts]][[sp-card:9d]]');
  await click(rankKey(document, 'A'), 0);
  const buttons = document.querySelectorAll('button');
  assert.equal(suitChoices(document).length, 4, 'the ace suits did not open');
  for (const button of buttons) {
    const width = Math.max(parseFloat(button.style.minWidth) || 0, parseFloat(button.style.width) || 0);
    const height = Math.max(parseFloat(button.style.minHeight) || 0, parseFloat(button.style.height) || 0);
    assert.ok(width >= 44 && height >= 44, `${button.getAttribute('aria-label') || button.textContent} is ${width} by ${height}`);
  }
  // All thirteen quick ranks stay on screen: the grid wraps, it never scrolls.
  const grid = byLabel(document, 'Quick rank card selector');
  assert.equal(grid.style.gridTemplateColumns, 'repeat(auto-fit, minmax(44px, 1fr))');
  assert.equal(grid.querySelectorAll('button').length, 13);
  assert.deepEqual(reactWarnings(browser), []);
});

// ── P5C-07: whole streets only ──────────────────────────────────────────────
test('a board is added only as the flop, turn or river, and the button says why not', () => {
  const addButton = (html) => html.match(/<button\b[^>]*>Add Cards To Post<\/button>/)?.[0];
  const hintOf = (html) => html.match(/<p id="poker-card-picker-insert-hint"[^>]*>([^<]*)<\/p>/)?.[1] ?? null;

  const oneCard = renderPicker('Board [[sp-card:As]]');
  assert.equal(attributeOf(addButton(oneCard), 'aria-disabled'), 'true');
  assert.equal(attributeOf(addButton(oneCard), 'aria-describedby'), 'poker-card-picker-insert-hint');
  assert.equal(hintOf(oneCard), 'Add 2 More Board Cards To Complete The Flop');

  const twoCards = renderPicker('Hand [[sp-card:Kd]] | Board [[sp-card:As]][[sp-card:2c]]');
  assert.equal(attributeOf(addButton(twoCards), 'aria-disabled'), 'true');
  assert.equal(hintOf(twoCards), 'Add 1 More Board Card To Complete The Flop');

  const nothing = renderPicker('');
  assert.equal(attributeOf(addButton(nothing), 'aria-disabled'), 'true');
  assert.equal(hintOf(nothing), 'Pick At Least One Card First');

  for (const markup of [
    'Hand [[sp-card:As]][[sp-card:Kd]]',
    'Board [[sp-card:As]][[sp-card:Kd]][[sp-card:Qh]]',
    'Board [[sp-card:As]][[sp-card:Kd]][[sp-card:Qh]][[sp-card:Jc]]',
    'Hand [[sp-card:9s]] | Board [[sp-card:As]][[sp-card:Kd]][[sp-card:Qh]][[sp-card:Jc]][[sp-card:Ts]]',
  ]) {
    const html = renderPicker(markup);
    assert.equal(attributeOf(addButton(html), 'aria-disabled'), 'false', markup);
    assert.equal(hintOf(html), null, markup);
  }
});

test('a partial flop cannot be inserted until the flop is complete', async (t) => {
  const { document, inserted } = await renderPickerInDom(t, 'Board [[sp-card:As]][[sp-card:Kd]]');
  const add = byText(document, 'Add Cards To Post');
  await click(add);
  assert.deepEqual(inserted, [], 'a two-card board was inserted');
  await click(byLabel(document, 'Select Board'));
  await click(gridCard(document, 'Seven of clubs'));
  assert.equal(add.getAttribute('aria-disabled'), 'false');
  await click(add);
  assert.deepEqual(inserted, ['Board [[sp-card:As]][[sp-card:Kd]][[sp-card:7c]]']);
});

test('removing a flop card keeps the turn and river on their streets', async (t) => {
  const { document, inserted } = await renderPickerInDom(
    t,
    'Hand [[sp-card:As]][[sp-card:Ks]] | Board [[sp-card:Qh]][[sp-card:Jc]][[sp-card:2d]][[sp-card:7s]][[sp-card:9h]]'
  );
  await click(cardIn(zoneOf(document, 'Select Board'), 'Jack of clubs'));
  assert.ok(hasLabel(document, 'Empty flop slot'), 'the flop slot closed up');
  assert.match(document.body.textContent, /Pick A Card To Fill The Empty Flop Slot/);
  const add = byText(document, 'Add Cards To Post');
  assert.equal(add.getAttribute('aria-disabled'), 'true');
  assert.equal(document.getElementById(add.getAttribute('aria-describedby')).textContent, 'Fill The Empty Flop Slot Before Adding These Cards');
  await click(add);
  assert.deepEqual(inserted, [], 'a board with a hole in the flop was inserted');
  // The next card goes back into the flop, because that is where the gap is.
  assert.equal(byLabel(document, 'Select Board').getAttribute('aria-pressed'), 'true');
  await click(gridCard(document, 'Ten of clubs'));
  assert.ok(!hasLabel(document, 'Empty flop slot'));
  await click(add);
  assert.deepEqual(inserted, [
    'Hand [[sp-card:As]][[sp-card:Ks]] | Board [[sp-card:Qh]][[sp-card:Tc]][[sp-card:2d]][[sp-card:7s]][[sp-card:9h]]',
  ]);
});

test('removing the turn under a river keeps the river on the river', async (t) => {
  const { document, inserted } = await renderPickerInDom(t, 'Board [[sp-card:Qh]][[sp-card:Jc]][[sp-card:2d]][[sp-card:7s]][[sp-card:9h]]');
  await click(cardIn(zoneOf(document, 'Select Board'), 'Seven of spades'));
  assert.ok(hasLabel(document, 'Empty turn slot'), 'the turn slot closed up');
  await click(gridCard(document, 'Three of hearts'));
  await click(byText(document, 'Add Cards To Post'));
  assert.deepEqual(inserted, ['Board [[sp-card:Qh]][[sp-card:Jc]][[sp-card:2d]][[sp-card:3h]][[sp-card:9h]]']);
  // With no later street a flop card simply comes off.
  const board = zoneOf(document, 'Select Board');
  await click(cardIn(board, 'Nine of hearts'));
  await click(cardIn(board, 'Three of hearts'));
  await click(cardIn(board, 'Jack of clubs'));
  assert.ok(!hasLabel(document, 'Empty flop slot'));
  assert.match(document.body.textContent, /Build The Flop · 2\/3/);
});

// ── P5C-10: focus stays in the dialog and comes back to the rank ────────────
test('Tab and Shift+Tab stay inside the card picker', async (t) => {
  const { browser, document } = await renderPickerInDom(t, 'Hand [[sp-card:As]]');
  const close = byLabel(document, 'Close Card Picker');
  const add = byText(document, 'Add Cards To Post');
  assert.equal(nameOf(document.activeElement), nameOf(close), 'the picker opens with focus on Close');
  await press(close, 'Tab', { shiftKey: true });
  assert.equal(nameOf(document.activeElement), nameOf(add), 'Shift+Tab from the first control left the dialog');
  await press(add, 'Tab');
  assert.equal(nameOf(document.activeElement), nameOf(close), 'Tab from the last control left the dialog');
  document.activeElement = document.body;
  await press(document.body, 'Tab');
  assert.equal(nameOf(document.activeElement), nameOf(close), 'Tab from outside did not come back into the dialog');
  assert.deepEqual(reactWarnings(browser), []);
});

test('picking a quick suit hands focus back to its rank, and so does Escape', async (t) => {
  const { document, closed } = await renderPickerInDom(t);
  const ace = rankKey(document, 'A');
  ace.focus();
  await click(ace, 0);
  const suits = document.getElementById(ace.getAttribute('aria-controls'));
  assert.ok(suits, 'aria-controls names nothing');
  assert.equal(suits.hidden, false);
  assert.equal(ace.getAttribute('aria-expanded'), 'true');
  const hearts = suitChoices(document)[1];
  assert.equal(hearts.querySelector('img').getAttribute('alt'), 'Ace of hearts');
  hearts.focus();
  await click(hearts, 0);
  assert.match(byLabel(document, 'Select Your Hand').textContent, /1\/6/, 'the card was not added');
  assert.equal(ace.getAttribute('aria-expanded'), 'false');
  assert.equal(nameOf(document.activeElement), nameOf(ace), 'focus fell out of the dialog when the suits closed');

  const king = rankKey(document, 'K');
  await click(king, 0);
  const spades = suitChoices(document)[0];
  spades.focus();
  await press(spades, 'Escape');
  assert.equal(king.getAttribute('aria-expanded'), 'false');
  assert.equal(nameOf(document.activeElement), nameOf(king), 'Escape dropped focus instead of returning it to the rank');
  assert.equal(closed(), 0, 'the first Escape should close only the suits');
});

test('aria-controls always names a real element and the quick ranks are a labelled group', () => {
  const html = renderPicker();
  const controlled = new Set(openingTags(html, 'button').map((tag) => attributeOf(tag, 'aria-controls')).filter(Boolean));
  assert.deepEqual([...controlled], ['quick-rank-suits']);
  for (const id of controlled) assert.ok(new RegExp(`\\sid="${id}"`).test(html), `aria-controls="${id}" names nothing`);
  const group = openingTags(html, 'div').find((tag) => attributeOf(tag, 'aria-label') === 'Quick rank card selector');
  assert.equal(attributeOf(group, 'role'), 'group');
});

// ── P5C-11: long press ──────────────────────────────────────────────────────
test('rank buttons turn off the iOS long-press callout', () => {
  const ranks = openingTags(renderPicker(), 'button').filter((tag) => attributeOf(tag, 'aria-controls') === 'quick-rank-suits');
  assert.equal(ranks.length, 13);
  for (const tag of ranks) {
    assert.match(attributeOf(tag, 'style'), /-webkit-touch-callout:none/);
    assert.match(attributeOf(tag, 'style'), /user-select:none/);
  }
});

test('a long press still opens the suits and its own click does not shut them', async (t) => {
  const { document } = await renderPickerInDom(t);
  const king = rankKey(document, 'K');
  await pointer(king, 'pointerdown');
  await wait(470);
  assert.equal(king.getAttribute('aria-expanded'), 'true', 'holding for 420ms did not open the suits');
  await pointer(king, 'pointerup');
  await pointer(king, 'pointerout', { relatedTarget: null });
  await click(king, 1);
  assert.equal(king.getAttribute('aria-expanded'), 'true', 'the click that ends the long press shut the suits');
  // A short tap is an ordinary click and toggles.
  await pointer(king, 'pointerdown');
  await pointer(king, 'pointerup');
  await click(king, 1);
  assert.equal(king.getAttribute('aria-expanded'), 'false');
});

test('a long press that never gets its click does not swallow the next keyboard press', async (t) => {
  const { document } = await renderPickerInDom(t);
  const queen = rankKey(document, 'Q');
  await pointer(queen, 'pointerdown');
  await wait(470);
  assert.equal(queen.getAttribute('aria-expanded'), 'true');
  // The finger slides off: no click follows.
  await pointer(queen, 'pointerout', { relatedTarget: document.body });
  queen.focus();
  await click(queen, 0);
  assert.equal(queen.getAttribute('aria-expanded'), 'false', 'the keyboard press was swallowed after a slide-off');

  const jack = rankKey(document, 'J');
  await pointer(jack, 'pointerdown');
  await wait(470);
  assert.equal(jack.getAttribute('aria-expanded'), 'true');
  // The browser takes the gesture over (a scroll): pointercancel, no click.
  await pointer(jack, 'pointercancel');
  const ten = rankKey(document, '1');
  ten.focus();
  await click(ten, 0);
  assert.equal(ten.getAttribute('aria-expanded'), 'true', 'the keyboard press was swallowed after a cancelled press');
});

// ── P5C-08: a backgrounded video post keeps its drafts until it exists ─────
function fakeUploader() {
  const uploader = {
    isActive: false,
    ghostMeta: null,
    started: [],
    listener: null,
    start(options) {
      uploader.started.push(options);
      uploader.isActive = true;
      uploader.ghostMeta = { content: options.content || '' };
      return new Promise(() => {});
    },
    subscribe(listener) {
      uploader.listener = listener;
      return () => { if (uploader.listener === listener) uploader.listener = null; };
    },
    prefetch: noop,
    abort: noop,
  };
  return uploader;
}

function composerStubs(uploader) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const token = `e30.${Buffer.from(JSON.stringify({ exp })).toString('base64url')}.sig`;
  return {
    'next/link': ({ href, children, ...rest }) => React.createElement('a', { href, ...rest }, children),
    supabase: {
      supabase: {
        rpc: async () => ({ data: [], error: null }),
        from: () => ({ select: () => ({ ilike: () => ({ limit: async () => ({ data: [] }) }) }) }),
        auth: {
          getSession: async () => ({ data: { session: { access_token: token } } }),
          refreshSession: async () => ({ data: { session: { access_token: token } } }),
        },
      },
    },
    authUtils: { getAccessToken: () => token },
    EventBus: { busEmit: { venueCheckinCreated: noop } },
    toastStore: { success: noop, error: noop, info: noop, warning: noop, action: noop },
    ActiveIdentityContext: {
      useActiveIdentity: () => ({ isClubMode: false, clubPage: null, hasClubPage: false, switchToPersonal: noop, switchToClub: noop }),
    },
    AvatarContext: { useAvatar: () => ({ avatar: null }) },
    CheckInModal: () => null,
    SharedAvatar: { SharedAvatar: () => null },
    socialHelpers: {
      MAX_MEDIA: 10,
      compressImage: async (file) => file,
      getYouTubeVideoId: () => null,
      validateYouTubeVideo: async () => ({ valid: true }),
      sniffMimeType: (file) => file.type,
      SOCIAL_COLORS: new Proxy({}, { get: () => '#1c1e21' }),
    },
    backgroundVideoUpload: uploader,
    videoCompressor: {
      validateVideoFile: () => ({ valid: true }),
      generateThumbnail: async () => 'data:image/jpeg;base64,AAAA',
      generateFrames: async () => [],
      compressVideo: async () => ({ compressed: false }),
    },
    thumbnailUploader: { uploadThumbnail: async () => 'https://cdn.smarter.poker.test/river.jpg' },
  };
}

const POST_TEXT = 'Flopped a set on the river';
const POST_CARDS = 'Hand [[sp-card:As]][[sp-card:Ad]] | Board [[sp-card:Ah]][[sp-card:Kc]][[sp-card:2d]]';

async function renderComposer(t, { storage = {}, uploadActive = false, postResult = true } = {}) {
  const browser = installBrowser(t, { unrefTimers: true });
  for (const [key, value] of Object.entries(storage)) browser.localStorage.setItem(key, value);
  const uploader = fakeUploader();
  uploader.isActive = uploadActive;
  const posts = [];
  const { SharedPostCreator } = loadComponent('src/components/social/SharedPostCreator.jsx', composerStubs(uploader));
  const container = await mount(browser, React.createElement(SharedPostCreator, {
    user: { id: 'player-1', name: 'River Rat' },
    onPost: async (...args) => { posts.push(args); return postResult; },
    isPosting: false,
    onGoLive: noop,
    context: 'social-media',
  }));
  const textBox = () => browser.document.querySelectorAll('input')
    .find((input) => (input.getAttribute('placeholder') || '').startsWith("What's on your mind"));
  return { browser, document: browser.document, container, uploader, posts, textBox };
}

// Stages a video through the real file input and presses Post, then waits for
// the upload to be handed to the (fake) background uploader.
async function postVideo(composer) {
  const { document, uploader } = composer;
  const fileInput = document.querySelector('input[type="file"]');
  fileInput.files = [new File(['not really a video'], 'river.mp4', { type: 'video/mp4' })];
  await fire(fileInput, 'change');
  await wait(20);
  await click(byText(document, 'Post'));
  for (let i = 0; i < 100 && !uploader.listener; i++) await wait(5);
  assert.ok(uploader.listener, 'the video never reached the background uploader');
  return uploader.listener;
}

test('the composer card controls are 44 by 44 targets', async (t) => {
  const { document } = await renderComposer(t, { storage: { 'sp-post-card-draft': POST_CARDS } });
  for (const control of [byText(document, 'Poker Cards'), byText(document, 'Edit'), byLabel(document, 'Remove Poker Cards')]) {
    const width = parseFloat(control.style.minWidth) || 0;
    const height = parseFloat(control.style.minHeight) || 0;
    assert.ok(width >= 44 && height >= 44, `${control.getAttribute('aria-label') || control.textContent} is ${width} by ${height}`);
  }
});

test('the composer names its card controls for what they change', async (t) => {
  const { document } = await renderComposer(t, { storage: { 'sp-post-card-draft': POST_CARDS } });
  assert.equal(byText(document, 'Edit').getAttribute('aria-label'), 'Edit Poker Cards');
  assert.ok(cardsShown(document));
});

test('a video post that moves to the background keeps its text and cards, and a failed upload gives them back', async (t) => {
  const composer = await renderComposer(t, { storage: { 'sp-post-draft': POST_TEXT, 'sp-post-card-draft': POST_CARDS } });
  const { document, uploader, posts, textBox, browser } = composer;
  assert.equal(textBox().value, POST_TEXT);
  assert.ok(cardsShown(document), 'the card draft was not restored');

  const upload = await postVideo(composer);
  assert.equal(uploader.started[0].content, `${POST_TEXT}\n${POST_CARDS}`);
  await React.act(async () => { upload.onBackground({}); });

  // The composer is free for the next post while the ghost card shows progress...
  assert.equal(textBox().value, '');
  assert.ok(!cardsShown(document));
  // ...but the post does not exist yet, so its text and cards are still saved.
  assert.deepEqual(JSON.parse(browser.localStorage.getItem('sp-post-pending-draft')), {
    content: POST_TEXT,
    pokerCardsMarkup: POST_CARDS,
  });

  uploader.isActive = false;
  await React.act(async () => {
    upload.onError({ error: new Error('Network error during upload') });
    await sleep(10);
  });
  assert.deepEqual(posts, [], 'a post was created from a failed upload');
  assert.equal(textBox().value, POST_TEXT, 'the text was not given back');
  assert.ok(cardsShown(document), 'the cards were not given back');
  assert.equal(browser.localStorage.getItem('sp-post-draft'), POST_TEXT);
  assert.equal(browser.localStorage.getItem('sp-post-card-draft'), POST_CARDS);
  assert.equal(browser.localStorage.getItem('sp-post-pending-draft'), null);
});

test('a background post whose upload finished but whose post failed gives its drafts back too', async (t) => {
  const composer = await renderComposer(t, {
    storage: { 'sp-post-draft': POST_TEXT, 'sp-post-card-draft': POST_CARDS },
    postResult: false,
  });
  const upload = await postVideo(composer);
  await React.act(async () => { upload.onBackground({}); });
  assert.equal(composer.textBox().value, '');
  composer.uploader.isActive = false;
  await React.act(async () => {
    upload.onComplete({ publicUrl: 'https://cdn.smarter.poker.test/river.mp4' });
    await sleep(20);
  });
  assert.equal(composer.posts.length, 1, 'onPost was not asked to create the post');
  assert.equal(composer.textBox().value, POST_TEXT);
  assert.ok(cardsShown(composer.document));
  assert.equal(composer.browser.localStorage.getItem('sp-post-card-draft'), POST_CARDS);
});

test('a background post that is created clears every draft it left behind', async (t) => {
  const composer = await renderComposer(t, { storage: { 'sp-post-draft': POST_TEXT, 'sp-post-card-draft': POST_CARDS } });
  const upload = await postVideo(composer);
  await React.act(async () => { upload.onBackground({}); });
  composer.uploader.isActive = false;
  await React.act(async () => {
    upload.onComplete({ publicUrl: 'https://cdn.smarter.poker.test/river.mp4' });
    await sleep(20);
  });
  assert.equal(composer.posts.length, 1);
  const [content, urls, type] = composer.posts[0];
  assert.equal(content, `${POST_TEXT}\n${POST_CARDS}`);
  assert.deepEqual(urls, ['https://cdn.smarter.poker.test/river.mp4']);
  assert.equal(type, 'video');
  assert.equal(composer.textBox().value, '');
  for (const key of ['sp-post-draft', 'sp-post-card-draft', 'sp-post-pending-draft']) {
    assert.equal(composer.browser.localStorage.getItem(key), null, `${key} survived a created post`);
  }
});

test('a page reloaded mid-upload offers the unfinished post again, but not while it is still uploading', async (t) => {
  const pending = JSON.stringify({ content: POST_TEXT, pokerCardsMarkup: POST_CARDS });

  await t.test('after a reload the upload is gone, so the post comes back', async (t) => {
    const composer = await renderComposer(t, { storage: { 'sp-post-pending-draft': pending } });
    assert.equal(composer.textBox().value, POST_TEXT);
    assert.ok(cardsShown(composer.document));
    assert.equal(composer.browser.localStorage.getItem('sp-post-draft'), POST_TEXT);
    assert.equal(composer.browser.localStorage.getItem('sp-post-pending-draft'), null);
  });

  await t.test('while the upload runs the post is not offered twice', async (t) => {
    const composer = await renderComposer(t, { storage: { 'sp-post-pending-draft': pending }, uploadActive: true });
    assert.equal(composer.textBox().value, '');
    assert.ok(!cardsShown(composer.document));
    assert.equal(composer.browser.localStorage.getItem('sp-post-pending-draft'), pending);
  });
});

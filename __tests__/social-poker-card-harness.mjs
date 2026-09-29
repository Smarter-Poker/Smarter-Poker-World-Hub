/**
 * Harness for __tests__/social-poker-card-picker.test.mjs.
 *
 * Every poker-card defect found on 2026-09-21 was a RENDERING gap: a surface
 * that printed post text without PokerCardText showed "[[sp-card:As]]" where
 * the Ace of spades belonged. A regex over the source can only say that a
 * file mentions PokerCardText; it cannot say that the comment list, the share
 * link or the search snippet actually goes through it. So this loads the real
 * source file, compiles its JSX with the TypeScript transpiler the repo
 * already depends on, and gives a test two ways in:
 *
 *   render(element)    react-dom/server markup, to look for card images
 *   elements(element)  the element tree, to find a button and press it
 *
 * Only the card code is real (pokerCardMarkup, PokerCardText, HashtagRenderer)
 * plus two pure helpers. Every other import is an inert stub, so a 4,000 line
 * page renders without a browser, a network or a database. The component under
 * test is called directly with stand-in hooks: state starts from the values a
 * test names (`state: { showComments: true }`) and effects never run. fetch and
 * window are handed to the module as parameters rather than patched onto the
 * global object, because this file runs inside the shared CHECK 8 process
 * (it is imported by _test-guards-exist.test.mjs) and must leave nothing
 * behind for the suites that run after it.
 */
import { readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const requireFromRoot = createRequire(join(ROOT, 'package.json'));
export const React = requireFromRoot('react');
const jsxRuntime = requireFromRoot('react/jsx-runtime');
const { renderToStaticMarkup } = requireFromRoot('react-dom/server');
const ts = requireFromRoot('typescript');

const REAL_MODULES = new Set([
  'src/lib/pokerCardMarkup.js',
  'src/components/social/PokerCardText.jsx',
  'src/components/social/HashtagRenderer.jsx',
  'src/lib/socialHelpers.js',
  'src/lib/keyboardActivate.js',
]);
const EXTENSIONS = ['', '.js', '.jsx', '.ts', '.tsx', '/index.js', '/index.jsx', '/index.ts', '/index.tsx'];
const INJECTED_GLOBALS = ['fetch', 'window', 'document', 'navigator', 'localStorage', 'sessionStorage'];

// An inert stand-in for anything that is not card code: callable, readable to
// any depth, iterable as empty, and a string of nothing when printed.
const STUBS = new WeakSet();
function stub(isModule = false) {
  const value = new Proxy(function stubbed() {}, {
    get(target, key) {
      if (key === '__esModule') return isModule;
      if (key === 'then' || key === '$$typeof') return undefined;
      if (key === Symbol.toPrimitive) return () => '';
      if (key === Symbol.iterator) return function* nothing() {};
      if (key === 'prototype' || key === 'name' || key === 'length') return target[key];
      return stub();
    },
    apply: () => stub(),
    construct: () => stub(),
  });
  STUBS.add(value);
  return value;
}

/** An inert value for a test's own partial fakes (a store, a context). */
export const inert = () => stub();

// A stub used as a component renders nothing, and a stub passed as a prop or
// a child is dropped, so React never meets one.
const Inert = () => null;
const elementType = (type) => (STUBS.has(type) ? Inert : type);
const cleanChildren = (children) => (Array.isArray(children)
  ? children.map(cleanChildren)
  : (STUBS.has(children) ? null : children));
function cleanProps(props) {
  if (!props) return props;
  const next = {};
  for (const key of Object.keys(props)) {
    next[key] = key === 'children'
      ? cleanChildren(props.children)
      : (STUBS.has(props[key]) ? undefined : props[key]);
  }
  return next;
}
const runtime = {
  Fragment: jsxRuntime.Fragment,
  jsx: (type, props, key) => jsxRuntime.jsx(elementType(type), cleanProps(props), key),
  jsxs: (type, props, key) => jsxRuntime.jsxs(elementType(type), cleanProps(props), key),
};
const createElement = (type, props, ...children) =>
  React.createElement(elementType(type), cleanProps(props), ...children.map(cleanChildren));

function standInHooks(namedState) {
  const nothing = () => {};
  return {
    useState: (initial) => namedState(null, initial),
    useReducer: (reducer, initial, init) => [init ? init(initial) : initial, nothing],
    useEffect: nothing,
    useLayoutEffect: nothing,
    useInsertionEffect: nothing,
    useImperativeHandle: nothing,
    useDebugValue: nothing,
    useRef: (current) => ({ current }),
    useCallback: (callback) => callback,
    useMemo: (factory) => factory(),
    useContext: (context) => context?._currentValue,
    useId: () => 'harness-id',
    useTransition: () => [false, (callback) => callback()],
    useDeferredValue: (value) => value,
    useSyncExternalStore: (subscribe, snapshot, serverSnapshot) => (serverSnapshot || snapshot)(),
    memo: (component) => component,
  };
}

function stateStore(initialValues) {
  const values = new Map(Object.entries(initialValues));
  const namedState = (name, initial) => {
    const start = () => (typeof initial === 'function' ? initial() : initial);
    if (name === null) return [start(), () => {}];
    if (!values.has(name)) values.set(name, start());
    const set = (next) => values.set(name, typeof next === 'function' ? next(values.get(name)) : next);
    return [values.get(name), set];
  };
  return { values, namedState };
}

// `const [open, setOpen] = useState(false)` becomes a state slot named "open",
// which is how a test opens a comment list or a share sheet without a click.
const NAMED_STATE = /const \[(\w+),\s*(\w+)\]\s*=\s*(?:React\.)?useState\(/g;

// ES imports are hoisted and the CommonJS the transpiler emits is not: the
// feed page calls dynamic() above its own `import dynamic`. So every import
// declaration moves to the top first, blanked where it stood.
function hoistImports(source, fileName) {
  const parsed = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, false, ts.ScriptKind.JSX);
  const imports = parsed.statements.filter((statement) => ts.isImportDeclaration(statement));
  let body = source;
  for (const statement of [...imports].reverse()) {
    const start = statement.getStart(parsed);
    body = body.slice(0, start) + body.slice(start, statement.end).replace(/[^\n]/g, ' ') + body.slice(statement.end);
  }
  return `${imports.map((statement) => statement.getText(parsed)).join('\n')}\n${body}`;
}

const compiled = new Map();
function compile(file, standIn, expose) {
  const key = `${standIn}|${file}|${expose.join(',')}`;
  if (!compiled.has(key)) {
    let source = hoistImports(readFileSync(join(ROOT, file), 'utf8'), file);
    if (standIn) {
      source = source.replace(NAMED_STATE, (match, value, setter) =>
        `const [${value}, ${setter}] = __namedState('${value}', `);
      if (expose.length) source += `\n;exports.__exposed = { ${expose.join(', ')} };\n`;
    }
    compiled.set(key, ts.transpileModule(source, {
      fileName: file.replace(/\.js$/, '.jsx'),
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText);
  }
  return compiled.get(key);
}

const isFile = (candidate) => {
  try { return statSync(join(ROOT, candidate)).isFile(); } catch { return false; }
};
function resolveFrom(from, specifier) {
  const base = posix.normalize(posix.join(posix.dirname(from), specifier));
  for (const extension of EXTENSIONS) {
    if (isFile(`${base}${extension}`)) return `${base}${extension}`;
  }
  return null;
}

/**
 * Load a World Hub source file for a test.
 *
 *   file     repo-relative path, e.g. 'pages/club/[id].js'
 *   state    starting values for named useState slots
 *   mocks    module replacements, keyed by bare specifier or resolved repo path
 *   expose   module-level names to hand back (inner components, helpers)
 *   globals  values for fetch / window / document / navigator / storage
 *
 * Returns { module, exposed, state, fetchCalls }.
 */
export function loadSurface(file, { state = {}, mocks = {}, expose = [], globals = {} } = {}) {
  const store = stateStore(state);
  const fetchCalls = [];
  const injected = {
    fetch: async (url, init = {}) => {
      let body = init.body ?? null;
      try { body = JSON.parse(body); } catch { /* not JSON: keep it as sent */ }
      fetchCalls.push({ url, init, body });
      return { ok: true, status: 200, json: async () => ({ success: true, data: {} }) };
    },
    ...globals,
  };
  const reactFor = (standIn) => ({ ...React, createElement, ...(standIn ? standInHooks(store.namedState) : {}) });
  const realReact = reactFor(false);
  const standInReact = reactFor(true);
  const realModules = new Map();

  function evaluate(target, standIn) {
    const code = compile(target, standIn, standIn ? expose : []);
    const module = { exports: {} };
    const requireHere = (specifier) => {
      if (specifier === 'react') return standIn ? standInReact : realReact;
      if (specifier === 'react/jsx-runtime' || specifier === 'react/jsx-dev-runtime') return runtime;
      if (Object.hasOwn(mocks, specifier)) return mocks[specifier];
      if (!specifier.startsWith('.')) return stub(true);
      const resolved = resolveFrom(target, specifier);
      if (resolved && Object.hasOwn(mocks, resolved)) return mocks[resolved];
      if (resolved && REAL_MODULES.has(resolved)) {
        if (!realModules.has(resolved)) realModules.set(resolved, evaluate(resolved, false));
        return realModules.get(resolved);
      }
      return stub(true);
    };
    const run = new Function('require', 'module', 'exports', '__namedState', ...INJECTED_GLOBALS, code);
    run(requireHere, module, module.exports, store.namedState, ...INJECTED_GLOBALS.map((name) => injected[name]));
    return module.exports;
  }

  const module = evaluate(file, true);
  return { module, exposed: module.__exposed || {}, state: store.values, fetchCalls };
}

export const render = (element) => renderToStaticMarkup(element);

export function elements(node, found = []) {
  if (Array.isArray(node)) {
    for (const child of node) elements(child, found);
    return found;
  }
  if (!React.isValidElement(node)) return found;
  found.push(node);
  elements(node.props?.children, found);
  return found;
}

export function textOf(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (React.isValidElement(node)) return textOf(node.props?.children);
  return '';
}

const CARD_IMAGE = /<img [^>]*src="\/hub\/club-arena\/cards\/2color\/(hearts|diamonds|clubs|spades)_([2-9]|10|j|q|k|a)\.webp"/g;
/** The Club Arena card images in a piece of markup, as ['spades_a', ...]. */
export const cardImages = (html) => [...html.matchAll(CARD_IMAGE)].map((match) => `${match[1]}_${match[2]}`);

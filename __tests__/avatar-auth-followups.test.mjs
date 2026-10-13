import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const React = require('react');
const { act, create } = require('react-test-renderer');
const ts = require('typescript');
const compile = source => ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, allowJs: true } }).outputText;
const source = readFileSync(process.env.AVATAR_SOURCE_FILE || new URL('../src/contexts/AvatarContext.jsx', import.meta.url), 'utf8');
const deadlineSource = readFileSync(new URL('../src/lib/server/fetchJsonWithDeadline.js', import.meta.url), 'utf8');
const A = { id: 'user-a', user_metadata: {} }, B = { id: 'user-b', user_metadata: {} };
function harness(automaticPlayerWrites = true) {
  const requests = [], proofs = [], warnings = [], timers = new Map(), listeners = new Map();
  let callback, value, realtime, disposed = false;
  const store = new Map();
  const timer = (fn, delay) => { const id = {}; timers.set(id, { fn, delay }); return id; };
  const clear = id => timers.delete(id);
  const fetcher = (url, options = {}) => new Promise((resolve, reject) => requests.push({ url, options, resolve, reject }));
  const bounded = { exports: {} };
  new Function('module', 'exports', 'fetch', 'setTimeout', 'clearTimeout', compile(deadlineSource))(bounded, bounded.exports, fetcher, timer, clear);
  let refreshResolve;
  const auth = { onAuthStateChange: fn => { callback = fn; return { data: { subscription: { unsubscribe() { disposed = true; } } } }; }, refreshSession: () => new Promise(resolve => { refreshResolve = resolve; }) };
  const imports = name => {
    if (name === 'react') return React;
    if (name === 'react/jsx-runtime') return require(name);
    if (name.endsWith('/supabase')) return { default: { auth } };
    if (name.endsWith('/avatar-service')) return { getUserAvatar: async () => ({ imageUrl: '/local-test.webp' }) };
    if (name.endsWith('/authUtils')) return { getAuthUser: () => null };
    if (name.endsWith('/broadcastSync')) return { listenBroadcast: () => () => {}, broadcastSync() {} };
    if (name.endsWith('/EventBus')) return { busEmit: { diamondsEarned() {} } };
    if (name.endsWith('/useProfileRealtime')) return { useProfileRealtime: (id, handlers) => { realtime = handlers; } };
    if (name.endsWith('/vipCache')) return { writeVipProof: (id, vip) => proofs.push({ id, vip }), readVipProof: () => false, clearVipProof: () => proofs.push({ cleared: true }) };
    if (name.endsWith('/headerStats')) return { invalidateHeaderStats() {} };
    if (name.endsWith('/fetchJsonWithDeadline')) return bounded.exports;
    throw new Error(`Unexpected import: ${name}`);
  };
  const module = { exports: {} };
  const win = { addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name), dispatchEvent() {} };
  const storage = { getItem: key => store.get(key) || null, setItem: (key, v) => store.set(key, v), removeItem: key => store.delete(key) };
  new Function('require', 'module', 'exports', 'fetch', 'setTimeout', 'clearTimeout', 'window', 'localStorage', 'CustomEvent', 'console', compile(source))(imports, module, module.exports, fetcher, timer, clear, win, storage, class { constructor(type, detail) { this.type = type; this.detail = detail; } }, { ...console, warn: (...args) => warnings.push(args) });
  function Consumer() { value = module.exports.useAvatar(); return null; }
  let view;
  act(() => { view = create(React.createElement(module.exports.AvatarProvider, { automaticPlayerWrites }, React.createElement(Consumer))); });
  return {
    requests, proofs, warnings, timers, get callback() { return callback; }, get value() { return value; },
    async event(event, user) { let returned; await act(async () => { returned = callback(event, user ? { user, access_token: 'synthetic-local-token' } : null); }); return { returned }; },
    async reply(index, data, ok = true) { await act(async () => requests[index].resolve({ ok, json: async () => data })); },
    async headers(index, json) { await act(async () => requests[index].resolve({ ok: true, json })); },
    async deadline() { await act(async () => { for (const [id, row] of [...timers]) if (row.delay === 5000) { timers.delete(id); row.fn(); } }); },
    async vip(vip, sourceId = value.user?.id) { await act(async () => realtime.onVipUpdate(vip, sourceId)); },
    async refreshReply(user) { await act(async () => refreshResolve({ data: { user } })); },
    close() { if (!disposed) act(() => view.unmount()); },
  };
}
const index = (h, part, start = 0) => h.requests.findIndex((r, i) => i >= start && r.url.includes(part));
test('SIGNED_IN and TOKEN_REFRESHED never return an HTTP promise to the shared auth lock', async () => {
  const h = harness();
  try {
    assert.equal((await h.event('SIGNED_IN', A)).returned, undefined);
    assert.equal(h.requests.length, 2);
    assert.equal((await h.event('TOKEN_REFRESHED', A)).returned, undefined);
    assert.equal(h.requests.length, 3);
  } finally { h.close(); }
});
test('VIP and profile deadlines remain active after headers and abort stalled bodies', async () => {
  const h = harness();
  try {
    await h.event('INITIAL_SESSION', A);
    for (let i = 0; i < 2; i++) await h.headers(i, () => new Promise(() => {}));
    await h.deadline();
    assert.ok(h.requests.every(r => r.options.signal.aborted));
    assert.equal(h.value.vipResolved, true);
    assert.equal(h.value.isVip, false);
    assert.equal(h.value.showWelcomeModal, false);
    assert.equal(h.warnings.filter(args => args[0] === 'Error fetching VIP status:').length, 0);
  } finally { h.close(); }
});
test('sign-out rejects late VIP and welcome responses', async () => {
  const h = harness();
  try {
    await h.event('INITIAL_SESSION', A);
    await h.event('SIGNED_OUT', null);
    await h.reply(index(h, 'check-status'), { isVip: true });
    await h.reply(index(h, 'ensure-profile'), { created: true, welcomePackage: { granted: true } });
    assert.equal(h.value.user, null);
    assert.equal(h.value.isVip, false);
    assert.equal(h.value.showWelcomeModal, false);
    assert.deepEqual(h.proofs, [{ cleared: true }]);
  } finally { h.close(); }
});
test('A to B to A rejects responses from the earlier A identity generation', async () => {
  const h = harness(false);
  try {
    await h.event('INITIAL_SESSION', A);
    await h.event('TOKEN_REFRESHED', B);
    await h.event('TOKEN_REFRESHED', A);
    await h.reply(2, { isVip: false });
    await h.reply(0, { isVip: true });
    assert.equal(h.value.isVip, false);
    assert.deepEqual(h.proofs, [{ id: A.id, vip: false }]);
  } finally { h.close(); }
});
test('latest VIP request and authoritative realtime revocation defeat earlier HTTP answers', async () => {
  const h = harness(false);
  try {
    await h.event('INITIAL_SESSION', A);
    await h.event('TOKEN_REFRESHED', A);
    await h.reply(1, { isVip: true });
    await h.reply(0, { isVip: false });
    assert.equal(h.value.isVip, true);
    const start = h.requests.length;
    await h.event('TOKEN_REFRESHED', A);
    await h.vip(false);
    await h.reply(start, { isVip: true });
    assert.equal(h.value.isVip, false);
  } finally { h.close(); }
});
test('unmount prevents pending VIP response writing a verified cache', async () => {
  const h = harness(false);
  await h.event('INITIAL_SESSION', A);
  h.close();
  await h.reply(0, { isVip: true });
  assert.deepEqual(h.proofs, []);
});
test('explicit refresh completion cannot cross A to B to A identity generations', async () => {
  const h = harness(false);
  try {
    await h.event('INITIAL_SESSION', A);
    const pending = h.value.refreshUser();
    await h.event('TOKEN_REFRESHED', B);
    await h.event('TOKEN_REFRESHED', A);
    const count = h.requests.length;
    await h.refreshReply({ ...A, user_metadata: { stale: true } });
    assert.equal(h.requests.length, count);
    await pending;
    assert.equal(h.value.user.user_metadata.stale, undefined);
  } finally { h.close(); }
});
test('bounded profile initialization preserves POST payload and earned welcome behavior', async () => {
  const h = harness();
  try {
    await h.event('INITIAL_SESSION', A);
    const request = h.requests[index(h, 'ensure-profile')];
    assert.equal(request.options.method, 'POST');
    assert.equal(JSON.parse(request.options.body).user_id, A.id);
    await h.reply(index(h, 'ensure-profile'), { created: true, welcomePackage: { granted: true } });
    assert.equal(h.value.showWelcomeModal, true);
    await h.reply(index(h, 'check-status'), { isVip: false });
    assert.deepEqual(h.proofs, [{ id: A.id, vip: false }]);
  } finally { h.close(); }
});


test('old profile channel owner cannot apply VIP to the newly signed-in user', async () => {
  const h = harness(false);
  try {
    await h.event('INITIAL_SESSION', A);
    await h.event('TOKEN_REFRESHED', B);
    await h.vip(true, A.id);
    assert.equal(h.value.isVip, false);
    assert.deepEqual(h.proofs, []);
    await h.vip(true, B.id);
    assert.deepEqual(h.proofs, [{ id: B.id, vip: true }]);
  } finally { h.close(); }
});

test('actual shared profile hook preserves channel ownership through latest callback refs', async () => {
  const refs = [], effects = [], delivered = [];
  let cursor = 0, payloadCallback;
  const hooks = { useRef(initial) { const i = cursor++; return refs[i] ||= { current: initial }; }, useEffect(fn) { effects.push(fn); } };
  const channel = { on(kind, filter, fn) { payloadCallback = fn; return this; }, subscribe() { return this; } };
  const module = { exports: {} };
  const imports = name => name === 'react' ? hooks : name.endsWith('/supabase') ? { supabase: { channel: () => channel, removeChannel() {} } } : { readOwnProfile: async () => ({}) };
  const text = readFileSync(new URL('../src/hooks/useProfileRealtime.js', import.meta.url), 'utf8');
  new Function('require', 'module', 'exports', 'window', compile(text))(imports, module, module.exports, {});
  module.exports.useProfileRealtime(A.id, { onVipUpdate: (...args) => delivered.push(['A', ...args]) });
  const cleanup = effects[0]();
  cursor = 0;
  module.exports.useProfileRealtime(B.id, { onVipUpdate: (...args) => delivered.push(['B', ...args]) });
  // The new render updates refs before the old effect cleanup can run.
  await payloadCallback({ new: { diamonds: 1, is_vip: true } });
  assert.deepEqual(delivered, [['B', true, A.id]]);
  cleanup();
});


test('actual auth SDK releases the shared session lock with provider HTTP bodies still pending', async () => {
  const { GoTrueClient } = require('@supabase/auth-js');
  const h = harness();
  const key = 'isolated-avatar-auth-lock-fixture';
  const session = { user: A, access_token: 'local-fixture-only', refresh_token: 'local-fixture-only',
    expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: 'bearer' };
  const values = new Map([[key, JSON.stringify(session)]]);
  const storage = { getItem: k => values.get(k) || null, setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k) };
  let tail = Promise.resolve();
  const lock = async (_name, _timeout, fn) => {
    const prior = tail;
    let release;
    tail = new Promise(resolve => { release = resolve; });
    await prior;
    try { return await fn(); } finally { release(); }
  };
  const options = { url: 'https://fixture.invalid/auth/v1', storage, storageKey: key, lock,
    persistSession: true, autoRefreshToken: false, detectSessionInUrl: false,
    fetch: () => { throw new Error('No fixture network calls permitted'); } };
  const hub = new GoTrueClient(options);
  const listener = hub.onAuthStateChange(h.callback).data.subscription;
  try {
    await act(async () => { await hub.initialize(); });
    assert.ok(h.requests.some(r => r.url.includes('ensure-profile')));
    assert.ok(h.requests.some(r => r.url.includes('check-status')));
    const arena = new GoTrueClient(options);
    let completed = false;
    const read = arena.getSession().then(result => { completed = true; assert.equal(result.data.session.user.id, A.id); });
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(completed, true, 'session reader must progress without resolving any profile/VIP HTTP request');
    await read;
  } finally { listener.unsubscribe(); h.close(); }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../pages/_app.js', import.meta.url), 'utf8');
const avatar = readFileSync(new URL('../src/contexts/AvatarContext.jsx', import.meta.url), 'utf8');

test('staff navigation excludes automatic reward and install writes while retaining providers', () => {
  assert.match(app, /const automaticPlayerWrites = path !== '\/horses' && !path\.startsWith\('\/horses\/'\)/);
  assert.match(app, /<AvatarProvider automaticPlayerWrites=\{automaticPlayerWrites\}>/);
  for (const component of ['EasterEggWatcher', 'PWAInstallPrompt', 'GlobalNotificationPrompt']) {
    assert.ok(app.includes(`{automaticPlayerWrites && <${component} />}`));
  }
  assert.match(app, /<UnreadProvider>/);
  assert.match(app, /<ServiceWorkerUpdater \/>/);
});

test('profile initialization is guarded but session and VIP reads resume across route transitions', () => {
  assert.match(avatar, /AvatarProvider\(\{ children, automaticPlayerWrites = true \}\)/);
  const ensure = avatar.slice(avatar.indexOf('async function ensureUserProfile'), avatar.indexOf('// Listen for auth changes'));
  assert.match(avatar, /playerWritesAllowedRef\.current = automaticPlayerWrites/);
  assert.match(ensure, /if \(!playerWritesAllowedRef\.current\) return;/);
  assert.ok(ensure.indexOf('if (!automaticPlayerWrites || !user) return;') < ensure.indexOf("fetch('/api/auth/ensure-profile'"));
  const subscription = avatar.slice(avatar.indexOf('// Listen for auth changes'), avatar.indexOf('// HARDENED: Listen for vip-status-changed'));
  assert.match(subscription, /setUser\(session\.user\)/);
  assert.match(subscription, /fetchVipStatus\(session\.user\.id\)/);
  assert.match(subscription, /subscription\.unsubscribe\(\)/);
  assert.match(subscription, /\}, \[automaticPlayerWrites\]\)/);
});


test('actual auth subscription suppresses initialization on staff routes and resumes after departure', async () => {
  const effectStart = avatar.indexOf('        async function ensureUserProfile');
  const effectEnd = avatar.indexOf('    }, [automaticPlayerWrites]);', effectStart);
  const effect = avatar.slice(effectStart, effectEnd);
  const vipStart = avatar.indexOf('    async function fetchVipStatus');
  const vipEnd = avatar.indexOf('    // Refresh user session', vipStart);
  const vip = avatar.slice(vipStart, vipEnd);
  const noop = () => {};
  const requests = [];
  const callbacks = [];
  const ref = { current: false };
  let unsubscribed = 0;
  const globals = {
    playerWritesAllowedRef: ref,
    fetch: async (url, options = {}) => {
      requests.push({ url, method: options.method || 'GET' });
      return { ok: true, json: async () => url.startsWith('/api/vip/') ? { isVip: false } : { created: false } };
    },
    supabase: { auth: { onAuthStateChange: (callback) => {
      callbacks.push(callback);
      return { data: { subscription: { unsubscribe: () => unsubscribed++ } } };
    } } },
    localStorage: { getItem: () => null },
    getAuthUser: () => null,
    setUser: noop, setIsVip: noop, setVipResolved: noop, setInitializing: noop,
    setShowWelcomeModal: noop, writeVipProof: noop, readVipProof: noop,
    clearVipProof: noop, invalidateHeaderStats: noop,
    busEmit: { diamondsEarned: noop },
  };
  const mount = new Function(...Object.keys(globals), 'automaticPlayerWrites', vip + effect);
  const session = { access_token: 'synthetic-token', user: { id: 'test-user', user_metadata: {} } };
  const routePolicy = app.match(/const automaticPlayerWrites = (.*);/)[1];
  const allowed = new Function('path', `return ${routePolicy}`);
  for (const rawPath of ['/horses', '/horses/', '/horses?tab=floor', '/horses#floor', '/horses/?tab=floor#x']) {
    const path = rawPath.split(/[?#]/, 1)[0];
    assert.equal(allowed(path), false);
    ref.current = allowed(path);
    const cleanup = mount(...Object.values(globals), ref.current);
    await callbacks.at(-1)('INITIAL_SESSION', session);
    await new Promise(resolve => setImmediate(resolve));
    cleanup();
  }
  assert.equal(requests.filter(row => row.method === 'POST').length, 0);
  assert.equal(requests.filter(row => row.url.startsWith('/api/vip/') && row.method === 'GET').length, 5);
  assert.equal(unsubscribed, 5);
  ref.current = allowed('/hub');
  assert.equal(ref.current, true);
  const cleanup = mount(...Object.values(globals), ref.current);
  await callbacks.at(-1)('INITIAL_SESSION', session);
  await new Promise(resolve => setImmediate(resolve));
  cleanup();
  assert.equal(requests.filter(row => row.url === '/api/auth/ensure-profile' && row.method === 'POST').length, 1);
  assert.equal(requests.filter(row => row.url.startsWith('/api/vip/') && row.method === 'GET').length, 6);
  assert.equal(allowed('/horseshoe'), true);
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
// React's act helper requires its test build, including inside Vercel's test subprocess.
// This isolated node --test process cannot change the following production build's environment.
process.env.NODE_ENV = 'test';
const require = createRequire(import.meta.url);
const React = require('react');
const renderer = require('react-test-renderer');
const ts = require('typescript');

function setup(t, outcomes, mobile = false) {
  const events = [], frames = new Map(), audios = [];
  let time = 0, frameId = 0, completed = 0;
  class Audio {
    constructor(src) { this.src = src; audios.push(this); }
    play() {
      events.push('play');
      const result = outcomes.shift();
      if (result === 'throw') throw new Error('Audio Unavailable');
      return result ? Promise.reject(Object.assign(new Error(result), { name: result })) : Promise.resolve();
    }
    pause() { events.push('pause'); }
  }
  const storage = new Map();
  const context = {
    sessionStorage: {getItem: k => storage.get(k), setItem: (k,v) => storage.set(k,v), removeItem: k => storage.delete(k)},
    console: { log() {}, warn() {} }, Audio,
    window: { innerWidth: 393, innerHeight: 852 },
    navigator: { maxTouchPoints: mobile ? 5 : 0, userActivation: { hasBeenActive: !mobile }, vibrate: pattern => { events.push(['haptic', pattern]); return true; } },
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
  const { CinematicIntro, useSignInOpening } = load('../src/world/components/CinematicIntro.tsx', { '../../audio/SoundEngine': sound });
  let tree, controls;
  function SignInFixture() { controls = useSignInOpening(); return controls.OpeningComponent; }
  t.after(async () => { await renderer.act(async () => tree?.unmount()); });
  return {
    events, frames, audios, storage,
    async mountSignIn() { await renderer.act(async () => { tree = renderer.create(React.createElement(SignInFixture)); }); },
    async begin() { let result; await renderer.act(async () => { result = controls.beginOpening(); }); return { finished: result }; },
    async cancel() { await renderer.act(async () => controls.cancelOpening()); },
    async mount() { await renderer.act(async () => { tree = renderer.create(React.createElement(CinematicIntro, { onComplete: () => completed++ })); }); },
    buttons() { return tree.root.findAllByType('button'); },
    async click(label) { await renderer.act(async () => { this.buttons().find(b => b.children.join('') === label).props.onClick(); }); },
    async frame(at) { time = at; const callbacks = [...frames.values()]; frames.clear(); await renderer.act(async () => callbacks.forEach(fn => fn(at))); },
    async unmount() { await renderer.act(async () => tree.unmount()); tree = null; },
    completed: () => completed,
  };
}

test('the existing sign-in gesture starts sound and haptics once without another control', async t => {
  const app = setup(t, [null], true);
  await app.mountSignIn();
  assert.equal(app.events.length, 0);
  const { finished } = await app.begin();
  const duplicate = await app.begin();
  assert.equal(duplicate.finished, finished);
  assert.equal(app.events[0][0], 'haptic');
  assert.equal(app.events[1], 'play');
  assert.equal(app.events.filter(e => e === 'play').length, 1);
  assert.equal(app.buttons().length, 0);
  await app.frame(820);
  await app.frame(850);
  assert.equal(app.events.filter(e => Array.isArray(e) && e[1] === 150).length, 1);
  await app.frame(4001);
  await finished;
  assert.equal(app.storage.get('signin_opening_played'), 'true');
});

test('failed authentication can cancel the opening, audio and pending navigation wait', async t => {
  const app = setup(t, [null]);
  await app.mountSignIn();
  const { finished } = await app.begin();
  await app.cancel();
  await finished;
  assert.equal(app.frames.size, 0);
  assert.equal(app.events.at(-1), 'pause');
  assert.equal(app.storage.has('signin_opening_played'), false);
});

test('an unavailable audio API cannot stop the existing sign-in action', async t => {
  const app = setup(t, ['throw']);
  await app.mountSignIn();
  const { finished } = await app.begin();
  await app.frame(4001);
  await finished;
  assert.equal(app.buttons().length, 0);
});

test('automatic fallback never introduces an opening button or traps entry on media refusal', async t => {
  const app = setup(t, ['NotAllowedError']);
  await app.mount();
  assert.equal(app.buttons().length, 0);
  assert.equal(app.frames.size, 1);
  await app.frame(4001);
  assert.equal(app.completed(), 1);
});

test('allowed automatic playback starts directly and unmount stops playback and animation', async t => {
  const app = setup(t, [null]);
  await app.mount();
  assert.equal(app.buttons().length, 0);
  assert.equal(app.frames.size, 1);
  assert.equal(app.audios[0].src, '/audio/main-intro.mp3');
  await app.unmount();
  assert.equal(app.frames.size, 0);
  assert.equal(app.events.at(-1), 'pause');
});

test('intro regression runs on the existing production build route', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
  assert.match(pkg.scripts.prebuild, /node --test __tests__\/cinematic-intro-playback\.test\.mjs/);
  assert.match(pkg.scripts['build:vercel'], /^NODE_ENV=test node --test __tests__\/cinematic-intro-playback\.test\.mjs &&/);
  assert.equal(JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url))).buildCommand, 'npm run build:vercel');
});

function loginHandler(name, context, page = 'login') {
  const source = readFileSync(new URL(`../pages/auth/${page}.js`, import.meta.url), 'utf8');
  const start = source.indexOf(`  const ${name} = async`);
  const end = source.indexOf('\n  };', start) + 5;
  return vm.runInNewContext(`(() => { ${source.slice(start,end)}; return ${name}; })()`, {
    console: {log(){},warn(){}}, isLoading: false, loading: false, oauthLoading: '',
    setIsLoading(){},setError(){},setErrorDetail(){},setOauthLoading(){},
    email:'test@example.invalid',password:'local-test-only',rememberMe:false,
    sessionStorage:{setItem(){}},localStorage:{removeItem(){}},
    identify(){},capture(){},FunnelEvents:{},getRedirectUrl:()=>'/hub',router:{},
    needsMfaChallenge:async()=>false,withPhoneWelcome:async p=>p,
    AUTH_ORIGIN_KEY:'origin',beginOAuthAttribution:()=>null,withAttributionNonce:p=>p,
    callbackUrl:()=> 'https://example.invalid/auth/callback',reportAuthError(){},
    ...context,
  });
}

test('the actual password handler starts effects before auth and keeps authenticated navigation after opening', async () => {
  const calls = []; let finish;
  const opening = new Promise(resolve => { finish = resolve; });
  const handler = loginHandler('handleLogin', {
    beginOpening:()=>{calls.push('opening');return opening;},cancelOpening:()=>calls.push('cancel'),
    supabase:{auth:{signInWithPassword:async()=>{calls.push('auth');return {data:{user:{id:'local-test'}}};}}},
    navigateWithFreshAuth:destination=>calls.push(destination),
  });
  const result=handler({preventDefault(){}});
  assert.deepEqual(calls,['opening','auth']);
  await new Promise(setImmediate);
  assert.equal(calls.includes('/hub'),false);
  finish();await result;
  assert.deepEqual(calls,['opening','auth','/hub']);
});

test('the actual OAuth handler waits for gesture opening before its existing provider handoff', async () => {
  const calls=[];let finish;
  const opening=new Promise(resolve=>{finish=resolve});
  const handler=loginHandler('handleOAuthSignIn',{
    beginOpening:()=>{calls.push('opening');return opening;},cancelOpening:()=>calls.push('cancel'),
    supabase:{auth:{signInWithOAuth:async request=>{calls.push(request);return {data:{url:'https://provider.example.invalid'}}}}},
    window:{location:{assign:url=>calls.push(url)}},
  });
  const result=handler('google');
  assert.equal(calls[0],'opening');
  assert.equal(calls[1].options.skipBrowserRedirect,true);
  assert.equal(calls[1].options.redirectTo,'https://example.invalid/auth/callback');
  finish();await result;
  assert.equal(calls.at(-1),'https://provider.example.invalid');
});

test('hub consumes a completed gesture opening instead of repeating it',()=>{
  const source=readFileSync(new URL('../src/world/WorldHub.tsx',import.meta.url),'utf8');
  assert.match(source,/getItem\('signin_opening_played'\) === 'true'[\s\S]*?removeItem\('signin_opening_played'\)[\s\S]*?return false/);
  const intro=readFileSync(new URL('../src/world/components/CinematicIntro.tsx',import.meta.url),'utf8');
  assert.doesNotMatch(intro,/Start Opening|Skip Opening|Retry Opening/);
});

test('provider sign-in from signup uses the same gesture opening and unchanged callback', async () => {
  const calls=[];
  const handler=loginHandler('handleOAuthSignIn',{
    beginOpening:()=>{calls.push('opening');return Promise.resolve();},cancelOpening:()=>{},
    supabase:{auth:{signInWithOAuth:async request=>{calls.push(request);return {data:{url:'https://provider.example.invalid'}}}}},
    window:{location:{origin:'https://example.invalid',assign:url=>calls.push(url)}},
  },'signup');
  await handler('facebook');
  assert.equal(calls[0],'opening');
  assert.equal(calls[1].options.skipBrowserRedirect,true);
  assert.equal(calls[1].options.scopes,'email,public_profile');
  assert.equal(calls[1].options.redirectTo,'https://example.invalid/auth/callback');
  assert.equal(calls.at(-1),'https://provider.example.invalid');
});

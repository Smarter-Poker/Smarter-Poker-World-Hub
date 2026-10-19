/**
 * SIGNUP HARDENING — STATIC GUARD TESTS
 * ─────────────────────────────────────────────────────────────────────────
 * Catches regressions in the 2026-05-03 signup-failure investigation.
 * Run via the same `node --test` invocation in build-safety-gate.yml.
 *
 *   1. /auth/* and /api/auth/* MUST be reachable from every region:
 *      either present in geo-blocks.json allow_paths OR in middleware.ts
 *      AUTH_ALWAYS_ALLOW. Both is best.
 *   2. /api/health/signup must exist and query signup_health_view.
 *   3. /api/cron/signup-probe must exist and exercise full signup flow.
 *   4. login.js handleSignup must call validatePassword OR redirect to
 *      /auth/signup OR be removed entirely.
 *   5. signup.js handleOAuthSignIn must address www→apex PKCE-verifier
 *      scope, or comment why not.
 *
 * If any check fails, signup is at risk of regressing into the
 * silent-failure mode that bricked it from 2026-04-24 to 2026-05-03.
 */
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const REPO_ROOT = path.resolve(new URL('.', import.meta.url).pathname, '..');
const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

test('geo-block JSON OR middleware.ts allow /auth/ and /api/auth/', () => {
    const json = JSON.parse(read('config/geo-blocks.json'));
    const mw = read('middleware.ts');
    const inJson = (p) => (json.allow_paths || []).some((a) => a === p || a.startsWith(p));
    const inMw = (p) => mw.includes(`'${p}'`) || mw.includes(`"${p}"`);
    for (const p of ['/auth/', '/api/auth/']) {
        assert.ok(
            inJson(p) || inMw(p),
            `${p} is missing from BOTH geo-blocks.json allow_paths AND middleware.ts AUTH_ALWAYS_ALLOW. ` +
            `Users in restricted regions will be redirected to /jurisdiction-blocked before they can sign up.`,
        );
    }
});

test('/api/health/signup endpoint exists and is non-trivial', () => {
    const p = path.join(REPO_ROOT, 'pages/api/health/signup.js');
    assert.ok(fs.existsSync(p), '/api/health/signup is missing — the probe has nothing to talk to.');
    assert.ok(fs.statSync(p).size > 500, '/api/health/signup is suspiciously small — likely truncated.');
    const src = fs.readFileSync(p, 'utf8');
    assert.match(src, /signup_health_view/, 'health endpoint must query signup_health_view');
});

test('/api/cron/signup-probe verifies the downstream chain without creating users', () => {
    const p = path.join(REPO_ROOT, 'pages/api/cron/signup-probe.js');
    assert.ok(fs.existsSync(p), '/api/cron/signup-probe is missing — the synthetic probe is the early-warning system.');
    const src = fs.readFileSync(p, 'utf8');

    // Strip comments before any negative assertion: this file documents the
    // behaviour it deliberately removed ("The previous version called
    // admin.auth.admin.createUser() on every invocation"), and a naive
    // doesNotMatch would fail on the very comment explaining why it is correct.
    // The (^|[^:]) guard keeps `https://` in string literals intact, and
    // stripping only from `//` onward (rather than the whole line) preserves
    // code that has a trailing comment.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

    // This test previously required signUp + deleteUser, matching the probe's
    // original design: sign up a throwaway user each run, then delete it. That
    // was removed on 2026-05-18 — every signUp bills as a Supabase Monthly
    // Active User, and on a cron this probe alone manufactured ~2,880 synthetic
    // MAU/month. It now inspects a PERMANENT probe account instead.
    assert.match(src, /profiles|user_diamonds|wallets/, 'probe must verify downstream trigger rows');
    assert.match(
        code, /getUserById/,
        'probe must inspect the permanent probe account (PROBE_SIGNUP_USER_ID) to confirm the auth -> profile chain is intact.',
    );
    assert.doesNotMatch(
        code, /auth\.signUp\s*\(/,
        'MAU-safety regression: signup-probe must NOT sign up a new user per run.',
    );
    assert.doesNotMatch(
        code, /admin\.auth\.admin\.(createUser|deleteUser)\s*\(/,
        'MAU-safety regression: signup-probe must NOT create or delete users — it reads a permanent account.',
    );
});

test('login.js handleSignup is hardened (validatePassword OR redirect to /auth/signup)', () => {
    const src = read('pages/auth/login.js');
    const m = src.match(/const handleSignup = async[^{]*\{([\s\S]*?)^\s{4}\};/m);
    if (!m) return; // handler removed — acceptable
    const body = m[1];
    const hasValidate = /validatePassword/.test(body);
    const redirectsToCanonical = /router\.push\(['"]\/auth\/signup['"]/.test(body);
    assert.ok(
        hasValidate || redirectsToCanonical,
        'login.js handleSignup must either call validatePassword (parity with /auth/signup) or router.push(/auth/signup). ' +
        'The bare signUp({email,password}) path creates accounts without metadata that crash downstream.',
    );
});

test('signup.js handleOAuthSignIn handles www → apex pre-flight', () => {
    const src = read('pages/auth/signup.js');
    const m = src.match(/handleOAuthSignIn[\s\S]*?(?=\n\s{4}\/\/|^\s{4}const )/m);
    assert.ok(m, 'handleOAuthSignIn not found');
    const handler = m[0];
    const handlesWww = /www\./.test(handler) && /location\.(replace|href|hostname)/.test(handler);
    const documented = /apex|PKCE|verifier/i.test(handler);
    assert.ok(
        handlesWww || documented,
        'handleOAuthSignIn must address www→apex PKCE-verifier scope, or comment why not.',
    );
});

// Production provider and UI agree on exactly six digits.
const { isEmailVerificationCode, installPromptDelay } = await import('../src/lib/signupExperience.mjs');
test('email verification allows exactly six digits and refuses eight', () => {
    for (const code of ['123456', '000000']) assert.equal(isEmailVerificationCode(code), true);
    for (const code of ['', '1234', '12345', '1234567', '12623502', '00000000', '123456789', '1234ab56']) assert.equal(isEmailVerificationCode(code), false);
    const signup = read('pages/auth/signup.js');
    assert.match(signup, /slice\(0, 6\)/);
    assert.match(signup, /maxLength=\{6\}/);
    assert.match(signup, /pattern="\[0-9\]\{6\}"/);
    assert.match(signup, /token: verificationCode/);
    assert.match(signup, /isEmailVerificationCode\(verificationCode\)/);
    assert.doesNotMatch(signup, /slice\(0, 8\)|maxLength=\{8\}/);
});

test('install prompt waits three minutes after account creation, across routes and reloads', () => {
    const created = Date.parse('2026-10-16T14:00:00Z');
    const user = { id: 'test-player', created_at: new Date(created).toISOString() };
    assert.equal(installPromptDelay(null, '/hub', created + 999999), null);
    assert.equal(installPromptDelay({ id: 'missing-date' }, '/hub', created), null);
    for (const route of ['/auth/signup', '/auth/callback', '/auth/login', '/i/abc']) {
        assert.equal(installPromptDelay(user, route, created + 999999), null);
    }
    assert.equal(installPromptDelay(user, '/hub', created), 180000);
    assert.equal(installPromptDelay(user, '/hub', created + 25000), 155000);
    assert.equal(installPromptDelay(user, '/hub', created + 179999), 1);
    assert.equal(installPromptDelay(user, '/hub', created + 180000), 0);
    assert.equal(installPromptDelay(user, '/hub', created + 360000), 0);
    const prompt = read('src/components/ui/PWAInstallPrompt.jsx');
    assert.match(prompt, /onAuthStateChange/);
    assert.match(prompt, /subscribeInstallState\(evaluate\)/);
    assert.match(prompt, /installPromptDelay\(authUser, pathname\)/);
    assert.ok(prompt.indexOf('const delay = installPromptDelay') < prompt.indexOf('if (isInstallable())'));
    assert.match(prompt, /Your Seat\.\.\.<\/span><span[^>]*>Always Within Reach\./);
});

test('club invite uses club artwork only and has no yellow fallback', () => {
    const invite = read('pages/i/[code].js');
    assert.doesNotMatch(invite, /logoLetter|C\.gold|245,197,66|#f5c542/);
    assert.match(invite, /club\.logoUrl \? \(/);
});

test('install availability events cannot bypass account-age gating in the mounted component', async () => {
    const { createRequire } = await import('node:module');
    const { default: vm } = await import('node:vm');
    const require = createRequire(import.meta.url);
    const ts = require('typescript');
    const React = require('react');
    const { create, act } = require('react-test-renderer');
    let now = Date.parse('2026-10-16T14:00:00Z');
    let route = '/auth/signup';
    let authChange;
    let installChange;
    let cancelled = 0;
    const timers = new Map();
    let nextTimer = 0;
    const storage = new Map();
    const module = { exports: {} };
    const compiled = ts.transpileModule(read('src/components/ui/PWAInstallPrompt.jsx'), {
        compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
        fileName: 'PWAInstallPrompt.jsx',
    }).outputText;
    vm.runInNewContext(compiled, {
        exports: module.exports, module, console,
        localStorage: { getItem: k => storage.get(k), setItem: (k, v) => storage.set(k, v) },
        setTimeout: (fn, delay) => { const id = ++nextTimer; timers.set(id, { fn, at: now + delay }); return id; },
        clearTimeout: id => timers.delete(id),
        fetch: async () => ({}),
        require: name => {
            if (name === 'react' || name === 'react/jsx-runtime') return require(name);
            if (name === 'next/router') return { useRouter: () => ({ pathname: route }) };
            if (name.endsWith('/supabase')) return { supabase: { auth: {
                getSession: async () => ({ data: { session: null } }),
                onAuthStateChange: fn => { authChange = fn; return { data: { subscription: { unsubscribe: () => cancelled++ } } }; },
            } } };
            if (name.endsWith('/signupExperience.mjs')) return { installPromptDelay: (user, path) => installPromptDelay(user, path, now) };
            if (name.endsWith('/pwaInstall')) return {
                isRunningAsApp: () => false, isKnownInstalled: () => false,
                isInstallable: () => true, canPromptInstall: () => false, isIos: () => true,
                subscribeInstallState: fn => { installChange = fn; return () => {}; }, PWA_INSTALLED_KEY: 'installed',
            };
            if (name.endsWith('/promptMaterials')) return {};
            if (name.endsWith('/InstallAppSheet')) return { default: () => null };
            throw new Error(`Unexpected Import: ${name}`);
        },
    });
    const Component = module.exports.default;
    let tree;
    await act(async () => { tree = create(React.createElement(Component)); });
    assert.equal(tree.toJSON(), null);
    await act(async () => { installChange(); });
    assert.equal(tree.toJSON(), null, 'signed-out availability event must stay hidden');
    const user = { id: 'test-player', created_at: new Date(now).toISOString() };
    await act(async () => { authChange('SIGNED_IN', { user }); });
    assert.equal(tree.toJSON(), null, 'registration must stay hidden even with a session');
    route = '/hub';
    await act(async () => { tree.update(React.createElement(Component)); });
    now += 25000;
    await act(async () => { installChange(); });
    assert.equal(tree.toJSON(), null, 'the previous 25-second bypass must stay hidden');
    now += 154999;
    await act(async () => { installChange(); });
    assert.equal(tree.toJSON(), null, '179999 milliseconds is still too early');
    now += 1;
    await act(async () => {
        for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.fn(); }
    });
    assert.equal(tree.root.findByProps({ 'data-startup-prompt': 'install' }).type, 'div');
    route = '/auth/signup';
    await act(async () => { tree.update(React.createElement(Component)); });
    assert.equal(tree.toJSON(), null, 'route transition must immediately hide the prompt');
    route = '/hub';
    await act(async () => { tree.update(React.createElement(Component)); authChange('SIGNED_OUT', null); });
    assert.equal(tree.toJSON(), null, 'sign-out must hide the prompt');
    await act(async () => { tree.unmount(); });
    assert.equal(timers.size, 0);
    assert.equal(cancelled, 1);
});

test('the verification screen passes the fresh six digits to Auth and renders rejection then success', async () => {
    const { createRequire } = await import('node:module');
    const { default: vm } = await import('node:vm');
    const require = createRequire(import.meta.url);
    const ts = require('typescript');
    const React = require('react');
    const { create, act } = require('react-test-renderer');
    const submitted = [];
    const redirects = [];
    const invitedClub = '/hub/club-arena/invite/shark-club?ref=1&i=ZG9YGMZ';
    let reject = true;
    const module = { exports: {} };
    const compiled = ts.transpileModule(read('pages/auth/signup.js'), {
        compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
        fileName: 'signup.jsx',
    }).outputText;
    vm.runInNewContext(compiled, {
        module, exports: module.exports, console: { log() {}, warn() {} },
        window: { location: { replace: path => redirects.push(path) } },
        require: name => {
            if (name === 'react') return { ...React, useEffect: () => {}, useState: initial => React.useState(
                initial === 'info' ? 'email_pending' : initial?.firstName === '' ? { ...initial, email: ' Signup@Example.Invalid ', pokerAlias: 'Test Player' } : initial
            ) };
            if (name === 'react/jsx-runtime' || name === 'lucide-react') return require(name);
            if (name === 'next/router') return { useRouter: () => ({ query: {} }) };
            if (name.endsWith('/SEOHead') || name.endsWith('/ExistingAccountDialog') || name.endsWith('/AuthEntryChoices')) return { default: () => null };
            if (name.endsWith('/signupExperience.mjs')) return { isEmailVerificationCode };
            if (name.endsWith('/clubInvite')) return { resolveSignupClubPath: async () => invitedClub };
            if (name.endsWith('/SignupWelcome')) return { default: () => React.createElement('h2', null, 'Welcome To Smarter.Poker!') };
            if (name.endsWith('/supabase')) return { supabase: { auth: { verifyOtp: async payload => {
                submitted.push(payload);
                return reject ? { error: new Error('Invalid Verification Code') } : { data: {} };
            } } } };
            return {};
        },
    });
    let tree;
    await act(async () => { tree = create(React.createElement(module.exports.default)); });
    const input = () => tree.root.findByProps({ id: 'signup-email-code' });
    assert.equal(input().props.maxLength, 6);
    await act(async () => { input().props.onChange({ target: { value: '126 235' } }); });
    assert.equal(input().props.value, '126235');
    assert.equal(tree.root.findByProps({ type: 'submit' }).props.disabled, false);
    const submit = () => tree.root.findByType('form').props.onSubmit({ preventDefault() {} });
    await act(async () => { await submit(); });
    assert.equal(submitted[0].token, '126235');
    assert.equal(submitted[0].email, 'signup@example.invalid');
    assert.equal(tree.root.findByProps({ role: 'alert' }).children[0], 'Invalid Verification Code');
    reject = false;
    await act(async () => { await submit(); });
    assert.equal(tree.root.findAllByProps({ id: 'signup-email-code' }).length, 0);
    assert.ok(JSON.stringify(tree.toJSON()).includes('Welcome To Smarter.Poker!'));
    assert.equal(redirects.length, 1);
    const destination = new URL(redirects[0], 'https://example.invalid');
    assert.equal(destination.pathname, '/hub/verify-phone', 'a referral must not skip the phone welcome offer');
    assert.equal(destination.searchParams.get('welcome'), '1');
    assert.equal(destination.searchParams.get('next'), invitedClub);
    await act(async () => { tree.unmount(); });
});

test('Auth duplicate responses are recovered without treating unrelated database errors as an existing account', async () => {
    const { isExistingSignup } = await import('../src/lib/signupOutcome.mjs');
    for (const code of ['user_already_exists', 'email_exists', 'identity_already_exists']) assert.equal(isExistingSignup(null, { code }), true);
    assert.equal(isExistingSignup(null, { message: 'User already registered' }), true);
    assert.equal(isExistingSignup({ user: { identities: [] }, session: null }, null), true);
    assert.equal(isExistingSignup({ user: { identities: [{ provider: 'email' }] }, session: null }, null), false);
    assert.equal(isExistingSignup({ user: { identities: [] }, session: { access_token: 'local-test' } }, null), false);
    for (const error of [{ message: 'duplicate key value violates player_number constraint' }, { code: 'over_email_send_rate_limit' }, { message: 'Network Error' }]) assert.equal(isExistingSignup(null, error), false);
});

test('signup shows existing-account recovery for both Auth response shapes, keeps new signups on OTP, and preserves referral when signing in', async () => {
    const { createRequire } = await import('node:module');
    const { default: vm } = await import('node:vm');
    const { isExistingSignup } = await import('../src/lib/signupOutcome.mjs');
    const { isEmailVerificationCode } = await import('../src/lib/signupExperience.mjs');
    const { authSwitchHref } = await import('../src/lib/clubInvite.js');
    const pendingSignupCodes = await import('../src/lib/pendingSignupCodes.mjs');
    const authErrors = await import('../src/lib/authErrors.js');
    const require = createRequire(import.meta.url), ts = require('typescript'), React = require('react');
    const { create, act } = require('react-test-renderer');
    for (const result of [
        { data: { user: { identities: [] }, session: null }, error: null },
        { data: { user: null, session: null }, error: { code: 'user_already_exists', message: 'User already registered' } },
        { data: { user: { id: 'local-new-user', identities: [{ provider: 'email' }] }, session: null }, error: null },
    ]) {
        const mod = { exports: {} }, routes = [], stored = new Map(), writes = [], reported = [];
        vm.runInNewContext(ts.transpileModule(read('pages/auth/signup.js'), {
            compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
        }).outputText, {
            module: mod, exports: mod.exports, console: { log() {}, warn() {} },
            window: { location: { origin: 'https://example.invalid' } },
            sessionStorage: { setItem: (k, v) => stored.set(k, v) },
            localStorage: { setItem: (...args) => writes.push(args) },
            require: name => {
                if (name === 'react') return { ...React, useEffect: () => {}, useState: initial => React.useState(initial?.firstName === '' ? {
                    ...initial, firstName: 'Signup', lastName: 'Test', email: 'PLAYER@example.invalid', password: 'Local-Only-Test-Password', pokerAlias: 'SignupTest', birthMonth: '01', birthDay: '01', birthYear: '1990',
                } : initial) };
                if (name === 'react/jsx-runtime' || name === 'lucide-react') return require(name);
                if (name === 'next/router') return { useRouter: () => ({ query: { ref: '1253', invite: 'ABC2345', redirect: '/hub/club-arena/invite/shark-club' }, push: href => routes.push(href) }) };
                if (name.endsWith('/ExistingAccountDialog')) return { default: ({ open, onSignIn, onClose }) => open ? React.createElement('div', { role: 'alertdialog' }, React.createElement('h2', null, 'You Already Have An Account'), React.createElement('button', { onClick: onSignIn }, 'Sign In'), React.createElement('button', { onClick: onClose }, 'Use A Different Email')) : null };
                if (name.endsWith('/SEOHead') || name.endsWith('/AuthEntryChoices')) return { default: () => null };
                if (name.endsWith('/signupOutcome.mjs')) return { isExistingSignup };
                if (name.endsWith('/signupExperience.mjs')) return { isEmailVerificationCode };
                if (name.endsWith('/clubInvite')) return { authSwitchHref, readPendingInvite: () => null, safeClubArenaPath: () => null };
                if (name.endsWith('/passwordStrength')) return { validatePassword: async () => ({ ok: true }) };
                if (name.endsWith('/pendingSignupCodes.mjs')) return pendingSignupCodes;
                if (name.endsWith('/authErrors')) return { ...authErrors, reportAuthError: (...args) => reported.push(args) };
                if (name.endsWith('/supabase')) return { supabase: { auth: { signUp: async () => result } } };
                return {};
            },
        });
        let tree;
        await act(async () => { tree = create(React.createElement(mod.exports.default)); });
        await act(async () => { tree.root.findAllByProps({ type: 'checkbox' })[0].props.onChange({ target: { checked: true } }); });
        await act(async () => { await tree.root.findAllByType('form')[0].props.onSubmit({ preventDefault() {} }); });
        const duplicate = isExistingSignup(result.data, result.error);
        assert.deepEqual(reported, [], 'a signup submit must not report an auth error');
        assert.equal(tree.root.findAllByProps({ role: 'alertdialog' }).length, duplicate ? 1 : 0);
        assert.equal(tree.root.findAllByProps({ id: 'signup-email-code' }).length, duplicate ? 0 : 1);
        if (duplicate) {
            assert.equal(writes.length, 0, 'duplicate response must not save a new signup redemption');
            const dialog = tree.root.findByProps({ role: 'alertdialog' });
            await act(async () => { dialog.findAllByType('button')[0].props.onClick(); });
            assert.equal(stored.get('login_email_prefill'), 'player@example.invalid');
            assert.match(routes[0], /\/auth\/login\?redirect=/);
            assert.match(routes[0], /invite=ABC2345&ref=1253/);
            await act(async () => { dialog.findAllByType('button')[1].props.onClick(); });
            assert.equal(tree.root.findAllByProps({ role: 'alertdialog' }).length, 0);
        }
        await act(async () => { tree.unmount(); });
    }
});

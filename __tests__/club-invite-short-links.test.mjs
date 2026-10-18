/**
 * Share & Invite short links (Dan 2026-10-15). Pins the pieces that carry an
 * invite from smarter.poker/i/<code> to the club join page: the code shape,
 * the cookie round trip, the 30-day window, the open-redirect guard, the
 * preview-crawler filter, and the wiring through signup, the auth callback
 * and phone verification.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    CLUB_INVITE_TTL_MS,
    resolveSignupClubPath,
    authSwitchHref,
    fetchPendingJoinPath,
    isSafeRelativePath,
    lookupPendingJoinPath,
    inviteCookieValue,
    isInviteCode,
    isInviteFresh,
    isLinkPreviewBot,
    normalizeInviteCode,
    parseInviteCookieValue,
    readCookie,
    safeClubArenaPath,
} from '../src/lib/clubInvite.js';

test('invite codes use the database alphabet: 7 chars, no I, O, 0 or 1', () => {
    assert.equal(isInviteCode('ABC2345'), true);
    assert.equal(normalizeInviteCode(' abc2345 '), 'ABC2345');
    for (const bad of ['ABC234', 'ABC23456', 'ABCI234', 'ABCO234', 'ABC0234', 'ABC1234', '', null, 42]) {
        assert.equal(isInviteCode(bad), false, String(bad));
    }
});

test('the attribution cookie round-trips and rejects junk', () => {
    const v = inviteCookieValue('ABC2345', 1760000000000);
    assert.deepEqual(parseInviteCookieValue(encodeURIComponent(v)), { code: 'ABC2345', firstSeen: 1760000000000 });
    assert.equal(parseInviteCookieValue('nope'), null);
    assert.equal(parseInviteCookieValue('ABC2345.abc'), null);
    assert.equal(readCookie('a=1; sp_club_invite=ABC2345.5; b=2', 'sp_club_invite'), 'ABC2345.5');
    assert.equal(readCookie('', 'sp_club_invite'), null);
});

test('attribution lasts 30 days from the first click', () => {
    const now = Date.now();
    assert.equal(isInviteFresh({ code: 'ABC2345', firstSeen: now - CLUB_INVITE_TTL_MS + 1000 }, now), true);
    assert.equal(isInviteFresh({ code: 'ABC2345', firstSeen: now - CLUB_INVITE_TTL_MS - 1 }, now), false);
    assert.equal(isInviteFresh(null, now), false);
});

test('only a Club Arena path on this origin is ever followed', () => {
    assert.equal(safeClubArenaPath('/hub/club-arena/invite/x?ref=1&i=ABC2345'), '/hub/club-arena/invite/x?ref=1&i=ABC2345');
    for (const bad of ['https://evil.example/hub/club-arena/', '//evil.example', '/hub/other', '/hub/club-arena\\x', null]) {
        assert.equal(safeClubArenaPath(bad), null, String(bad));
    }
});

test('link-preview crawlers are not counted as opens', () => {
    assert.equal(isLinkPreviewBot('WhatsApp/2.23.20.0'), true);
    assert.equal(isLinkPreviewBot('facebookexternalhit/1.1'), true);
    assert.equal(isLinkPreviewBot('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Discordbot/2.0'), true);
    assert.equal(isLinkPreviewBot('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'), false);
});

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('the /i/ page renders a preview card, sets the cookie and puts Create Account first', () => {
    const page = read('pages/i/[code].js');
    assert.match(page, /getServerSideProps/);
    assert.match(page, /og:image/);
    assert.match(page, /Set-Cookie/);
    assert.match(page, /const countClick = !bot && existing\?\.code !== code;/);
    assert.match(page, /resolveInviteServer\(code, \{ countClick \}\)/);
    assert.ok(page.includes('>Sign Up</a>'));
    assert.ok(page.includes('>Sign In</a>'));
    assert.ok(page.indexOf('>Sign Up</a>') < page.indexOf('>Sign In</a>'));
});

test('signup carries the invite into the account metadata', () => {
    const s = read('pages/auth/signup.js');
    assert.match(s, /rememberInvite\(String\(invite\)\)/);
    assert.match(s, /club_invite_code: pendingInvite\.code/);
});

test('the auth callback claims the invite and routes directly to the club', () => {
    const s = read('pages/auth/callback.js');
    assert.match(s, /claimInvite\(session\.access_token, invite\)/);
    assert.match(s, /const inviteDest = inviteJoinPath;/);
});

test('phone verification (or skipping it) continues to the invited club', () => {
    const s = read('pages/hub/verify-phone.js');
    assert.match(s, /safeClubArenaPath/);
    assert.match(s, /if \(nextPath\) window\.location\.replace\(nextPath\);\n\s+else router\.replace\('\/hub'\);/);
});

test('a malformed invite cookie is no invite, never a crash', () => {
    assert.equal(parseInviteCookieValue('%E0'), null);
});

test('a dot segment cannot walk a join path out of Club Arena', () => {
    assert.equal(safeClubArenaPath('/hub/club-arena/../../hub/x'), null);
    assert.equal(safeClubArenaPath('/hub/club-arena/%2e%2e/x'), null);
    assert.equal(safeClubArenaPath('/hub/club-arena/invite/abc?ref=1&i=ABCDEFG'), '/hub/club-arena/invite/abc?ref=1&i=ABCDEFG');
});

test('an older account claims the invite this browser holds, not its signup invite', () => {
    const s = read('pages/auth/callback.js');
    assert.match(s, /youngAccount && metaCode/);
    assert.match(s, /if \(claimedStored\) clearPendingInvite\(\)/);
});

test('signup keeps the ?redirect= join page when the claim fails', () => {
    const s = read('src/lib/clubInvite.js');
    assert.match(s, /next = safeClubArenaPath\(claimed\?\.join_path\) \|\| next;/);
});

test('the landing page trusts a stored session, not the cached header user', () => {
    const s = read('pages/i/[code].js');
    assert.match(s, /if \(getSessionToken\(\)\)/);
    assert.doesNotMatch(s, /getAuthUser\(\)/);
});

test('the share card only embeds a logo Satori can draw', () => {
    const s = read('pages/api/og/club-invite.js');
    assert.match(s, /embeddableLogo\(invite\?\.club\?\.logo_url\)/);
    assert.match(s, /image\\\/\(png\|jpe\?g\|gif\)/);
});

test('switching between signup and login keeps redirect and invite', () => {
    assert.equal(authSwitchHref('/auth/login', {}), '/auth/login');
    assert.equal(
        authSwitchHref('/auth/login', { redirect: '/hub/club-arena/invite/x?ref=1&i=ABC2345', invite: 'ABC2345' }),
        '/auth/login?redirect=%2Fhub%2Fclub-arena%2Finvite%2Fx%3Fref%3D1%26i%3DABC2345&invite=ABC2345'
    );
    assert.equal(authSwitchHref('/auth/signup', { redirect: ['/hub/a', '/hub/b'] }), '/auth/signup?redirect=%2Fhub%2Fa');
    assert.equal(authSwitchHref('/auth/login', { ref: '1253', promo: 'WELCOME', invite: 'ABC2345' }), '/auth/login?invite=ABC2345&ref=1253&promo=WELCOME');
    assert.equal(authSwitchHref('/auth/signup', { ref: ['1253', 'other'] }), '/auth/signup?ref=1253');
    const signup = read('pages/auth/signup.js');
    assert.doesNotMatch(signup, /router\.push\('\/auth\/login'\)/);
    assert.equal(signup.split("router.push(authSwitchHref('/auth/login', router.query))").length - 1, 4);
    const login = read('pages/auth/login.js');
    assert.doesNotMatch(login, /router\.push\('\/auth\/signup'\)/);
    assert.match(login, /router\.push\(authSwitchHref\('\/auth\/signup', router\.query\)\)/);
});

test('magic link and OAuth sign-in return through the callback to the redirect target', () => {
    const login = read('pages/auth/login.js');
    assert.match(login, /emailRedirectTo: callbackUrl\(\)/);
    assert.match(login, /redirectTo: callbackUrl\(\)/);
    assert.match(login, /\?next=\$\{encodeURIComponent\(target\)\}/);
    assert.doesNotMatch(login, /redirectTo: `\$\{window\.location\.origin\}\/auth\/callback`/);
    const cb = read('pages/auth/callback.js');
    assert.match(cb, /if \(isSafeRelativePath\(rawNext\)\)/);
});

test('the callback routes an invite only for a fresh claim, and Commander wins', () => {
    const cb = read('pages/auth/callback.js');
    assert.match(cb, /INVITE_ROUTE_STATUSES = \['signed_up', 'verified'\]/);
    assert.match(cb, /INVITE_SETTLED_STATUSES = \['already_member', 'joined', 'blocked'\]/);
    assert.match(cb, /youngAccount && INVITE_ROUTE_STATUSES\.includes\(claimed\.status\)/);
    assert.match(cb, /claimed\.success === false && !!claimed\.code/);
    assert.match(cb, /!inviteJoinPath && youngAccount && \(!claimAttempted \|\| !claimSettled\)/);
    const dest = cb.slice(cb.indexOf('const dest = nextPath'));
    assert.ok(dest.indexOf("isCommanderOrigin ? '/commander/dashboard'") < dest.indexOf('|| inviteDest'));
});

test('fetchPendingJoinPath never throws and only returns a Club Arena path', async () => {
    const realFetch = globalThis.fetch;
    try {
        globalThis.fetch = async () => { throw new Error('network down'); };
        assert.equal(await fetchPendingJoinPath('token'), null);
        globalThis.fetch = async () => ({ ok: false, status: 500, text: async () => 'boom' });
        assert.equal(await fetchPendingJoinPath('token'), null);
        globalThis.fetch = async () => ({ ok: true, json: async () => ({ pending: true, join_path: '/hub/club-arena/invite/x?ref=1&i=ABC2345' }) });
        assert.equal(await fetchPendingJoinPath('token'), '/hub/club-arena/invite/x?ref=1&i=ABC2345');
        globalThis.fetch = async () => ({ ok: true, json: async () => ({ pending: true, join_path: 'https://evil.example/' }) });
        assert.equal(await fetchPendingJoinPath('token'), null);
        globalThis.fetch = async () => ({ ok: true, json: async () => ({ pending: false, join_path: '/hub/club-arena/invite/x' }) });
        assert.equal(await fetchPendingJoinPath('token'), null);
        assert.equal(await fetchPendingJoinPath(null), null);
    } finally {
        globalThis.fetch = realFetch;
    }
});

test('verify phone without ?next= continues to the account\'s pending invite', () => {
    const s = read('pages/hub/verify-phone.js');
    assert.match(s, /fetchPendingJoinPath\(getAccessToken\(\)\)/);
    assert.match(s, /const nextPath = queryNext \|\| pendingNext;/);
});

test('the hub forwards a pending invite once per browser session', () => {
    const c = read('src/components/gates/PendingInviteForward.jsx');
    assert.match(c, /'sp-pending-invite-forwarded'/);
    // Spent only on a real answer, and any value (Club Arena's too) counts.
    assert.ok(c.indexOf('await lookupPendingJoinPath(token)') < c.indexOf('sessionStorage.setItem(PENDING_INVITE_FORWARDED_KEY'));
    assert.match(c, /if \(path === undefined \|\| cancelled\) return;/);
    assert.match(c, /if \(sessionStorage\.getItem\(PENDING_INVITE_FORWARDED_KEY\)\) return undefined;/);
    assert.match(c, /window\.location\.assign\(path\)/);
    const hub = read('pages/hub/index.js');
    assert.match(hub, /<PendingInviteForward enabled=\{phonePromptEligible !== null && !redirectingToWelcome\} \/>/);
});

test('a redirect target with a control character, space or backslash is refused', () => {
    for (const bad of ['/\t/evil.com', '/\n/evil.com', '/\r/evil.com', '/ /evil.com', '/\\evil.com', '//evil.com', 'https://evil.com', 'javascript:alert(1)']) {
        assert.equal(isSafeRelativePath(bad), false, JSON.stringify(bad));
        assert.equal(safeClubArenaPath(bad), null, JSON.stringify(bad));
    }
    assert.equal(isSafeRelativePath('/hub/club-arena/invite/x?ref=1&i=ABCDEFG'), true);
    assert.equal(safeClubArenaPath('/hub/club-arena/\t/evil.com'), null);
    assert.match(read('pages/auth/callback.js'), /if \(isSafeRelativePath\(rawNext\)\)/);
    assert.match(read('pages/auth/login.js'), /isSafeRelativePath\(r\)\) return r;/);
});

test('any explained claim refusal stops the metadata fallback', () => {
    assert.match(read('pages/auth/callback.js'), /\(claimed\.success === false && !!claimed\.code\)/);
});

test('a successful verify continues to a pending invite that loaded late', () => {
    assert.match(read('pages/hub/verify-phone.js'), /\[busy, code, digits, user\?\.id, isWelcome, nextPath\]\);/);
});

test('lookupPendingJoinPath tells "could not ask" from "nothing pending"', async () => {
    const real = globalThis.fetch;
    try {
        globalThis.fetch = async () => { throw new Error('offline'); };
        assert.equal(await lookupPendingJoinPath('t'), undefined);
        assert.equal(await fetchPendingJoinPath('t'), null);
        globalThis.fetch = async () => new Response(JSON.stringify({ pending: false }), { status: 200 });
        assert.equal(await lookupPendingJoinPath('t'), null);
    } finally {
        globalThis.fetch = real;
    }
});


test('confirmed signup uses the fresh response token and cross-device invite metadata', async () => {
    const original = globalThis.fetch;
    const calls = [];
    globalThis.fetch = async (url, options) => {
        calls.push({ url, options });
        return { ok: true, json: async () => ({ join_path: '/hub/club-arena/invite/shark-club' }) };
    };
    try {
        const path = await resolveSignupClubPath({ access_token: 'fresh-test-session', user: {
            user_metadata: { club_invite_code: 'ABC2345', club_invite_first_seen: new Date().toISOString() },
        } });
        assert.equal(path, '/hub/club-arena/invite/shark-club');
        assert.equal(calls[0].options.headers.Authorization, 'Bearer fresh-test-session');
        assert.equal(JSON.parse(calls[0].options.body).p_code, 'ABC2345');
    } finally { globalThis.fetch = original; }
});

test('signup recovers server pending destination and refuses unsafe metadata redirects', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ pending: true, join_path: '/hub/club-arena/invite/shark-club' }) });
    try {
        assert.equal(await resolveSignupClubPath({ access_token: 'test', user: {} }), '/hub/club-arena/invite/shark-club');
        assert.equal(await resolveSignupClubPath(null, '//evil.example'), null);
        globalThis.fetch = async () => { throw new Error('offline'); };
        assert.equal(await resolveSignupClubPath({ access_token: 'test', user: { user_metadata: { club_join_path: '//evil.example' } } }), null);
        assert.equal(await resolveSignupClubPath({ access_token: 'test' }, '/hub/club-arena/invite/shark-club'), '/hub/club-arena/invite/shark-club');
    } finally { globalThis.fetch = original; }
});

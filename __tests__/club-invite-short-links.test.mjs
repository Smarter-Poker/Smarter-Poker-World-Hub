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
    assert.match(page, /countClick: !bot/);
    assert.ok(page.indexOf('Create Account') < page.indexOf('I Already Have An Account'));
});

test('signup carries the invite into the account metadata', () => {
    const s = read('pages/auth/signup.js');
    assert.match(s, /rememberInvite\(String\(invite\)\)/);
    assert.match(s, /club_invite_code: pendingInvite\.code/);
});

test('the auth callback claims the invite and routes through the phone step to the club', () => {
    const s = read('pages/auth/callback.js');
    assert.match(s, /claimInvite\(session\.access_token, invite\)/);
    assert.match(s, /verify-phone\?welcome=1&next=\$\{encodeURIComponent\(inviteJoinPath\)\}/);
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
    const s = read('pages/auth/signup.js');
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

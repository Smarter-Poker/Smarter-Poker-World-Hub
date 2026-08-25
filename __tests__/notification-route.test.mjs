/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  NOTIFICATION ROUTING — every tap must land somewhere real
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Dan, 2026-08-25: "you need to enable the ability to click on the
 * notification and it direct you directly to the page it's notifying you
 * about... it currently just silently fails."
 *
 * It silently failed because five separate renderers each implemented their
 * own routing switch, and the destination lives in one of three columns
 * (`link`, `action_url`, or a key inside `data`/`metadata`) depending on
 * which producer wrote the row. Production at the time of writing:
 *
 *     waitlist_seat_open  1219 rows   0 with a link   <- "Seat Open"
 *     friend_accept       3188 rows   0 with a link
 *     friend_request      1193 rows   0 with a link
 *     union_invoice          4 rows   0 with a link
 *     like / comment        18 rows   0 with a link
 *
 * The fixtures below are REAL payload shapes copied out of production, not
 * invented ones. If a producer changes the shape it writes, these fail —
 * which is the point.
 *
 * Run: node --test __tests__/notification-route.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveNotificationRoute as route } from '../src/lib/notificationRoute.js';

// ── Explicit destinations win ────────────────────────────────────────────
test('an explicit link is authoritative', () => {
    assert.equal(route({ type: 'system', link: '/admin/push-health' }), '/admin/push-health');
});

test('action_url is used when link is absent', () => {
    assert.equal(
        route({ type: 'page_completion_nudge', action_url: '/hub/social-pages/the-midway-club/manage' }),
        '/hub/social-pages/the-midway-club/manage'
    );
});

test('link beats action_url when both are present', () => {
    assert.equal(route({ type: 'system', link: '/a', action_url: '/b' }), '/a');
});

test('a non-path link value is rejected rather than navigated to', () => {
    // Guards against a producer writing a bare word and us pushing it as a route.
    assert.equal(route({ type: 'unknown_type', link: 'nowhere', data: {} }), null);
});

// ── The seat-open regression, the biggest dead-click population ──────────
test('waitlist_seat_open routes to the actual table', () => {
    assert.equal(
        route({ type: 'waitlist_seat_open', data: { table_id: 'e2f57660-9234-419d-a629-d765f5205e76' } }),
        '/hub/club-arena/table/e2f57660-9234-419d-a629-d765f5205e76'
    );
});

test('waitlist_seat_open with no table id falls back to the waitlist, not nowhere', () => {
    assert.equal(route({ type: 'waitlist_seat_open', data: {} }), '/hub/club-arena/waitlist');
});

test('the seat_available alias routes identically', () => {
    assert.equal(route({ type: 'seat_available', data: { tableId: 'abc' } }), '/hub/club-arena/table/abc');
});

// ── Union money ──────────────────────────────────────────────────────────
test('union_invoice opens that union statements page', () => {
    assert.equal(
        route({
            type: 'union_invoice',
            data: { union_id: 'fade0000-0000-0000-0000-000000000001', club_id: 'a0000000-0000-0000-0000-000000000001' },
        }),
        '/hub/club-arena/unions/fade0000-0000-0000-0000-000000000001/statements'
    );
});

test('a failed settlement opens settlement, where the chips actually move', () => {
    assert.equal(
        route({ type: 'settlement', data: { failed: true, union_id: 'fade0000-0000-0000-0000-000000000001' } }),
        '/hub/club-arena/unions/fade0000-0000-0000-0000-000000000001/settlement'
    );
});

test('settlement without a union falls back to the club settlement page', () => {
    assert.equal(route({ type: 'settlement', data: { club_id: 'c1' } }), '/hub/club-arena/clubs/c1/settlement');
});

// ── Social people ────────────────────────────────────────────────────────
test('friend_request opens the requester profile once enrichment ran', () => {
    assert.equal(
        route({ type: 'friend_request', data: { sender_id: '7046eac5' }, actor_username: 'adelaide' }),
        '/hub/user/adelaide'
    );
});

test('friend_accept with no resolvable username lands on friends, not nowhere', () => {
    assert.equal(route({ type: 'friend_accept', data: { sender_id: '165df98e' } }), '/hub/friends');
});

test('a username with a space is percent-encoded, not pasted raw', () => {
    // 232 of 906 production usernames need encoding. Raw interpolation put a
    // literal space in the path, and that value is also what the push-outbox
    // trigger sends as the notification URL.
    assert.equal(
        route({ type: 'friend_request', actor_username: 'solver steve' }),
        '/hub/user/solver%20steve'
    );
});

test('apostrophes, @ and non-ASCII usernames encode correctly', () => {
    assert.equal(route({ type: 'new_follow', actor_username: "chase o'ryan" }), "/hub/user/chase%20o'ryan");
    assert.equal(route({ type: 'new_follow', actor_username: '@todd' }), '/hub/user/%40todd');
    assert.equal(route({ type: 'new_follow', actor_username: 'j\u00f6rg' }), '/hub/user/j%C3%B6rg');
});

// ── Social posts: the dropped-post-id bug ────────────────────────────────
test('a like opens the post itself, not the feed root', () => {
    assert.equal(
        route({ type: 'like', data: { post_id: 'f494cf97-380b-4c09-9ab7-8e6389c481b5', liker_id: 'x' } }),
        '/hub/social-media?post=f494cf97-380b-4c09-9ab7-8e6389c481b5'
    );
});

test('a comment opens the post itself', () => {
    assert.equal(
        route({ type: 'comment', data: { post_id: '24305212-f7ff-4c94-bcc7-4fc5ff687f70', comment_id: 'c1' } }),
        '/hub/social-media?post=24305212-f7ff-4c94-bcc7-4fc5ff687f70'
    );
});

test('a like on a reel opens the reel viewer instead', () => {
    assert.equal(route({ type: 'like', data: { post_id: 'p1', is_reel: true } }), '/hub/reels?id=p1');
});

// ── metadata-column producers ────────────────────────────────────────────
test('metadata is read when data is empty', () => {
    // `bonus` and `club_announcement` write camelCase into metadata, not data.
    assert.equal(
        route({ type: 'club_announcement', data: {}, metadata: { clubId: 'a0000000-0000-0000-0000-000000000001' } }),
        '/hub/club-arena/clubs/a0000000-0000-0000-0000-000000000001'
    );
});

test('bonus with a club opens that club promotions', () => {
    assert.equal(route({ type: 'bonus', metadata: { clubId: 'a1' } }), '/hub/club-arena/clubs/a1/promotions');
});

test('bonus with no club still opens the bonuses page', () => {
    assert.equal(route({ type: 'bonus', data: {}, metadata: {} }), '/hub/club-arena/bonuses');
});

test('achievement opens achievements even with an empty payload', () => {
    assert.equal(route({ type: 'achievement', data: {}, metadata: {} }), '/hub/club-arena/achievements');
});

// ── Generic shape fallbacks for types we do not know by name ─────────────
test('an unknown type carrying page_type + page_id still routes', () => {
    assert.equal(route({ type: 'mystery', data: { page_type: 'venue', page_id: 'v1' } }), '/hub/venues/v1');
});

test('an unknown type carrying a table id still reaches the table', () => {
    assert.equal(route({ type: 'mystery', data: { table_id: 't9' } }), '/hub/club-arena/table/t9');
});

// ── Honest nulls: a row with nowhere to go must say so ───────────────────
test('an empty notification resolves to null so the row renders unclickable', () => {
    assert.equal(route({ type: 'mystery', data: {}, metadata: {} }), null);
});

test('null and undefined input do not throw', () => {
    assert.equal(route(null), null);
    assert.equal(route(undefined), null);
});

test('malformed data columns do not throw', () => {
    // Producers have historically written strings and nulls into these.
    assert.equal(route({ type: 'mystery', data: 'not-an-object', metadata: null }), null);
});

// ── Every route this module can emit must be a real path ─────────────────
test('no resolver output is ever a bare word', () => {
    const fixtures = [
        { type: 'waitlist_seat_open', data: { table_id: 't' } },
        { type: 'union_invoice', data: { union_id: 'u' } },
        { type: 'settlement', data: {} },
        { type: 'friend_request', actor_username: 'bob' },
        { type: 'like', data: { post_id: 'p' } },
        { type: 'achievement' },
        { type: 'bonus' },
        { type: 'message', data: { conversation_id: 'c' } },
        { type: 'tournament_start', data: { tournament_id: 'tr' } },
    ];
    for (const f of fixtures) {
        const r = route(f);
        assert.ok(r, `${f.type} must resolve`);
        assert.ok(r.startsWith('/'), `${f.type} resolved to a non-path: ${r}`);
    }
});

/**
 * Shared Club Arena hands, smarter.poker/h/<token> (2026-11-06). Pins the
 * token shape, the preview words (chips, never a currency sign, never hole
 * cards), the server read (anon key, p_count=false so a preview is never a
 * view), the preview metadata replacing the application defaults, the person
 * being sent on to Club Arena while a crawler is not, and the image reading
 * the stored facts by token rather than taking words from the URL.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    boardCards,
    cleanPreview,
    clubArenaHandPath,
    handPreviewText,
    normalizeHandToken,
    readSharedHand,
} from '../src/lib/sharedHandLink.js';

const read = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('tokens use the database alphabet: 8 chars, no I, O, l, 0 or 1', () => {
    assert.equal(normalizeHandToken(' AbCd2345 '), 'AbCd2345');
    for (const bad of ['AbCd234', 'AbCd23456', 'AbCdI345', 'AbCdO345', 'AbCdl345', 'AbCd0345', 'AbCd1345', '../etc/p', '', null, 7]) {
        assert.equal(normalizeHandToken(bad), null, String(bad));
    }
    assert.equal(clubArenaHandPath('AbCd2345'), '/hub/club-arena/h/AbCd2345');
});

test('preview words are chips with no currency sign', () => {
    const { headline, description } = handPreviewText({
        handNumber: '56019216', tableName: 'NLH 0.25/0.50 Lightning Games', pot: '3.43',
        board: '9h Jh 3c Ah 6s', senderName: 'Mongo',
    });
    assert.equal(headline, "Mongo's Hand #56019216");
    assert.equal(description, 'NLH 0.25/0.50 Lightning Games | Pot 3.43 Chips | Board 9h Jh 3c Ah 6s. Watch The Replay On Smarter.Poker.');
    assert.doesNotMatch(headline + description, /\$/);
    assert.equal(handPreviewText({}).headline, 'A Club Arena Hand');
});

test('only the known preview facts survive, and the board parses five cards at most', () => {
    assert.deepEqual(cleanPreview({ pot: '3.43', hero: 'Kh 4c', board: ' 9h Jh ' }), { pot: '3.43', board: '9h Jh' });
    assert.deepEqual(boardCards('9h Jh 3c Ah 6s Kd'), [
        { rank: '9', suit: 'h' }, { rank: 'J', suit: 'h' }, { rank: '3', suit: 'c' }, { rank: 'A', suit: 'h' }, { rank: '6', suit: 's' },
    ]);
    assert.deepEqual(boardCards('<script>'), []);
});

test('the server read uses the anon key and never counts a view', async () => {
    let seen;
    const fake = async (url, init) => {
        seen = { url, init };
        return { ok: true, json: async () => ({ found: true, revoked: false, preview: { pot: '3.43', hero: 'Kh' } }) };
    };
    const r = await readSharedHand('AbCd2345', fake);
    assert.deepEqual(r, { status: 'found', preview: { pot: '3.43' } });
    assert.match(seen.url, /\/rest\/v1\/rpc\/fn_ca_shared_hand_open$/);
    assert.deepEqual(JSON.parse(seen.init.body), { p_token: 'AbCd2345', p_count: false });
    assert.ok(seen.init.headers.apikey);
    assert.equal(seen.init.headers.Authorization, undefined);
    const revoked = await readSharedHand('AbCd2345', async () => ({ ok: true, json: async () => ({ found: true, revoked: true }) }));
    assert.deepEqual(revoked, { status: 'revoked' });
    assert.deepEqual(await readSharedHand('nope', fake), { status: 'missing' });
    await assert.rejects(readSharedHand('AbCd2345', async () => ({ ok: false, status: 503 })));
});

test('the hand page replaces the application preview defaults through shared Head keys', () => {
    const app = read('pages/_app.js');
    const page = read('pages/h/[token].js');
    for (const property of ['og:type', 'og:site_name', 'og:url', 'og:title', 'og:description', 'og:image', 'og:image:width', 'og:image:height', 'og:image:type', 'twitter:card', 'twitter:title', 'twitter:description', 'twitter:image']) {
        const findTag = source => [...source.matchAll(/<meta\b[^>]*>/g)].map(m => m[0])
            .find(tag => tag.includes(`property="${property}"`) || tag.includes(`name="${property}"`));
        const defaultKey = findTag(app)?.match(/key="([^"]+)"/)?.[1];
        const overrideKey = findTag(page)?.match(/key="([^"]+)"/)?.[1];
        assert.ok(defaultKey, `Application default key for ${property}`);
        assert.equal(overrideKey, defaultKey, `The hand page must replace the default ${property}`);
    }
});

test('a person is sent on to Club Arena; a preview crawler is not', () => {
    const page = read('pages/h/[token].js');
    assert.match(page, /window\.location\.replace\(target\)/);
    assert.match(page, /\{!bot && <meta httpEquiv="refresh" content=\{`0;url=\$\{target\}`\} \/>\}/);
    assert.match(page, /const target = clubArenaHandPath\(token\);/);
});

test('the image reads the stored facts by token and never draws hole cards', () => {
    const og = read('pages/api/og/club-hand.js');
    assert.match(og, /readSharedHand\(token\)/);
    assert.doesNotMatch(og, /searchParams\.get\('(hero|board|pot|player|stakes|amount)'\)/);
    assert.doesNotMatch(og, /\$\{?\s*['"]?\$/);
});

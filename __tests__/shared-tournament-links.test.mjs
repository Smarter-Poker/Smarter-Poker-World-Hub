/**
 * Shared Club Arena tournaments, smarter.poker/t/<id> (2026-11-15). Pins the
 * id shape, the server read (anon key, one uuid), the preview words (chips,
 * never a currency sign), only known facts surviving, the preview metadata
 * replacing the application defaults, a signed-in person being sent on while
 * a signed-out one sees the invitation with one Register button, a crawler
 * never being redirected, and the image reading the stored facts by id rather
 * than taking words from the URL.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    buyInWords,
    chipAmount,
    cleanTournamentPreview,
    clubArenaTournamentPath,
    gameLine,
    hasSignedInSession,
    isOpenForEntry,
    normalizeTournamentId,
    readSharedTournament,
    startWords,
    statusWords,
    tournamentPreviewText,
} from '../src/lib/sharedTournamentLink.js';

const read = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const ID = '8c5474fd-f1e6-4112-91f9-6d6e8af4c842';

test('ids are uuids, lower-cased; anything else is not a tournament', () => {
    assert.equal(normalizeTournamentId(` ${ID.toUpperCase()} `), ID);
    for (const bad of ['8c5474fd', `${ID}x`, '../etc/passwd', '', null, 7, `${ID.slice(0, -1)}g`]) {
        assert.equal(normalizeTournamentId(bad), null, String(bad));
    }
    assert.equal(clubArenaTournamentPath(ID), `/hub/club-arena/tournaments/${ID}`);
});

test('the server read uses the anon key and sends only the id', async () => {
    let seen;
    const fake = async (url, init) => {
        seen = { url, init };
        return { ok: true, json: async () => ({ found: true, name: 'Turbo Tuesday PKO', buyIn: 9, fee: 1, hero: 'x' }) };
    };
    const r = await readSharedTournament(ID, fake);
    assert.equal(r.status, 'found');
    assert.deepEqual(r.preview, { name: 'Turbo Tuesday PKO', buyIn: 9, fee: 1 });
    assert.match(seen.url, /\/rest\/v1\/rpc\/fn_ca_tournament_share_preview$/);
    assert.deepEqual(JSON.parse(seen.init.body), { p_tournament_id: ID });
    assert.ok(seen.init.headers.apikey);
    assert.equal(seen.init.headers.Authorization, undefined);
    assert.deepEqual(await readSharedTournament(ID, async () => ({ ok: true, json: async () => ({ found: false }) })), { status: 'missing' });
    assert.deepEqual(await readSharedTournament('nope', fake), { status: 'missing' });
    await assert.rejects(readSharedTournament(ID, async () => ({ ok: false, status: 503 })));
});

test('only the known facts survive, typed', () => {
    const p = cleanTournamentPreview({
        name: '  Nightly 10K ', game: 'NLH', status: 'REGISTERING', buyIn: '10.00', fee: 0, guarantee: null,
        freeBuy: 'yes', rebuys: true, startTime: '2026-11-18T01:00:00+00:00', userId: 'u', wallet: 99, club: '<b>x</b>',
    });
    assert.deepEqual(p, {
        name: 'Nightly 10K', game: 'NLH', status: 'REGISTERING', club: '<b>x</b>', buyIn: 10, fee: 0, rebuys: true,
        startTime: '2026-11-18T01:00:00.000Z',
    });
    assert.equal(p.guarantee, undefined);
    assert.equal(p.freeBuy, undefined);
});

test('preview words are chips with no currency sign, in Chicago time', () => {
    const preview = cleanTournamentPreview({
        name: 'Turbo Tuesday PKO', game: 'NLH', format: 'progressive_bounty', bounty: 'PKO', status: 'REGISTERING',
        startTime: '2026-11-18T01:00:00Z', buyIn: 9, fee: 1, guarantee: 1000, club: 'Midway Union',
    });
    const { headline, description } = tournamentPreviewText(preview, Date.parse('2026-11-17T12:00:00Z'));
    assert.equal(headline, 'Turbo Tuesday PKO');
    assert.equal(
        description,
        'NLH PKO | Buy-In 10 Chips | 1,000 Chips GTD | Starts Tue Nov 17, 7:00 PM CT | Midway Union. Register On Smarter.Poker.'
    );
    assert.doesNotMatch(headline + description, /\$/);
    assert.equal(chipAmount(1.9), '1.90');
    assert.equal(chipAmount(25000), '25,000');
    assert.equal(buyInWords({ freeBuy: true, buyIn: 1 }), 'Free Entry');
    assert.equal(gameLine({ game: 'PLO5', format: 'sng' }), 'PLO5 Sit & Go');
    assert.equal(startWords('2026-07-04T23:30:00Z'), 'Sat Jul 4, 6:30 PM CT');
});

test('status words follow the event, and late registration is still open entry', () => {
    const start = '2026-11-18T01:00:00Z';
    assert.equal(statusWords({ status: 'REGISTERING' }), 'Registration Open');
    assert.equal(statusWords({ status: 'COMPLETED' }), 'Finished');
    assert.equal(statusWords({ status: 'CANCELLED' }), 'Cancelled');
    const running = { status: 'RUNNING', startTime: start, lateRegMinutes: 60 };
    assert.equal(statusWords(running, Date.parse('2026-11-18T01:30:00Z')), 'Running, Late Registration Open');
    assert.equal(statusWords(running, Date.parse('2026-11-18T02:30:00Z')), 'Running Now');
    assert.equal(isOpenForEntry(running, Date.parse('2026-11-18T01:30:00Z')), true);
    assert.equal(isOpenForEntry({ status: 'COMPLETED' }), false);
    assert.match(tournamentPreviewText({ name: 'Done', status: 'COMPLETED' }).description, /Finished.*Play Poker Tournaments On Smarter\.Poker\.$/);
});

test('a signed-in browser is recognised only by a real shared session', () => {
    const store = v => ({ getItem: () => v });
    assert.equal(hasSignedInSession(store(JSON.stringify({ access_token: 't', user: { id: 'u' } }))), true);
    assert.equal(hasSignedInSession(store(null)), false);
    assert.equal(hasSignedInSession(store('{not json')), false);
    assert.equal(hasSignedInSession(store(JSON.stringify({ user: { id: 'u' } }))), false);
    assert.equal(hasSignedInSession(undefined), false);
});

test('the tournament page replaces the application preview defaults through shared Head keys', () => {
    const app = read('pages/_app.js');
    const page = read('pages/t/[id].js');
    for (const property of ['og:type', 'og:site_name', 'og:url', 'og:title', 'og:description', 'og:image', 'og:image:width', 'og:image:height', 'og:image:type', 'twitter:card', 'twitter:title', 'twitter:description', 'twitter:image']) {
        const findTag = source => [...source.matchAll(/<meta\b[^>]*>/g)].map(m => m[0])
            .find(tag => tag.includes(`property="${property}"`) || tag.includes(`name="${property}"`));
        const defaultKey = findTag(app)?.match(/key="([^"]+)"/)?.[1];
        const overrideKey = findTag(page)?.match(/key="([^"]+)"/)?.[1];
        assert.ok(defaultKey, `Application default key for ${property}`);
        assert.equal(overrideKey, defaultKey, `The tournament page must replace the default ${property}`);
    }
});

test('signed in goes straight on; signed out sees the invitation; a crawler is never redirected', () => {
    const page = read('pages/t/[id].js');
    assert.match(page, /const target = clubArenaTournamentPath\(id\);/);
    assert.match(page, /if \(hasSignedInSession\(window\.localStorage\)\) window\.location\.replace\(target\);/);
    // No meta refresh and no server redirect: a preview crawler must read the card.
    assert.doesNotMatch(page, /httpEquiv="refresh"/);
    assert.doesNotMatch(page, /redirect:\s*\{/);
    assert.match(page, /<a href=\{target\} style=\{styles\.button\}>/);
    assert.match(page, /\{open \? 'Register' : 'Open Tournament'\}/);
    assert.match(page, /if \(!id\) return \{ notFound: true \};/);
});

test('the image reads the stored facts by id and never takes words from the URL', () => {
    const og = read('pages/api/og/club-tournament.js');
    assert.match(og, /readSharedTournament\(id\)/);
    assert.match(og, /normalizeTournamentId\(searchParams\.get\('id'\) \|\| ''\)/);
    assert.doesNotMatch(og, /searchParams\.get\('(name|title|club|buyin|buyIn|gtd|guarantee|text|amount)'\)/);
    assert.doesNotMatch(og, /\$\{?\s*['"]?\$/);
    assert.doesNotMatch(og, /[♠-♧]/);
});

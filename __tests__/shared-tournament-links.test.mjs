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
    isSeatBasedTournament,
    normalizeTournamentId,
    readSharedTournament,
    seatStartWords,
    startWords,
    statusWords,
    tournamentLandingFacts,
    tournamentOgFacts,
    tournamentPreviewText,
} from '../src/lib/sharedTournamentLink.js';
import { fitOgFactValue, fitOgSubtitle, fitOgTitle } from '../src/lib/sharedOgTypography.js';

const read = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const ID = '8c5474fd-f1e6-4112-91f9-6d6e8af4c842';

test('ids are uuids, lower-cased; anything else is not a tournament', () => {
    assert.equal(normalizeTournamentId(` ${ID.toUpperCase()} `), ID);
    for (const bad of ['8c5474fd', `${ID}x`, '../etc/passwd', '', null, 7, `${ID.slice(0, -1)}g`]) {
        assert.equal(normalizeTournamentId(bad), null, String(bad));
    }
    assert.equal(clubArenaTournamentPath(ID), `/hub/club-arena/tournaments/${ID}`);
});

test('the club code and the seat-hold token go on to Club Arena, sanitised as /g/ does, and nothing else', () => {
    // 2026-11-22: Club Arena shares a tournament as /t/<id>?i=<club code> so a
    // signed-in friend outside the club is offered its join step. Real shapes:
    // the database's 7 character code and a 32 hex seat-hold token.
    const CODE = 'K7MQ2XR';
    const HOLD = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
    assert.equal(
        clubArenaTournamentPath(ID, { i: 'k7mq2xr' }),
        `/hub/club-arena/tournaments/${ID}?i=${CODE}`
    );
    assert.equal(
        clubArenaTournamentPath(ID, { i: CODE, invite: HOLD }),
        `/hub/club-arena/tournaments/${ID}?i=${CODE}&invite=${HOLD}`
    );
    // A repeated key takes its first value, exactly as /g/ does.
    assert.equal(
        clubArenaTournamentPath(ID, { i: [CODE, 'OTHER99'] }),
        `/hub/club-arena/tournaments/${ID}?i=${CODE}`
    );
    // cluster names a cash game; an arbitrary key, a redirect or an injected
    // value is never forwarded.
    assert.equal(
        clubArenaTournamentPath(ID, {
            cluster: '9b3e1c2a-5d4f-4a6b-8c7d-0e1f2a3b4c5d',
            next: '//evil.example',
            redirect: 'https://evil.example',
            utm_source: 'x',
        }),
        `/hub/club-arena/tournaments/${ID}`
    );
    for (const bad of ['<script>', 'AB', 'ABC 234', 'ABC2345&x=1', '../x']) {
        assert.equal(clubArenaTournamentPath(ID, { i: bad }), `/hub/club-arena/tournaments/${ID}`, bad);
    }
    assert.equal(clubArenaTournamentPath(ID, null), `/hub/club-arena/tournaments/${ID}`);
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
    assert.match(page, /const target = clubArenaTournamentPath\(id, shareParams\);/);
    // The query is read through /g/'s own sanitiser, on the server, and is the
    // only thing forwarded.
    assert.match(page, /const shareParams = sanitizeShareParams\(query\);/);
    assert.match(page, /import \{ sanitizeShareParams \} from '\.\.\/\.\.\/src\/lib\/sharedGameLink';/);
    assert.match(page, /shareParams,\n\s*\},\n\s*\};/);
    assert.match(page, /if \(hasSignedInSession\(window\.localStorage\)\) window\.location\.replace\(target\);/);
    // No meta refresh and no server redirect: a preview crawler must read the card.
    assert.doesNotMatch(page, /httpEquiv="refresh"/);
    assert.doesNotMatch(page, /redirect:\s*\{/);
    assert.match(page, /<a href=\{target\} style=\{styles\.button\}>/);
    assert.match(page, /const ctaLabel = open \? \(seatBased \? 'Play Now' : 'Register'\) : 'Open Tournament';/);
    assert.match(page, /\{ctaLabel\}/);
    assert.match(page, /if \(!id\) return \{ notFound: true \};/);
});

test('the image reads the stored facts by id and never takes words from the URL', () => {
    const og = read('pages/api/og/club-tournament.js');
    assert.match(og, /export const config = \{\s*runtime:\s*'edge'\s*\};/);
    assert.match(og, /readSharedTournament\(id\)/);
    assert.match(og, /normalizeTournamentId\(searchParams\.get\('id'\) \|\| ''\)/);
    assert.match(og, /tournamentOgFacts\(preview, now\)/);
    assert.match(og, /club-arena-invite-bg\.jpg/);
    assert.match(og, /fitOgTitle\(/);
    assert.match(og, /fitOgSubtitle\(/);
    assert.match(og, /fitOgFactValue\(/);
    assert.match(og, /whiteSpace:\s*'nowrap'/);
    assert.doesNotMatch(og, /searchParams\.get\('(name|title|club|buyin|buyIn|gtd|guarantee|text|amount)'\)/);
    assert.doesNotMatch(og, /\$\{?\s*['"]?\$/);
    assert.doesNotMatch(og, /[♠-♧]/);
    assert.doesNotMatch(og, /—/);

    // Satori law: every intrinsic HTML container element inside JSX MUST specify display: 'flex'.
    const htmlOpenTags = [...og.matchAll(/<(div|span|p|section|header|footer|main)\b([^>]*)>/g)];
    assert.ok(htmlOpenTags.length >= 6, 'Expected OG JSX elements to be verified');
    for (const [fullTag, tagName, attrs] of htmlOpenTags) {
        assert.match(
            attrs,
            /display:\s*'flex'/,
            `Satori requires display:'flex' on every <${tagName}> element; missing in: ${fullTag}`
        );
    }
});

test('Spins and Sit & Gos never emit clock start times or Guarantee: None, while MTTs keep scheduled start times', () => {
    for (const fmt of ['spin', 'SPIN', 'sng', 'SNG', 'sng_satellite', 'sit_and_go', 'spin_and_go']) {
        assert.equal(isSeatBasedTournament({ format: fmt }), true, `expected seat-based for ${fmt}`);
    }
    for (const fmt of ['freezeout', 'progressive_bounty', 'mystery_bounty', 'bounty', 'satellite', 'rebuy', '', undefined]) {
        assert.equal(isSeatBasedTournament({ format: fmt }), false, `expected scheduled for ${String(fmt)}`);
    }

    const spin = cleanTournamentPreview({
        name: '100 Chip Spin PLO4',
        game: 'PLO4',
        format: 'spin',
        status: 'REGISTERING',
        startTime: '2026-11-22T15:52:00Z',
        buyIn: 100,
        fee: 0,
        guarantee: null,
        startingChips: 500,
        maxPlayers: 3,
        club: 'Midway Union',
    });
    const spinMeta = tournamentPreviewText(spin, Date.parse('2026-11-22T15:00:00Z'));
    assert.equal(
        spinMeta.description,
        'PLO4 Spin | Buy-In 100 Chips | Starts When Full (3 Players) | Midway Union. Register On Smarter.Poker.'
    );
    assert.doesNotMatch(spinMeta.description, /\bAM CT\b|\bPM CT\b|Nov 22/);

    const spinLanding = tournamentLandingFacts(spin, Date.parse('2026-11-22T15:00:00Z'));
    assert.deepEqual(spinLanding, [
        ['Buy-In', '100 Chips'],
        ['Starting Stack', '500 Chips'],
        ['Starts', 'When Full (3 Players)'],
        ['Status', 'Registration Open'],
    ]);
    assert.equal(spinLanding.some(([label]) => label === 'Guarantee'), false);

    const spinOg = tournamentOgFacts(spin, Date.parse('2026-11-22T15:00:00Z'));
    assert.deepEqual(spinOg, [
        { label: 'BUY-IN', value: '100 Chips' },
        { label: 'STARTING STACK', value: '500 Chips' },
        { label: 'STARTS', value: 'When Full (3 Players)' },
    ]);

    // SNG without startingChips falls back to Seats; SNG without maxPlayers renders "When Full" without clock time.
    const sngNoStack = cleanTournamentPreview({
        name: '6-Max NLH SNG',
        game: 'NLH',
        format: 'sng',
        status: 'REGISTERING',
        startTime: '2026-11-22T18:00:00Z',
        buyIn: 50,
        fee: 5,
        maxPlayers: 6,
    });
    assert.deepEqual(tournamentLandingFacts(sngNoStack), [
        ['Buy-In', '55 Chips'],
        ['Seats', '6 Players'],
        ['Starts', 'When Full (6 Players)'],
        ['Status', 'Registration Open'],
    ]);
    assert.deepEqual(tournamentOgFacts(sngNoStack), [
        { label: 'BUY-IN', value: '55 Chips' },
        { label: 'SEATS', value: '6 Players' },
        { label: 'STARTS', value: 'When Full (6 Players)' },
    ]);

    const sngNoMax = cleanTournamentPreview({
        name: 'Heads-Up SNG',
        game: 'NLH',
        format: 'SNG',
        status: 'REGISTERING',
        startTime: '2026-11-22T18:00:00Z',
        buyIn: 25,
    });
    assert.equal(seatStartWords(sngNoMax), 'When Full');
    assert.doesNotMatch(tournamentPreviewText(sngNoMax).description, /\bAM CT\b|\bPM CT\b/);
    assert.deepEqual(tournamentLandingFacts(sngNoMax), [
        ['Buy-In', '25 Chips'],
        ['Starts', 'When Full'],
        ['Status', 'Registration Open'],
    ]);
    assert.equal(statusWords({ format: 'spin', status: 'RUNNING', startTime: '2026-11-22T15:00:00Z', lateRegMinutes: 30 }, Date.parse('2026-11-22T15:05:00Z')), 'Running Now');

    // Scheduled MTT retains its exact Chicago start time and guarantee.
    const mtt = cleanTournamentPreview({
        name: 'Sunday Major 50K',
        game: 'NLH',
        format: 'freezeout',
        status: 'REGISTERING',
        startTime: '2026-11-22T20:00:00Z',
        buyIn: 100,
        fee: 10,
        guarantee: 50000,
        club: 'Midway Union',
    });
    assert.deepEqual(tournamentLandingFacts(mtt), [
        ['Buy-In', '110 Chips'],
        ['Guarantee', '50,000 Chips'],
        ['Starts', 'Sun Nov 22, 2:00 PM CT'],
        ['Status', 'Registration Open'],
    ]);
    assert.deepEqual(tournamentOgFacts(mtt), [
        { label: 'BUY-IN', value: '110 Chips' },
        { label: 'GUARANTEE', value: '50,000 Chips' },
        { label: 'STARTS', value: 'Sun Nov 22, 2:00 PM CT' },
    ]);
});

test('Free To Play disclaimer is removed and 3D metallic assets are wired on /t/[id], /g/[id], and /l/[id]', () => {
    for (const pagePath of ['pages/t/[id].js', 'pages/g/[id].js', 'pages/l/[id].js']) {
        const page = read(pagePath);
        assert.doesNotMatch(page, /Free To Play\. No Real-Money Gambling\./i, `${pagePath} must not show Free To Play disclaimer`);
        assert.doesNotMatch(page, /Free To Play/i, `${pagePath} must not contain Free To Play`);
        assert.doesNotMatch(page, /No Real-Money Gambling/i, `${pagePath} must not contain No Real-Money Gambling`);
        assert.match(page, /sharedArenaCardStyles/, `${pagePath} must use 3D sharedArenaCardStyles`);
    }
    const tournamentPage = read('pages/t/[id].js');
    const cardStyles = read('src/lib/sharedArenaCardStyles.js');
    assert.match(tournamentPage, /tournamentLandingFacts/);
    assert.match(cardStyles, /\/images\/og\/club-arena-landing-bg\.jpg/);
});

test('defensive seat-based detection covers all Spins, SNGs, and 6/9-max SNG satellites without misclassifying scheduled MTTs', () => {
    const now = Date.parse('2026-11-22T15:00:00Z');
    const clockRe = /\b(?:AM|PM)\b|\bCT\b/;

    const seatBasedCases = [
        { name: '100 Chip Spin PLO4', game: 'PLO4', format: 'spin', maxPlayers: 3, buyIn: 100, startingChips: 500 },
        { name: '50 Chip Spin NLH', game: 'NLH', format: 'SPIN', maxPlayers: 3, buyIn: 50, startingChips: 500 },
        { name: 'Heads-Up NLH SNG', game: 'NLH', format: 'sng', maxPlayers: 2, buyIn: 25, startingChips: 1500 },
        { name: 'Heads-Up PLO4 SNG', game: 'PLO4', format: 'SNG', maxPlayers: 2, buyIn: 25 },
        { name: '6-Max NLH Sit & Go', game: 'NLH', format: 'sng', maxPlayers: 6, buyIn: 50, fee: 5 },
        { name: '9-Max NLH Sit & Go', game: 'NLH', format: 'sit_and_go', maxPlayers: 9, buyIn: 20, fee: 2 },
        { name: '6-Max Mega Satellite', game: 'NLH', format: 'sng_satellite', maxPlayers: 6, buyIn: 30, fee: 3, startingChips: 2000 },
        { name: '6-Max Satellite Into Main', game: 'NLH', format: 'satellite', maxPlayers: 6, buyIn: 30, fee: 3, startingChips: 2000 },
        { name: 'Satellite Into Sunday Funday Mini Main Event', game: 'NLH', format: 'satellite', maxPlayers: 9, buyIn: 50, fee: 5, startingChips: 3000 },
        { name: 'Satellite Into High Roller', game: 'PLO4', format: 'SATELLITE', maxPlayers: 9, buyIn: 100, fee: 10 },
        { name: '100 Chip Spin PLO5', game: 'PLO5', format: '', maxPlayers: 3, buyIn: 100, startingChips: 500 },
        { name: 'Heads-Up Turbo Match', game: 'NLH', format: 'freezeout', maxPlayers: 2, buyIn: 50 },
        { name: 'Sit & Go 9-Max Turbo', game: 'NLH', format: '', maxPlayers: 9, buyIn: 20 },
    ];

    for (const raw of seatBasedCases) {
        const preview = cleanTournamentPreview({
            ...raw,
            status: 'REGISTERING',
            startTime: '2026-11-23T04:30:00Z',
            guarantee: null,
            club: 'Midway Union',
        });
        assert.equal(isSeatBasedTournament(preview), true, `Expected seat-based for ${raw.name} (${raw.format}, max=${raw.maxPlayers})`);

        const landing = tournamentLandingFacts(preview, now);
        const ogFacts = tournamentOgFacts(preview, now);
        const meta = tournamentPreviewText(preview, now);

        for (const [label, value] of landing) {
            assert.doesNotMatch(value, clockRe, `Landing fact ${label} leaked clock time for ${raw.name}: ${value}`);
            assert.notEqual(`${label}:${value}`, 'Guarantee:None', `Landing leaked Guarantee: None for ${raw.name}`);
        }
        for (const fact of ogFacts) {
            assert.doesNotMatch(fact.value, clockRe, `OG fact ${fact.label} leaked clock time for ${raw.name}: ${fact.value}`);
            assert.notEqual(`${fact.label}:${fact.value}`, 'GUARANTEE:None', `OG leaked Guarantee: None for ${raw.name}`);
        }
        assert.doesNotMatch(meta.description, clockRe, `Preview description leaked clock time for ${raw.name}: ${meta.description}`);
        assert.doesNotMatch(meta.description, /Guarantee:\s*None/i, `Preview description leaked Guarantee: None for ${raw.name}`);
    }

    // Scheduled MTTs and scheduled MTT satellites MUST stay scheduled and preserve Chicago start timestamps.
    const scheduledCases = [
        { name: 'Sunday Major 50K', game: 'NLH', format: 'freezeout', maxPlayers: null, guarantee: 50000 },
        { name: 'Mega Satellite Into Sunday Major', game: 'NLH', format: 'satellite', maxPlayers: null },
        { name: 'Sunday Funday MTT Satellite', game: 'NLH', format: 'satellite', maxPlayers: 500 },
        { name: '10-Seat Scheduled Satellite', game: 'NLH', format: 'satellite', maxPlayers: 10 },
        { name: 'Sunday Spin-Off Championship MTT', game: 'NLH', format: 'freezeout', maxPlayers: 500 },
        { name: 'Heads-Up Bracket Championship MTT', game: 'NLH', format: 'freezeout', maxPlayers: 128 },
    ];

    for (const raw of scheduledCases) {
        const preview = cleanTournamentPreview({
            ...raw,
            status: 'REGISTERING',
            startTime: '2026-11-23T04:30:00Z',
            buyIn: 100,
            fee: 10,
            club: 'Midway Union',
        });
        assert.equal(isSeatBasedTournament(preview), false, `Expected scheduled MTT for ${raw.name} (${raw.format}, max=${raw.maxPlayers})`);

        const landing = tournamentLandingFacts(preview, now);
        const ogFacts = tournamentOgFacts(preview, now);
        const meta = tournamentPreviewText(preview, now);

        const landingStarts = landing.find(([label]) => label === 'Starts')?.[1] || '';
        const ogStarts = ogFacts.find(f => f.label === 'STARTS')?.value || '';
        assert.equal(landingStarts, 'Sun Nov 22, 10:30 PM CT', `Expected Chicago start time in landing facts for ${raw.name}`);
        assert.equal(ogStarts, 'Sun Nov 22, 10:30 PM CT', `Expected Chicago start time in OG facts for ${raw.name}`);
        assert.match(meta.description, /Sun Nov 22, 10:30 PM CT/, `Expected Chicago start time in meta for ${raw.name}`);
    }
});

test('OG header typography safely caps title size (<= 36px for 36+ chars), subtitles, and fact values against overflow', () => {
    const longSat = 'Satellite Into Sunday Funday Mini Main Event';
    assert.equal(longSat.length, 44);
    const satFit = fitOgTitle(longSat);
    assert.equal(satFit.text, longSat, '44-char satellite title must fit intact without truncation');
    assert.ok(satFit.fontSize <= 36, `Expected <= 36px for 44-char title, got ${satFit.fontSize}`);

    const thirtySix = 'Sunday Funday Mini Main Event Turbo!';
    assert.equal(thirtySix.length, 36);
    assert.ok(fitOgTitle(thirtySix).fontSize <= 36, '36-char title must cap at <= 36px');

    const allCapsLong = 'SUNDAY FUNDAY CHAMPIONSHIP SUPER HIGH ROLLER EVENT';
    const capsFit = fitOgTitle(allCapsLong);
    assert.ok(capsFit.text.length <= 48, 'Titles > 48 chars must truncate cleanly');
    assert.ok(capsFit.fontSize <= 32, `ALL-CAPS long title must step down cleanly, got ${capsFit.fontSize}`);

    const longSub = fitOgSubtitle('PLO5 Mystery Bounty  |  Midway Championship High Stakes Poker Union Of Chicago');
    assert.ok(longSub.text.length <= 64, 'Long subtitle must truncate cleanly');
    assert.ok(longSub.fontSize <= 20, `Long subtitle must step down cleanly, got ${longSub.fontSize}`);

    const seatStartFit = fitOgFactValue('When Full (9 Players)');
    assert.ok(seatStartFit.fontSize <= 20, `When Full (9 Players) must fit on 1 line, got ${seatStartFit.fontSize}`);
    assert.equal(seatStartFit.singleLine, true);

    const mttStartFit = fitOgFactValue('Sun Nov 22, 10:30 PM CT');
    assert.ok(mttStartFit.fontSize <= 20, `Chicago timestamp must fit on 1 line, got ${mttStartFit.fontSize}`);
    assert.equal(mttStartFit.singleLine, true);
});

// Daily Operations Digest: rendering, admin recipients and the signed view link.
// Run: node --test __tests__/daily-digest.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHtml, buildSubject, buildText, esc, trendBars, priorAverage, sectionRows, shortTitle, SECTION_DEFS, horseRosterRows, allowedNumbers, playerTotalsRows, fmtSigned, fmtMinutes } from '../src/lib/dailyDigest/render.mjs';
import { signViewToken, verifyViewToken, ownerPhone, digestRecipients, adminRecipients } from '../src/lib/dailyDigest/delivery.mjs';

function fixture(overrides = {}) {
    return {
        day: '2026-10-14',
        day_label: 'Wednesday, Oct 14',
        metrics: {
            day: '2026-10-14',
            window: { start: '2026-10-14T05:00:00+00:00', end: '2026-10-15T05:00:00+00:00' },
            growth: { signups: 3, signups_phone_verified: 1, signups_email_confirmed: 2, active_humans: 32, active_horses: 146, humans_total: 185,
                funnel_30d: { signed_up: 9, email_confirmed: 7, phone_verified: 2, joined_club: 5, played_hand: 4 },
                retention: { d1: { cohort: 2, returned: 1 }, d7: { cohort: 0, returned: 0 }, d30: { cohort: 1, returned: 1 } } },
            money: { cash_rake: 73222.58, tournament_rake: 21698.42, rake_paid_by_humans: 82.57, rake_paid_by_horses: 73140.01, supply_unexplained: 0,
                rake_by_club: [{ club: 'Shark Club', rake: 50000 }], top_human_rakers: [{ username: 'KingFish', rake: 82.57 }] },
            diamonds: { given_out: 138518, taken_in: 9100, net_issued: 129418, given_by_source: { daily_challenge_claim: 111933, daily_mission_milestone: 24300 },
                taken_by_sink: { wheel_spin: 5100, diamond_game: 4000 }, big_movements: [{ username: 'danimal', type: 'transfer', amount: 42080, at_ct: '03:12 PM' }],
                circulation: 1000000, circulation_usd: 10000 },
            sales: { revenue_usd: 0, diamond_packages: { count: 0, usd: 0 }, vip_new: { count: 0, usd: 0 }, vip_lifetime: { count: 0, usd: 0 }, merch: { count: 0, usd: 0 }, refunds_usd: 0, disputes: 0 },
            play: { hands: 287809, hands_cash: 250000, hands_tournament: 37809, tournaments_started: { SPIN: 4000 }, tournaments_completed: { SPIN: 3990, SNG: 1100 }, horse_fleet: { avg_seated: 800, max_seated: 820 } },
            agents: { cashouts_requested: { count: 0 }, agent_credit_invoices: 0, invoices_issued: {} },
            health: { breaks: { total: 24, passed: 24 }, deploys: { attempted: 5, shipped: 3 }, alerts_new: { critical: 122, warning: 56 }, client_errors: 804, db_timeouts: 316,
                alerts_top: [{ alertname: 'GameServer.tournament_dark_after_rebuild', severity: 'critical', n: 122 }], client_errors_top: [{ k: '57014', n: 316 }], crashes: 0, push: { sent: 10, failed: 0 } },
            engagement: { challenges_claimed: 4569 },
            security: { admin_ids: ['a', 'b'], admins: { a: 'dan', b: 'ops' } },
            capacity: { db_size_gb: 120.5, connections: 140, cache_hit_pct: 99.1 },
            freshness: { chip_ledger: '2026-10-15T05:14:00Z' },
        },
        prev: { growth: { signups: 1, active_humans: 30 }, money: { cash_rake: 60000 } },
        series: { cash_rake: [{ day: '2026-10-12', v: 50000 }, { day: '2026-10-13', v: 60000 }, { day: '2026-10-14', v: 73222.58 }] },
        mtd: { days: 14, revenue_usd: 0, cash_rake: 500000, tournament_rake: 100000, projected_revenue_usd: 0, projected_rake: 1328571.43, signups: 9, horse_net_bb: -120.5 },
        week: null,
        attention: [
            { rule: 'deploy_failed', severity: 'warning', title: '2 engine deploy attempts did not ship', status: 'fixed', resolution: 'Retried at :55' },
            { rule: 'critical_alert_rising', severity: 'critical', title: '<script>x</script> fired 122 times', status: 'not_picked_up' },
            { rule: 'drift_past_deadline', severity: 'warning', title: '53 drift incidents are open past their deadline', status: 'tracked' },
        ],
        attention_status: { fixed: 1, in_progress: 0, not_picked_up: 1, tracked: 1 },
        generated_at: '2026-10-15T12:00:00Z',
        ...overrides,
    };
}

test('subject carries attention count, signups, rake and sales', () => {
    const s = buildSubject(fixture());
    assert.equal(s, '[3 Need Attention] Smarter.Poker Daily Digest - 3 Signups, 94,921 Rake, $0.00 Sales (Oct 14)');
    assert.ok(!buildSubject(fixture({ attention: [] })).startsWith('['));
});

test('html renders every section, escapes untrusted text, has no em dashes', () => {
    const html = buildHtml(fixture(), { viewUrl: 'https://smarter.poker/api/digest/view?t=x' });
    for (const def of SECTION_DEFS) assert.ok(html.includes(esc(def.title)), def.title);
    assert.ok(html.includes('Needs Your Attention (3)'));
    assert.ok(html.includes('Recorded Alert; Assignment Unconfirmed'));
    assert.ok(html.includes('Resolved Or Reviewed'));
    assert.ok(html.includes('Not Yet Picked Up'));
    assert.ok(!html.includes('<script>x</script>'), 'attention titles are escaped');
    assert.ok(html.includes('&lt;script&gt;'));
    assert.ok(html.includes('Open The Admin Dashboard'));
    assert.ok(html.includes('View This Digest Online'));
    assert.ok(html.includes('Month To Date'));
    assert.ok(html.includes('Whale Watch'));
    assert.ok(html.includes('Diamond Movements Over 10,000'));
    assert.ok(!html.includes('—'), 'no em dashes');
    assert.ok(html.length < 102000, 'stays under the Gmail clipping size');
});

test('clean day says nothing needs attention', () => {
    const html = buildHtml(fixture({ attention: [], attention_status: { fixed: 0, in_progress: 0, not_picked_up: 0 } }));
    assert.ok(html.includes('Nothing needs your attention.'));
});

test('monday edition adds the week card', () => {
    const html = buildHtml(fixture({ week: { from: '2026-10-05', to: '2026-10-11', revenue_usd: 12.5, hands: 1000 } }));
    assert.ok(html.includes('Week In Review (2026-10-05 To 2026-10-11)'));
});

test('rows compare with the prior day and the 7 day average', () => {
    const rows = sectionRows(SECTION_DEFS.find((d) => d.title === 'Money'), fixture());
    const cash = rows.find((r) => r.label === 'Cash Game Rake');
    assert.equal(cash.value, '73,222.58');
    assert.match(cash.sub, /\+13,223 vs prior day/);
    assert.match(cash.sub, /7 day avg 55,000/);
    assert.ok(cash.bars.includes('<table'));
    assert.equal(priorAverage(fixture(), 'cash_rake'), 55000);
    assert.equal(trendBars([{ v: 1 }]), '');
});

test('red only where a rule fires', () => {
    const rows = sectionRows(SECTION_DEFS.find((d) => d.title === 'Money'), fixture({ metrics: { ...fixture().metrics, money: { ...fixture().metrics.money, supply_unexplained: 5 } } }));
    assert.equal(rows.find((r) => r.label === 'Unexplained Supply Drift').red, true);
    assert.equal(rows.find((r) => r.label === 'Cash Game Rake').red, false);
});

test('plain text version lists attention and sections', () => {
    const t = buildText(fixture());
    assert.match(t, /NEEDS YOUR ATTENTION \(3\)/);
    assert.match(t, /Cash Game Rake: 73,222.58/);
});

test('signed view link verifies, expires and refuses tampering', () => {
    process.env.CRON_SECRET = 'test-secret-value-123';
    const t = signViewToken('2026-10-14', 45, Date.parse('2026-10-15T12:00:00Z'));
    assert.equal(verifyViewToken(t, Date.parse('2026-10-20T00:00:00Z')), '2026-10-14');
    assert.equal(verifyViewToken(t, Date.parse('2026-12-31T00:00:00Z')), null, 'expired');
    assert.equal(verifyViewToken(t.replace('2026-10-14', '2026-10-13'), Date.parse('2026-10-20T00:00:00Z')), null, 'other day');
    assert.equal(verifyViewToken('garbage'), null);
});

test('recipient and phone defaults', () => {
    delete process.env.DAILY_DIGEST_TO;
    assert.deepEqual(digestRecipients(), [], 'no literal fallback recipient');
    process.env.DAILY_DIGEST_TO = 'owner@example.test, second@example.test';
    assert.deepEqual(digestRecipients(), ['owner@example.test', 'second@example.test']);
    process.env.MY_PHONE_NUMBER = '(708) 555-0101\n';
    delete process.env.DIGEST_ALERT_PHONE;
    assert.equal(ownerPhone(), '+17085550101');
});

test('long grouped attention titles end at a complete item', () => {
    const long = '9 critical alert types are new this week or doubled: ' + Array.from({ length: 12 }, (_, i) => `AlertName${i} (41, 10 the day before)`).join('; ');
    const s = shortTitle(long);
    assert.ok(s.length <= 270);
    assert.ok(s.endsWith(' and more'));
    assert.ok(!/befo and more$/.test(s));
    assert.equal(shortTitle('short'), 'short');
});

test('admins come from the database, like the Pep Nation Lab digest; the env list is only a fallback', async () => {
    const users = { a1: 'admin-one@example.test', a2: null };
    const fakeSb = (rows) => ({
        from: () => ({ select: () => ({ eq: () => ({ limit: async () => ({ data: rows }) }) }) }),
        auth: { admin: { getUserById: async (id) => ({ data: { user: users[id] ? { email: users[id] } : null } }) } },
    });
    process.env.DAILY_DIGEST_TO = 'fallback@example.test';
    const got = await adminRecipients(fakeSb([{ id: 'a1', full_name: 'Admin One' }, { id: 'a2', username: 'noemail' }]));
    assert.deepEqual(got, [{ id: 'a1', name: 'Admin One', email: 'admin-one@example.test' }], 'admins without an email are skipped');
    const none = await adminRecipients(fakeSb([]));
    assert.deepEqual(none, [{ id: null, name: 'Admin', email: 'fallback@example.test' }]);
    delete process.env.DAILY_DIGEST_TO;
});

test('the digest is straight data: no AI module, no model call', async () => {
    const fs = await import('node:fs');
    assert.ok(!fs.existsSync(new URL('../src/lib/dailyDigest/aiSummary.mjs', import.meta.url)));
    const src = fs.readFileSync(new URL('../src/lib/dailyDigest/assemble.mjs', import.meta.url), 'utf8');
    assert.ok(!/anthropic|grok|openai/i.test(src));
    assert.ok(!buildHtml(fixture()).includes('Daniel'), 'no personal name is baked into the template');
});

const ROSTER = {
    as_of: '2026-10-14T21:15:00+00:00', size: 43, demand: 43, plo_count: 2, refreshes_today: 4,
    members: [
        { rank: 1, name: 'Ace<Horse>', bb100: 12.34, hands: 15000, plo: true, plo_bb100: 6.5 },
        { rank: 2, name: 'Cash Cow', bb100: 3.1, hands: 9000, plo: false, plo_bb100: null },
    ],
    added: ['Cash Cow'], dropped: ['Old Timer'], plo_added: [], plo_dropped: ['Fishy'],
};

test('horse roster card: size, PLO list, changes and every member, escaped', () => {
    const d = fixture({ horse_roster: ROSTER });
    const html = buildHtml(d);
    assert.match(html, /Horse Roster/);
    assert.match(html, /Horses At Cash/);
    assert.match(html, /Sized to 43 live cash games/);
    assert.match(html, /PLO List/);
    assert.match(html, /Old Timer/);
    assert.match(html, /Fishy/);
    assert.match(html, /1\. Ace&lt;Horse&gt;/);
    assert.ok(!html.includes('Ace<Horse>'));
    assert.match(html, /PLO 6\.5 BB\/100/);
    assert.ok(!html.includes('\u2014'));
    const rows = horseRosterRows(d);
    assert.equal(rows.length, 6 + 2);
    assert.equal(rows.find((r) => r[0] === 'Added To The PLO List')[1], 'None');
    const text = buildText(d);
    assert.match(text, /HORSE ROSTER/);
    assert.match(text, /2\. Cash Cow: 3\.1 BB\/100/);
    const nums = allowedNumbers(d);
    for (const n of ['43', '35', '50', '12.34', '15000']) assert.ok(nums.has(n), n);
});

test('no roster in the digest: no card, no text section, nothing breaks', () => {
    const d = fixture();
    assert.ok(!buildHtml(d).includes('Horse Roster'));
    assert.ok(!buildText(d).includes('HORSE ROSTER'));
    assert.deepEqual(horseRosterRows(fixture({ horse_roster: null })), []);
});

 test('attention never promises a fleet or infers assignment from a recorded alert', () => {
    for (const rendered of [buildHtml(fixture()), buildText(fixture())]) {
        assert.doesNotMatch(rendered, /alert-fixing fleet|fleet queue|fixed overnight/i);
        assert.match(rendered, /Recorded Alert; Assignment Unconfirmed/);
    }
});

test('review and investigation labels do not promise that a repair was completed', () => {
    const d = fixture({ attention: [
        { title: 'Reviewed movement', status: 'fixed', resolution: 'Verified legitimate credit' },
        { title: 'Current investigation', status: 'in_progress' },
    ] });
    for (const rendered of [buildHtml(d), buildText(d)]) {
        assert.match(rendered, /Resolved Or Reviewed/);
        assert.match(rendered, /Under Investigation/);
        assert.doesNotMatch(rendered, /Marked Fixed|Being Fixed|marked fixed/);
        assert.match(rendered, /Verified legitimate credit/);
    }
});

test('the signed view link precedes a long roster that Gmail clips', () => {
    const members = Array.from({ length: 938 }, (_, i) => ({ rank: i + 1, name: `Horse ${i + 1}`, bb100: 1, hands: 5000 }));
    const d = fixture({ horse_roster: { ...ROSTER, members } });
    const url = 'https://smarter.poker/api/digest/view?t=test&day=24';
    const html = buildHtml(d, { viewUrl: url });
    assert.ok(html.length > 102000, 'reproduces the clipped long-email case');
    assert.ok(html.indexOf('View This Digest Online') < html.indexOf('Needs Your Attention'));
    assert.ok(html.includes('Horse 938'), 'the full roster is retained');
    assert.ok(html.includes('t=test&amp;day=24'), 'the signed URL is escaped');
    const text = buildText(d, { viewUrl: url });
    assert.ok(text.indexOf(`View online: ${url}`) < text.indexOf('NEEDS YOUR ATTENTION'));
    assert.ok(text.includes('Horse 938'));
});

const PLAYER_TOTALS = {
    day: '2026-10-24',
    totals: { players: 2, net: 1381.81, cash_net: 1491.81, tournament_net: -110, diamond_arena_net: -106, cash_rake: 723.88,
        tournament_rake: 6.18, diamond_arena_rake: 0, hands: 915, minutes: 942, wallet_end: 479.9 },
    players: [
        { username: 'Woo<Woo>', net: 1481.81, cash_net: 1481.81, tournament_net: 0, cash_rake: 723.88, tournament_rake: 0,
            hands: 782, minutes: 822, wallet_end: 479.9, diamonds_end: 275,
            games: [
                { kind: 'cash', label: 'PLO5 1/2', hands: 362, net: 1233.6, rake: 459.37, minutes: 473 },
                { kind: 'cash', label: 'NLH 1/2', hands: 53, net: -190.7, rake: 28.48, minutes: 55 },
            ] },
        { username: 'badbeets', net: -100, cash_net: 0, tournament_net: -100, cash_rake: 0, tournament_rake: 6.18,
            hands: 133, minutes: 120, wallet_end: 0, diamonds_end: 5,
            games: [
                { kind: 'tournament', label: 'Nightly 10K (NLH)', type: 'MTT', entries: 2, hands: 93, net: -70, rake: 4.07, minutes: 87 },
                { kind: 'diamond_arena', label: 'NLH 1/2', hands: 42, net: -106, rake: 0, minutes: 32 },
            ] },
    ],
};

test('real player totals: day totals, rake split, balances, time and every game per player', () => {
    const d = fixture({ player_totals: PLAYER_TOTALS });
    const html = buildHtml(d);
    assert.match(html, /Real Player Totals/);
    assert.match(html, /Real Players Who Played/);
    assert.match(html, /Rake Paid - Cash Games/);
    assert.match(html, /723\.88/);
    assert.match(html, /Rake Paid - Tournaments/);
    assert.match(html, /Woo&lt;Woo&gt;/);
    assert.ok(!html.includes('Woo<Woo>'), 'player names are escaped');
    assert.match(html, /\+1,481\.81/);
    assert.match(html, /13h 42m played, 782 hands/);
    assert.match(html, /479\.9 chips/);
    assert.match(html, /275 diamonds/);
    assert.match(html, /PLO5 1\/2 Cash/);
    assert.match(html, /-190\.7/);
    assert.match(html, /Nightly 10K \(NLH\) \(MTT\) x2/);
    assert.match(html, /Diamond Arena NLH 1\/2 \(Diamonds\)/);
    assert.match(html, /Diamond Arena Won \/ Lost \(Diamonds\)/);
    assert.ok(html.indexOf('Real Player Totals') < html.indexOf('Growth'), 'near the top, before the sections');
    assert.ok(!html.includes('\u2014'));
    const text = buildText(d);
    assert.match(text, /REAL PLAYER TOTALS/);
    assert.match(text, /Woo<Woo>: \+1,481\.81  \(13h 42m played, 782 hands\)/);
    assert.match(text, /- PLO5 1\/2 Cash: \+1,233\.6  \(362 hands, 7h 53m, rake 459\.37\)/);
    assert.match(text, /Balances At End Of Day: 0 chips  \(5 diamonds\)/);
    assert.equal(playerTotalsRows(d).players.length, 2);
});

test('real player totals: absent means no card, an error says so plainly, an empty day says nobody played', () => {
    const d = fixture();
    assert.ok(!buildHtml(d).includes('Real Player Totals'));
    assert.ok(!buildText(d).includes('REAL PLAYER TOTALS'));
    assert.equal(playerTotalsRows(d), null);
    const broken = fixture({ player_totals: { day: '2026-10-24', error: 'canceling statement due to <timeout>' } });
    assert.match(buildHtml(broken), /Player totals could not be built/);
    assert.match(buildHtml(broken), /&lt;timeout&gt;/);
    assert.match(buildText(broken), /Player totals could not be built: canceling statement/);
    const empty = fixture({ player_totals: { day: '2026-10-24', totals: { players: 0 }, players: [] } });
    assert.match(buildHtml(empty), /No real player played a hand or a tournament/);
});

test('signed results and durations read the way a person says them', () => {
    assert.equal(fmtSigned(1233.6), '+1,233.6');
    assert.equal(fmtSigned(-0.1), '-0.1');
    assert.equal(fmtSigned(0), '0');
    assert.equal(fmtSigned(null), '0');
    assert.equal(fmtMinutes(45), '45m');
    assert.equal(fmtMinutes(822), '13h 42m');
    assert.equal(fmtMinutes(60), '1h 00m');
});

test('the digest stays inside its 600px card: no value or sub-line can force it wider (Dan, 2026-10-26)', () => {
    // An 886-character value and long grey sub-lines were white-space:nowrap and
    // stretched the Oct 25 email to 6,300px in Gmail, labels far from numbers.
    const html = buildHtml(fixture());
    assert.ok(html.includes('max-width:600px'), 'the card keeps its 600px width');
    assert.ok(!/<td[^>]*text-align:right;white-space:nowrap;[^>]*>\s*<span[^>]*>[^<]{29,}/.test(html), 'no long value is held on one line');
    for (const m of html.matchAll(/<div style="color:[^"]*font-size:11px;margin-top:2px;([^"]*)">/g)) {
        assert.ok(m[1].includes('white-space:normal'), 'every grey sub-line can wrap');
    }
});

test('BBJ is included once in rake totals, never deducted again from net', () => {
    const p = structuredClone(PLAYER_TOTALS);
    p.totals.bbj_rake = 77.96;
    p.totals.won = 1481.81;
    p.totals.lost = 100;
    p.players[0].bbj_rake = 70;
    const d = fixture({ player_totals: p });
    const rows = playerTotalsRows(d);
    assert.deepEqual(rows.summary.find(r => r[0] === 'BBJ Rake Paid').slice(0, 2), ['BBJ Rake Paid', '77.96']);
    assert.equal(rows.summary.find(r => r[0] === 'Rake Paid - Total')[1], '808.02');
    assert.equal(rows.summary.find(r => r[0] === 'Players Net Won / Lost (Chips)')[1], '+1,381.81');
    assert.equal(rows.summary.find(r => r[0] === 'Winning Players / Losing Players')[1], '+1,481.81 / -100');
    assert.equal(rows.players[0].rows[1][1], '793.88');
    for (const output of [buildHtml(d), buildText(d)]) assert.match(output, /BBJ Rake Paid/);
    assert.equal(playerTotalsRows(fixture({ player_totals: PLAYER_TOTALS })).summary.find(r => r[0] === 'BBJ Rake Paid')[1], 'Unavailable');
});

test('email keeps all operating sections below clipping size with a full roster and player games', () => {
    const members = Array.from({ length: 1000 }, (_, i) => ({ rank: i + 1, name: `Horse ${i + 1}`, bb100: 1, hands: 5000 }));
    const players = Array.from({ length: 30 }, (_, i) => ({ ...PLAYER_TOTALS.players[0], username: `Player ${i}`, games: Array(20).fill(PLAYER_TOTALS.players[0].games[0]) }));
    const d = fixture({ horse_roster: { ...ROSTER, members }, player_totals: { ...PLAYER_TOTALS, players } });
    const opts = { email: true, viewUrl: 'https://smarter.poker/api/digest/view?t=x' };
    const html = buildHtml(d, opts);
    assert.ok(Buffer.byteLength(html) < 102000, `email bytes: ${Buffer.byteLength(html)}`);
    for (const def of SECTION_DEFS) assert.ok(html.includes(def.title), def.title);
    assert.match(html, /Full Player And Horse Details/);
    assert.ok(!html.includes('Horse 1000'));
    assert.ok(html.includes('Player 29'), 'every human stays in the email');
    assert.ok(!html.includes('PLO5 1/2 Cash'), 'per-game details are linked online');
    const online = buildHtml(d, { ...opts, email: false });
    assert.match(online, /Horse 1000/);
    assert.match(online, /Player 29/);
    assert.match(buildText(d), /Horse 1000/);
});

test('incomplete player periods are unavailable, never presented as complete totals', () => {
    const p = { ...PLAYER_TOTALS, period: {
        week: { from: '2026-10-20', to: '2026-10-26', players: 8, net: 987654, missing_days: 4 },
        month: { from: '2026-10-01', to: '2026-10-26', players: 9, net: 876543, missing_days: 20 },
    } };
    for (const output of [buildHtml(fixture({ player_totals: p })), buildText(fixture({ player_totals: p }))]) {
        assert.match(output, /missing days/);
        assert.ok(!output.includes('987,654') && !output.includes('876,543'));
    }
});

test('assembler uses the BBJ and period RPC and selects the compact email rendering', async () => {
    const { assembleDigest, loadPlayerTotals } = await import('../src/lib/dailyDigest/assemble.mjs');
    const calls = [];
    const sb = { rpc: async (name, args) => { calls.push([name, args]); return { data: name === 'fn_sp_daily_digest' ? fixture() : PLAYER_TOTALS, error: null }; } };
    const out = await assembleDigest(sb, '2026-10-26', { withCosts: false, dispatch: false });
    assert.ok(calls.some(([n]) => n === 'fn_sp_digest_player_report'));
    assert.equal(out.opts.email, true);
    assert.match(out.html, /Full Player And Horse Details/);
    assert.deepEqual(await loadPlayerTotals({ rpc: async () => ({ error: { message: 'timeout' } }) }, '2026-10-26'), { day: '2026-10-26', error: 'timeout' });
});

test('email layout fixes the card width and lets long alert identifiers wrap', () => {
    const html = buildHtml(fixture(), { email: true });
    assert.match(html, /table-layout:fixed;max-width:600px/);
    assert.match(html, /overflow-wrap:anywhere/);
    assert.match(html, /font-size:14px;color:#e7edf3;/);
});


test('spins report splits actual chips and diamonds, marks provisional profit and escapes recipients', async () => {
    const digest = fixture({ spins_spend: { spins: {
        humans: { spins: 1, diamonds_collected: 100, chips_paid: 0.25, direct_chips_paid: 0.25, profit_chip_equivalent: 0.75 },
        horses: { spins: 1, diamonds_collected: 300, chips_paid: 2, direct_chips_paid: 2, profit_chip_equivalent: 1, pending_awards: 1 },
        total: { spins: 2, diamonds_collected: 400, chips_paid: 2.25, profit_chip_equivalent: 1.75, pending_awards: 1 },
    }, spend: [{ recipient: '<Human>', recipient_kind: 'human', category: 'leaderboard_payout', from_type: 'union_wallet', to_type: 'player_wallet', amount: 5, transactions: 1 },
    { recipient: 'Bank', recipient_kind: 'internal', category: 'promo', from_type: 'bbj_pool', to_type: 'union_wallet', amount: 10, transactions: 1 }] } });
    for (const output of [buildHtml(digest), buildText(digest)]) {
        assert.match(output, /Diamond Spins/i);
        assert.match(output, /2.25 chips paid/);
        assert.match(output, /400 diamonds collected/);
        assert.match(output, /Provisional: 1 unsettled awards/);
        assert.match(output, /Promo And Leaderboard Player Payouts/i);
        assert.match(output, /Promo And Setup Internal Movements/i);
    }
    assert.match(buildHtml(digest), /&lt;Human&gt;/);
    assert.ok(!buildHtml(digest).includes('<Human>'));
    const { loadSpinsSpend } = await import('../src/lib/dailyDigest/assemble.mjs');
    assert.deepEqual(await loadSpinsSpend({ rpc: async () => ({ error: { message: 'timeout' } }) }, '2026-10-27'), { day: '2026-10-27', error: 'timeout' });
    assert.match(buildText(fixture({ spins_spend: { error: 'timeout' } })), /Unavailable.*timeout/);
});

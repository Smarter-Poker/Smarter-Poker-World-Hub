// Daily Operations Digest: rendering, admin recipients and the signed view link.
// Run: node --test __tests__/daily-digest.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHtml, buildSubject, buildText, esc, trendBars, priorAverage, sectionRows, shortTitle, SECTION_DEFS, horseRosterRows, allowedNumbers, playerTotalsRows, fmtSigned, fmtMinutes, signupsRows, welcomeBackRows, agentScoreboardRows } from '../src/lib/dailyDigest/render.mjs';
import { signViewToken, verifyViewToken, ownerPhone, digestRecipients, adminRecipients } from '../src/lib/dailyDigest/delivery.mjs';
import { loadAlertFixes } from '../src/lib/dailyDigest/assemble.mjs';

function alertProofFixture() {
    const item = {
        rule: 'critical_alert_rising',
        detail: { source_events: [{ alertname: 'Tournament.finish', event_ids: [12, 13] }] },
        canonical_alert_proof: { version: 1, linkage_complete: true, groups: [{
            alertname: 'Tournament.finish', event_ids: [13, 12], total: 2, reviewed: 2, verified: 1,
            proofs: [
                { event_id: 13, reviewed: true, verified: false, kind: 'historical', reference: null },
                { event_id: 12, reviewed: true, verified: true, kind: 'terminal_receipt', reference: 'terminal receipt 123' },
            ], fixes: ['terminal receipt 123'],
        }] },
    };
    return { attention: [item] };
}

test('canonical original receipts reach the per-type fixes without legacy label reads', async () => {
    const digest = alertProofFixture();
    await loadAlertFixes({ from() { assert.fail('canonical proof must use the server evidence'); } }, digest);
    assert.deepEqual(digest.attention[0].fixes, [{ alertname: 'Tournament.finish', total: 2, verified: 1, fixes: ['terminal receipt 123'] }]);
    const rendered = fixture({ attention: [{ ...digest.attention[0], title: 'Critical tournament alerts' }] });
    assert.match(buildText(rendered), /Tournament\.finish: 1 of 2 verified fixed/);
    assert.match(buildHtml(rendered), /terminal receipt 123/);
});

test('malformed or mismatched canonical proof cannot elevate fixes through labels', async () => {
    const mutations = [
        (p) => { p.version = 2; },
        (p) => { p.linkage_complete = false; },
        (p) => { p.groups[0].event_ids = [12, 14]; },
        (p) => { p.groups[0].proofs[0].event_id = 12; },
        (p) => { p.groups[0].verified = 2; },
        (p) => { p.groups[0].proofs[1].reviewed = false; },
        (p) => { p.groups[0].proofs[1].reference = null; },
        (p) => { p.groups[0].fixes = ['unrelated repair']; },
        (p) => { p.groups[0].alertname = 'Other.alert'; },
        (p) => { p.groups[0].event_ids[0] = '1e3'; },
    ];
    for (const mutate of mutations) {
        const digest = alertProofFixture();
        mutate(digest.attention[0].canonical_alert_proof);
        await loadAlertFixes({ from() { assert.fail('invalid canonical proof must stay unverified'); } }, digest);
        assert.equal(digest.attention[0].fixes[0].verified, 0);
        assert.match(digest.attention[0].canonical_alert_proof_error, /incomplete or inconsistent/);
    }
});

test('an older database retains the existing verified-label fallback', async () => {
    const digest = alertProofFixture();
    delete digest.attention[0].canonical_alert_proof;
    const sb = { from() { return { select() { return { async in() { return { data: [
        { id: 12, investigation_status: 'verified_fixed', investigation: { fixing_pr: 'PR 9' } },
        { id: 13, investigation_status: 'historical', investigation: {} },
    ] }; } }; } }; } };
    await loadAlertFixes(sb, digest);
    assert.deepEqual(digest.attention[0].fixes, [{ alertname: 'Tournament.finish', total: 2, verified: 1, fixes: ['PR 9'] }]);
});

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
    assert.ok(html.includes('Daily Update'));
    assert.ok(html.includes('Weekly Update'));
    assert.ok(html.includes('Monthly Update'));
    assert.ok(html.indexOf('Needs Your Attention (3)') < html.indexOf('Daily Update'));
    assert.ok(html.indexOf('Daily Update') < html.indexOf('Weekly Update'));
    assert.ok(html.indexOf('Weekly Update') < html.indexOf('Monthly Update'));
    assert.ok(html.includes('Whale Watch'));
    assert.ok(html.includes('Diamond Movements Over 10,000'));
    assert.ok(!html.includes('—'), 'no em dashes');
    assert.ok(html.length < 102000, 'stays under the Gmail clipping size');
});

test('clean day says nothing needs attention', () => {
    const html = buildHtml(fixture({ attention: [], attention_status: { fixed: 0, in_progress: 0, not_picked_up: 0 } }));
    assert.ok(html.includes('Nothing needs your attention.'));
});

test('daily, weekly and monthly updates render directly under needs your attention in both html and text', () => {
    const d = fixture({ week: { from: '2026-10-08', to: '2026-10-14', revenue_usd: 12.5, cash_rake: 300000, tournament_rake: 80000, signups: 14, hands: 1000, diamonds_given: 500, diamonds_taken: 100, minted: 200, burned: 50 } });
    const html = buildHtml(d);
    assert.ok(html.includes('Daily Update'));
    assert.ok(html.includes('Weekly Update'));
    assert.ok(html.includes('Monthly Update'));
    assert.ok(html.includes('2026-10-08 To 2026-10-14'));
    assert.ok(html.indexOf('Needs Your Attention (3)') < html.indexOf('Daily Update'));
    assert.ok(html.indexOf('Daily Update') < html.indexOf('Weekly Update'));
    assert.ok(html.indexOf('Weekly Update') < html.indexOf('Monthly Update'));
    const text = buildText(d);
    assert.ok(text.indexOf('NEEDS YOUR ATTENTION (3)') < text.indexOf('DAILY UPDATE'));
    assert.ok(text.indexOf('DAILY UPDATE') < text.indexOf('WEEKLY UPDATE'));
    assert.ok(text.indexOf('WEEKLY UPDATE') < text.indexOf('MONTHLY UPDATE'));
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

test('phase 4 tiles: new health and security metrics render, flag red where a rule fires', () => {
    const base = fixture().metrics;
    const d = fixture({ metrics: { ...base,
        health: { ...base.health, breaks: { total: 24, passed: 23, gate_opened: 22 }, alerts_new: { ...base.health.alerts_new, critical_distinct: 4 },
            financial_alerts_open_actionable: 2, tournaments_stuck_running: 1, tournaments_past_start_registering: 3,
            engine_restarts_outside_break: 2, drift_open_manual_needed: 5, client_errors_distinct_users: 17, client_errors_top_share: 0.4167 },
        security: { ...base.security, login_probe_failures: 0, recovery_probe_failures: 1, signup_probe_failures: 2, trigger_audit_failures: 3 } } });
    const health = sectionRows(SECTION_DEFS.find((x) => x.title === 'Platform Health'), d);
    const h = (label) => health.find((r) => r.label === label);
    assert.equal(h('Engine Breaks Passed').value, '23 of 24');
    assert.equal(h('Breaks Restartable').value, '22 of 24');
    assert.equal(h('Engine Restarts Outside A Break').value, '2');
    assert.equal(h('Engine Restarts Outside A Break').red, true);
    assert.equal(h('- Distinct Critical Alerts').value, '4');
    assert.equal(h('- Actionable').value, '2');
    assert.equal(h('Tournaments Stuck Running').red, true);
    assert.equal(h('Tournaments Past Start Still Registering').value, '3');
    assert.equal(h('Tournaments Past Start Still Registering').red, true);
    assert.equal(h('- Needing Manual Repair').value, '5');
    assert.equal(h('- Distinct Users Affected').value, '17');
    assert.equal(h('- Share From The Top Error').value, '42%');
    const sec = sectionRows(SECTION_DEFS.find((x) => x.title === 'Security'), d);
    const s = (label) => sec.find((r) => r.label === label);
    assert.equal(s('Login Probe Failures').red, false);
    for (const [label, v] of [['Recovery Probe Failures', '1'], ['Signup Probe Failures', '2'], ['Trigger Audit Failures', '3']]) {
        assert.equal(s(label).value, v, label);
        assert.equal(s(label).red, true, label);
    }
    const zero = fixture({ metrics: { ...base, health: { ...base.health, tournaments_stuck_running: 0, tournaments_past_start_registering: 0, engine_restarts_outside_break: 0 },
        security: { ...base.security, recovery_probe_failures: 0, signup_probe_failures: 0, trigger_audit_failures: 0 } } });
    for (const r of [...sectionRows(SECTION_DEFS.find((x) => x.title === 'Platform Health'), zero), ...sectionRows(SECTION_DEFS.find((x) => x.title === 'Security'), zero)]) {
        if (/Stuck Running|Past Start|Restarts Outside|Recovery Probe|Signup Probe|Trigger Audit/.test(r.label)) assert.equal(r.red, false, r.label);
    }
});

test('phase 4 tiles: an older day without the new keys shows n/a, not 0, not red, no em dash, no crash', () => {
    const d = fixture({ prev: { health: { tournaments_stuck_running: 4 } } });
    const health = sectionRows(SECTION_DEFS.find((x) => x.title === 'Platform Health'), d);
    const sec = sectionRows(SECTION_DEFS.find((x) => x.title === 'Security'), d);
    const labels = ['Breaks Restartable', 'Engine Restarts Outside A Break', '- Distinct Critical Alerts', '- Actionable', 'Tournaments Stuck Running',
        'Tournaments Past Start Still Registering', '- Needing Manual Repair', '- Distinct Users Affected', '- Share From The Top Error',
        'Recovery Probe Failures', 'Signup Probe Failures', 'Trigger Audit Failures'];
    for (const label of labels) {
        const r = [...health, ...sec].find((x) => x.label === label);
        assert.ok(r, label);
        assert.equal(r.value, 'n/a', label);
        assert.equal(r.red, false, label);
        assert.equal(r.sub, '', label);
    }
    assert.equal(health.find((r) => r.label === 'Engine Breaks Passed').value, '24 of 24', 'existing breaks tile unchanged');
    const noBreaks = fixture({ metrics: { ...fixture().metrics, health: { ...fixture().metrics.health, breaks: undefined } } });
    assert.equal(sectionRows(SECTION_DEFS.find((x) => x.title === 'Platform Health'), noBreaks).find((r) => r.label === 'Breaks Restartable').value, 'n/a');
    const html = buildHtml(d);
    assert.ok(html.includes('Trigger Audit Failures'));
    assert.ok(!html.includes('\u2014'), 'no em dashes');
    assert.match(buildText(d), /Recovery Probe Failures: n\/a/);
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
        assert.match(output, /2.25 Chips/);
        assert.match(output, /400 Diamonds/);

        assert.match(output, /Promo Player Payouts - Chips/i);
        assert.match(output, /Internal Funding Movements - Chips/i);
    }
    assert.match(buildHtml(digest), /&lt;Human&gt;/);
    const email = buildHtml(digest, { email: true });
    assert.match(email, /digest-row/);
    assert.match(email, /Total Paid/);
    assert.match(email, /5 Chips/);
    assert.match(email, /&lt;Human&gt;/);
    assert.ok(!buildHtml(digest).includes('<Human>'));
    const { loadSpinsSpend } = await import('../src/lib/dailyDigest/assemble.mjs');
    assert.deepEqual(await loadSpinsSpend({ rpc: async () => ({ error: { message: 'timeout' } }) }, '2026-10-27'), { day: '2026-10-27', error: 'timeout' });
    assert.match(buildText(fixture({ spins_spend: { error: 'timeout' } })), /Unavailable.*timeout/);
});


test('money units and promo versus leaderboard totals remain separate', async () => {
    const {spinsSpendRows} = await import('../src/lib/dailyDigest/render.mjs');
    const d=fixture({spins_spend:{spins:{total:{diamonds_collected:31297,diamonds_paid:50,chips_paid:283.13,direct_chips_paid:124.79,bonus_chips_paid:158.34,profit_chip_equivalent:29.34}},spend:[{category:'promo',to_type:'player_wallet',amount:5,recipient:'A'},{category:'leaderboard_payout',to_type:'player_wallet',amount:10,recipient:'B'}]}});
    const sections=spinsSpendRows(d);
    assert.ok(sections.find(([t])=>t==='Diamond Spins - Diamonds')[1].some(r=>r[1]==='31,247 Diamonds'));
    assert.equal(sections.find(([t])=>t==='Promo Player Payouts - Chips')[1][0][1],'5 Chips');
    assert.equal(sections.find(([t])=>t==='Leaderboard Player Payouts - Chips')[1][0][1],'10 Chips');
    assert.ok(!buildHtml(d).includes('Promo, Leaderboard And Setup Ledger Movements'));
    assert.ok(!buildHtml(d).includes('Chips Equivalent'));
});

test('a report cancelled by a statement timeout is retried after the contention passes, other errors are final', async () => {
    const { loadPlayerTotals, loadSpinsSpend, rpcWithRetry } = await import('../src/lib/dailyDigest/assemble.mjs');
    const fast = { sleep: async () => {}, delays: [1, 1] };
    let n = 0;
    const flaky = { rpc: async () => (++n < 3 ? { error: { message: 'canceling statement due to statement timeout' } } : { data: { day: 'd', ok: true }, error: null }) };
    assert.deepEqual(await loadSpinsSpend(flaky, 'd', fast), { day: 'd', ok: true });
    assert.equal(n, 3, 'two cancelled attempts, then the success');
    n = 0;
    const dead = { rpc: async () => { n++; return { error: { message: 'canceling statement due to statement timeout' } }; } };
    assert.deepEqual(await loadPlayerTotals(dead, 'd', fast), { day: 'd', error: 'canceling statement due to statement timeout' });
    assert.equal(n, 3, 'gives up after the configured retries');
    n = 0;
    const final = { rpc: async () => { n++; return { error: { message: 'permission denied' } }; } };
    await rpcWithRetry(final, 'x', {}, fast);
    assert.equal(n, 1, 'a non-timeout error is not retried');
    n = 0;
    await rpcWithRetry(dead, 'x', {}, { ...fast, delays: [50], budget: { deadline: Date.now() } });
    assert.equal(n, 1, 'no retry starts past the shared budget');
});

test('the digest is loaded once for all recipients and the reports do not race the main read', async () => {
    const { loadDigestData, renderDigest } = await import('../src/lib/dailyDigest/assemble.mjs');
    const order = [];
    let inflight = 0, maxInflight = 0;
    const sb = { rpc: async (name) => {
        order.push(name); inflight++; maxInflight = Math.max(maxInflight, inflight);
        await new Promise((r) => setTimeout(r, 5)); inflight--;
        return { data: name === 'fn_sp_daily_digest' ? fixture() : PLAYER_TOTALS, error: null };
    } };
    const data = await loadDigestData(sb, '2026-10-28', { withCosts: false, dispatch: false });
    assert.equal(maxInflight, 1, 'one database read at a time');
    assert.deepEqual(order, ['fn_sp_daily_digest', 'fn_sp_digest_player_report', 'fn_sp_digest_spins_spend', 'fn_sp_digest_signups', 'fn_sp_digest_free_buy_funding']);
    const a = renderDigest('2026-10-28', data, { recipientName: 'Ann' });
    const b = renderDigest('2026-10-28', data, { recipientName: 'Bob' });
    assert.equal(order.length, 5, 'rendering for a second admin reads nothing');
    assert.match(a.html, /Ann/); assert.match(b.html, /Bob/);
    const fs = await import('node:fs');
    const route = fs.readFileSync(new URL('../pages/api/cron/daily-digest.js', import.meta.url), 'utf8');
    assert.match(route, /loadDigestData\(sb, day\)/);
    assert.ok(!/for \(const a of admins\) \{\s*out = await assembleDigest/.test(route), 'no per-admin reload');
});

test('a delayed retry wakeup never starts a report after its deadline', async () => {
    const { rpcWithRetry } = await import('../src/lib/dailyDigest/assemble.mjs');
    let clock = 100, calls = 0;
    const originalNow = Date.now;
    Date.now = () => clock;
    try {
        const result = await rpcWithRetry({ rpc: async () => {
            calls++;
            return { error: { message: 'canceling statement due to statement timeout' } };
        } }, 'report', {}, { budget: { deadline: 200 }, delays: [10], sleep: async () => { clock = 201; } });
        assert.equal(calls, 1);
        assert.match(result.error.message, /statement timeout/);
    } finally { Date.now = originalNow; }
});

test('the signed online view executes the shared serial loader without dispatching or provider costs', async () => {
    const fs = await import('node:fs/promises');
    const { loadDigestData, loadPlayerTotals, loadSpinsSpend } = await import('../src/lib/dailyDigest/assemble.mjs');
    const source = await fs.readFile(new URL('../pages/api/digest/view.js', import.meta.url), 'utf8');
    // Execute the actual handler, replacing only module imports and external boundaries.
    const body = source.replace(/^import .*;\n/gm, '').replace('export const config =', 'const config =').replace('export default async function handler', 'return async function handler');
    const order = [];
    let inFlight = 0, maxInFlight = 0;
    const sb = { rpc: async (name, args) => {
        order.push(name);
        maxInFlight = Math.max(maxInFlight, ++inFlight);
        await new Promise(resolve => setTimeout(resolve, 1));
        inFlight--;
        if (name === 'fn_sp_daily_digest') {
            assert.equal(args.p_dispatch, false);
            return { data: fixture(), error: null };
        }
        return { data: name === 'fn_sp_digest_player_report' ? PLAYER_TOTALS : { spins: {} }, error: null };
    } };
    let options;
    const handler = new Function('createClient', 'verifyViewToken', 'viewUrlFor', 'buildHtml', 'loadDigestData', 'loadPlayerTotals', 'loadSpinsSpend', body)(
        () => sb, () => '2026-10-28', () => 'https://example.test/view', buildHtml,
        async (client, day, opts) => { options = opts; return loadDigestData(client, day, opts); }, loadPlayerTotals, loadSpinsSpend,
    );
    const oldUrl = process.env.NEXT_PUBLIC_SUPABASE_URL, oldKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.test';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'fixture-only';
    const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(n) { this.code = n; return this; }, send(v) { this.body = v; return this; } };
    try {
        await handler({ method: 'GET', query: { t: 'fixture' } }, res);
        assert.equal(maxInFlight, 1, 'online reports must not compete for the database');
        assert.deepEqual(options, { withCosts: false, dispatch: false });
        assert.deepEqual(order, ['fn_sp_daily_digest', 'fn_sp_digest_player_report', 'fn_sp_digest_spins_spend', 'fn_sp_digest_signups', 'fn_sp_digest_free_buy_funding']);
        assert.equal(res.code, 200);
        assert.equal(res.headers['Cache-Control'], 'no-store');
        assert.match(res.body, /Real Player Totals/i);
    } finally {
        if (oldUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = oldUrl;
        if (oldKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = oldKey;
    }
});

test('explicit live verification rejects wrong revisions and broken sections without sending email or exposing links', async () => {
    const { verifyDigestLive } = await import('../scripts/verify-digest-live.mjs');
    const oldSecret = process.env.CRON_SECRET;
    process.env.CRON_SECRET = 'fixture-only-secret';
    const sha = 'a'.repeat(40);
    let calls = [];
    const response = html => new Response(html, { headers: { 'content-type': 'text/html', 'cache-control': 'no-store' } });
    const fetchImpl = async (url, opts) => {
        calls.push([url, opts]);
        return url.endsWith('/api/health') ? Response.json({ version: sha, deploymentId: 'fixture' }) : response('Daily Update Weekly Update Monthly Update Real Player Totals Diamond Spins Free Buy And Guarantee Funding');
    };
    try {
        const report = await verifyDigestLive({ day: '2026-10-28', expectedSha: sha, fetchImpl });
        assert.equal(report.playerTotals, 'rendered');
        assert.equal(calls.length, 2);
        assert.ok(calls[1][0].startsWith('https://smarter.poker/api/digest/view?t='));
        assert.equal(calls[1][1].redirect, 'error');
        assert.doesNotMatch(JSON.stringify(report), /fixture-only-secret|\?t=/);
        calls = [];
        await assert.rejects(verifyDigestLive({ day: '2026-10-28', expectedSha: 'b'.repeat(40), fetchImpl }), /revision differs/);
        assert.equal(calls.length, 1, 'a wrong deployment never reads the report');
        await assert.rejects(verifyDigestLive({ day: '2026-10-28', expectedSha: sha, fetchImpl: async url =>
            url.endsWith('/api/health') ? Response.json({ version: sha }) : response('Daily Update Weekly Update Monthly Update Real Player Totals Diamond Spins Free Buy And Guarantee Funding Report Unavailable') }), /section failed/);
        await assert.rejects(verifyDigestLive({ day: '2026-10-28', expectedSha: sha, fetchImpl: async url => {
            if (url.endsWith('/api/health')) return Response.json({ version: sha });
            throw new Error(`network failure at ${url}`);
        } }), error => error.message === 'Production digest request failed');
    } finally { if (oldSecret === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = oldSecret; }
});

// New Sign-Ups and Welcome-Back Chips (Dan 2026-11-04)
const SIGNUPS = {
    day: '2026-10-14', signup_count: 3,
    signups: [
        { username: 'Luvtasuck', display_name: 'Luvtasuck', signed_up_ct: '04:00 AM', referred_by: 'phucmot', referral_code_used: '1002337', agent: 'phucmot',
          clubs: [{ club: 'KINGS CLUB', is_kings_club: true, agent: 'phucmot' }], in_kings_club: true, joined_a_club: true, hands: 30, played_hand: true, first_hand_ct: 'Oct 14 05:00 AM', phone_on_file: true, phone_verified: true, email_confirmed: true, welcome_back: null },
        { username: 'Willian', display_name: 'Willian Soares', signed_up_ct: '02:18 PM', referred_by: null, agent: null, clubs: [], in_kings_club: false, joined_a_club: false, hands: 0, played_hand: false, phone_on_file: false, phone_verified: false, email_confirmed: true, welcome_back: null },
        { username: 'Breezy', display_name: 'Breezy', signed_up_ct: '10:17 PM', referred_by: 'Probyourmom', agent: 'Probyourmom',
          clubs: [{ club: 'Club Savage', is_kings_club: false, agent: 'Probyourmom' }], in_kings_club: false, joined_a_club: true, hands: 0, played_hand: false, phone_on_file: true, phone_verified: false, email_confirmed: true, welcome_back: { status: 'awarded' } },
    ],
    welcome_back: { amount: 25, awarded_count: 1,
        awarded: [{ username: 'Breezy', display_name: 'Breezy', signed_up_ct: 'Oct 13 10:17 PM', awarded_ct: '11:00 PM', amount: 25, club: 'KINGS CLUB', push: true, push_status: 'no device', email: 'sent', text: 'no phone', played_since: false }],
        waiting_count: 2, waiting_for_club: [{ username: 'TheSAUCE' }, { username: 'PokerMogul' }],
        failed_count: 1, failed: [{ username: 'Broke', error: 'Insufficient Promo Balance', since_ct: 'Oct 14 01:17 AM' }] },
};

test('the New Sign-Ups card names every sign-up with referrer, agent and KINGS CLUB membership', () => {
    const s = signupsRows(fixture({ signups: SIGNUPS }));
    assert.equal(s.title, 'New Sign-Ups (Real Players) - 3');
    assert.equal(s.rows.length, 3);
    assert.deepEqual(s.rows[0].slice(0, 2), ['Luvtasuck', 'KINGS CLUB']);
    assert.match(s.rows[0][2], /Referred by phucmot \(code 1002337\); Agent phucmot; Signed up 04:00 AM; Played 30 hands, first Oct 14 05:00 AM; Phone verified/);
    assert.deepEqual(s.rows[1].slice(0, 2), ['Willian (Willian Soares)', 'No club yet']);
    assert.match(s.rows[1][2], /No referral; Signed up 02:18 PM; No hand played yet; No phone/);
    assert.equal(s.rows[2][1], 'Club Savage (not KINGS CLUB)');
    const pending = signupsRows(fixture({ signups: { ...SIGNUPS, signups: [{ ...SIGNUPS.signups[0], clubs: [{ club: 'KINGS CLUB', is_kings_club: true, status: 'pending' }] }] } }));
    assert.equal(pending.rows[0][1], 'KINGS CLUB (pending)');
    assert.match(s.rows[2][2], /Welcome-back chips sent/);
});

test('the Welcome-Back Chips card shows each award with its channels and who is still waiting for a club', () => {
    const w = welcomeBackRows(fixture({ signups: SIGNUPS }));
    assert.equal(w.title, 'Welcome-Back Chips (25 Free Chips, No Hand After 24 Hours) - 1');
    assert.deepEqual(w.rows[0].slice(0, 2), ['Breezy', '25 chips to KINGS CLUB']);
    assert.match(w.rows[0][2], /Push no device; Email sent; Text no phone; Still has not played/);
    const legacy = welcomeBackRows(fixture({ signups: { ...SIGNUPS, welcome_back: { ...SIGNUPS.welcome_back, awarded: [{ ...SIGNUPS.welcome_back.awarded[0], push_status: undefined }] } } }));
    assert.match(legacy.rows[0][2], /Push queued;/, 'before the push outcome shipped, a raised notification is only queued');
    assert.deepEqual(w.rows[1].slice(0, 2), ['Waiting To Join A Club', '2']);
    assert.match(w.rows[1][2], /TheSAUCE, PokerMogul/);
    assert.deepEqual(w.rows[2].slice(0, 2), ['Could Not Be Paid: Broke', 'Retrying hourly']);
    assert.match(w.rows[2][2], /Insufficient Promo Balance; first tried Oct 14 01:17 AM/);
});

test('both cards render in the email, the online view and the plain text, right after Growth', () => {
    const d = fixture({ signups: SIGNUPS });
    for (const html of [buildHtml(d, { email: true }), buildHtml(d, {})]) {
        assert.ok(html.indexOf('New Sign-Ups (Real Players) - 3') > html.indexOf('>Growth<'));
        assert.ok(html.indexOf('Welcome-Back Chips') < html.indexOf('Player Funnel'));
        assert.match(html, /Luvtasuck/);
        assert.match(html, /Referred by phucmot/);
    }
    const text = buildText(d, {});
    assert.match(text, /NEW SIGN-UPS \(REAL PLAYERS\) - 3\nLuvtasuck: KINGS CLUB  \(Referred by phucmot/);
    assert.match(text, /WELCOME-BACK CHIPS/);
});

test('a failed or missing sign-up report never stops the digest', () => {
    const broken = fixture({ signups: { day: '2026-10-14', error: 'canceling statement due to statement timeout' } });
    assert.match(buildHtml(broken, { email: true }), /Could not be built/);
    assert.equal(welcomeBackRows(broken).rows.length, 0);
    const none = fixture({ signups: { day: '2026-10-14', signups: [], welcome_back: { amount: 25, awarded: [], waiting_for_club: [] } } });
    assert.match(buildHtml(none, { email: true }), /Nobody signed up/);
    assert.match(buildHtml(none, { email: true }), /Nobody qualified/);
    assert.doesNotMatch(buildHtml(fixture(), { email: true }), /New Sign-Ups/);
});

test('loadSignups returns the report or a tagged error, never throws', async () => {
    const { loadSignups } = await import('../src/lib/dailyDigest/assemble.mjs');
    const sb = { rpc: async (name) => (name === 'fn_sp_digest_signups' ? { data: { day: '2026-10-14', signups: [] }, error: null } : { data: null, error: { message: 'wrong rpc' } }) };
    assert.deepEqual(await loadSignups(sb, '2026-10-14'), { day: '2026-10-14', signups: [] });
    const bad = { rpc: async () => { throw new Error('boom'); } };
    assert.deepEqual(await loadSignups(bad, '2026-10-14'), { day: '2026-10-14', error: 'boom' });
});

// Enhancements (Dan 2026-11-04): conversion, promo wallet runway, scoreboard, push coverage, nudges
const SIGNUPS_PLUS = { ...SIGNUPS,
    settings: { amount: 25, hours: 24, club_nudge_hours: 1, play_nudge_hours: 72 },
    conversion: { day: { awarded: 21, played: 3 }, week: { awarded: 21, played: 3 }, all: { awarded: 42, played: 10, chips: 1050 } },
    promo_wallet: { balance: 135877.93, low_threshold: 2500, low: false, welcome_back_7d_chips: 525, all_promo_7d_out: 140897.45, all_promo_7d_in: 112320.41, net_7d: -28577.04, awards_left_at_amount: 5435, days_left_at_welcome_back_pace: 1811.7, days_left_at_net_pace: 33.3 },
    agents_7d: [{ referrer: 'Probyourmom', signups: 5, joined: 5, kings_club: 5, played: 3, push_on: 0, welcome_back_paid: 1 }, { referrer: 'No referral', signups: 4, joined: 1, kings_club: 1, played: 1, push_on: 0, welcome_back_paid: 0 }],
    push_coverage: { week_signups: 19, week_with_device: 0, paid_total: 21, paid_with_device: 0 },
    nudges: { club_nudges_day: 7, play_nudges_day: 1, play_nudged_then_played: 0, play_nudged_total: 1, club_nudged_then_joined: 2, club_nudged_total: 7 },
    welcome_back: { ...SIGNUPS.welcome_back,
        awarded: [{ ...SIGNUPS.welcome_back.awarded[0], play_nudge: { at_ct: 'Oct 16 11:17 PM', email: 'sent', text: 'no phone' } }],
        waiting_for_club: [{ username: 'TheSAUCE', club_nudge: 'push no device, email sent, text no phone' }, { username: 'PokerMogul', club_nudge: 'not yet' }] } };

test('the Welcome-Back card opens with conversion, the promo wallet runway, push reach and the two nudges', () => {
    const w = welcomeBackRows(fixture({ signups: SIGNUPS_PLUS }));
    assert.equal(w.title, 'Welcome-Back Chips (25 Free Chips, No Hand After 24 Hours) - 1');
    assert.deepEqual(w.rows[0].slice(0, 2), ['Played A Hand Since Getting Chips', '3 of 21 (14%)']);
    assert.match(w.rows[0][2], /Last 7 days 3 of 21 \(14%\); all time 10 of 42 \(24%\), 1,050 chips paid in total/);
    assert.deepEqual(w.rows[1].slice(0, 2), ['Midway Union Promo Wallet', '135,877.93 chips']);
    assert.match(w.rows[1][2], /5,435 more awards at 25; welcome-back took 525 in 7 days; wallet out 140,897.45 \/ in 112,320.41 \(net -28,577.04\); 1,811.7 days at the welcome-back pace, 33.3 days at the wallet's net pace/);
    assert.deepEqual(w.rows[2].slice(0, 2), ['Push Enabled On A Device', '0 of 19 sign-ups this week']);
    assert.deepEqual(w.rows[3].slice(0, 2), ['Join-A-Club Nudges Sent', '7']);
    assert.match(w.rows[3][2], /2 of 7 ever nudged have since joined/);
    assert.deepEqual(w.rows[4].slice(0, 2), ['Play Nudges Sent', '1']);
    assert.match(w.rows[4][2], /sent 72 hours after the chips/);
    assert.match(w.rows[5][2], /Play nudge Oct 16 11:17 PM \(email sent, text no phone\)/);
    assert.match(w.rows[6][2], /TheSAUCE \(nudged: push no device, email sent, text no phone\), PokerMogul/);
});

test('a low promo wallet is flagged in the card and becomes a Needs Your Attention item', async () => {
    const low = { ...SIGNUPS_PLUS, promo_wallet: { ...SIGNUPS_PLUS.promo_wallet, balance: 1200, low: true, awards_left_at_amount: 48, days_left_at_net_pace: null } };
    const w = welcomeBackRows(fixture({ signups: low }));
    assert.equal(w.rows[1][0], 'Midway Union Promo Wallet - LOW');
    assert.match(w.rows[1][2], /refilled faster than it is spent this week; at or under the 2,500 line/);
    const { loadDigestData } = await import('../src/lib/dailyDigest/assemble.mjs');
    const sb = { rpc: async (name) => ({ data: name === 'fn_sp_daily_digest' ? fixture() : name === 'fn_sp_digest_signups' ? low : PLAYER_TOTALS, error: null }) };
    const { digest } = await loadDigestData(sb, '2026-10-28', { withCosts: false, dispatch: false });
    const item = digest.attention.find((a) => a.rule === 'promo_wallet_low');
    assert.ok(item, 'attention item added');
    assert.match(item.title, /down to 1,200 chips \(48 welcome-back awards left; the line is 2,500\)/);
    assert.match(buildSubject(digest), /Need Attention/);
    const okSb = { rpc: async (name) => ({ data: name === 'fn_sp_daily_digest' ? fixture() : name === 'fn_sp_digest_signups' ? SIGNUPS_PLUS : PLAYER_TOTALS, error: null }) };
    const ok = await loadDigestData(okSb, '2026-10-28', { withCosts: false, dispatch: false });
    assert.ok(!(ok.digest.attention || []).some((a) => a.rule === 'promo_wallet_low'), 'no item when the wallet is fine');
});

test('the agent scoreboard lists referrers with joined, KINGS CLUB, played, push and paid counts, in the email and the text', () => {
    const a = agentScoreboardRows(fixture({ signups: SIGNUPS_PLUS }));
    assert.equal(a.title, 'Agents And Referrers (Last 7 Days)');
    assert.deepEqual(a.rows[0], ['Probyourmom', '5 sign-ups', '5 joined a club (5 KINGS CLUB), 3 played a hand, 0 push on, 1 paid welcome-back chips']);
    assert.equal(a.rows[1][0], 'No referral');
    const html = buildHtml(fixture({ signups: SIGNUPS_PLUS }), { email: true });
    assert.ok(html.indexOf('Agents And Referrers') > html.indexOf('Welcome-Back Chips') && html.indexOf('Agents And Referrers') < html.indexOf('Player Funnel'));
    assert.match(buildText(fixture({ signups: SIGNUPS_PLUS }), {}), /AGENTS AND REFERRERS \(LAST 7 DAYS\)\nProbyourmom: 5 sign-ups/);
    assert.deepEqual(agentScoreboardRows(fixture()).rows, [], 'no report, no card');
});

// Free Buy And Guarantee Funding (Dan 2026-11-06), the shape production
// returned for 2026-11-06 plus one underfunded event.
const FUNDING = {
    day: '2026-11-06', events: 37, free_buy_events: 5, exact: 30, over: 0, under: 1, pending: 6,
    required_total: 991, posted_total: 961, promo_total: 891, house_total: 70,
    free_buy: [
        { name: 'Midnight Free Buy (NLH)', starts_ct: '12:30 AM', free_buy_format: 'pko', guarantee: 0, entries: 170, tickets: 18, player_coverage: 0, required: 170, posted: 170, promo: 170, house: 0, variance: 0, verdict: 'exact' },
        { name: 'Afternoon Free Buy (NLH)', starts_ct: '4:30 PM', free_buy_format: 'aiof', guarantee: 500, entries: 136, tickets: 49, player_coverage: 117, required: 383, posted: 383, promo: 383, house: 0, variance: 0, verdict: 'exact' },
        { name: 'Prime Time Free Buy (NLH)', starts_ct: '8:30 PM', free_buy_format: 'mystery', guarantee: 0, entries: 174, tickets: 174, player_coverage: 0, required: 174, posted: 174, promo: 174, house: 0, variance: 0, verdict: 'pending' },
    ],
    off: [{ name: 'Sunday <b>Major</b>', starts_ct: '7:00 PM', free_buy_format: null, guarantee: 1000, entries: 20, tickets: 0, player_coverage: 900, required: 100, posted: 70, promo: 0, house: 70, variance: -30, verdict: 'under' }],
    tickets: { gaming_day: '2026-11-06', allotment: 5, redeemed: 477, returned: 2, players: 400, players_at_limit: 3 },
    open_findings: { total: 1, by_kind: { guarantee_underfunded: 1 } },
};

test('the funding card says required against posted per event, with promo, house and players apart', async () => {
    const { freeBuyFundingRows } = await import('../src/lib/dailyDigest/render.mjs');
    const rows = freeBuyFundingRows(fixture({ free_buy_funding: FUNDING }));
    const byLabel = Object.fromEntries(rows.map((r) => [r[0], r]));
    assert.deepEqual(byLabel['Events Funded Exactly'].slice(1), ['30 Of 31', '0 over, 1 under; 6 still open', true]);
    assert.deepEqual(byLabel['Required / Posted'].slice(1, 3), ['991 / 961 Chips', 'Promo 891, house 70; finalized events only']);
    assert.equal(byLabel['Afternoon Free Buy (NLH) (4:30 PM)'][1], 'Exact');
    assert.equal(byLabel['Afternoon Free Buy (NLH) (4:30 PM)'][2], 'Guarantee 500: players 117, needs 383; posted 383 (promo 383, house 0); 49 tickets');
    assert.equal(byLabel['Midnight Free Buy (NLH) (12:30 AM)'][2], '170 first entries need 170; posted 170 (promo 170, house 0); 18 tickets');
    assert.equal(byLabel['Prime Time Free Buy (NLH) (8:30 PM)'][1], 'Still Open');
    assert.deepEqual(byLabel['Sunday <b>Major</b> (7:00 PM)'].slice(1, 2), ['Under By 30']);
    assert.equal(byLabel['Sunday <b>Major</b> (7:00 PM)'][3], true);
    assert.deepEqual(byLabel['Free Buy Tickets Used'].slice(1, 3), ['477 By 400 Players', '2 returned; 3 used all 5 (gaming day 2026-11-06)']);
    assert.deepEqual(byLabel['Open Funding Watch Findings'].slice(1, 4), ['1', 'guarantee underfunded 1', true]);

    const html = buildHtml(fixture({ free_buy_funding: FUNDING }), { email: true });
    assert.match(html, /Free Buy And Guarantee Funding/);
    assert.ok(html.includes('Sunday &lt;b&gt;Major&lt;/b&gt;'), 'event names are escaped');
    assert.ok(!html.includes('Sunday <b>Major</b>'));
    assert.ok(!/—/.test(html), 'no em dashes');
    const text = buildText(fixture({ free_buy_funding: FUNDING }));
    assert.match(text, /FREE BUY AND GUARANTEE FUNDING\nEvents Funded Exactly: 30 Of 31 {2}\(0 over, 1 under; 6 still open\)/);
    for (const n of ['991', '961', '891', '477', '400', '383', '117']) assert.ok(allowedNumbers(fixture({ free_buy_funding: FUNDING })).has(n), n);
});

test('the funding card is absent without the report and says Report Unavailable when it failed', async () => {
    const { freeBuyFundingRows } = await import('../src/lib/dailyDigest/render.mjs');
    assert.deepEqual(freeBuyFundingRows(fixture()), []);
    assert.ok(!buildHtml(fixture()).includes('Free Buy And Guarantee Funding'));
    const failed = freeBuyFundingRows(fixture({ free_buy_funding: { day: '2026-11-06', error: 'permission denied' } }));
    assert.deepEqual(failed, [['Report Unavailable', 'Unavailable', 'permission denied', false]]);
});

test('an event funded over or under becomes one tracked Needs Your Attention item; an exact day adds none', async () => {
    const { loadDigestData, loadFreeBuyFunding } = await import('../src/lib/dailyDigest/assemble.mjs');
    const sbFor = (funding) => ({ rpc: async (name) => ({ data: name === 'fn_sp_daily_digest' ? fixture() : name === 'fn_sp_digest_free_buy_funding' ? funding : PLAYER_TOTALS, error: null }) });
    const { digest } = await loadDigestData(sbFor(FUNDING), '2026-11-06', { withCosts: false, dispatch: false });
    const items = digest.attention.filter((a) => a.rule === 'free_buy_funding_off');
    assert.equal(items.length, 1);
    assert.equal(items[0].title, '1 event was not funded exactly (Sunday <b>Major</b> under by 30)');
    assert.equal(items[0].status, 'tracked');
    assert.equal(items[0].dispatch, false, 'the watch already raised the Production Alert');
    assert.equal(digest.attention_status.tracked, 2);
    assert.match(buildSubject(digest), /^\[4 Need Attention\]/);
    const exact = { ...FUNDING, under: 0, off: [] };
    const ok = await loadDigestData(sbFor(exact), '2026-11-06', { withCosts: false, dispatch: false });
    assert.ok(!ok.digest.attention.some((a) => a.rule === 'free_buy_funding_off'));
    assert.deepEqual(ok.digest.free_buy_funding, exact);
    const failing = { rpc: async () => ({ data: null, error: { message: 'function fn_sp_digest_free_buy_funding does not exist' } }) };
    assert.deepEqual(await loadFreeBuyFunding(failing, '2026-11-06'), { day: '2026-11-06', error: 'function fn_sp_digest_free_buy_funding does not exist' });
    const throwing = { rpc: async () => { throw new Error('socket closed'); } };
    assert.deepEqual(await loadFreeBuyFunding(throwing, '2026-11-06'), { day: '2026-11-06', error: 'socket closed' });
});

test('the engine line keeps the live build, since when and the 4 AM cutover verdict together', async () => {
    const { engineCutoverRow } = await import('../src/lib/dailyDigest/render.mjs');
    assert.equal(engineCutoverRow(fixture()), null);
    const sealed = { live_build: '8bd8eef3', live_since_ct: 'Nov 9 04:01', cutover_day: '2026-11-09', cutover: 'sealed' };
    assert.deepEqual(engineCutoverRow(fixture({ engine_cutover: sealed })),
        ['Live Engine Build', '8bd8eef3', 'since Nov 9 04:01 Central; 2026-11-09 4 AM cutover: Happened', false]);
    const missed = { live_build: '391f7bc0', live_since_ct: 'Nov 7 15:22', cutover_day: '2026-11-08', cutover: 'missed', owed_build: 'c4370778', reason: 'no preparation run' };
    const row = engineCutoverRow(fixture({ engine_cutover: missed }));
    assert.equal(row[1], '391f7bc0');
    assert.equal(row[2], 'since Nov 7 15:22 Central; 2026-11-08 4 AM cutover: Missed; owed c4370778; no preparation run');
    assert.equal(row[3], true);
    const html = buildHtml(fixture({ engine_cutover: missed }));
    assert.match(html, /Engine Build And 4 AM Cutover/);
    assert.match(html, /Live Engine Build<\/td><td[^>]*><span[^>]*>391f7bc0<\/span>/);
    assert.match(buildText(fixture({ engine_cutover: missed })), /Live Engine Build: 391f7bc0  \(since Nov 7 15:22 Central; 2026-11-08 4 AM cutover: Missed/);
    assert.equal(engineCutoverRow(fixture({ engine_cutover: { ...missed, resolved_at: '2026-11-09T10:02:00Z' } }))[3], false);
});

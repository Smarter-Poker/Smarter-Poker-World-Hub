// Daily Operations Digest: rendering, AI number guard and the signed view link.
// Run: node --test __tests__/daily-digest.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHtml, buildSubject, buildText, esc, trendBars, priorAverage, sectionRows, shortTitle, SECTION_DEFS } from '../src/lib/dailyDigest/render.mjs';
import { extractNumbers, summaryPassesGuard, fallbackSummary, generateAiSummary } from '../src/lib/dailyDigest/aiSummary.mjs';
import { signViewToken, verifyViewToken, ownerPhone, digestRecipients } from '../src/lib/dailyDigest/delivery.mjs';

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
    const html = buildHtml(fixture(), { aiSummary: 'All good.', viewUrl: 'https://smarter.poker/api/digest/view?t=x' });
    for (const def of SECTION_DEFS) assert.ok(html.includes(esc(def.title)), def.title);
    assert.ok(html.includes('Needs Your Attention (3)'));
    assert.ok(html.includes('Already In The Fleet Queue'));
    assert.ok(html.includes('Fixed Overnight'));
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

test('number guard accepts numbers from the data and rejects invented ones', () => {
    const d = fixture();
    assert.deepEqual(extractNumbers('Rake was 73,222.58 and $0.00 sales, 31% up'), [73222.58, 0, 31]);
    assert.equal(summaryPassesGuard('3 real players signed up and cash rake was 73,222.58 chips across 287,809 hands on Oct 14.', d).ok, true);
    assert.equal(summaryPassesGuard('Cash rake grew 22% to 73,222.58 chips.', d).ok, false);
    assert.equal(summaryPassesGuard('', d).ok, false);
});

test('ai summary falls back when the model invents a number or is unavailable', async () => {
    const d = fixture();
    const fake = async () => ({ ok: true, json: async () => ({ content: [{ type: 'text', text: 'Rake rose 999,999 chips.' }] }) });
    const r = await generateAiSummary(d, { apiKey: 'k', fetchImpl: fake });
    assert.equal(r.source, 'fallback');
    assert.match(r.reason, /unverified numbers/);
    assert.equal(r.text, fallbackSummary(d));
    const good = async () => ({ ok: true, json: async () => ({ content: [{ type: 'text', text: '3 real players signed up. Cash rake was 73,222.58 chips. 3 items need attention.' }] }) });
    const r2 = await generateAiSummary(d, { apiKey: 'k', fetchImpl: good, model: 'test-model' });
    assert.equal(r2.source, 'test-model');
    const none = await generateAiSummary(d, { apiKey: '' });
    assert.equal(none.reason, 'no_api_key');
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
    assert.deepEqual(digestRecipients(), ['Daniel@bekavactrading.com']);
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

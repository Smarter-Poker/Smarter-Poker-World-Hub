// Tour schedule sources in the daily digest (2026-11-20).
// Since World Hub #2900 a failing tour site is recorded only on its
// public.tour_source_registry row. These tests pin the reader: which rows the
// digest lists, that the list is a counted Needs Your Attention item in the
// email, the text and the bell notification, and that an unreadable registry
// is reported as unknown rather than as healthy.
// Run: node --test __tests__/daily-digest-tour-sources.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
    selectStaleTourSources, loadTourSourceHealth, addTourSourceAttention, tourSourcesStaleTitle,
    isManualTourSource, loadDigestData, TOUR_STALE_DAYS,
} from '../src/lib/dailyDigest/assemble.mjs';
import { buildHtml, buildText, buildSubject, tourSourceRows } from '../src/lib/dailyDigest/render.mjs';

const NOW = Date.parse('2026-11-20T13:00:00Z');
const ago = (days) => new Date(NOW - days * 86400000).toISOString();

function row(code, extra = {}) {
    return {
        tour_code: code, tour_name: `${code} Tour`, scrape_method: 'puppeteer', is_active: true,
        scrape_status: 'active', last_successful_scrape: ago(0.5), last_checked_at: ago(0.5), ...extra,
    };
}

// The live registry shape on 2026-11-20 (read-only query), plus failures.
const REGISTRY = [
    row('WPT'),                                                                    // healthy
    row('AUPT', { scrape_status: 'pending', last_successful_scrape: ago(13) }),    // between seasons, checked today
    row('CPPT', { scrape_method: 'manual', scrape_status: 'defunct', last_successful_scrape: ago(75) }),
    row('FPN', { scrape_method: ' Manual ', scrape_status: 'manual', last_successful_scrape: null }),
    row('OLD', { is_active: false, scrape_status: 'error', last_successful_scrape: ago(90) }),
    row('BROKE', { scrape_status: 'error', last_successful_scrape: ago(12) }),     // broken 12 days
    row('NEVER', { scrape_status: 'error', last_successful_scrape: null }),        // never succeeded
    row('EDGE', { scrape_status: 'error', last_successful_scrape: ago(7) }),       // exactly 7 days: not over
    row('JUSTOVER', { scrape_status: 'error', last_successful_scrape: ago(8) }),
    row('QUIET', { scrape_status: 'active', last_successful_scrape: ago(9) }),     // status says active but no success in 9 days
    row('LIMBO', { scrape_status: 'pending', last_successful_scrape: ago(40), last_checked_at: ago(10) }), // pending, unchecked 10 days
];

test('selection: active, non-manual sources with no success in over 7 days; pending is not a failure', () => {
    const stale = selectStaleTourSources(REGISTRY, NOW);
    assert.deepEqual(stale.map((s) => s.tour_code), ['NEVER', 'LIMBO', 'BROKE', 'QUIET', 'JUSTOVER']);
    const byCode = Object.fromEntries(stale.map((s) => [s.tour_code, s]));
    assert.deepEqual(byCode.BROKE, { tour_code: 'BROKE', tour_name: 'BROKE Tour', scrape_status: 'error', days_since_success: 12, days_since_check: 0, reason: 'stale_success' });
    assert.equal(byCode.NEVER.days_since_success, null);
    assert.equal(byCode.QUIET.scrape_status, 'active');
    assert.equal(byCode.LIMBO.reason, 'not_checked', 'a pending answer older than 7 days is an old answer');
    for (const code of ['WPT', 'AUPT', 'CPPT', 'FPN', 'OLD', 'EDGE']) assert.ok(!byCode[code], `${code} is not listed`);
    assert.equal(TOUR_STALE_DAYS, 7);
});

test('manual sources are skipped exactly as load_tours in the scraper skips them', () => {
    assert.equal(isManualTourSource({ scrape_method: 'manual' }), true);
    assert.equal(isManualTourSource({ scrape_method: ' MANUAL ' }), true);
    assert.equal(isManualTourSource({ scrape_method: 'puppeteer' }), false);
    assert.equal(isManualTourSource({ scrape_method: null }), false);
    const py = fs.readFileSync(new URL('../scripts/tour_stealth_scraper.py', import.meta.url), 'utf8');
    assert.match(py, /str\(r\.get\("scrape_method"\) or ""\)\.strip\(\)\.lower\(\) == "manual"/, 'scraper still filters manual the same way');
    assert.match(py, /&is_active=eq\.true/, 'scraper still loads only active sources');
    assert.match(py, /if status != "active":\s*\n\s*return True/, 'only an active run stamps last_successful_scrape');
});

function registryClient(result) {
    const calls = [];
    const q = {
        select: (cols) => { calls.push(['select', cols]); return q; },
        eq: (c, v) => { calls.push(['eq', c, v]); return q; },
        limit: async () => result,
    };
    return { calls, from: (t) => { calls.push(['from', t]); return q; } };
}

test('loader reads only active registry rows and reports unknown, never healthy, on a failed read', async () => {
    const sb = registryClient({ data: REGISTRY.filter((r) => r.is_active), error: null });
    const h = await loadTourSourceHealth(sb, NOW);
    assert.deepEqual(sb.calls[0], ['from', 'tour_source_registry']);
    assert.ok(sb.calls.some((c) => c[0] === 'eq' && c[1] === 'is_active' && c[2] === true));
    assert.equal(h.active, 8);
    assert.equal(h.manual, 2);
    assert.equal(h.stale.length, 5);
    assert.deepEqual(await loadTourSourceHealth(registryClient({ data: null, error: { message: 'permission denied' } })), { error: 'permission denied' });
    assert.deepEqual(await loadTourSourceHealth(registryClient({ data: null, error: null })), { error: 'Registry returned no rows array' });
    assert.match((await loadTourSourceHealth({})).error, /from/);
});

test('stale sources become one counted Needs Your Attention item and a card in the email and the text', () => {
    const health = { stale_days: 7, active: 21, manual: 5, stale: selectStaleTourSources(REGISTRY, NOW) };
    const digest = { day: '2026-11-19', day_label: 'Thursday, Nov 19', metrics: {}, attention: [], attention_status: { fixed: 0, in_progress: 0, not_picked_up: 0, tracked: 0 } };
    addTourSourceAttention(digest, health);
    assert.equal(digest.attention.length, 1);
    assert.equal(digest.attention[0].rule, 'tour_sources_stale');
    assert.equal(digest.attention[0].dispatch, false);
    assert.equal(digest.attention_status.not_picked_up, 1);
    assert.equal(digest.attention[0].title, tourSourcesStaleTitle(health));
    assert.match(digest.attention[0].title, /^5 tour schedule sources have not scraped successfully in over 7 days \(NEVER never succeeded, error; LIMBO not checked in 10 days, pending; BROKE 12 days, error/);
    assert.match(buildSubject(digest), /^\[1 Need Attention\]/);
    const html = buildHtml(digest);
    assert.match(html, /Tour Schedule Sources/);
    assert.match(html, /BROKE - BROKE Tour/);
    assert.match(html, /12 Days/);
    assert.match(html, /Status error; days since last successful scrape/);
    assert.match(html, /Never Succeeded/);
    assert.ok(!html.includes('—'));
    const text = buildText(digest);
    assert.match(text, /TOUR SCHEDULE SOURCES\nStale Sources: 5 Of 21/);
    assert.match(text, /JUSTOVER - JUSTOVER Tour: 8 Days/);
    assert.match(text, /LIMBO - LIMBO Tour: 10 Days Unchecked/);
});

test('a healthy registry adds no item and no card; an unreadable one is its own item', () => {
    const clean = { attention: [], attention_status: { not_picked_up: 0 }, metrics: {} };
    addTourSourceAttention(clean, { stale_days: 7, active: 21, manual: 5, stale: [] });
    assert.equal(clean.attention.length, 0);
    assert.deepEqual(tourSourceRows(clean), []);
    assert.ok(!buildHtml(clean).includes('Tour Schedule Sources'));
    const broken = { attention: [], attention_status: { not_picked_up: 0 }, metrics: {} };
    addTourSourceAttention(broken, { error: 'timeout' });
    assert.equal(broken.attention[0].rule, 'tour_sources_unreadable');
    assert.equal(broken.attention_status.not_picked_up, 1);
    assert.match(buildText(broken), /TOUR SCHEDULE SOURCES\nReport Unavailable: Unavailable/);
});

test('wiring: loadDigestData reads the registry, and the bell notification counts the item', async () => {
    const q = { select: () => q, eq: () => q, limit: async () => ({ data: [row('BROKE', { scrape_status: 'error', last_successful_scrape: '2026-01-01T00:00:00Z' })], error: null }) };
    const sb = {
        from: (t) => { assert.equal(t, 'tour_source_registry'); return q; },
        rpc: async (name) => ({ data: name === 'fn_sp_daily_digest'
            ? { day: '2026-11-19', metrics: {}, attention: [], attention_status: { not_picked_up: 0 } }
            : name === 'fn_sp_digest_daily_results' ? { results: {}, reconciliation: { status: 'balanced' } } : null, error: null }),
    };
    const { digest } = await loadDigestData(sb, '2026-11-19', { withCosts: false, dispatch: false });
    assert.ok(digest.attention.some((a) => a.rule === 'tour_sources_stale'));
    assert.equal(digest.tour_sources.stale[0].tour_code, 'BROKE');
    // The cron's bell notification and subject count digest.attention, which now carries the item.
    const route = fs.readFileSync(new URL('../pages/api/cron/daily-digest.js', import.meta.url), 'utf8');
    assert.match(route, /\(out\.digest\.attention \|\| \[\]\)\.length\} items need attention/);
    assert.match(route, /loadDigestData\(sb, day\)/);
    const view = fs.readFileSync(new URL('../pages/api/digest/view.js', import.meta.url), 'utf8');
    assert.match(view, /loadDigestData\(sb, day/);
});

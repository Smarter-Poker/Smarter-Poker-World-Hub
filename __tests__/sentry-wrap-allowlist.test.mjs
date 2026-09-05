/**
 * SENTRY FREE-TIER GATE - reportApiError() only sends for allowlisted routes
 * ─────────────────────────────────────────────────────────────────────────
 * docs/SENTRY-FREE-TIER-POLICY.md section 3: the World Hub server has 60
 * events a day. ~541 catch blocks call reportApiError(); the wrapper is the
 * gate. These tests prove both directions:
 *   - an allowlisted route path reaches Sentry.captureException
 *   - a non-allowlisted route does NOT, and a money-shaped one is filed in
 *     financial_alerts instead
 * plus the pure helpers the gate is built from.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    reportApiError,
    isSentryAllowlisted,
    isMoneyShaped,
    fileFinancialAlert,
    withSentryRoute,
    SENTRY_ROUTE_ALLOWLIST,
    _setSentryForTests,
} from '../vendor/commander-shared/src/lib/sentryWrap.js';

function recorder() {
    const calls = { exceptions: [], messages: [], tags: {} };
    const scope = {
        setTag: (k, v) => { calls.tags[k] = v; },
        setUser: (u) => { calls.user = u; },
        setExtra: (k, v) => { (calls.extra ||= {})[k] = v; },
    };
    return {
        calls,
        sdk: {
            withScope: (fn) => fn(scope),
            captureException: (e) => { calls.exceptions.push(e); return 'evt'; },
            captureMessage: (m) => { calls.messages.push(m); return 'evt'; },
            addBreadcrumb: () => {},
            flush: async () => true,
        },
    };
}

function fakeAlertClient() {
    const rows = [];
    return {
        rows,
        from: (table) => ({
            insert: async (row) => { rows.push({ table, row }); return { error: null }; },
        }),
    };
}

const quiet = (fn) => async () => {
    const orig = { error: console.error, warn: console.warn };
    console.error = () => {};
    console.warn = () => {};
    try { await fn(); } finally { console.error = orig.error; console.warn = orig.warn; }
};

test('allowlist: exact and prefix entries resolve as documented', () => {
    assert.ok(SENTRY_ROUTE_ALLOWLIST.length >= 10, 'allowlist should not be empty');
    assert.equal(isSentryAllowlisted('/api/cron/rakeback-period-settle'), true);
    assert.equal(isSentryAllowlisted('/api/cron/vip-stipend'), true);
    assert.equal(isSentryAllowlisted('/api/cron/vip-lapse'), true);
    assert.equal(isSentryAllowlisted('/api/live/gift'), true);
    assert.equal(isSentryAllowlisted('/api/live/gifts'), true);
    assert.equal(isSentryAllowlisted('/api/auth/commander-sso'), true);
    assert.equal(isSentryAllowlisted('/api/auth/mfa/verify'), true);
    assert.equal(isSentryAllowlisted('/api/internal/edge-error'), true);
    // Not on the list
    assert.equal(isSentryAllowlisted('/api/poker/venues'), false);
    assert.equal(isSentryAllowlisted('/api/cron/generate-trivia'), false);
    assert.equal(isSentryAllowlisted('/api/live/gift-history'), false, 'exact entries must not prefix-match');
    assert.equal(isSentryAllowlisted('/api/authors'), false, 'prefix entries need the trailing slash');
    assert.equal(isSentryAllowlisted(undefined), false);
});

test('money-shaped: route pattern, explicit flag, and context keys', () => {
    assert.equal(isMoneyShaped('/api/club-arena/transfer-chips', { money: true }), true);
    assert.equal(isMoneyShaped('/api/cron/rakeback-daily', {}), true, 'cron/rakeback path');
    assert.equal(isMoneyShaped('/api/store/vip-membership-status', {}), true, 'vip path');
    assert.equal(isMoneyShaped('/api/anything', { context: { amount: 5 } }), true, 'amount key');
    assert.equal(isMoneyShaped('/api/anything', { context: { wallet_id: 'x' } }), true, 'wallet key');
    assert.equal(isMoneyShaped('/api/news/articles', { context: { page: 1 } }), false);
    assert.equal(isMoneyShaped('/api/news/articles', {}), false);
});

test('allowlisted route: reportApiError SENDS to Sentry with route + method tags', quiet(async () => {
    const r = recorder();
    _setSentryForTests(r.sdk);
    try {
        const err = new Error('settle failed');
        const out = await reportApiError(err, { url: '/api/cron/rakeback-period-settle?x=1', method: 'POST' }, {
            userId: 'u1', tags: { stage: 'settle' }, context: { owed: 12 },
        });
        assert.equal(out.sent, true);
        assert.equal(out.alerted, false);
        assert.deepEqual(r.calls.exceptions, [err]);
        assert.equal(r.calls.tags.route, '/api/cron/rakeback-period-settle');
        assert.equal(r.calls.tags.method, 'POST');
        assert.equal(r.calls.tags.stage, 'settle');
        assert.deepEqual(r.calls.user, { id: 'u1' });
        assert.equal(r.calls.extra.owed, 12);
    } finally {
        _setSentryForTests(null);
    }
}));

test('allowlisted route: a non-Error value becomes captureMessage', quiet(async () => {
    const r = recorder();
    _setSentryForTests(r.sdk);
    try {
        await reportApiError({ code: 'PGRST301' }, { url: '/api/auth/login', method: 'POST' });
        assert.equal(r.calls.exceptions.length, 0);
        assert.deepEqual(r.calls.messages, ['{"code":"PGRST301"}']);
    } finally {
        _setSentryForTests(null);
    }
}));

test('non-allowlisted route: reportApiError does NOT send, and non-money files nothing', quiet(async () => {
    const r = recorder();
    _setSentryForTests(r.sdk);
    try {
        const out = await reportApiError(new Error('boom'), { url: '/api/news/articles', method: 'GET' }, {
            context: { page: 2 },
        });
        assert.equal(out.sent, false);
        assert.equal(out.alerted, false);
        assert.equal(r.calls.exceptions.length, 0);
        assert.equal(r.calls.messages.length, 0);
    } finally {
        _setSentryForTests(null);
    }
}));

test('non-allowlisted MONEY route: no Sentry, but a financial_alerts row is filed', quiet(async () => {
    const r = recorder();
    _setSentryForTests(r.sdk);
    const client = fakeAlertClient();
    try {
        const out = await reportApiError(new Error('transfer refused'), { url: '/api/club-arena/transfer-chips', method: 'POST' }, {
            money: true, userId: 'u9', context: { amount: 40 }, __alertClient: client,
        });
        assert.equal(out.sent, false, 'must not reach Sentry');
        assert.equal(out.alerted, true);
        assert.equal(r.calls.exceptions.length, 0);
        assert.equal(client.rows.length, 1);
        const { table, row } = client.rows[0];
        assert.equal(table, 'financial_alerts');
        assert.equal(row.severity, 'warning');
        assert.equal(row.source, 'api./api/club-arena/transfer-chips');
        assert.match(row.message, /POST \/api\/club-arena\/transfer-chips failed: transfer refused/);
        assert.equal(row.context.user_id, 'u9');
        assert.equal(row.context.extra.amount, 40);
        assert.equal(row.resolved, false);
    } finally {
        _setSentryForTests(null);
    }
}));

test('non-allowlisted money-PATH route (no context) also files financial_alerts', quiet(async () => {
    const r = recorder();
    _setSentryForTests(r.sdk);
    const client = fakeAlertClient();
    try {
        const out = await reportApiError(new Error('x'), { url: '/api/store/purchase-vip-with-diamonds', method: 'POST' }, { __alertClient: client });
        assert.equal(out.sent, false);
        assert.equal(out.alerted, true);
        assert.equal(client.rows[0].row.source, 'api./api/store/purchase-vip-with-diamonds');
    } finally {
        _setSentryForTests(null);
    }
}));

test('fileFinancialAlert never throws when the insert fails', quiet(async () => {
    const client = { from: () => ({ insert: async () => ({ error: { message: 'nope' } }) }) };
    const ok = await fileFinancialAlert(new Error('e'), '/api/x', 'GET', { __alertClient: client });
    assert.equal(ok, false);
    const thrower = { from: () => { throw new Error('down'); } };
    const ok2 = await fileFinancialAlert(new Error('e'), '/api/x', 'GET', { __alertClient: thrower });
    assert.equal(ok2, false);
}));

test('withSentryRoute answers 500 and routes through the same gate', quiet(async () => {
    const r = recorder();
    _setSentryForTests(r.sdk);
    try {
        const wrapped = withSentryRoute(async () => { throw new Error('unhandled'); });
        const res = { headersSent: false, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
        await wrapped({ url: '/api/poker/series', method: 'GET' }, res);
        assert.equal(res.code, 500);
        assert.equal(r.calls.exceptions.length, 0, 'poker/series is not allowlisted');

        const res2 = { headersSent: false, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
        await wrapped({ url: '/api/auth/quick-signup', method: 'POST' }, res2);
        assert.equal(res2.code, 500);
        assert.equal(r.calls.exceptions.length, 1, 'auth/* is allowlisted');
    } finally {
        _setSentryForTests(null);
    }
}));

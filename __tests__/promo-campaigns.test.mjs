import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
    DEFAULT_POSTAL_ADDRESS,
    DEFAULT_PROMO_DRAFT,
    DEFAULT_WELCOME_BACK_DRAFT,
    dispatchPromoCampaign,
    ensureSmsStopFooter,
    importMarketingLeads,
    isAllowedSmarterPokerUrl,
    normalizeDeliverableEmail,
    normalizeExplicitTestEmail,
    parseLeadInput,
    renderPromoEmail,
    resolvePromoAudience,
    verifyOperatorTestSignature,
} from '../src/lib/promoCampaigns/dispatch.mjs';
import {
    KINGS_CLUB_UUID,
    WELCOME_BACK_CODE,
    acceptWelcomeBackOffer,
    buildWelcomeBackOfferUrl,
    inspectWelcomeBackOfferStatus,
    signWelcomeBackOfferToken,
    verifyWelcomeBackOfferToken,
} from '../src/lib/promoCampaigns/welcomeBackOffer.mjs';
import { verifySvixSignature } from '../src/lib/email/svixSignature.mjs';
import {
    CLUB_ARENA_DEVICE_ID_KEY,
    KINGS_CLUB_JOIN_PATH,
    PROMO_SIGNUP_STORAGE_KEY,
    buildPromoSignupUrl,
    clearPendingPromoSignupToken,
    getOrCreateClubArenaDeviceId,
    isValidDeviceUuid,
    readPendingPromoSignupToken,
    rememberPromoSignupToken,
    signPromoSignupToken,
    verifyPromoSignupToken,
} from '../src/lib/promoCampaigns/promoSignupToken.mjs';
import { authSwitchHref } from '../src/lib/clubInvite.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

function createMockDb(initial = {}) {
    const tables = {
        newsletter_subscribers: [...(initial.newsletter_subscribers || [])],
        notification_preferences: [...(initial.notification_preferences || [])],
        sms_delivery_receipts: [...(initial.sms_delivery_receipts || [])],
        profiles: [...(initial.profiles || [])],
        club_members: [...(initial.club_members || [])],
        ca_browser_bindings: [...(initial.ca_browser_bindings || [])],
        training_progress: [...(initial.training_progress || [])],
        promo_codes: [...(initial.promo_codes || [])],
        promo_code_redemptions: [...(initial.promo_code_redemptions || [])],
        commander_members: [...(initial.commander_members || [])],
        commander_onboarding_leads: [...(initial.commander_onboarding_leads || [])],
        commander_leads: [...(initial.commander_leads || [])],
        commander_home_members: [...(initial.commander_home_members || [])],
        newsletter_campaigns: [...(initial.newsletter_campaigns || [])],
    };

    const makeQuery = (tableName) => {
        let rows = () => [...(tables[tableName] || [])];
        const filters = [];
        let pendingInsert = null;
        let pendingInsertErr = null;
        let pendingUpdate = null;
        let pendingDelete = false;

        const applyFilters = () =>
            rows().filter((row) => filters.every((fn) => fn(row)));

        const builder = {
            select() {
                return builder;
            },
            eq(col, val) {
                filters.push((r) => r?.[col] === val);
                return builder;
            },
            in(col, vals) {
                const set = new Set(vals);
                filters.push((r) => set.has(r?.[col]));
                return builder;
            },
            or(expr) {
                if (expr.includes('is_active.is.null,is_active.eq.true')) {
                    filters.push((r) => r?.is_active == null || r?.is_active === true);
                }
                return builder;
            },
            like(col, pattern) {
                if (pattern === '%@%') filters.push((r) => String(r?.[col] || '').includes('@'));
                else if (pattern === 'sms:%') filters.push((r) => String(r?.[col] || '').startsWith('sms:'));
                return builder;
            },
            order() {
                return builder;
            },
            limit(n) {
                const matched = applyFilters().slice(0, n);
                return Promise.resolve({ data: matched, error: null });
            },
            range(from, to) {
                const matched = applyFilters().slice(from, to + 1);
                return Promise.resolve({ data: matched, error: null });
            },
            insert(payload) {
                const items = Array.isArray(payload) ? payload : [payload];
                if (tableName === 'promo_code_redemptions') {
                    for (const item of items) {
                        const dup = tables.promo_code_redemptions.find(
                            (r) => r.promo_code_id === item.promo_code_id && r.user_id === item.user_id
                        );
                        if (dup) {
                            pendingInsertErr = { code: '23505', message: 'duplicate key value violates unique constraint' };
                            return builder;
                        }
                    }
                }
                pendingInsert = items.map((item, idx) => ({
                    id: item.id || `${tableName}-${tables[tableName].length + idx + 1}`,
                    ...item,
                }));
                tables[tableName].push(...pendingInsert);
                return builder;
            },
            update(patch) {
                pendingUpdate = patch;
                return builder;
            },
            delete() {
                pendingDelete = true;
                return builder;
            },
            maybeSingle() {
                if (pendingInsertErr) {
                    return Promise.resolve({ data: null, error: pendingInsertErr });
                }
                if (pendingInsert) {
                    return Promise.resolve({ data: pendingInsert[0] || null, error: null });
                }
                if (pendingUpdate) {
                    const matched = applyFilters();
                    for (const row of matched) Object.assign(row, pendingUpdate);
                    return Promise.resolve({ data: matched[0] || null, error: null });
                }
                const matched = applyFilters();
                return Promise.resolve({ data: matched[0] || null, error: null });
            },
            then(resolve, reject) {
                try {
                    if (pendingInsertErr) {
                        return Promise.resolve({ data: null, error: pendingInsertErr }).then(resolve, reject);
                    }
                    if (pendingDelete) {
                        const matched = new Set(applyFilters());
                        const removed = tables[tableName].filter((r) => matched.has(r));
                        tables[tableName] = tables[tableName].filter((r) => !matched.has(r));
                        return Promise.resolve({ data: removed, error: null }).then(resolve, reject);
                    }
                    if (pendingUpdate) {
                        const matched = applyFilters();
                        for (const row of matched) Object.assign(row, pendingUpdate);
                        return Promise.resolve({ data: matched, error: null }).then(resolve, reject);
                    }
                    if (pendingInsert) {
                        return Promise.resolve({ data: pendingInsert, error: null }).then(resolve, reject);
                    }
                    return Promise.resolve({ data: applyFilters(), error: null }).then(resolve, reject);
                } catch (err) {
                    return Promise.reject(err).then(resolve, reject);
                }
            },
        };
        return builder;
    };

    return {
        tables,
        from: (name) => makeQuery(name),
        rpc: initial.rpc || (async () => ({ data: { success: true }, error: null })),
        auth: initial.authUsers
            ? {
                  admin: {
                      listUsers: async ({ page }) => ({
                          data: { users: page === 1 ? initial.authUsers : [] },
                          error: null,
                      }),
                  },
              }
            : undefined,
    };
}

test('default Smarter.Poker promo draft puts 25 Free Chips first, defaults to non_accounts, and carries Oak Lawn PO Box', () => {
    for (const field of ['subject', 'headline', 'body', 'smsBody']) {
        const text = DEFAULT_PROMO_DRAFT[field];
        const chipsIdx = text.indexOf('25 Free Chips');
        const vipIdx = text.indexOf('30-Day Free VIP');
        const diamondsIdx = text.indexOf('500 Free Diamonds');
        assert.ok(chipsIdx >= 0, `${field} must mention 25 Free Chips`);
        assert.ok(vipIdx > chipsIdx, `${field} must place 25 Free Chips before 30-Day Free VIP`);
        assert.ok(diamondsIdx > vipIdx, `${field} must place 30-Day Free VIP before 500 Free Diamonds`);
    }
    assert.equal(DEFAULT_PROMO_DRAFT.scope, 'non_accounts');
    assert.equal(DEFAULT_PROMO_DRAFT.postalAddress, 'PO Box 1905, 9624 Cicero Ave, Oak Lawn, IL 60453');
    assert.equal(DEFAULT_POSTAL_ADDRESS, 'PO Box 1905, 9624 Cicero Ave, Oak Lawn, IL 60453');
    assert.match(DEFAULT_PROMO_DRAFT.smsBody, /Reply STOP to opt out\./);
});

test('resolvePromoAudience non_accounts scope excludes anyone with an existing account or Club Arena membership', async () => {
    const db = createMockDb({
        newsletter_subscribers: [
            { id: 's-new-1', email: 'brandnew1@gmail.com', is_active: true },
            { id: 's-new-2', email: 'sms:+17083334444', is_active: true },
            { id: 's-has-profile', email: 'existingplayer@gmail.com', is_active: true },
            { id: 's-has-auth', email: 'authmember@yahoo.com', is_active: true },
            { id: 's-linked-ca', email: 'clubonly@outlook.com', is_active: true, user_id: 'u-ca-member' },
            { id: 's-has-phone', email: 'sms:+13127778888', is_active: true },
        ],
        profiles: [
            { id: 'u-prof-1', username: 'grinder1', email: 'ExistingPlayer@gmail.com', phone: '(312) 777-8888' },
        ],
        authUsers: [
            { id: 'u-auth-1', email: 'authmember@yahoo.com', phone: '+16305550199', is_anonymous: false },
        ],
        club_members: [
            { user_id: 'u-ca-member' },
        ],
        commander_members: [
            { id: 'cm-new', email: 'venuenew@icloud.com', phone: '630-888-1212' },
            { id: 'cm-existing', email: 'existingplayer@gmail.com', phone: '312-777-8888' },
        ],
    });

    const audience = await resolvePromoAudience(db);
    assert.deepEqual(audience.emails.sort(), ['brandnew1@gmail.com', 'venuenew@icloud.com'].sort());
    assert.deepEqual(audience.phones.sort(), ['+16308881212', '+17083334444'].sort());
    assert.equal(audience.breakdown.excludedExistingAccounts >= 4, true);
});

test('parseLeadInput normalizes emails and US phones while dropping synthetic addresses', () => {
    const raw = [
        'PlayerOne@Gmail.com, (708) 444-2233',
        'second.player@yahoo.com; 1-312-666-7788',
        'playerone@gmail.com',
        'bot@horses.smarter.poker',
        'hydra@hydra.smarter.poker',
        'agent@bot.smarter.poker',
        'probe@smarter.poker',
        'ai@horse.ai',
        'demo@email.com',
        'fixture@example.com',
        '708-555-0142',
        '555-200-1234',
        '210-105-4455',
    ].join('\n');

    const parsed = parseLeadInput(raw);
    assert.deepEqual(parsed.emails, ['playerone@gmail.com', 'second.player@yahoo.com']);
    assert.deepEqual(parsed.phones, ['+17084442233', '+13126667788']);
    assert.equal(parsed.invalidCount >= 10, true);
});

test('importMarketingLeads inserts new contacts and never reactivates opted-out contacts', async () => {
    const db = createMockDb({
        newsletter_subscribers: [
            { id: '1', email: 'unsubbed@gmail.com', is_active: false },
            { id: '2', email: 'active@gmail.com', is_active: true },
            { id: '3', email: 'sms:+17082223333', is_active: false },
        ],
    });

    const res = await importMarketingLeads(db, {
        rawText: 'unsubbed@gmail.com\nactive@gmail.com\nnewlead@gmail.com\n708-222-3333\n312-888-9999',
        source: 'admin_import',
    });

    assert.equal(res.importedEmails, 1);
    assert.equal(res.importedPhones, 1);
    assert.equal(res.alreadyActiveEmails, 1);
    assert.equal(res.optedOutPreserved, 2);

    const unsubRow = db.tables.newsletter_subscribers.find((r) => r.email === 'unsubbed@gmail.com');
    assert.equal(unsubRow.is_active, false);
    const unsubPhone = db.tables.newsletter_subscribers.find((r) => r.email === 'sms:+17082223333');
    assert.equal(unsubPhone.is_active, false);
    const insertedPhone = db.tables.newsletter_subscribers.find((r) => r.email === 'sms:+13128889999');
    assert.equal(insertedPhone?.is_active, true);
});

test('resolvePromoAudience merges database + imported contacts, deduplicates, and honors suppressions', async () => {
    const db = createMockDb({
        newsletter_subscribers: [
            { id: 's1', email: 'lead1@gmail.com', is_active: true },
            { id: 's2', email: 'bounced@yahoo.com', is_active: false },
            { id: 's3', email: 'sms:+17083334444', is_active: true },
            { id: 's4', email: 'sms:+17089990000', is_active: false },
        ],
        notification_preferences: [
            { user_id: 'u-muted', mute_all: true, marketing_enabled: true, email_enabled: true, sms_enabled: true },
            { user_id: 'u-nomkt', mute_all: false, marketing_enabled: false, email_enabled: true, sms_enabled: true },
        ],
        sms_delivery_receipts: [
            { sid: 'SM_BAD', to_number: '+13124445555', status: 'undelivered', error_code: 30005 },
        ],
        profiles: [
            { id: 'u-good', username: 'shark99', email: 'shark99@gmail.com', phone: '708-333-4444' },
            { id: 'u-dup', username: 'shark99b', email: 'lead1@gmail.com', phone: '+17087776666' },
            { id: 'u-muted', username: 'quiet1', email: 'quiet1@gmail.com', phone: '+17081112222' },
            { id: 'u-nomkt', username: 'nomkt', email: 'nomkt@gmail.com', phone: '+17081113333' },
            { id: 'u-bounced', username: 'bounced', email: 'bounced@yahoo.com', phone: '+13124445555' },
            { id: 'u-synth', username: 'deleted-123', email: 'real@gmail.com', phone: '+13129998888' },
            { id: 'u-horse', username: 'colephx', email: 'cole@horses.smarter.poker', phone: null },
        ],
        authUsers: [
            { id: 'u-auth-only', email: 'authonly@icloud.com', phone: '+16304447777', is_anonymous: false },
        ],
        commander_members: [
            { id: 'cm1', email: 'clubmember@outlook.com', phone: '630-444-7777' },
            { id: 'cm2', email: 'clubmember2@outlook.com', phone: '630-888-1212' },
        ],
    });

    const audience = await resolvePromoAudience(db, { scope: 'all' });
    assert.deepEqual(
        audience.emails.sort(),
        ['authonly@icloud.com', 'clubmember2@outlook.com', 'clubmember@outlook.com', 'lead1@gmail.com', 'shark99@gmail.com'].sort()
    );
    assert.deepEqual(
        audience.phones.sort(),
        ['+16304447777', '+16308881212', '+17083334444', '+17087776666'].sort()
    );
});

test('dispatchPromoCampaign uses Pro Resend sender, enforces smarter.poker URLs, previews cleanly, and audits sends', async () => {
    const savedEnv = { ...process.env };
    process.env.RESEND_API_KEY = 'free-key';
    process.env.RESEND_BULK_API_KEY = 'pro-bulk-key';
    process.env.TWILIO_ACCOUNT_SID = 'AC123';
    process.env.TWILIO_AUTH_TOKEN = 'tok';
    process.env.TWILIO_PHONE_NUMBER = '+18885551234';
    delete process.env.NEWS_DIGEST_FROM;

    try {
        const db = createMockDb({
            newsletter_subscribers: [
                { id: '1', email: 'first@gmail.com', is_active: true },
                { id: '2', email: 'sms:+17084449999', is_active: true },
            ],
        });

        await assert.rejects(
            () => dispatchPromoCampaign(db, { ctaUrl: 'https://evil.example/phish', dryRun: true }),
            /https:\/\/smarter\.poker/
        );

        let batchCalls = 0;
        let smsCalls = 0;
        const preview = await dispatchPromoCampaign(db, {
            dryRun: true,
            resendFactory: () => ({ batch: { send: async () => { batchCalls += 1; return {}; } } }),
            sendSms: async () => { smsCalls += 1; return { ok: true }; },
        });
        assert.equal(preview.dryRun, true);
        assert.equal(preview.from, 'Smarter.Poker News <news@mail.smarter.poker>');
        assert.equal(preview.emailRecipients, 1);
        assert.equal(preview.smsRecipients, 1);
        assert.equal(batchCalls, 0);
        assert.equal(smsCalls, 0);

        let capturedKey = '';
        const sentBatches = [];
        const sentTexts = [];
        const live = await dispatchPromoCampaign(db, {
            dryRun: false,
            resendFactory: (key) => {
                capturedKey = key;
                return {
                    batch: {
                        send: async (msgs) => {
                            sentBatches.push(msgs);
                            return { data: msgs.map((_, i) => ({ id: `em-${i}` })) };
                        },
                    },
                };
            },
            sendSms: async (body, { to }) => {
                sentTexts.push({ to, body });
                return { ok: true, id: 'SM99' };
            },
        });

        assert.equal(capturedKey, 'pro-bulk-key');
        assert.equal(live.success, true);
        assert.equal(live.emailSent, 1);
        assert.equal(live.smsSent, 1);
        assert.equal(sentBatches[0][0].from, 'Smarter.Poker News <news@mail.smarter.poker>');
        assert.match(sentBatches[0][0].html, /PO Box 1905, 9624 Cicero Ave, Oak Lawn, IL 60453/);
        assert.match(sentBatches[0][0].headers['List-Unsubscribe'], /\/api\/news\/subscribe\?unsubscribe=/);
        assert.equal(sentTexts.length, 1);
        assert.equal(sentTexts[0].to, '+17084449999');
        assert.match(sentTexts[0].body, /Reply STOP to opt out\./);
        assert.equal(db.tables.newsletter_campaigns.length, 1);
        assert.equal(db.tables.newsletter_campaigns[0].status, 'sent');
        assert.equal(db.tables.newsletter_campaigns[0].sent_count, 2);
    } finally {
        process.env = savedEnv;
    }
});

test('renderPromoEmail and ensureSmsStopFooter preserve CAN-SPAM and STOP invariants', () => {
    const rendered = renderPromoEmail({
        subject: 'Subj',
        headline: 'Head',
        body: 'Line 1\n\nLine 2',
        ctaLabel: 'Join Free',
        ctaUrl: 'https://smarter.poker/auth/signup',
        unsubscribeUrl: 'https://smarter.poker/api/news/subscribe?unsubscribe=tok',
    });
    assert.match(rendered.html, /PO Box 1905, 9624 Cicero Ave, Oak Lawn, IL 60453/);
    assert.match(rendered.text, /PO Box 1905, 9624 Cicero Ave, Oak Lawn, IL 60453/);
    assert.equal(ensureSmsStopFooter('Smarter.Poker promo link'), 'Smarter.Poker promo link Reply STOP to opt out.');
    assert.equal(isAllowedSmarterPokerUrl('https://smarter.poker/hub'), true);
    assert.equal(isAllowedSmarterPokerUrl('http://smarter.poker/hub'), false);
    assert.equal(isAllowedSmarterPokerUrl('https://smarter.poker.evil.com/hub'), false);
});

test('verifySvixSignature validates Resend bounce webhook signatures and rejects stale or forged headers', () => {
    const keyBytes = Buffer.from('test-webhook-secret-bytes-32-len');
    const secret = `whsec_${keyBytes.toString('base64')}`;
    const nowMs = 1_760_000_000_000;
    const ts = String(Math.floor(nowMs / 1000));
    const msgId = 'msg_2abc123';
    const rawBody = JSON.stringify({ type: 'email.bounced', data: { to: ['bounce@gmail.com'] } });
    const sig = crypto.createHmac('sha256', keyBytes).update(`${msgId}.${ts}.${rawBody}`).digest('base64');

    const headers = {
        'svix-id': msgId,
        'svix-timestamp': ts,
        'svix-signature': `v1,${sig}`,
    };

    assert.equal(verifySvixSignature(rawBody, headers, secret, nowMs), true);
    assert.equal(verifySvixSignature(rawBody, { ...headers, 'svix-signature': 'v1,forged' }, secret, nowMs), false);
    assert.equal(verifySvixSignature(rawBody, headers, secret, nowMs + 600_000), false);
    assert.equal(verifySvixSignature(rawBody, headers, '', nowMs), false);
});

test('promo sender routes use resendAccount.mjs and admin authorization guards', async () => {
    const dispatchSrc = read('src/lib/promoCampaigns/dispatch.mjs');
    const apiSrc = read('pages/api/news/promo-campaign.js');
    const adminAliasSrc = read('pages/api/admin/promo-campaign.js');
    const adminPageSrc = read('pages/admin/newsletter.js');
    const subscribeSrc = read('pages/api/news/subscribe.js');

    assert.match(dispatchSrc, /resendAccount\.mjs/);
    assert.doesNotMatch(dispatchSrc, /process\.env\.RESEND_API_KEY/);
    assert.match(apiSrc, /getServerUserWithFallback/);
    assert.match(apiSrc, /\['admin', 'superadmin', 'god'\]/);
    assert.doesNotMatch(apiSrc, /process\.env\.RESEND_API_KEY/);
    assert.match(adminAliasSrc, /from '\.\.\/news\/promo-campaign'/);
    assert.match(adminPageSrc, /\/api\/news\/promo-campaign/);
    assert.doesNotMatch(adminPageSrc, /\/api\/admin\/promo-campaign/);
    assert.match(subscribeSrc, /source:\s*'unsubscribe'/);

    const secret = 'test-signing-key-32-bytes-minimum';
    const nowMs = 1_764_000_000_000;
    const ts = String(Math.floor(nowMs / 1000));
    const sig = crypto.createHmac('sha256', secret).update(`${ts}:test:ops@smarter.poker:+17082223333`).digest('hex');
    assert.equal(
        verifyOperatorTestSignature({
            action: 'test',
            testEmail: 'ops@smarter.poker',
            testPhone: '+17082223333',
            timestampHeader: ts,
            signatureHeader: sig,
            secret,
            nowMs,
        }),
        true
    );
    assert.equal(
        verifyOperatorTestSignature({
            action: 'send',
            testEmail: 'ops@smarter.poker',
            testPhone: '+17082223333',
            timestampHeader: ts,
            signatureHeader: sig,
            secret,
            nowMs,
        }),
        false,
        'full broadcast send is never permitted via operator test signature'
    );
    assert.equal(
        verifyOperatorTestSignature({
            action: 'test',
            testEmail: 'ops@smarter.poker',
            testPhone: '+17082223333',
            timestampHeader: ts,
            signatureHeader: sig,
            secret,
            nowMs: nowMs + 120_000,
        }),
        false,
        'stale signatures past 90s are rejected'
    );
});

test('signPromoSignupToken and verifyPromoSignupToken enforce HMAC authenticity and expiration', () => {
    const secret = 'test-promo-hmac-secret-20261123';
    const nowMs = Date.parse('2026-11-23T23:00:00Z');
    const token = signPromoSignupToken({ campaign: 'sp_promo_20261123', ttlDays: 30, nowMs, secret });
    assert.ok(token.includes('.'));

    const ok = verifyPromoSignupToken(token, { nowMs: nowMs + 60_000, secret });
    assert.equal(ok.valid, true);
    assert.equal(ok.campaign, 'sp_promo_20261123');

    const tampered = `${token.slice(0, -2)}zz`;
    assert.deepEqual(verifyPromoSignupToken(tampered, { nowMs, secret }), { valid: false, reason: 'bad_signature' });
    assert.deepEqual(verifyPromoSignupToken(token, { nowMs, secret: 'wrong-secret' }), { valid: false, reason: 'bad_signature' });
    assert.deepEqual(verifyPromoSignupToken(token, { nowMs: nowMs + 31 * 86400 * 1000, secret }), { valid: false, reason: 'expired' });
    assert.deepEqual(verifyPromoSignupToken('', { nowMs, secret }), { valid: false, reason: 'missing' });
    assert.deepEqual(verifyPromoSignupToken('not-a-valid-token', { nowMs, secret }), { valid: false, reason: 'malformed' });
});

test('buildPromoSignupUrl, storage helpers, device ID helper, and authSwitchHref preserve promo attribution', () => {
    const secret = 'test-promo-url-secret';
    const nowMs = Date.parse('2026-11-23T23:00:00Z');
    const built = new URL(buildPromoSignupUrl('https://smarter.poker/auth/signup', { secret, nowMs }));
    assert.equal(built.pathname, '/auth/signup');
    assert.equal(built.searchParams.get('redirect'), KINGS_CLUB_JOIN_PATH);
    const pt = built.searchParams.get('pt');
    assert.equal(verifyPromoSignupToken(pt, { secret, nowMs }).valid, true);

    const store = new Map();
    const fakeStorage = {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, String(v)),
        removeItem: (k) => store.delete(k),
    };
    assert.equal(rememberPromoSignupToken(pt, fakeStorage), pt);
    assert.equal(store.get(PROMO_SIGNUP_STORAGE_KEY), pt);
    assert.equal(readPendingPromoSignupToken(fakeStorage), pt);
    clearPendingPromoSignupToken(fakeStorage);
    assert.equal(readPendingPromoSignupToken(fakeStorage), null);

    const devId = getOrCreateClubArenaDeviceId(fakeStorage);
    assert.equal(isValidDeviceUuid(devId), true);
    assert.equal(store.get(CLUB_ARENA_DEVICE_ID_KEY), devId);
    assert.equal(getOrCreateClubArenaDeviceId(fakeStorage), devId);

    const switched = authSwitchHref('/auth/login', { redirect: KINGS_CLUB_JOIN_PATH, pt });
    assert.match(switched, new RegExp(`pt=${encodeURIComponent(pt).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    assert.match(DEFAULT_PROMO_DRAFT.smsBody, /https:\/\/smarter\.poker\/go\/promo/);
});

test('25 free signup chips are gated exclusively behind verified promotional signup tokens', () => {
    const goPromoSrc = read('pages/go/promo.js');
    const signupSrc = read('pages/auth/signup.js');
    const callbackSrc = read('pages/auth/callback.js');
    const verifyPhoneSrc = read('pages/hub/verify-phone.js');
    const consoleSrc = read('src/components/gates/VerificationConsole.jsx');
    const verifyOtpSrc = read('pages/api/sms/verify-otp.js');

    assert.match(goPromoSrc, /buildPromoSignupUrl\(/);
    assert.match(goPromoSrc, /permanent:\s*false/);
    assert.match(signupSrc, /promo_signup_token:\s*promoSignupToken/);
    assert.match(callbackSrc, /promo_signup_token:\s*pendingPt/);
    assert.match(verifyPhoneSrc, /getOrCreateClubArenaDeviceId/);
    assert.match(verifyPhoneSrc, /\/hub\/club-arena\/\?welcome=chips/);
    assert.match(consoleSrc, /Free Chips Added In Kings Club/);
    assert.match(verifyOtpSrc, /verifyPromoSignupToken\(candidatePromoToken\)/);
    assert.match(verifyOtpSrc, /supabase\.rpc\('fn_sp_grant_promo_signup_chips'/);
    assert.ok(
        verifyOtpSrc.indexOf('verifyPromoSignupToken(candidatePromoToken)') <
        verifyOtpSrc.indexOf("supabase.rpc('fn_sp_grant_promo_signup_chips'"),
        'verify-otp must verify the HMAC promo token before calling fn_sp_grant_promo_signup_chips'
    );
});

test('testOnly dispatch accepts admin @smarter.poker inboxes and renders inline status + live preview', async () => {
    const savedEnv = { ...process.env };
    process.env.RESEND_BULK_API_KEY = 'pro-bulk-key';
    process.env.TWILIO_ACCOUNT_SID = 'AC123';
    process.env.TWILIO_AUTH_TOKEN = 'tok';
    process.env.TWILIO_PHONE_NUMBER = '+18885551234';
    try {
        assert.equal(normalizeDeliverableEmail('admin@smarter.poker'), null);
        assert.equal(normalizeExplicitTestEmail('admin@smarter.poker'), 'admin@smarter.poker');

        const db = createMockDb();
        let singlePayload = null;
        const out = await dispatchPromoCampaign(db, {
            testOnly: true,
            channels: 'email',
            testEmail: 'admin@smarter.poker',
            sendSingleEmail: async (msg) => {
                singlePayload = msg;
                return { ok: true, id: 'em-single-1' };
            },
        });
        assert.equal(out.success, true);
        assert.equal(out.emailSent, true);
        assert.deepEqual(singlePayload.to, ['admin@smarter.poker']);
        assert.match(singlePayload.html, /pt=/);

        const adminPage = read('pages/admin/newsletter.js');
        assert.match(adminPage, /Live Email Preview/);
        assert.match(adminPage, /Live SMS Text Preview/);
        assert.match(adminPage, /promoInlineNotice/);
        assert.match(adminPage, /promoInlineError/);
    } finally {
        process.env = savedEnv;
    }
});

test('3-week inactive Welcome-Back preset orders 25 Free Chips, 500 Diamonds, and 1-Month VIP and resolves inactive_21d accurately', async () => {
    for (const field of ['subject', 'headline', 'body', 'smsBody']) {
        const text = DEFAULT_WELCOME_BACK_DRAFT[field];
        const chipsIdx = text.indexOf('25 Free Chips');
        const diamondsIdx = text.indexOf('500');
        const vipIdx = text.search(/1-Month Free VIP|1 Month of Free VIP/i);
        assert.ok(chipsIdx >= 0, `${field} must mention 25 Free Chips`);
        assert.ok(diamondsIdx > chipsIdx, `${field} must place 25 Free Chips before 500 Diamonds`);
        assert.ok(vipIdx > diamondsIdx, `${field} must place 500 Diamonds before 1-Month VIP`);
    }
    assert.equal(DEFAULT_WELCOME_BACK_DRAFT.scope, 'inactive_21d');
    assert.equal(DEFAULT_WELCOME_BACK_DRAFT.ctaLabel, 'Accept Your Offer');
    assert.equal(DEFAULT_WELCOME_BACK_DRAFT.ctaUrl, 'https://smarter.poker/promo/welcome-back');
    assert.match(DEFAULT_WELCOME_BACK_DRAFT.smsBody, /https:\/\/smarter\.poker\/go\/welcome-back/);
    assert.equal(DEFAULT_WELCOME_BACK_DRAFT.smsBody.length <= 160, true);

    const nowMs = Date.parse('2026-11-24T04:00:00Z');
    const uInactive = '11111111-1111-4111-8111-111111111111';
    const uRecentSignin = '22222222-2222-4222-8222-222222222222';
    const uRecentClubPlay = '33333333-3333-4333-8333-333333333333';
    const uHorse = '44444444-4444-4444-8444-444444444444';

    const db = createMockDb({
        profiles: [
            {
                id: uInactive,
                username: 'dormantpro',
                email: 'dormant@gmail.com',
                phone: '708-333-4444',
                is_horse: false,
                created_at: '2026-08-01T00:00:00Z',
                last_login: '2026-10-15T00:00:00Z',
                last_active: '2026-10-18T00:00:00Z',
            },
            {
                id: uRecentSignin,
                username: 'recentlogin',
                email: 'recent@gmail.com',
                phone: '312-444-5555',
                is_horse: false,
                created_at: '2026-07-01T00:00:00Z',
                last_login: '2026-10-01T00:00:00Z',
            },
            {
                id: uRecentClubPlay,
                username: 'grinder21',
                email: 'grinder@yahoo.com',
                phone: '630-777-8888',
                is_horse: false,
                created_at: '2026-07-01T00:00:00Z',
                last_login: '2026-09-01T00:00:00Z',
            },
            {
                id: uHorse,
                username: 'horsebot',
                email: 'realhumanlooking@gmail.com',
                phone: '773-888-9999',
                is_horse: true,
                created_at: '2026-06-01T00:00:00Z',
            },
        ],
        authUsers: [
            { id: uInactive, email: 'dormant@gmail.com', last_sign_in_at: '2026-10-18T00:00:00Z', created_at: '2026-08-01T00:00:00Z' },
            { id: uRecentSignin, email: 'recent@gmail.com', last_sign_in_at: '2026-11-20T00:00:00Z', created_at: '2026-07-01T00:00:00Z' },
            { id: uRecentClubPlay, email: 'grinder@yahoo.com', last_sign_in_at: '2026-09-01T00:00:00Z', created_at: '2026-07-01T00:00:00Z' },
        ],
        club_members: [
            { user_id: uRecentClubPlay, is_bot: false, last_active_at: '2026-11-15T12:00:00Z' },
        ],
    });

    const audience = await resolvePromoAudience(db, { scope: 'inactive_21d', nowMs });
    assert.deepEqual(audience.emails, ['dormant@gmail.com']);
    assert.deepEqual(audience.phones, ['+17083334444']);
    assert.equal(audience.emailToUserId.get('dormant@gmail.com'), uInactive);
    assert.equal(audience.breakdown.inactiveEligibleAccounts, 1);
    assert.equal(audience.breakdown.excludedRecentActiveUsers, 2);
});

test('acceptWelcomeBackOffer enforces HMAC + 3-week inactivity, grants 25 Chips + 500 Diamonds + 30d VIP once, and rolls back on RPC failure', async () => {
    const secret = 'test-welcome-back-hmac-secret-20261123';
    const nowMs = Date.parse('2026-11-24T04:00:00Z');
    const uDormant = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
    const uOther = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';
    const uActive = 'cccccccc-3333-4333-8333-cccccccccccc';

    const userBoundUrl = new URL(
        buildWelcomeBackOfferUrl('https://smarter.poker/promo/welcome-back', { userId: uDormant, nowMs, secret })
    );
    const wbUser = userBoundUrl.searchParams.get('wb');
    const verified = verifyWelcomeBackOfferToken(wbUser, { nowMs, secret });
    assert.equal(verified.valid, true);
    assert.equal(verified.userId, uDormant);

    const wbShared = signWelcomeBackOfferToken({ nowMs, secret });

    let shouldFailDiamonds = true;
    const rpcCalls = [];
    const joinCalls = [];

    const db = createMockDb({
        profiles: [
            {
                id: uDormant,
                username: 'comebackkid',
                is_horse: false,
                is_vip: false,
                vip_tier: null,
                vip_expires_at: null,
                created_at: '2026-06-01T00:00:00Z',
                last_active: '2026-10-10T00:00:00Z',
            },
            {
                id: uActive,
                username: 'dailygrinder',
                is_horse: false,
                is_vip: false,
                vip_tier: null,
                vip_expires_at: null,
                created_at: '2026-06-01T00:00:00Z',
                last_active: '2026-11-22T00:00:00Z',
            },
        ],
        club_members: [
            { user_id: uActive, club_id: KINGS_CLUB_UUID, status: 'active', last_active_at: '2026-11-22T18:00:00Z' },
        ],
        rpc: async (fnName, args) => {
            rpcCalls.push({ fnName, args });
            if (fnName === 'fn_promo_disburse') {
                return { data: { success: true, transaction_id: 'tx-chip-25', club_id: KINGS_CLUB_UUID }, error: null };
            }
            if (fnName === 'add_diamonds_to_balance') {
                if (shouldFailDiamonds) {
                    return { data: null, error: { message: 'transient diamond lock' } };
                }
                return { data: { success: true, transaction_id: 'tx-diam-500' }, error: null };
            }
            return { data: { success: true }, error: null };
        },
    });

    // 1. Wrong account cannot use another player's user-bound email link
    const wrongAccount = await inspectWelcomeBackOfferStatus(db, {
        user: { id: uOther, created_at: '2026-05-01T00:00:00Z' },
        token: wbUser,
        nowMs,
        secret,
    });
    assert.equal(wrongAccount.eligible, false);
    assert.equal(wrongAccount.reason, 'wrong_account');

    // 2. Active player (< 21 days) cannot claim via shared SMS link
    const activeBlocked = await acceptWelcomeBackOffer(db, {
        user: { id: uActive, created_at: '2026-06-01T00:00:00Z' },
        token: wbShared,
        nowMs,
        secret,
    });
    assert.equal(activeBlocked.success, false);
    assert.equal(activeBlocked.status, 'recently_active');

    // 3. Transient failure rolls back promo_code_redemptions lock so player can retry
    await assert.rejects(
        () =>
            acceptWelcomeBackOffer(db, {
                user: { id: uDormant, created_at: '2026-06-01T00:00:00Z' },
                accessToken: 'jwt-dormant',
                token: wbUser,
                userSupabaseFactory: () => ({
                    rpc: async (name, args) => {
                        joinCalls.push({ name, args });
                        return { data: { success: true }, error: null };
                    },
                }),
                nowMs,
                secret,
            }),
        /transient diamond lock/
    );
    assert.equal(db.tables.promo_code_redemptions.length, 0, 'failed claim must roll back redemption lock');

    // 4. Retry succeeds cleanly and grants 25 Free Chips + 500 Diamonds + 30-Day VIP
    shouldFailDiamonds = false;
    const accepted = await acceptWelcomeBackOffer(db, {
        user: { id: uDormant, created_at: '2026-06-01T00:00:00Z' },
        accessToken: 'jwt-dormant',
        token: wbUser,
        userSupabaseFactory: () => ({
            rpc: async (name, args) => {
                joinCalls.push({ name, args });
                return { data: { success: true }, error: null };
            },
        }),
        nowMs,
        secret,
    });

    assert.equal(accepted.success, true);
    assert.equal(accepted.alreadyClaimed, false);
    assert.equal(accepted.chipsAwarded, 25);
    assert.equal(accepted.diamondsAwarded, 500);
    assert.equal(accepted.vipDaysAwarded, 30);
    assert.equal(joinCalls.some((c) => c.name === 'fn_join_club_atomic' && c.args.p_identifier === '25450'), true);

    const updatedProfile = db.tables.profiles.find((p) => p.id === uDormant);
    assert.equal(updatedProfile.is_vip, true);
    assert.equal(updatedProfile.vip_expires_at, new Date(nowMs + 30 * 86_400_000).toISOString());

    // 5. Second click returns alreadyClaimed=true without invoking chip/diamond RPCs again
    const callCountAfterFirst = rpcCalls.length;
    const secondClick = await acceptWelcomeBackOffer(db, {
        user: { id: uDormant, created_at: '2026-06-01T00:00:00Z' },
        accessToken: 'jwt-dormant',
        token: wbUser,
        nowMs,
        secret,
    });
    assert.equal(secondClick.success, true);
    assert.equal(secondClick.alreadyClaimed, true);
    assert.equal(rpcCalls.length, callCountAfterFirst, 'duplicate click must not re-run chip or diamond RPCs');
    assert.equal(db.tables.promo_codes[0].code, WELCOME_BACK_CODE);
});

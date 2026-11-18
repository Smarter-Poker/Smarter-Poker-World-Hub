// Marketing programme (Dan, 2026-11-18): contacts, campaigns, one-click
// unsubscribe, Resend webhook, click tracking and the /horses Marketing tab.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
    signUnsubscribe, verifyUnsubscribe, unsubscribeUrl, signClick, verifyClick, clickUrl, isAllowedDestination, withUtm,
} from '../src/lib/marketing/links.mjs';
import { campaignEmail, mergeFields, firstNameOf, sendBlockers } from '../src/lib/marketing/template.mjs';
import { signSvix, verifySvix } from '../src/lib/marketing/svix.mjs';
import { rowsToContacts, parseDelimited } from '../src/lib/marketing/csv.mjs';
import { runMarketingCampaigns, ensureResendWebhook, campaignFrom, WEBHOOK_EVENTS } from '../src/lib/marketing/runner.mjs';
import { oneClickHeaders, loadSuppressed } from '../src/lib/marketing/suppression.mjs';
import { validateCampaign, makeMarketingAdminHandler } from '../src/lib/horses/marketingAdmin.js';

const ENV = { MARKETING_LINK_SECRET: 'test-secret' };
const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

test('an unsubscribe token proves the address and cannot be edited to name another', () => {
    const t = signUnsubscribe('Jason@Example.com ', 'c1', ENV);
    assert.deepEqual(verifyUnsubscribe(t, ENV), { email: 'jason@example.com', campaignId: 'c1' });
    const [body, sig] = [t.slice(0, t.lastIndexOf('.')), t.slice(t.lastIndexOf('.') + 1)];
    const forged = Buffer.from(JSON.stringify({ e: 'victim@example.com', c: 'c1' })).toString('base64url');
    assert.equal(verifyUnsubscribe(`${forged}.${sig}`, ENV), null);
    assert.equal(verifyUnsubscribe(`${body}.${sig}x`, ENV), null);
    assert.equal(verifyUnsubscribe(t, { MARKETING_LINK_SECRET: 'other' }), null);
    assert.equal(signUnsubscribe('not-an-email', null, ENV), null);
    assert.equal(unsubscribeUrl('a@b.co', null, {}), null, 'no secret, no link (callers fall back)');
});

test('a click token only ever redirects to a smarter.poker https page, and expires', () => {
    assert.equal(isAllowedDestination('https://smarter.poker/hub/club-arena/'), true);
    assert.equal(isAllowedDestination('https://evil.example/smarter.poker'), false);
    assert.equal(isAllowedDestination('http://smarter.poker/'), false);
    assert.equal(isAllowedDestination('https://smarter.poker.evil.com/'), false);
    assert.equal(signClick('a@b.co', 'c1', 'https://evil.example/', ENV), null);
    const now = Date.UTC(2026, 10, 18);
    const t = signClick('a@b.co', 'c1', 'https://smarter.poker/hub/', ENV, now);
    assert.deepEqual(verifyClick(t, ENV, now), { email: 'a@b.co', campaignId: 'c1', url: 'https://smarter.poker/hub/', expired: false });
    assert.equal(verifyClick(t, ENV, now + 121 * 86400000).expired, true);
    assert.match(clickUrl('a@b.co', 'c1', 'https://smarter.poker/hub/', ENV), /^https:\/\/smarter\.poker\/api\/email\/click\?t=/);
    assert.equal(withUtm('https://smarter.poker/hub/club-arena/', 'nov-invite'), 'https://smarter.poker/hub/club-arena/?utm_source=email&utm_medium=campaign&utm_campaign=nov-invite');
});

test('the campaign email carries the address, the one-click unsubscribe and a plain-text part, and escapes content', () => {
    const c = { id: 'c1', slug: 'nov-invite', subject: 'Hi {{first_name}}', preheader: 'p', headline: 'Welcome <b>', body: 'Para one.\n\nPara {{promo_code}}.', cta_label: 'Join', cta_url: 'https://smarter.poker/hub/club-arena/', promo_code: 'MIDWAY25' };
    const m = campaignEmail(c, { email: 'jason@example.com', display_name: 'Jason Trezak' }, { from_name: 'Smarter.Poker', postal_address: '1 Main St, Chicago IL 60601' }, { env: ENV });
    assert.equal(m.subject, 'Hi Jason');
    assert.match(m.html, /1 Main St, Chicago IL 60601/);
    assert.match(m.html, /Welcome &lt;b&gt;/);
    assert.match(m.html, /MIDWAY25/);
    assert.match(m.html, /api\/email\/click\?t=/);
    assert.match(m.html, /api\/email\/unsubscribe\?t=/);
    assert.match(m.html, /18\+ only/);
    assert.match(m.text, /Para MIDWAY25\./);
    assert.match(m.text, /Unsubscribe: https:\/\/smarter\.poker\/api\/email\/unsubscribe/);
    assert.equal(m.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
    assert.match(m.headers['List-Unsubscribe'], /^<https:\/\/smarter\.poker\/api\/email\/unsubscribe\?t=/);
    assert.equal(campaignEmail(c, { email: 'a@b.co', display_name: '' }, {}, { env: ENV, test: true }).subject, '[TEST] Hi there');
    assert.doesNotMatch(read('src/lib/marketing/template.mjs'), /[\u{1F300}-\u{1FAFF}]/u, 'no emoji');
});

test('merge fields never print a raw placeholder, and a first name is never guessed', () => {
    assert.equal(mergeFields('{{first_name}} {{unknown}}!', { displayName: '' }), 'there !');
    assert.equal(firstNameOf('$tackNRack12'), '');
    assert.equal(firstNameOf('Rob Richmond'), 'Rob');
    assert.deepEqual(sendBlockers({ subject: 's', headline: 'h', body: 'b' }, { postal_address: '' }), ['Mailing address is not set (required by CAN-SPAM).']);
});

test('the Resend webhook signature is verified (svix), with a replay window', () => {
    const secret = `whsec_${Buffer.from('k'.repeat(24)).toString('base64')}`;
    const now = 1_800_000_000_000;
    const ts = String(Math.floor(now / 1000));
    const body = '{"type":"email.bounced"}';
    const sig = signSvix(secret, 'msg_1', ts, body);
    const headers = { 'svix-id': 'msg_1', 'svix-timestamp': ts, 'svix-signature': `v1,bogus v1,${sig}` };
    assert.deepEqual(verifySvix(secret, headers, body, now), { ok: true, id: 'msg_1' });
    assert.equal(verifySvix(secret, headers, body + ' ', now).ok, false);
    assert.equal(verifySvix(secret, headers, body, now + 301000).reason, 'stale_timestamp');
    assert.equal(verifySvix(null, headers, body, now).ok, false);
    assert.equal(verifySvix(secret, { ...headers, 'svix-signature': undefined }, body, now).reason, 'missing_headers');
});

test('a pasted sheet with a header row, a TSV, or a bare list all import', () => {
    const csv = 'Number,Agent Name,Name,Phone,Email,Downlines\n41999,Poker_Tree,"Trezak, Jason",708-548-0499,JasonTrezak@gmail.com,76\n349758,Up North,Deb Laney,219-384-1903,,2\n1,x,y,,bad-email,\n';
    const { contacts, skipped } = rowsToContacts(csv);
    assert.equal(contacts.length, 2);
    assert.equal(skipped, 1);
    assert.deepEqual(contacts[0], { email: 'jasontrezak@gmail.com', full_name: 'Trezak, Jason', agent_name: 'Poker_Tree', phone: '708-548-0499', external_id: '41999', downlines: '76' });
    assert.equal(contacts[1].email, '');
    assert.equal(rowsToContacts('a@b.co\nc@d.co\n\n').contacts.length, 2);
    assert.equal(parseDelimited('Email\tName\nx@y.z\tX').length, 2);
});

function fakeSb({ settings = {}, batch = [], campaigns = [], linkCount = 0 } = {}) {
    const calls = { rpc: [], updates: [] };
    const sb = {
        rpc: async (name, args) => {
            calls.rpc.push([name, args]);
            if (name === 'fn_sp_marketing_link_conversions') return { data: linkCount, error: null };
            if (name === 'fn_sp_marketing_next_batch') return { data: batch, error: null };
            if (name === 'fn_sp_marketing_mark_sent') return { data: null, error: null };
            return { data: null, error: { message: `unknown ${name}` } };
        },
        from: (table) => {
            const q = { _table: table };
            for (const m of ['select', 'eq', 'in']) q[m] = () => q;
            q.maybeSingle = async () => ({ data: table === 'sp_marketing_settings' ? settings : null, error: null });
            q.update = (patch) => { calls.updates.push([table, patch]); return { eq: async () => ({ error: null }) }; };
            q.then = (resolve) => resolve({ data: table === 'sp_marketing_campaigns' ? campaigns : [], error: null });
            return q;
        },
    };
    return { sb, calls };
}

test('the runner sends each batch row once, with an idempotency key, one-click headers and the right sender', async () => {
    const campaign = { id: 'c1', slug: 'nov', status: 'sending', subject: 'S', headline: 'H', body: 'B', cta_label: 'Go', cta_url: 'https://smarter.poker/hub/' };
    const { sb, calls } = fakeSb({
        settings: { postal_address: '1 Main St', from_name: 'Smarter.Poker', from_email: 'promos@mail.smarter.poker', reply_to: 'support@smarter.poker', sending_enabled: true, webhook_secret: 'whsec_x' },
        batch: [{ campaign_id: 'c1', email_key: 'a@b.co', email: 'a@b.co', display_name: 'Al Mileski' }, { campaign_id: 'c1', email_key: 'c@d.co', email: 'c@d.co', display_name: null }],
        campaigns: [campaign], linkCount: 2,
    });
    const sent = [];
    const summary = await runMarketingCampaigns(sb, {
        sendEmail: async (m) => { sent.push(m); return m.to[0] === 'c@d.co' ? { ok: false, error: 'resend 422' } : { ok: true, id: 'em_1' }; },
        apiKey: 'pro', env: ENV,
    });
    assert.equal(summary.linked, 2);
    assert.equal(summary.sent, 1);
    assert.equal(summary.failed, 1);
    assert.equal(sent[0].idempotencyKey, 'campaign-c1-a@b.co');
    assert.equal(sent[0].from, 'Smarter.Poker <promos@mail.smarter.poker>');
    assert.equal(sent[0].replyTo, 'support@smarter.poker');
    assert.equal(sent[0].headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
    assert.match(sent[0].subject, /^S$/);
    const marks = calls.rpc.filter(([n]) => n === 'fn_sp_marketing_mark_sent').map(([, a]) => a);
    assert.deepEqual(marks.map((m) => [m.p_email_key, m.p_ok, m.p_provider_id]), [['a@b.co', true, 'em_1'], ['c@d.co', false, null]]);
});

test('the runner stops before sending when the mailing address is missing', async () => {
    const { sb } = fakeSb({
        settings: { postal_address: '', sending_enabled: true, webhook_secret: 'x' },
        batch: [{ campaign_id: 'c1', email_key: 'a@b.co', email: 'a@b.co' }],
        campaigns: [{ id: 'c1', status: 'sending', subject: 'S', headline: 'H', body: 'B' }],
    });
    let sends = 0;
    const s = await runMarketingCampaigns(sb, { sendEmail: async () => { sends++; return { ok: true }; }, env: ENV });
    assert.equal(sends, 0);
    assert.match(s.blocked.join(' '), /Mailing address/);
});

test('the webhook connects itself once and stores its signing secret', async () => {
    const { sb, calls } = fakeSb({ settings: { webhook_secret: null } });
    const posts = [];
    const r = await ensureResendWebhook(sb, { apiKey: 'pro', fetchImpl: async (url, init) => { posts.push([url, JSON.parse(init.body)]); return { ok: true, status: 201, json: async () => ({ id: 'wh_1', signing_secret: 'whsec_abc' }) }; } });
    assert.deepEqual(r, { ok: true, created: true });
    assert.equal(posts[0][0], 'https://api.resend.com/webhooks');
    assert.deepEqual(posts[0][1], { endpoint: 'https://smarter.poker/api/email/resend-webhook', events: WEBHOOK_EVENTS });
    assert.equal(calls.updates[0][1].webhook_secret, 'whsec_abc');
    const { sb: sb2 } = fakeSb({ settings: { webhook_secret: 'whsec_abc' } });
    assert.deepEqual(await ensureResendWebhook(sb2, { apiKey: 'pro', fetchImpl: async () => { throw new Error('must not call'); } }), { ok: true, already: true });
});

test('campaign From stays on the verified mail.smarter.poker domain', () => {
    assert.equal(campaignFrom({ from_name: 'Smarter.Poker', from_email: 'promos@mail.smarter.poker' }), 'Smarter.Poker <promos@mail.smarter.poker>');
    assert.equal(campaignFrom({ from_name: 'X', from_email: 'me@gmail.com' }, 'noreply@mail.smarter.poker'), 'X <noreply@mail.smarter.poker>');
    assert.equal(campaignFrom({ from_name: '<script>', from_email: '' }), 'script <promos@mail.smarter.poker>');
});

test('player emails honour the do-not-email list and carry the one-click header when a secret exists', async () => {
    const h = oneClickHeaders('a@b.co', 'https://smarter.poker/hub/settings/notifications');
    if (process.env.MARKETING_LINK_SECRET || process.env.CRON_SECRET) assert.ok(h['List-Unsubscribe-Post']);
    else assert.deepEqual(h, { 'List-Unsubscribe': '<https://smarter.poker/hub/settings/notifications>' });
    const sb = { from: () => ({ select: () => ({ in: async () => ({ data: null, error: { message: 'down' } }) }) }) };
    assert.equal(await loadSuppressed(sb, ['a@b.co']), null, 'an unreadable list fails closed');
    const missing = { from: () => ({ select: () => ({ in: async () => ({ data: null, error: { code: 'PGRST205', message: "Could not find the table 'public.sp_marketing_suppressions'" } }) }) }) };
    assert.deepEqual(await loadSuppressed(missing, ['a@b.co']), new Set(), 'a list that is not installed yet changes nothing');
    const ann = read('src/lib/playerAnnouncements/notice.mjs');
    assert.match(ann, /loadSuppressed\(sb, rows\.map/);
    assert.match(ann, /oneClickHeaders\(r\.email, UNSUBSCRIBE_URL\)/);
    const wb = read('src/lib/welcomeBack/run.mjs');
    assert.match(wb, /isSuppressed\(suppressed, t\.email\)/);
    assert.match(wb, /isSuppressed\(nudgeSuppressed, t\.email\)/);
});

test('campaign validation refuses off-site links, bad slugs and missing copy', () => {
    const ok = { slug: 'nov-invite', name: 'N', subject: 'S', headline: 'H', body: 'B', audience: 'contacts', audience_tags: 'Midway Agent, nov18-email-list' };
    const v = validateCampaign(ok);
    assert.deepEqual(v.audience_tags, ['midway-agent', 'nov18-email-list']);
    assert.equal(v.cta_url, 'https://smarter.poker/hub/club-arena/');
    assert.throws(() => validateCampaign({ ...ok, cta_url: 'https://evil.example/' }), /smarter\.poker Page/);
    assert.throws(() => validateCampaign({ ...ok, slug: 'X' }), /Slug/);
    assert.throws(() => validateCampaign({ ...ok, body: '' }), /Required/);
    assert.throws(() => validateCampaign({ ...ok, audience: 'everyone' }), /Audience/);
});

test('every admin write files an audit row; approve goes through the database rule', async () => {
    const audits = [];
    const rpcs = [];
    const db = {
        rpc: async (name, args) => { rpcs.push([name, args]); return name === 'fn_sp_marketing_campaign_approve' ? { data: { pending: 98, suppressed: 0 }, error: null } : { data: { inserted: 1 }, error: null }; },
        from: () => { const q = {}; for (const m of ['select', 'eq']) q[m] = () => q; q.maybeSingle = async () => ({ data: { id: '00000000-0000-4000-8000-000000000001', status: 'draft' }, error: null }); return q; },
    };
    const h = makeMarketingAdminHandler({ audit: async (op, req, spec) => audits.push(spec.action) });
    const op = { user: { id: 'u1', email: 'dan@example.com' } };
    const r = await h({ req: {}, op, db, method: 'POST', query: {}, body: { action: 'approve', id: '00000000-0000-4000-8000-000000000001' } });
    assert.deepEqual(r.result, { pending: 98, suppressed: 0 });
    assert.equal(rpcs[0][0], 'fn_sp_marketing_campaign_approve');
    await h({ req: {}, op, db, method: 'POST', query: {}, body: { action: 'import_contacts', rows: [{ email: 'a@b.co' }], source: 'Sheet', consent_basis: 'existing_relationship', tags: 'midway-agent' } });
    assert.deepEqual(audits, ['marketing.approve_campaign', 'marketing.import_contacts']);
    await assert.rejects(h({ req: {}, op, db, method: 'POST', query: {}, body: { action: 'import_contacts', rows: [{ email: 'a@b.co' }], source: 'Sheet', consent_basis: 'bought' } }), /Say Why/);
});

test('wiring: the hourly route runs campaigns, the tab is registered, the routes exist, no new cron file', () => {
    const cron = read('pages/api/cron/signup-welcome-back.js');
    assert.match(cron, /runMarketingCampaigns\(sb, \{/);
    assert.match(read('src/components/horses/tabRegistry.js'), /\{ id: 'marketing', label: 'Marketing', permission: 'console.read' \}/);
    assert.match(read('src/components/horses/dynamicPanels.js'), /marketing: MarketingPanel/);
    for (const f of ['pages/api/email/unsubscribe.js', 'pages/api/email/click.js', 'pages/api/email/resend-webhook.js', 'pages/api/horses/marketing-admin.js']) assert.ok(fs.existsSync(new URL(`../${f}`, import.meta.url)), f);
    assert.match(read('pages/api/email/resend-webhook.js'), /bodyParser: false/);
    assert.ok(!fs.existsSync(new URL('../pages/api/cron/marketing.js', import.meta.url)));
    const sql = read('supabase/migrations/20261118170500_marketing_contacts_and_campaigns.sql');
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.%s FROM PUBLIC, anon, authenticated/);
    assert.match(sql, /send a test to yourself before approving/);
    assert.match(sql, /set the mailing address/);
});

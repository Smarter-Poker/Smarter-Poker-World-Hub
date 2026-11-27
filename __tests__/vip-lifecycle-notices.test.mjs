/**
 * VIP lifecycle after the $1 signup: confirmation with the renewal terms, the
 * reminder before the first full-price charge, the failed-renewal notice, the
 * card-update route and the cancel step on the manage page.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

import {
  VIP_MANAGE_PATH,
  VIP_NOTICE_TYPES,
  VIP_YEARLY_PITCH,
  buildVipFirstRenewalReminderNotice,
  buildVipIntroConfirmationNotice,
  buildVipPaymentFailedNotice,
  deliverVipLifecycleNotice,
  formatNoticeDate,
  formatNoticeUsd,
} from '../src/lib/store/vipLifecycleNotices.mjs';
import { sendTransactionalEmail } from '../src/lib/email/transactionalEmail.mjs';
import { VIP_INTRO_OFFER } from '../src/lib/store/vipIntroOffer.mjs';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const webhookSource = await read('pages/api/store/webhooks/stripe.js');
const portalSource = await read('pages/api/store/billing-portal.js');
const manageSource = await read('pages/hub/vip-membership/manage.js');
const noticesSource = await read('src/lib/store/vipLifecycleNotices.mjs');

const USER_ID = '11111111-1111-4111-8111-111111111111';
const CUSTOMER_ID = 'cus_exact';
const SUBSCRIPTION_ID = 'sub_exact';
const PERIOD_START = 1_800_000_000;
const PERIOD_END = 1_802_592_000;
const RENEWAL_DATE = formatNoticeDate(PERIOD_END);

function introSubscription(overrides = {}) {
  return {
    id: SUBSCRIPTION_ID,
    customer: CUSTOMER_ID,
    status: 'active',
    cancel_at_period_end: false,
    current_period_start: PERIOD_START,
    current_period_end: PERIOD_END,
    metadata: {
      type: 'subscription',
      vip_tier: 'monthly',
      user_id: USER_ID,
      vip_intro_offer: VIP_INTRO_OFFER.metadataValue,
    },
    items: {
      data: [{
        id: 'si_exact',
        quantity: 1,
        price: {
          id: 'price_monthly',
          currency: 'usd',
          unit_amount: 2000,
          recurring: { interval: 'month', interval_count: 1 },
        },
      }],
    },
    latest_invoice: {
      id: 'in_first',
      billing_reason: 'subscription_create',
      amount_paid: 100,
    },
    ...overrides,
  };
}

const firstInvoice = (overrides = {}) => ({
  id: 'in_first',
  subscription: SUBSCRIPTION_ID,
  customer: CUSTOMER_ID,
  billing_reason: 'subscription_create',
  amount_paid: 100,
  paid: true,
  ...overrides,
});

const upcomingInvoice = (overrides = {}) => ({
  object: 'invoice',
  subscription: SUBSCRIPTION_ID,
  customer: CUSTOMER_ID,
  billing_reason: 'upcoming',
  amount_due: 2000,
  ...overrides,
});

const failedInvoice = (overrides = {}) => ({
  id: 'in_renewal',
  subscription: SUBSCRIPTION_ID,
  customer: CUSTOMER_ID,
  billing_reason: 'subscription_cycle',
  amount_due: 2000,
  paid: false,
  next_payment_attempt: PERIOD_END + 3 * 86400,
  ...overrides,
});

function fakeSupabase({ existing = [], email = 'member@example.com', insertError = null, readError = null } = {}) {
  const calls = { inserts: [], updates: [], lookups: [] };
  return {
    calls,
    from(table) {
      const state = { table, op: 'select', filters: [], patch: null };
      const query = {
        select() { return query; },
        insert(row) { state.op = 'insert'; state.patch = row; return query; },
        update(patch) { state.op = 'update'; state.patch = patch; return query; },
        eq(column, value) { state.filters.push([column, value]); return query; },
        limit() { return query; },
        async maybeSingle() {
          if (table === 'profiles') return { data: { email }, error: null };
          if (state.op === 'insert') {
            calls.inserts.push(state.patch);
            return insertError
              ? { data: null, error: insertError }
              : { data: { id: 'notice-row' }, error: null };
          }
          throw new Error(`unexpected maybeSingle on ${table}`);
        },
        then(resolve, reject) {
          if (table === 'notifications' && state.op === 'select') {
            calls.lookups.push(state.filters);
            return Promise.resolve(readError
              ? { data: null, error: readError }
              : { data: existing, error: null }).then(resolve, reject);
          }
          if (table === 'notifications' && state.op === 'update') {
            calls.updates.push({ patch: state.patch, filters: state.filters });
            return Promise.resolve({ error: null }).then(resolve, reject);
          }
          return Promise.reject(new Error(`unexpected awaited ${state.op} on ${table}`)).then(resolve, reject);
        },
      };
      return query;
    },
  };
}

test('amounts and dates are formatted from Stripe values', () => {
  assert.equal(formatNoticeUsd(100), '$1');
  assert.equal(formatNoticeUsd(2000), '$20');
  assert.equal(formatNoticeUsd(1999), '$19.99');
  assert.equal(formatNoticeUsd(0), null);
  assert.equal(formatNoticeUsd('x'), null);
  assert.equal(formatNoticeDate(null), null);
  assert.match(RENEWAL_DATE, /^[A-Z][a-z]+ \d{1,2}, \d{4}$/);
});

test('the $1 confirmation states the charge, the renewal amount and date, and how to cancel', () => {
  const notice = buildVipIntroConfirmationNotice({
    subscription: introSubscription(),
    invoice: firstInvoice(),
    tier: 'monthly',
    status: 'active',
  });
  assert.equal(notice.type, VIP_NOTICE_TYPES.introConfirmation);
  assert.equal(notice.dedupeKey, `vip_intro_confirmation:${SUBSCRIPTION_ID}`);
  assert.equal(notice.link, VIP_MANAGE_PATH);
  assert.equal(
    notice.message,
    `$1 Charged Today. Then $20 On ${RENEWAL_DATE} And Every Month After Until You Cancel. Cancel Anytime.`
  );
  for (const body of [notice.email.html, notice.email.text]) {
    assert.match(body, /Charged \$1 Today/);
    assert.ok(body.includes(`Then $20 On ${RENEWAL_DATE} And Every Month After Until You Cancel.`));
    assert.ok(body.includes('https://smarter.poker/hub/vip-membership/manage'));
  }
  assert.equal(notice.data.charged_cents, 100);
  assert.equal(notice.data.renewal_cents, 2000);
});

test('the confirmation reads the renewal price from Stripe, never from a constant', () => {
  const subscription = introSubscription();
  subscription.items.data[0].price.unit_amount = 1999;
  const notice = buildVipIntroConfirmationNotice({
    subscription, invoice: firstInvoice(), tier: 'monthly', status: 'active',
  });
  assert.ok(notice.message.includes('Then $19.99 On'));
});

test('a confirmation is built only for the exact paid $1 first invoice', () => {
  const base = { subscription: introSubscription(), invoice: firstInvoice(), tier: 'monthly', status: 'active' };
  const refused = [
    { ...base, tier: 'yearly' },
    { ...base, status: 'past_due' },
    { ...base, invoice: firstInvoice({ amount_paid: 2000 }) },
    { ...base, invoice: firstInvoice({ billing_reason: 'subscription_cycle' }) },
    { ...base, invoice: firstInvoice({ subscription: 'sub_other' }) },
    { ...base, subscription: introSubscription({ metadata: { user_id: USER_ID, vip_tier: 'monthly' } }) },
    { ...base, subscription: introSubscription({ current_period_end: null }) },
    { ...base, subscription: introSubscription({ items: { data: [] } }) },
  ];
  for (const input of refused) assert.equal(buildVipIntroConfirmationNotice(input), null);
});

test('a member who already scheduled the end is not told a renewal is coming', () => {
  const notice = buildVipIntroConfirmationNotice({
    subscription: introSubscription({ cancel_at_period_end: true }),
    invoice: firstInvoice(),
    tier: 'monthly',
    status: 'active',
  });
  assert.ok(notice.message.includes('You Will Not Be Charged Again.'));
  assert.ok(!notice.message.includes('Every Month After'));
  assert.equal(notice.data.renewal_cents, null);
});

test('the first-renewal reminder says the amount, the date, cancel anytime and the yearly comparison', () => {
  const notice = buildVipFirstRenewalReminderNotice({
    subscription: introSubscription(),
    upcomingInvoice: upcomingInvoice(),
    tier: 'monthly',
    userId: USER_ID,
  });
  assert.equal(notice.type, VIP_NOTICE_TYPES.firstRenewalReminder);
  assert.equal(notice.dedupeKey, `vip_first_renewal_reminder:${SUBSCRIPTION_ID}:${PERIOD_END}`);
  assert.equal(notice.message, `$20 On ${RENEWAL_DATE}. Cancel Anytime.`);
  assert.ok(notice.email.text.includes(VIP_YEARLY_PITCH));
  assert.equal(
    VIP_YEARLY_PITCH,
    '$200/Year Is Two Months Free Versus Monthly. After Your First Renewal You Can Switch To Yearly.'
  );
});

test('the reminder is sent only before the FIRST full-price invoice of a $1 subscription', () => {
  const base = {
    subscription: introSubscription(), upcomingInvoice: upcomingInvoice(), tier: 'monthly', userId: USER_ID,
  };
  const laterRenewal = introSubscription({
    latest_invoice: { id: 'in_second', billing_reason: 'subscription_cycle', amount_paid: 2000 },
  });
  const refused = [
    { ...base, subscription: laterRenewal },
    { ...base, subscription: introSubscription({ latest_invoice: 'in_first' }) },
    { ...base, subscription: introSubscription({ cancel_at_period_end: true }) },
    { ...base, subscription: introSubscription({ status: 'past_due' }) },
    { ...base, subscription: introSubscription({ metadata: { user_id: USER_ID } }) },
    { ...base, tier: 'yearly' },
    { ...base, userId: '22222222-2222-4222-8222-222222222222' },
    { ...base, upcomingInvoice: upcomingInvoice({ amount_due: 100 }) },
    { ...base, upcomingInvoice: upcomingInvoice({ amount_due: 0 }) },
    { ...base, upcomingInvoice: upcomingInvoice({ customer: 'cus_other' }) },
    { ...base, upcomingInvoice: upcomingInvoice({ subscription: 'sub_other' }) },
  ];
  for (const input of refused) assert.equal(buildVipFirstRenewalReminderNotice(input), null);
});

test('a failed renewal is one notice per invoice with the retry date Stripe gave', () => {
  const notice = buildVipPaymentFailedNotice({
    subscription: introSubscription({ status: 'past_due' }),
    invoice: failedInvoice(),
    status: 'past_due',
  });
  assert.equal(notice.type, VIP_NOTICE_TYPES.paymentFailed);
  assert.equal(notice.dedupeKey, 'vip_payment_failed:in_renewal');
  assert.ok(notice.email.text.includes('$20'));
  assert.ok(notice.email.text.includes(`The Card Will Be Tried Again On ${formatNoticeDate(PERIOD_END + 3 * 86400)}.`));

  const final = buildVipPaymentFailedNotice({
    subscription: introSubscription({ status: 'unpaid' }),
    invoice: failedInvoice({ next_payment_attempt: null }),
    status: 'unpaid',
  });
  assert.ok(final.email.text.includes('No Further Automatic Attempt Is Scheduled.'));
});

test('a failed FIRST payment, a paid invoice or an active subscription sends no failure notice', () => {
  const subscription = introSubscription({ status: 'past_due' });
  assert.equal(buildVipPaymentFailedNotice({
    subscription, invoice: failedInvoice({ billing_reason: 'subscription_create' }), status: 'incomplete',
  }), null);
  assert.equal(buildVipPaymentFailedNotice({
    subscription, invoice: failedInvoice({ paid: true }), status: 'past_due',
  }), null);
  assert.equal(buildVipPaymentFailedNotice({
    subscription, invoice: failedInvoice(), status: 'active',
  }), null);
});

test('notice copy has no em dash and no emoji', () => {
  assert.ok(!noticesSource.includes('—'));
  assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(noticesSource));
});

test('delivery records the notice first, emails once with the dedupe key, then records the result', async () => {
  const supabase = fakeSupabase();
  const sent = [];
  const notice = buildVipIntroConfirmationNotice({
    subscription: introSubscription(), invoice: firstInvoice(), tier: 'monthly', status: 'active',
  });
  const result = await deliverVipLifecycleNotice({
    supabase,
    userId: USER_ID,
    notice,
    sendEmail: async (message) => {
      assert.equal(supabase.calls.inserts.length, 1, 'the record is written before the email');
      sent.push(message);
      return { ok: true, id: 'email-1' };
    },
  });
  assert.equal(result, 'sent');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'member@example.com');
  assert.equal(sent[0].idempotencyKey, notice.dedupeKey);
  assert.deepEqual(supabase.calls.lookups[0], [
    ['user_id', USER_ID],
    ['type', 'vip_intro_confirmation'],
    ['data->>dedupe_key', notice.dedupeKey],
  ]);
  const row = supabase.calls.inserts[0];
  assert.equal(row.user_id, USER_ID);
  assert.equal(row.link, VIP_MANAGE_PATH);
  assert.equal(row.data.dedupe_key, notice.dedupeKey);
  assert.equal(row.data.email, 'pending');
  assert.equal(supabase.calls.updates[0].patch.data.email, 'sent');
});

test('a notice already recorded is never sent again', async () => {
  const supabase = fakeSupabase({ existing: [{ id: 'earlier' }] });
  let sends = 0;
  const notice = buildVipPaymentFailedNotice({
    subscription: introSubscription({ status: 'past_due' }), invoice: failedInvoice(), status: 'past_due',
  });
  const result = await deliverVipLifecycleNotice({
    supabase, userId: USER_ID, notice, sendEmail: async () => { sends += 1; return { ok: true }; },
  });
  assert.equal(result, 'duplicate');
  assert.equal(sends, 0);
  assert.equal(supabase.calls.inserts.length, 0);
});

test('when the record cannot be read or written nothing is emailed, and delivery never throws', async () => {
  const notice = buildVipIntroConfirmationNotice({
    subscription: introSubscription(), invoice: firstInvoice(), tier: 'monthly', status: 'active',
  });
  let sends = 0;
  const sendEmail = async () => { sends += 1; return { ok: true }; };
  assert.equal(await deliverVipLifecycleNotice({
    supabase: fakeSupabase({ readError: { message: 'down' } }), userId: USER_ID, notice, sendEmail,
  }), 'ledger_failed');
  assert.equal(await deliverVipLifecycleNotice({
    supabase: fakeSupabase({ insertError: { message: 'down' } }), userId: USER_ID, notice, sendEmail,
  }), 'ledger_failed');
  assert.equal(await deliverVipLifecycleNotice({
    supabase: { from() { throw new Error('boom'); } }, userId: USER_ID, notice, sendEmail,
  }), 'ledger_failed');
  assert.equal(await deliverVipLifecycleNotice({}), 'ledger_failed');
  assert.equal(sends, 0);
});

test('a failed email is recorded on the notice and does not throw', async () => {
  const supabase = fakeSupabase();
  const notice = buildVipIntroConfirmationNotice({
    subscription: introSubscription(), invoice: firstInvoice(), tier: 'monthly', status: 'active',
  });
  const result = await deliverVipLifecycleNotice({
    supabase, userId: USER_ID, notice, sendEmail: async () => ({ ok: false, error: 'resend_500' }),
  });
  assert.equal(result, 'recorded');
  assert.equal(supabase.calls.updates[0].patch.data.email, 'failed:resend_500');

  const noAddress = fakeSupabase({ email: null });
  let sends = 0;
  assert.equal(await deliverVipLifecycleNotice({
    supabase: noAddress, userId: USER_ID, notice, sendEmail: async () => { sends += 1; return { ok: true }; },
  }), 'recorded');
  assert.equal(sends, 0);
  assert.equal(noAddress.calls.updates[0].patch.data.email, 'failed:no_email_on_file');
});

test('the transactional sender makes one attempt with the idempotency key and never throws', async () => {
  const requests = [];
  const env = { RESEND_API_KEY: 'key-test' };
  const message = {
    to: 'member@example.com', subject: 'S', html: '<p>H</p>', text: 'T', idempotencyKey: 'vip-key', env,
  };
  const ok = await sendTransactionalEmail({
    ...message,
    fetchImpl: async (url, init) => {
      requests.push({ url, init });
      return { ok: true, status: 200, json: async () => ({ id: 'email-1' }) };
    },
  });
  assert.deepEqual(ok, { ok: true, id: 'email-1' });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://api.resend.com/emails');
  assert.equal(requests[0].init.headers['Idempotency-Key'], 'vip-key');
  const sentBody = JSON.parse(requests[0].init.body);
  assert.deepEqual(sentBody.to, ['member@example.com']);
  assert.equal(sentBody.from, 'Smarter.Poker <noreply@smarter.poker>');

  let attempts = 0;
  const failed = await sendTransactionalEmail({
    ...message,
    fetchImpl: async () => { attempts += 1; return { ok: false, status: 500, json: async () => ({}) }; },
  });
  assert.deepEqual(failed, { ok: false, error: 'resend_500' });
  assert.equal(attempts, 1, 'no retry loop on a payment path');

  const threw = await sendTransactionalEmail({
    ...message, fetchImpl: async () => { throw new TypeError('network'); },
  });
  assert.equal(threw.ok, false);

  let called = 0;
  const count = async () => { called += 1; return { ok: true, status: 200, json: async () => ({ id: 'x' }) }; };
  assert.equal((await sendTransactionalEmail({ ...message, env: {}, fetchImpl: count })).error, 'email_not_configured');
  assert.equal((await sendTransactionalEmail({ ...message, to: 'nobody', fetchImpl: count })).error, 'invalid_recipient');
  assert.equal((await sendTransactionalEmail({ ...message, idempotencyKey: '', fetchImpl: count })).error, 'missing_idempotency_key');
  assert.equal(called, 0);

  const pro = await sendTransactionalEmail({
    ...message,
    env: { RESEND_BULK_API_KEY: 'pro-key' },
    fetchImpl: async (_url, init) => {
      requests.push({ init });
      return { ok: true, status: 200, json: async () => ({ id: 'email-2' }) };
    },
  });
  assert.equal(pro.ok, true);
  assert.equal(JSON.parse(requests.at(-1).init.body).from, 'Smarter.Poker <noreply@mail.smarter.poker>');
});

/* ------------------------------------------------------------------------
 * The webhook wiring, executed: the invoice handlers and the notice sender
 * are cut out of the real file and run against recorded stand-ins.
 * --------------------------------------------------------------------- */
const wiringStart = webhookSource.indexOf('async function handleInvoicePaymentSucceeded(');
const wiringEnd = webhookSource.indexOf('// DISPUTES (Diamond Accounting Standard', wiringStart);
assert.ok(wiringStart > -1 && wiringEnd > wiringStart, 'the invoice handlers must be extractable');
const wiringSource = webhookSource.slice(wiringStart, webhookSource.lastIndexOf('// ----', wiringEnd));

function loadWiring({ outcome, ledgerRow = null, ledgerError = null, retrieved = null, deliver } = {}) {
  const calls = { subscriptionEvents: [], delivered: [], retrieves: [], ledgerReads: 0 };
  const context = {
    console: { info() {}, warn() {}, error() {} },
    stripeObjectId: (value) => (typeof value === 'string' ? value : value?.id || null),
    handleStripeSubscriptionEvent: async (reference, options) => {
      calls.subscriptionEvents.push({ reference, options });
      if (outcome instanceof Error) throw outcome;
      return outcome;
    },
    buildVipIntroConfirmationNotice,
    buildVipPaymentFailedNotice,
    buildVipFirstRenewalReminderNotice,
    deliverVipLifecycleNotice: async (input) => {
      calls.delivered.push(input);
      if (deliver) return deliver(input);
      return 'sent';
    },
    sendTransactionalEmail: async () => ({ ok: true }),
    getSupabase: () => ({
      marker: 'supabase',
      from(table) {
        assert.equal(table, 'vip_subscriptions');
        const query = {
          select() { return query; },
          eq() { return query; },
          async maybeSingle() {
            calls.ledgerReads += 1;
            return { data: ledgerRow, error: ledgerError };
          },
        };
        return query;
      },
    }),
    stripe: {
      subscriptions: {
        async retrieve(id, params) {
          calls.retrieves.push({ id, params });
          return retrieved;
        },
      },
    },
  };
  const handlers = vm.runInNewContext(
    `${wiringSource}\n({ handleInvoicePaymentSucceeded, handleInvoicePaymentFailed, handleInvoiceUpcoming })`,
    context
  );
  return { calls, ...handlers };
}

const projected = (overrides = {}) => ({
  projected: true,
  userId: USER_ID,
  tier: 'monthly',
  status: 'active',
  subscription: introSubscription(),
  ...overrides,
});

test('a paid $1 first invoice settles the membership first and then sends the confirmation', async () => {
  const harness = loadWiring({ outcome: projected() });
  const invoice = firstInvoice();
  await harness.handleInvoicePaymentSucceeded(invoice);
  assert.equal(harness.calls.subscriptionEvents.length, 1);
  assert.equal(harness.calls.subscriptionEvents[0].options.triggerInvoice, invoice);
  assert.equal(harness.calls.delivered.length, 1);
  assert.equal(harness.calls.delivered[0].userId, USER_ID);
  assert.equal(harness.calls.delivered[0].notice.type, 'vip_intro_confirmation');
  assert.equal(harness.calls.delivered[0].supabase.marker, 'supabase');
});

test('a regular renewal, a full-price signup and an unprojected subscription send no confirmation', async () => {
  const renewal = loadWiring({ outcome: projected() });
  await renewal.handleInvoicePaymentSucceeded(firstInvoice({ billing_reason: 'subscription_cycle', amount_paid: 2000 }));
  assert.equal(renewal.calls.delivered.length, 0);

  const fullPrice = loadWiring({
    outcome: projected({ subscription: introSubscription({ metadata: { user_id: USER_ID, vip_tier: 'monthly' } }) }),
  });
  await fullPrice.handleInvoicePaymentSucceeded(firstInvoice({ amount_paid: 2000 }));
  assert.equal(fullPrice.calls.delivered.length, 0);

  const ignored = loadWiring({ outcome: undefined });
  await ignored.handleInvoicePaymentSucceeded(firstInvoice());
  assert.equal(ignored.calls.delivered.length, 0);
});

test('a membership failure still fails the event and nothing is sent', async () => {
  const harness = loadWiring({ outcome: new Error('admission failed') });
  await assert.rejects(harness.handleInvoicePaymentSucceeded(firstInvoice()), /admission failed/);
  await assert.rejects(harness.handleInvoicePaymentFailed(failedInvoice()), /admission failed/);
  assert.equal(harness.calls.delivered.length, 0);
});

test('a notice that throws can never fail the settled event', async () => {
  const harness = loadWiring({
    outcome: projected(),
    deliver: () => { throw new Error('notice exploded'); },
  });
  await harness.handleInvoicePaymentSucceeded(firstInvoice());
  assert.equal(harness.calls.delivered.length, 1);
});

test('a failed renewal projects past_due and then tells the member', async () => {
  const harness = loadWiring({
    outcome: projected({ status: 'past_due', subscription: introSubscription({ status: 'past_due' }) }),
  });
  await harness.handleInvoicePaymentFailed(failedInvoice());
  assert.deepEqual(harness.calls.subscriptionEvents[0].options, undefined);
  assert.equal(harness.calls.delivered.length, 1);
  assert.equal(harness.calls.delivered[0].notice.dedupeKey, 'vip_payment_failed:in_renewal');
});

test('invoice.upcoming reminds only the ledger owner of an active $1 subscription', async () => {
  const harness = loadWiring({
    ledgerRow: { user_id: USER_ID, tier: 'monthly', status: 'active' },
    retrieved: introSubscription(),
  });
  await harness.handleInvoiceUpcoming(upcomingInvoice());
  assert.equal(harness.calls.subscriptionEvents.length, 0, 'the reminder never touches membership state');
  assert.deepEqual(JSON.parse(JSON.stringify(harness.calls.retrieves[0])), {
    id: SUBSCRIPTION_ID,
    params: { expand: ['items.data.price', 'latest_invoice'] },
  });
  assert.equal(harness.calls.delivered.length, 1);
  assert.equal(harness.calls.delivered[0].notice.type, 'vip_first_renewal_reminder');
  assert.equal(harness.calls.delivered[0].userId, USER_ID);
});

test('invoice.upcoming for an unknown, inactive or later-period subscription sends nothing', async () => {
  const unknown = loadWiring({ ledgerRow: null });
  await unknown.handleInvoiceUpcoming(upcomingInvoice());
  assert.equal(unknown.calls.retrieves.length, 0);
  assert.equal(unknown.calls.delivered.length, 0);

  const pastDue = loadWiring({ ledgerRow: { user_id: USER_ID, tier: 'monthly', status: 'past_due' } });
  await pastDue.handleInvoiceUpcoming(upcomingInvoice());
  assert.equal(pastDue.calls.retrieves.length, 0);

  const later = loadWiring({
    ledgerRow: { user_id: USER_ID, tier: 'monthly', status: 'active' },
    retrieved: introSubscription({
      latest_invoice: { id: 'in_second', billing_reason: 'subscription_cycle', amount_paid: 2000 },
    }),
  });
  await later.handleInvoiceUpcoming(upcomingInvoice());
  assert.equal(later.calls.delivered.length, 0);

  const noSubscription = loadWiring({});
  await noSubscription.handleInvoiceUpcoming({ object: 'invoice', subscription: null });
  assert.equal(noSubscription.calls.ledgerReads, 0);
});

test('invoice.upcoming retries when the ledger or Stripe cannot be read', async () => {
  const ledgerDown = loadWiring({ ledgerError: new Error('ledger down') });
  await assert.rejects(ledgerDown.handleInvoiceUpcoming(upcomingInvoice()), /ledger down/);
  const wrong = loadWiring({
    ledgerRow: { user_id: USER_ID, tier: 'monthly', status: 'active' },
    retrieved: introSubscription({ id: 'sub_other' }),
  });
  await assert.rejects(wrong.handleInvoiceUpcoming(upcomingInvoice()), /exact upcoming-invoice subscription/);
});

test('the webhook routes invoice.upcoming and reports a projection only from its final exit', () => {
  assert.match(
    webhookSource,
    /case 'invoice\.upcoming':\s+await handleInvoiceUpcoming\(event\.data\.object\);\s+break;/
  );
  const pipelineEnd = webhookSource.indexOf('async function handleInvoicePaymentSucceeded(');
  const pipeline = webhookSource.slice(
    webhookSource.indexOf('async function handleStripeSubscriptionEvent('),
    pipelineEnd
  );
  const exits = pipeline.match(/return \{ projected: true[^}]*\}/g) || [];
  assert.equal(exits.length, 1);
  assert.match(
    pipeline,
    /finalize_vip_subscription_admission[\s\S]*return \{ projected: true, userId, tier, status, subscription \};\s*\}\s*$/
  );
  assert.ok(!/sendVipLifecycleNotice|deliverVipLifecycleNotice|sendTransactionalEmail/.test(pipeline),
    'the membership pipeline itself never sends anything');
});

/* ------------------------------------------------------------------------
 * The card-update route, executed.
 * --------------------------------------------------------------------- */
async function runPortal({
  method = 'POST',
  headers = { authorization: 'Bearer token' },
  body = {},
  user = { id: USER_ID },
  profile = { stripe_customer_id: CUSTOMER_ID },
  profileError = null,
  portal = async ({ customer }) => ({ url: 'https://billing.stripe.com/p/session/test_1', customer }),
  runtimeReady = true,
} = {}) {
  const calls = { portal: [], profileFilters: [] };
  const executable = portalSource
    .replace(/^import [^;]+;$/gm, '')
    .replace('export default async function handler', 'async function handler');
  const context = {
    URL,
    console: { info() {}, warn() {}, error() {} },
    process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://supabase.test', SUPABASE_SERVICE_ROLE_KEY: 'k', STRIPE_SECRET_KEY: 'sk_test_x' } },
    require: () => ({ inspectStripeRuntime: () => ({ ready: runtimeReady }) }),
    getServerUserWithFallback: async () => (user ? { user, error: null } : { user: null, error: new Error('no') }),
    applyRateLimit: () => true,
    LIMITS: { write: {} },
    reportApiError() {},
    createClient: () => ({
      from(table) {
        assert.equal(table, 'profiles');
        const query = {
          select() { return query; },
          eq(column, value) { calls.profileFilters.push([column, value]); return query; },
          async maybeSingle() { return { data: profile, error: profileError }; },
        };
        return query;
      },
    }),
    Stripe: function Stripe() {
      return {
        billingPortal: {
          sessions: {
            async create(params) { calls.portal.push(params); return portal(params); },
          },
        },
      };
    },
  };
  const handler = vm.runInNewContext(`${executable}\nhandler`, context);
  const res = {
    body: null, statusCode: 200, headersSent: false, headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; this.headersSent = true; return this; },
  };
  await handler({ method, headers, body }, res);
  return { res, calls };
}

test('the card-update route opens the portal for the signed-in member own customer only', async () => {
  const { res, calls } = await runPortal();
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(JSON.stringify(res.body)), {
    success: true, url: 'https://billing.stripe.com/p/session/test_1',
  });
  assert.deepEqual(calls.profileFilters, [['id', USER_ID]]);
  assert.deepEqual(JSON.parse(JSON.stringify(calls.portal)), [{
    customer: CUSTOMER_ID,
    return_url: 'https://smarter.poker/hub/vip-membership/manage',
  }]);
  assert.equal(res.headers['Cache-Control'], 'private, no-store, max-age=0');
});

test('the card-update route refuses anything that could name another customer or leave Stripe', async () => {
  assert.equal((await runPortal({ method: 'GET' })).res.statusCode, 405);
  assert.equal((await runPortal({ headers: {} })).res.statusCode, 401);
  assert.equal((await runPortal({ user: null })).res.statusCode, 401);

  const named = await runPortal({ body: { customer: 'cus_someone_else' } });
  assert.equal(named.res.statusCode, 400);
  assert.equal(named.calls.portal.length, 0);

  const none = await runPortal({ profile: { stripe_customer_id: null } });
  assert.equal(none.res.statusCode, 404);
  assert.equal(none.res.body.code, 'BILLING_CUSTOMER_MISSING');
  assert.equal(none.calls.portal.length, 0);

  assert.equal((await runPortal({ profileError: { message: 'down' } })).res.statusCode, 503);
  assert.equal((await runPortal({ runtimeReady: false })).res.statusCode, 503);

  const elsewhere = await runPortal({ portal: async ({ customer }) => ({ url: 'https://evil.example/p', customer }) });
  assert.equal(elsewhere.res.statusCode, 503);
  assert.equal(elsewhere.res.body.url, undefined);

  const wrongCustomer = await runPortal({
    portal: async () => ({ url: 'https://billing.stripe.com/p/session/x', customer: 'cus_other' }),
  });
  assert.equal(wrongCustomer.res.statusCode, 503);

  const unconfigured = await runPortal({ portal: async () => { throw new Error('No configuration provided'); } });
  assert.equal(unconfigured.res.statusCode, 503);
  assert.equal(unconfigured.res.body.code, 'BILLING_PORTAL_UNAVAILABLE');
});

/* ------------------------------------------------------------------------
 * The manage page is held (owner order, 2026-11-27): nothing a member sees
 * changes until the design is approved. The page must not call the card
 * route or show the new cancel step yet, and no notice may promise a button
 * the page does not have.
 * --------------------------------------------------------------------- */
test('the manage page carries no unapproved lifecycle surface and notices promise none', () => {
  assert.ok(!manageSource.includes('billing-portal'));
  assert.ok(!manageSource.includes('Update Payment Card'));
  assert.ok(!manageSource.includes('cancel-details'));
  assert.ok(!noticesSource.includes('Update Payment Card'));
  const notice = buildVipPaymentFailedNotice({
    subscription: introSubscription({ status: 'past_due' }), invoice: failedInvoice(), status: 'past_due',
  });
  assert.ok(notice.email.text.includes('support@smarter.poker'));
  assert.ok(notice.email.text.includes('Open VIP Command Center: https://smarter.poker/hub/vip-membership/manage'));
});

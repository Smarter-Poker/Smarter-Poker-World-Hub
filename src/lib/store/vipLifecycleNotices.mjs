/**
 * VIP LIFECYCLE NOTICES: what a Card member is told after signup.
 *
 * Three notices, all driven by signed Stripe webhook events (no schedule):
 *   1. intro confirmation  - the $1 first invoice was paid: what was charged
 *      today, what renews, when, and how to cancel;
 *   2. first renewal reminder - Stripe's `invoice.upcoming` before the first
 *      full-price invoice of a $1 subscription;
 *   3. payment failed - a renewal invoice was not paid.
 *
 * Every figure and date is read from the Stripe objects of the event, never
 * from a constant, so a notice cannot state one amount while Stripe charges
 * another. A builder returns null whenever the objects are not exactly the
 * case the notice was written for.
 *
 * Exactly once: each notice has a dedupe key. The in-app `notifications` row
 * carrying that key is written BEFORE the email is attempted and is the
 * durable record; the same key is the email provider's Idempotency-Key.
 * Delivery never throws: a notice must not be able to fail the webhook that
 * settles the membership.
 */
import { VIP_INTRO_OFFER } from './vipIntroOffer.mjs';

export const VIP_NOTICE_TYPES = Object.freeze({
    introConfirmation: 'vip_intro_confirmation',
    firstRenewalReminder: 'vip_first_renewal_reminder',
    paymentFailed: 'vip_payment_failed',
});

export const VIP_MANAGE_PATH = '/hub/vip-membership/manage';
export const VIP_MANAGE_URL = `https://smarter.poker${VIP_MANAGE_PATH}`;
export const VIP_YEARLY_PITCH =
    '$200/Year Is Two Months Free Versus Monthly. After Your First Renewal You Can Switch To Yearly.';

const NOTICE_TIME_ZONE = 'America/Chicago';

function objectId(value) {
    if (typeof value === 'string') return value.trim() || null;
    if (value && typeof value.id === 'string') return value.id.trim() || null;
    return null;
}

function positiveCents(value) {
    const cents = Number(value);
    return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

/** "$1", "$20", "$19.99". Null for anything that is not a positive whole cent amount. */
export function formatNoticeUsd(value) {
    const cents = positiveCents(value);
    if (cents === null) return null;
    return cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`;
}

/** Stripe epoch seconds as "December 27, 2026". Null when it is not a real instant. */
export function formatNoticeDate(seconds) {
    const value = Number(seconds);
    if (!Number.isSafeInteger(value) || value <= 0) return null;
    const date = new Date(value * 1000);
    if (!Number.isFinite(date.getTime())) return null;
    return date.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        timeZone: NOTICE_TIME_ZONE,
    });
}

function singleRecurringPrice(subscription) {
    const items = Array.isArray(subscription?.items?.data) ? subscription.items.data : [];
    if (items.length !== 1) return null;
    const price = items[0]?.price;
    const cents = positiveCents(price?.unit_amount);
    if (!cents || price?.currency !== 'usd') return null;
    return { cents, interval: price?.recurring?.interval || null };
}

function isIntroSubscription(subscription) {
    return subscription?.metadata?.vip_intro_offer === VIP_INTRO_OFFER.metadataValue;
}

function emailHtml({ headline, lines, ctaLabel, ctaUrl, finePrint }) {
    const paragraphs = lines
        .map((line) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#e8edf5;">${line}</p>`)
        .join('');
    return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${headline}</title></head>
<body style="margin:0;padding:0;background:#05070c;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#05070c;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#0d131d;border:1px solid #2b3a52;border-radius:14px;">
<tr><td style="padding:22px 26px;border-bottom:1px solid #2b3a52;font-size:13px;letter-spacing:2px;color:#d9b45a;font-weight:700;">SMARTER.POKER VIP</td></tr>
<tr><td style="padding:26px;">
<h1 style="margin:0 0 18px;font-size:22px;line-height:1.3;color:#ffffff;">${headline}</h1>
${paragraphs}
<p style="margin:22px 0 6px;"><a href="${ctaUrl}" style="display:inline-block;padding:13px 26px;background:#d9b45a;color:#0d131d;text-decoration:none;border-radius:999px;font-size:15px;font-weight:700;">${ctaLabel}</a></p>
</td></tr>
<tr><td style="padding:18px 26px;border-top:1px solid #2b3a52;font-size:12px;line-height:1.6;color:#8f9bb0;">${finePrint}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

function emailText({ headline, lines, ctaLabel, ctaUrl, finePrint }) {
    return [headline, '', ...lines, '', `${ctaLabel}: ${ctaUrl}`, '', finePrint].join('\n');
}

function composeNotice({ type, dedupeKey, title, message, headline, lines, ctaLabel, finePrint, data }) {
    const email = { headline, lines, ctaLabel, ctaUrl: VIP_MANAGE_URL, finePrint };
    return {
        type,
        dedupeKey,
        title,
        message,
        link: VIP_MANAGE_PATH,
        data,
        email: {
            subject: headline,
            html: emailHtml(email),
            text: emailText(email),
        },
    };
}

const FINE_PRINT =
    'You Are Receiving This Billing Notice Because Of Your Smarter.Poker VIP Card Subscription. Manage Or Cancel It Anytime At smarter.poker/hub/vip-membership/manage.';

/**
 * Notice 1. The first invoice of a $1 subscription was paid.
 * `invoice` is the signed `invoice.payment_succeeded` object.
 */
export function buildVipIntroConfirmationNotice({ subscription, invoice, tier, status } = {}) {
    const subscriptionId = objectId(subscription);
    const price = singleRecurringPrice(subscription);
    const charged = formatNoticeUsd(invoice?.amount_paid);
    const renewalDate = formatNoticeDate(subscription?.current_period_end);
    if (!subscriptionId
        || status !== 'active'
        || tier !== VIP_INTRO_OFFER.plan
        || !isIntroSubscription(subscription)
        || objectId(invoice?.subscription) !== subscriptionId
        || invoice?.billing_reason !== 'subscription_create'
        || Number(invoice?.amount_paid) !== VIP_INTRO_OFFER.firstPeriodCents
        || !price
        || price.interval !== VIP_INTRO_OFFER.interval
        || !charged
        || !renewalDate) {
        return null;
    }
    const regular = formatNoticeUsd(price.cents);
    const ending = subscription.cancel_at_period_end === true;
    const terms = ending
        ? `Your Membership Is Set To End On ${renewalDate}. You Will Not Be Charged Again.`
        : `Then ${regular} On ${renewalDate} And Every Month After Until You Cancel.`;
    return composeNotice({
        type: VIP_NOTICE_TYPES.introConfirmation,
        dedupeKey: `${VIP_NOTICE_TYPES.introConfirmation}:${subscriptionId}`,
        title: 'Welcome To VIP',
        message: `${charged} Charged Today. ${terms} Cancel Anytime.`,
        headline: `Welcome To VIP: ${charged} Charged Today`,
        lines: [
            `Your Card Was Charged ${charged} Today For Your First Month Of Smarter.Poker VIP.`,
            terms,
            'Cancel Anytime From Your VIP Command Center. Cancelling Stops Future Charges And Your Access Continues Until The End Of The Period You Paid For.',
        ],
        ctaLabel: 'Manage Or Cancel VIP',
        finePrint: FINE_PRINT,
        data: {
            source: 'vip_lifecycle',
            stripe_subscription_id: subscriptionId,
            charged_cents: Number(invoice.amount_paid),
            renewal_cents: ending ? null : price.cents,
            renewal_at: Number(subscription.current_period_end),
        },
    });
}

/**
 * Notice 2. Stripe announced the next invoice of a $1 subscription whose only
 * invoice so far is the $1 one, so the announced invoice is the first
 * full-price charge. `upcomingInvoice` is the signed `invoice.upcoming`
 * object; `subscription.latest_invoice` must be expanded.
 */
export function buildVipFirstRenewalReminderNotice({ subscription, upcomingInvoice, tier, userId } = {}) {
    const subscriptionId = objectId(subscription);
    const latestInvoice = subscription?.latest_invoice;
    const price = singleRecurringPrice(subscription);
    const amountDue = positiveCents(upcomingInvoice?.amount_due);
    const renewalDate = formatNoticeDate(subscription?.current_period_end);
    if (!subscriptionId
        || subscription?.status !== 'active'
        || subscription?.cancel_at_period_end !== false
        || tier !== VIP_INTRO_OFFER.plan
        || !isIntroSubscription(subscription)
        || !userId
        || subscription?.metadata?.user_id !== userId
        || objectId(upcomingInvoice?.subscription) !== subscriptionId
        || objectId(upcomingInvoice?.customer) !== objectId(subscription?.customer)
        || !latestInvoice
        || typeof latestInvoice !== 'object'
        || latestInvoice.billing_reason !== 'subscription_create'
        || Number(latestInvoice.amount_paid) !== VIP_INTRO_OFFER.firstPeriodCents
        || !price
        || price.interval !== VIP_INTRO_OFFER.interval
        || !amountDue
        || amountDue !== price.cents
        || !renewalDate) {
        return null;
    }
    const amount = formatNoticeUsd(amountDue);
    return composeNotice({
        type: VIP_NOTICE_TYPES.firstRenewalReminder,
        dedupeKey: `${VIP_NOTICE_TYPES.firstRenewalReminder}:${subscriptionId}:${Number(subscription.current_period_end)}`,
        title: 'Your VIP Renews Soon',
        message: `${amount} On ${renewalDate}. Cancel Anytime.`,
        headline: `Your VIP Renews Soon: ${amount} On ${renewalDate}`,
        lines: [
            `Your $1 First Month Ends Soon. Your Card Will Be Charged ${amount} On ${renewalDate}, And ${amount} Every Month After Until You Cancel.`,
            'Cancel Anytime Before That Date And You Will Not Be Charged. Your Access Continues Until The End Of The Period You Paid For.',
            VIP_YEARLY_PITCH,
        ],
        ctaLabel: 'Manage Or Cancel VIP',
        finePrint: FINE_PRINT,
        data: {
            source: 'vip_lifecycle',
            stripe_subscription_id: subscriptionId,
            renewal_cents: amountDue,
            renewal_at: Number(subscription.current_period_end),
        },
    });
}

/**
 * Notice 3. A renewal invoice was not paid.
 * `invoice` is the signed `invoice.payment_failed` object; one notice per
 * invoice however many times Stripe retries it.
 */
export function buildVipPaymentFailedNotice({ subscription, invoice, status } = {}) {
    const subscriptionId = objectId(subscription);
    const invoiceId = objectId(invoice);
    const amount = formatNoticeUsd(invoice?.amount_due);
    if (!subscriptionId
        || !invoiceId
        || !['past_due', 'unpaid'].includes(status)
        || objectId(invoice?.subscription) !== subscriptionId
        || invoice?.billing_reason !== 'subscription_cycle'
        || invoice?.paid === true
        || !amount) {
        return null;
    }
    const retryDate = formatNoticeDate(invoice?.next_payment_attempt);
    const retryLine = retryDate
        ? `The Card Will Be Tried Again On ${retryDate}.`
        : 'No Further Automatic Attempt Is Scheduled.';
    return composeNotice({
        type: VIP_NOTICE_TYPES.paymentFailed,
        dedupeKey: `${VIP_NOTICE_TYPES.paymentFailed}:${invoiceId}`,
        title: 'VIP Payment Failed',
        message: `Your ${amount} VIP Renewal Did Not Go Through. Update Your Card To Restore VIP.`,
        headline: `Your ${amount} VIP Renewal Did Not Go Through`,
        lines: [
            `We Could Not Charge Your Card ${amount} For Your Smarter.Poker VIP Renewal, So The VIP Access From This Subscription Is Off Until The Payment Succeeds.`,
            retryLine,
            'To Put A New Card On File, Contact Support At support@smarter.poker. VIP Returns As Soon As The Payment Goes Through.',
        ],
        ctaLabel: 'Open VIP Command Center',
        finePrint: FINE_PRINT,
        data: {
            source: 'vip_lifecycle',
            stripe_subscription_id: subscriptionId,
            stripe_invoice_id: invoiceId,
            amount_due_cents: Number(invoice.amount_due),
            next_attempt_at: retryDate ? Number(invoice.next_payment_attempt) : null,
        },
    });
}

async function readMemberEmail(supabase, userId) {
    const { data, error } = await supabase
        .from('profiles')
        .select('email')
        .eq('id', userId)
        .maybeSingle();
    if (!error && typeof data?.email === 'string' && data.email.trim()) return data.email.trim();
    try {
        const result = await supabase.auth?.admin?.getUserById?.(userId);
        const email = result?.data?.user?.email;
        return typeof email === 'string' && email.trim() ? email.trim() : null;
    } catch {
        return null;
    }
}

/**
 * Record the notice once and email it once. Resolves to one of:
 *   'sent'            in-app row written and email accepted by the provider
 *   'recorded'        in-app row written, email not sent (reason in the row)
 *   'duplicate'       this dedupe key was already recorded; nothing done
 *   'ledger_failed'   the record could not be read or written; nothing sent
 * Never throws.
 */
export async function deliverVipLifecycleNotice({ supabase, userId, notice, sendEmail, log = () => {} } = {}) {
    try {
        if (!supabase || !userId || !notice?.dedupeKey || typeof sendEmail !== 'function') {
            return 'ledger_failed';
        }
        const { data: existing, error: existingError } = await supabase
            .from('notifications')
            .select('id')
            .eq('user_id', userId)
            .eq('type', notice.type)
            .eq('data->>dedupe_key', notice.dedupeKey)
            .limit(1);
        if (existingError || !Array.isArray(existing)) {
            log(`[vip-notice] ${notice.type} ledger read failed: ${existingError?.message || 'no rows'}`);
            return 'ledger_failed';
        }
        if (existing.length) return 'duplicate';

        const { data: inserted, error: insertError } = await supabase
            .from('notifications')
            .insert({
                user_id: userId,
                type: notice.type,
                title: notice.title,
                message: notice.message,
                link: notice.link,
                data: { ...notice.data, dedupe_key: notice.dedupeKey, email: 'pending' },
            })
            .select('id')
            .maybeSingle();
        if (insertError || !inserted?.id) {
            log(`[vip-notice] ${notice.type} ledger write failed: ${insertError?.message || 'no row'}`);
            return 'ledger_failed';
        }

        const to = await readMemberEmail(supabase, userId);
        const result = to
            ? await sendEmail({
                to,
                subject: notice.email.subject,
                html: notice.email.html,
                text: notice.email.text,
                idempotencyKey: notice.dedupeKey,
            })
            : { ok: false, error: 'no_email_on_file' };
        const emailState = result?.ok ? 'sent' : `failed:${String(result?.error || 'unknown').slice(0, 80)}`;
        if (!result?.ok) log(`[vip-notice] ${notice.type} email not sent: ${emailState}`);
        try {
            const { error: stateError } = await supabase
                .from('notifications')
                .update({ data: { ...notice.data, dedupe_key: notice.dedupeKey, email: emailState } })
                .eq('id', inserted.id);
            if (stateError) log(`[vip-notice] ${notice.type} email state not recorded: ${stateError.message}`);
        } catch (stateError) {
            log(`[vip-notice] ${notice.type} email state not recorded: ${stateError?.message || stateError}`);
        }
        return result?.ok ? 'sent' : 'recorded';
    } catch (error) {
        log(`[vip-notice] ${notice?.type || 'unknown'} delivery failed: ${error?.message || error}`);
        return 'ledger_failed';
    }
}

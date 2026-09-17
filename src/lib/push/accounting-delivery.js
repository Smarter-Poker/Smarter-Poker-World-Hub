import { sendPush, SUBSCRIPTION_COLUMNS } from './send-push';
import { recordSendFailure } from './push-deliver';
import { loadGateContext, gateDecision, needsDailyCount } from './push-gate.js';
import { accountingDisplayPayload } from './accounting-display.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PREFERENCE_RETRY_MS = 15 * 60 * 1000;
export const isAccountingPush = row => row.event === 'accounting_invoice' || row.accounting_notification_id != null;

// Only the typed, foreign-key-backed receipt establishes accounting provenance.
// A matching event name or arbitrary JSON must not grant this delivery path.
export function accountingPushPayload(row) {
    const id = row.accounting_notification_id;
    if (!UUID.test(id || '') || row.event !== 'accounting_invoice' || row.related_entity_id !== id) {
        throw new Error('Accounting push receipt is unverified');
    }
    return accountingDisplayPayload({
        url: row.url,
        // One banner per receipt, including receipts in the same conversation.
        // A retry replaces only that receipt, without another web-push alert.
        tag: `accounting:${id}`, renotify: false,
        data: { event: row.event, outboxId: row.id, accountingNotificationId: id },
    });
}

async function updateClaim(db, row, patch) {
    const { data, error } = await db.from('push_outbox').update(patch)
        .eq('id', row.id).eq('status', 'processing').eq('claimed_at', row.claimed_at)
        .eq('accounting_notification_id', row.accounting_notification_id).select('id');
    if (error || data?.length !== 1) throw new Error('Accounting push acknowledgment is uncertain');
}

async function ownsClaim(db, row) {
    const { data, error } = await db.from('push_outbox').select('id')
        .eq('id', row.id).eq('status', 'processing').eq('claimed_at', row.claimed_at)
        .eq('accounting_notification_id', row.accounting_notification_id)
        .eq('related_entity_id', row.accounting_notification_id)
        .eq('recipient_user_id', row.recipient_user_id).eq('event', 'accounting_invoice').maybeSingle();
    if (error) throw new Error('Accounting push claim lookup failed');
    return !!data;
}

export async function releaseAccountingPush(db, row) {
    await updateClaim(db, row, { status: 'pending', claimed_at: null,
        attempts: Math.max(0, (row.attempts || 1) - 1), failure_reason: 'time_budget_exhausted' });
}

// The same durable queue and provider sender as other notifications. Accounting
// receipts are never digested. This is provider acceptance, not proof of display;
// an uncertain provider/DB boundary must remain visible for lease recovery.
export async function deliverAccountingPush(db, row, options = {}) {
    const send = options.send || sendPush;
    const now = options.now || Date.now;
    const out = { sent: 0, skipped: 0, failed: 0, deactivated: 0, uncertain: 0, deferred: 0 };
    let providerStarted = false;
    const skip = async reason => {
        await updateClaim(db, row, { status: 'skipped', failure_reason: reason });
        return { ...out, skipped: 1, reason };
    };
    const defer = async reason => {
        // No provider was called. Preserve this receipt and refund the unused
        // attempt; claim eligibility keeps it from starving other recipients.
        await updateClaim(db, row, { status: 'pending', claimed_at: null,
            attempts: Math.max(0, row.attempts - 1),
            next_attempt_at: new Date(now() + PREFERENCE_RETRY_MS).toISOString(),
            failure_reason: `accounting_deferred:${reason}` });
        return { ...out, deferred: 1, reason };
    };
    try {
        const payload = accountingPushPayload(row);
        if (!row.claimed_at || !row.recipient_user_id) throw new Error('Accounting push claim is incomplete');
        if (!await ownsClaim(db, row)) return { ...out, uncertain: 1, reason: 'claim_lost' };
        const createdAt = Date.parse(row.created_at);
        if (!Number.isFinite(createdAt)) throw new Error('Accounting push creation time is unknown');
        // A verified invoice does not expire because dispatch was unavailable.
        // Archived/historical source suppressions are already terminal queue
        // rows and can never enter this claimed delivery path.
        const context = await loadGateContext(db, [row.recipient_user_id], { strict: true });
        const entry = context.get(row.recipient_user_id) || {};
        const gateOptions = { now: new Date(now()) };
        if (needsDailyCount(entry, row.event)) {
            // Exact aggregate: a bounded PostgREST row page is not a daily total.
            const { count, error } = await db.from('push_outbox').select('id', { count: 'exact', head: true })
                .eq('recipient_user_id', row.recipient_user_id).eq('status', 'sent')
                .gte('sent_at', new Date(now() - 86400_000).toISOString());
            if (error || !Number.isSafeInteger(count) || count < 0) throw new Error('Accounting push daily count lookup failed');
            gateOptions.sentToday = count;
        }
        const gate = gateDecision(entry, row.event, gateOptions);
        if (!gate.allowed) {
            if (gate.reason === 'quiet_hours' || gate.reason.startsWith('daily_cap_reached:')) return await defer(gate.reason);
            return await skip(gate.reason);
        }
        const { data: subscriptions, error } = await db.from('push_subscriptions')
            .select(SUBSCRIPTION_COLUMNS).eq('user_id', row.recipient_user_id).eq('is_active', true);
        if (error || !Array.isArray(subscriptions)) throw new Error('Accounting push subscription lookup failed');
        if (!subscriptions.length) return await skip('no_subscription');
        // Defend against duplicate endpoint rows without confusing separate devices.
        const devices = [...new Map(subscriptions.map(sub => [`${sub.transport || 'webpush'}:${sub.endpoint}`, sub])).values()];
        let accepted = 0, refused = 0, lastError = null;
        for (let offset = 0; offset < devices.length; offset += 4) {
            if (!await ownsClaim(db, row)) return { ...out, uncertain: 1, reason: 'claim_lost' };
            const group = devices.slice(offset, offset + 4);
            providerStarted = true;
            const results = await Promise.all(group.map(sub => send(sub, payload)));
            for (let i = 0; i < results.length; i++) {
                const result = results[i], sub = group[i];
                if (result.ok) {
                    accepted++;
                    // Telemetry cannot undo a successful provider acceptance.
                    try { await db.from('push_subscriptions').update({ last_used_at: new Date(now()).toISOString(),
                        failure_count: 0, last_failure_reason: null }).eq('id', sub.id); } catch { /* telemetry */ }
                } else {
                    refused++;
                    lastError = result.error || 'provider_refused';
                    if (result.expired) {
                        const retired = await db.from('push_subscriptions').update({ is_active: false,
                            last_failure_reason: `expired_${result.statusCode || 410}` }).eq('id', sub.id);
                        if (!retired.error) out.deactivated++;
                    } else if (await recordSendFailure(db, sub.id, result)) out.deactivated++;
                }
            }
        }
        if (accepted > 0) {
            // The existing queue acknowledges recipient delivery after one device
            // accepts. Do not resend accepted devices to retry another endpoint.
            await updateClaim(db, row, { status: 'sent', sent_at: new Date(now()).toISOString(),
                next_attempt_at: null, failure_reason: refused ? `accounting_partial_device_failure:${refused}` : null });
            return { ...out, sent: 1, failed: refused ? 1 : 0 };
        }
        await updateClaim(db, row, { status: row.attempts >= 5 ? 'failed' : 'pending', claimed_at: null,
            failure_reason: String(lastError || 'provider_refused').slice(0, 300) });
        return { ...out, failed: 1 };
    } catch (error) {
        if (providerStarted) {
            try { await updateClaim(db, row, { failure_reason: 'accounting_delivery_acknowledgment_uncertain' }); } catch { /* retain claim */ }
            return { ...out, uncertain: 1, reason: 'delivery_acknowledgment_uncertain' };
        }
        try {
            await updateClaim(db, row, { status: row.attempts >= 5 ? 'failed' : 'pending', claimed_at: null,
                failure_reason: String(error?.message || 'accounting_read_failed').slice(0, 300) });
        } catch { return { ...out, uncertain: 1, reason: 'claim_acknowledgment_uncertain' }; }
        return { ...out, failed: 1, reason: 'retryable_read_failure' };
    }
}

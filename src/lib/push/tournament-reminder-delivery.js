import { sendPush, SUBSCRIPTION_COLUMNS } from './send-push';
import { recordSendFailure } from './push-deliver';
import { loadGateContext, gateDecision, needsDailyCount, countSentTodayBatch } from './push-gate.js';

export const isTournamentReminder = (row) =>
    row.event === 'tournament_reminder_15m' || row.event === 'tournament_reminder_2m';

async function updateClaim(supabase, row, patch) {
    const { data, error } = await supabase.from('push_outbox').update(patch)
        .eq('id', row.id).eq('status', 'processing').eq('claimed_at', row.claimed_at).select('id');
    if (error) throw new Error('Reminder acknowledgment failed');
    if (data?.length !== 1) throw new Error('Reminder claim no longer owned');
}

async function currentIntent(supabase, row) {
    const { data, error } = await supabase.rpc('get_tournament_reminder_delivery', { p_outbox_ids: [row.id] });
    if (error || data?.length !== 1 || data[0].outbox_id !== row.id) {
        throw new Error('Reminder eligibility lookup failed');
    }
    return data[0];
}

// Both the continuous worker and the compatibility cron use this exact sender.
// Unknown reads are retryable; a provider acceptance followed by an uncertain
// acknowledgment retains the claim for lease recovery and is reported separately.
export async function deliverTournamentReminder(supabase, row, options = {}) {
    const send = options.send || sendPush;
    const now = options.now || Date.now;
    const out = { sent: 0, skipped: 0, failed: 0, deactivated: 0, uncertain: 0 };
    let providerStarted = false;
    const skip = async (reason) => {
        await updateClaim(supabase, row, { status: 'skipped', failure_reason: reason });
        return { ...out, skipped: 1, reason };
    };
    try {
        if (!row.claimed_at || !isTournamentReminder(row)) throw new Error('Invalid reminder claim');
        let intent = await currentIntent(supabase, row);
        if (intent.skip_reason) return await skip(intent.skip_reason);
        const context = await loadGateContext(supabase, [row.recipient_user_id], { strict: true });
        const entry = context.get(row.recipient_user_id) || {};
        const gateOptions = {};
        if (needsDailyCount(entry, row.event)) {
            const counts = await countSentTodayBatch(supabase, [row.recipient_user_id], { strict: true });
            gateOptions.sentToday = counts.get(row.recipient_user_id) || 0;
        }
        const gate = gateDecision(entry, row.event, gateOptions);
        if (!gate.allowed) return await skip(gate.reason);
        const { data: subscriptions, error: subscriptionError } = await supabase.from('push_subscriptions')
            .select(SUBSCRIPTION_COLUMNS).eq('user_id', row.recipient_user_id).eq('is_active', true);
        if (subscriptionError || !Array.isArray(subscriptions)) throw new Error('Reminder subscription lookup failed');
        if (subscriptions.length === 0) return await skip('no_subscription');
        // Reads above can take time. Recheck cancellation, schedule, registration
        // and seating immediately before the external side effect.
        intent = await currentIntent(supabase, row);
        if (intent.skip_reason) return await skip(intent.skip_reason);
        const expiresAt = Date.parse(intent.expires_at);
        if (!Number.isFinite(expiresAt)) throw new Error('Reminder expiry is unknown');
        const { data: owned, error: ownerError } = await supabase.from('push_outbox').select('id')
            .eq('id', row.id).eq('status', 'processing').eq('claimed_at', row.claimed_at).maybeSingle();
        if (ownerError) throw new Error('Reminder claim lookup failed');
        if (!owned) return { ...out, uncertain: 1, reason: 'claim_lost' };
        let accepted = 0;
        let lastError = null;
        for (let offset = 0; offset < subscriptions.length; offset += 4) {
            const ttl = Math.floor((expiresAt - now()) / 1000);
            if (ttl <= 0) break;
            const group = subscriptions.slice(offset, offset + 4);
            const payload = {
                title: row.title, body: row.body, url: row.url, tag: row.tag,
                icon: row.icon_url || undefined, badge: row.badge_url || undefined,
                data: { event: row.event, outboxId: row.id, expiresAt },
            };
            providerStarted = true;
            const results = await Promise.all(group.map(sub => send(sub, payload, { ttl })));
            for (let i = 0; i < results.length; i++) {
                const result = results[i], sub = group[i];
                if (result.ok) {
                    accepted++;
                    // Subscription telemetry never turns provider acceptance into failure.
                    await supabase.from('push_subscriptions')
                        .update({ last_used_at: new Date(now()).toISOString(), failure_count: 0, last_failure_reason: null })
                        .eq('id', sub.id);
                } else {
                    lastError = result.error || 'provider_refused';
                    if (result.expired) {
                        await supabase.from('push_subscriptions').update({ is_active: false,
                            last_failure_reason: `expired_${result.statusCode || 410}` }).eq('id', sub.id);
                        out.deactivated++;
                    } else if (await recordSendFailure(supabase, sub.id, result)) out.deactivated++;
                }
            }
        }
        if (accepted > 0) {
            await updateClaim(supabase, row, { status: 'sent', sent_at: new Date(now()).toISOString(), failure_reason: null });
            return { ...out, sent: 1 };
        }
        if (expiresAt <= now()) return await skip('reminder_expired');
        await updateClaim(supabase, row, { status: row.attempts >= 5 ? 'failed' : 'pending',
            claimed_at: null, failure_reason: String(lastError || 'provider_refused').slice(0, 300) });
        return { ...out, failed: 1 };
    } catch (error) {
        if (providerStarted) {
            console.warn('[tournament-reminder] Delivery acknowledgment uncertain:', row.id);
            return { ...out, uncertain: 1, reason: 'delivery_acknowledgment_uncertain' };
        }
        try {
            await updateClaim(supabase, row, { status: row.attempts >= 5 ? 'failed' : 'pending',
                claimed_at: null, failure_reason: String(error?.message || 'reminder_read_failed').slice(0, 300) });
        } catch {
            return { ...out, uncertain: 1, reason: 'claim_acknowledgment_uncertain' };
        }
        return { ...out, failed: 1, reason: 'retryable_read_failure' };
    }
}

export async function dispatchTournamentReminders(supabase, options = {}) {
    const now = options.now || Date.now;
    const startedAt = now();
    const { data: rows, error } = await supabase.rpc('claim_tournament_reminder_pushes', { p_limit: 100, p_max_attempts: 5 });
    if (error || !Array.isArray(rows)) throw new Error('Reminder queue claim failed');
    const stats = { claimed: rows.length, sent: 0, skipped: 0, failed: 0, deactivated: 0, uncertain: 0, released: 0 };
    for (const row of rows) {
        if (now() - startedAt >= 45_000) {
            await updateClaim(supabase, row, { status: 'pending', claimed_at: null,
                attempts: Math.max(0, row.attempts - 1), failure_reason: 'time_budget_exhausted' });
            stats.released++;
            continue;
        }
        const result = await deliverTournamentReminder(supabase, row, options);
        for (const key of ['sent', 'skipped', 'failed', 'deactivated', 'uncertain']) stats[key] += result[key];
    }
    return { ok: stats.failed === 0 && stats.uncertain === 0, reminderProtocol: 1, ...stats };
}

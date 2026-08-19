/**
 * ===========================================================================
 *  CRON: /api/cron/push-dispatch
 *  Schedule: every 5 minutes, from Open Claw (Hetzner), NOT vercel.json.
 *            See CLAUDE.md section 11 -- vercel.json crons are frozen.
 *
 *  THE DURABILITY LAYER.
 *
 *  Inline delivery (push-enqueue -> push-deliver) is what makes a phone buzz
 *  within a second. This cron is what makes the system HONEST: if the serverless
 *  function died mid-send, if FCM was having a bad afternoon, if VAPID env vars
 *  were missing when the event fired -- the outbox row is still sitting there as
 *  `pending` and this run drains it.
 *
 *  Order of operations matters:
 *    1. Claim a deduplicated slot in push_dispatch_runs. Two dispatchers alive
 *       at once (which has happened -- see the duplicate-dispatcher incident in
 *       CLAUDE.md) would otherwise double-send every queued push.
 *    2. requeue_stuck_push_outbox() -- reclaim rows a crashed run left in
 *       `processing` for more than 15 minutes.
 *    3. claim_push_outbox_batch() -- FOR UPDATE SKIP LOCKED, up to 100 rows.
 *       Must be an RPC: PostgREST cannot express SKIP LOCKED.
 *    4. Send, and record the outcome per subscription.
 *
 *  Auth: standard repo cron guard (x-cron-secret / Bearer / ?secret=).
 *  Idempotent: re-running sends nothing twice -- claimed rows leave `pending`.
 * ===========================================================================
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { validateCronAuth } from '../../../src/utils/cron-auth';
import { withCronHealth } from '../../../src/lib/cronHealth';
import { sendWebPush, isPushConfigured } from '../../../src/lib/push/web-push';
import { recordSendFailure } from '../../../src/lib/push/push-deliver';
import { loadGateContext, gateDecision, needsDailyCount, countSentToday } from '../../../src/lib/push/push-gate';

// Vercel's default Pages-Router function timeout is short, and this route
// fans out to every subscription of up to BATCH_LIMIT recipients. Give it room,
// then police ourselves with TIME_BUDGET_MS so we always exit cleanly and leave
// unprocessed rows `pending` for the next tick instead of being killed
// mid-flight (which is what strands rows in `processing`).
export const config = { maxDuration: 300 };

const TIME_BUDGET_MS = 240_000;
// Raised from 100. Per-recipient device sends are parallel and each send has a
// 10s cap, so the real limiter is TIME_BUDGET_MS, not this number. At 100 a
// burst of a few hundred notifications took nearly an hour to reach phones.
const BATCH_LIMIT = 300;

// A push about something that happened an hour ago is not news, it is noise.
// Rows older than this are retired unsent. This bounds two real scenarios:
// a backlog that built up during an outage being dumped on users all at once,
// and a bulk backfill of `notifications` reaching phones long after the fact.
// The in-app bell still has every one of them -- that is the durable record.
const MAX_DELIVERY_AGE_MS = 60 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const STUCK_AFTER_MINUTES = 15;
const SLOT_MINUTES = 5;

let _supabase = null;
function getSupabase() {
    if (!_supabase) _supabase = createClient();
    return _supabase;
}

/** Floor `now` to the nearest 5-minute slot so a double-fire collides. */
function currentSlot() {
    const d = new Date();
    d.setUTCSeconds(0, 0);
    d.setUTCMinutes(Math.floor(d.getUTCMinutes() / SLOT_MINUTES) * SLOT_MINUTES);
    return d.toISOString();
}

async function handler(req, res) {
    let authed;
    try {
        authed = validateCronAuth(req);
    } catch (e) {
        return res.status(500).json({ error: 'Cron authentication is not configured' });
    }
    if (!authed) return res.status(401).json({ error: 'Unauthorized' });

    const startedAt = Date.now();
    const supabase = getSupabase();
    const slot = currentSlot();

    // ---- 1. Deduplicated slot claim ---------------------------------------
    const { data: runRow, error: runErr } = await supabase
        .from('push_dispatch_runs')
        .insert({ job: 'push-dispatch', slot })
        .select('id')
        .maybeSingle();

    if (runErr) {
        // Unique violation means another dispatcher already owns this slot.
        if (String(runErr.code) === '23505' || /duplicate key/i.test(runErr.message || '')) {
            return res.status(200).json({ ok: true, skipped: 'slot_already_claimed', slot });
        }
        return res.status(500).json({ error: runErr.message });
    }
    const runId = runRow?.id || null;

    const stats = { requeued: 0, claimed: 0, sent: 0, failed: 0, skipped: 0, deactivated: 0 };

    const finish = async (note) => {
        if (!runId) return;
        try {
            await supabase.from('push_dispatch_runs').update({
                finished_at: new Date().toISOString(),
                claimed: stats.claimed, sent: stats.sent,
                failed: stats.failed, skipped: stats.skipped,
                note: note || null,
            }).eq('id', runId);
        } catch { /* ignore */ }
    };

    if (!isPushConfigured()) {
        await finish('vapid_not_configured');
        return res.status(200).json({ ok: false, reason: 'vapid_not_configured', ...stats });
    }

    try {
        // ---- 2. Crash recovery --------------------------------------------
        const { data: requeued } = await supabase
            .rpc('requeue_stuck_push_outbox', { p_stale_minutes: STUCK_AFTER_MINUTES });
        stats.requeued = typeof requeued === 'number' ? requeued : 0;

        // ---- 3. Claim ------------------------------------------------------
        const { data: batch, error: claimErr } = await supabase
            .rpc('claim_push_outbox_batch', { p_limit: BATCH_LIMIT, p_max_attempts: MAX_ATTEMPTS });

        if (claimErr) {
            await finish(`claim_failed:${claimErr.message}`);
            return res.status(500).json({ error: claimErr.message });
        }

        const rows = batch || [];
        stats.claimed = rows.length;

        // GATE AT SEND TIME, not at queue time.
        //
        // Rows arrive here from two places: enqueuePush (already gated once)
        // and the DB trigger that mirrors every `notifications` row, which has
        // never seen a preference in its life. Gating here is what makes the
        // trigger path safe, and it also means a user who mutes at 22:00 is not
        // pushed by a row that was queued at 21:58.
        //
        // Batched: two queries for the whole run, then pure in-memory decisions.
        const gateCtx = await loadGateContext(
            supabase,
            rows.map((r) => r.recipient_user_id).filter(Boolean)
        );

        if (rows.length === 0) {
            await finish('nothing_pending');
            return res.status(200).json({ ok: true, ...stats, slot });
        }

        // ---- 4. Send -------------------------------------------------------
        const nowIso = new Date().toISOString();

        let ranOutOfTime = false;

        for (const row of rows) {
            // Stop cleanly before the platform kills us. Remaining rows are
            // still `processing`; requeue_stuck_push_outbox reclaims them.
            if (Date.now() - startedAt > TIME_BUDGET_MS) {
                ranOutOfTime = true;
                // Give the attempt back. claim_push_outbox_batch already did
                // attempts = attempts + 1 for this row, but nothing was actually
                // attempted. Without the decrement a row unlucky enough to sit at
                // the tail of five consecutive over-budget runs reaches
                // attempts = MAX_ATTEMPTS and is failed permanently having never
                // been sent once.
                await supabase.from('push_outbox')
                    .update({
                        status: 'pending',
                        claimed_at: null,
                        attempts: Math.max(0, (row.attempts || 1) - 1),
                        failure_reason: 'time_budget_exhausted',
                    })
                    .eq('id', row.id);
                stats.skipped += 1;
                continue;
            }

            if (!row.recipient_user_id) {
                await supabase.from('push_outbox')
                    .update({ status: 'skipped', failure_reason: 'no_recipient' })
                    .eq('id', row.id);
                stats.skipped += 1;
                continue;
            }

            // ---- staleness ------------------------------------------------
            const ageMs = Date.now() - Date.parse(row.created_at || 0);
            if (Number.isFinite(ageMs) && ageMs > MAX_DELIVERY_AGE_MS) {
                await supabase.from('push_outbox')
                    .update({ status: 'skipped', failure_reason: 'too_stale_to_deliver' })
                    .eq('id', row.id);
                stats.skipped += 1;
                continue;
            }

            // ---- preference gate ------------------------------------------
            const entry = gateCtx.get(row.recipient_user_id) || { prefs: null, legacy: null };
            const gateOpts = {};
            if (needsDailyCount(entry, row.event)) {
                gateOpts.sentToday = await countSentToday(supabase, row.recipient_user_id);
            }
            const gate = gateDecision(entry, row.event, gateOpts);
            if (!gate.allowed) {
                await supabase.from('push_outbox')
                    .update({ status: 'skipped', failure_reason: gate.reason })
                    .eq('id', row.id);
                stats.skipped += 1;
                continue;
            }

            const { data: subs } = await supabase
                .from('push_subscriptions')
                .select('id, endpoint, p256dh, auth')
                .eq('user_id', row.recipient_user_id)
                .eq('is_active', true);

            if (!subs || subs.length === 0) {
                await supabase.from('push_outbox')
                    .update({ status: 'skipped', failure_reason: 'no_subscription' })
                    .eq('id', row.id);
                stats.skipped += 1;
                continue;
            }

            const payload = {
                title: row.title,
                body: row.body,
                url: row.url,
                tag: row.tag || undefined,
                icon: row.icon_url || undefined,
                badge: row.badge_url || undefined,
                data: { event: row.event, outboxId: row.id },
            };

            let accepted = 0;
            let lastError = null;

            // One recipient's devices go out in parallel. A slow Apple endpoint
            // must not delay that user's Android tablet, and sequential sends
            // across 100 recipients is what pushes this run past its budget.
            const results = await Promise.all(subs.map((sub) => sendWebPush(sub, payload)));

            await Promise.all(results.map(async (result, i) => {
                const sub = subs[i];
                if (result.ok) {
                    accepted += 1;
                    await supabase.from('push_subscriptions')
                        .update({ last_used_at: nowIso, failure_count: 0, last_failure_reason: null })
                        .eq('id', sub.id);
                    return;
                }
                lastError = result.error;
                if (result.expired) {
                    stats.deactivated += 1;
                    await supabase.from('push_subscriptions')
                        .update({
                            is_active: false,
                            last_failure_reason: `expired_${result.statusCode || 410}`,
                            updated_at: nowIso,
                        })
                        .eq('id', sub.id);
                    return;
                }
                // Shared with deliverPushNow so the two delivery paths cannot
                // drift. This copy previously incremented failure_count and
                // never acted on it, so a permanently-failing endpoint was
                // retried on every run forever -- and since the DB mirror
                // trigger makes THIS the dominant path, the retirement logic
                // was effectively dead.
                if (await recordSendFailure(supabase, sub.id, result, nowIso)) {
                    stats.deactivated += 1;
                }
            }));

            if (accepted > 0) {
                stats.sent += 1;
                await supabase.from('push_outbox')
                    .update({ status: 'sent', sent_at: new Date().toISOString(), failure_reason: null })
                    .eq('id', row.id);
            } else if ((row.attempts || 1) >= MAX_ATTEMPTS) {
                stats.failed += 1;
                await supabase.from('push_outbox')
                    .update({ status: 'failed', failure_reason: String(lastError || 'all endpoints failed').slice(0, 300) })
                    .eq('id', row.id);
            } else {
                // Back to pending -- the next run retries. attempts was already
                // incremented inside claim_push_outbox_batch().
                stats.failed += 1;
                await supabase.from('push_outbox')
                    .update({ status: 'pending', failure_reason: String(lastError || 'retry').slice(0, 300) })
                    .eq('id', row.id);
            }
        }

        await finish(ranOutOfTime ? 'time_budget_exhausted' : null);
        return res.status(200).json({ ok: true, ...stats, slot });
    } catch (e) {
        await finish(`threw:${e?.message || e}`);
        return res.status(500).json({ error: e?.message || 'push-dispatch failed' });
    }
}

export default withCronHealth('push-dispatch', handler);

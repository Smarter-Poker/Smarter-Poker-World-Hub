#!/usr/bin/env node
/*
 * Physical-device call verification conductor (suite messenger-calls-device).
 *
 * The person holding the device signs in, on that device, to an ORDINARY
 * account they created and control (role user or player, created in the last
 * 30 days, not a horse). The script is given only that account's email
 * (DEVICE_USER_EMAIL), resolves its id, and never signs in as it or sees its
 * password. It refuses any elevated account, including the god-mode service
 * identity: nothing in this test needs more than a member's permissions.
 * DEVICE_KIND (iphone or ipad) keeps each device's evidence separate; iPadOS
 * Safari reports a Mac user agent, so the kind is stated, not guessed. It creates ONE throwaway partner
 * ("Call Verification Partner", example.com, hard-deleted at the end), drives
 * that partner in headless Chromium with a synthetic camera and microphone,
 * and posts each next step into the shared chat so the person holding the
 * phone can follow along.
 *
 * Evidence is kept in three separate tiers, never merged:
 *   dispatch  - push_outbox row for the call is `sent` and the device
 *               subscription's last_used_at advanced (Apple's push service
 *               accepted it from our server);
 *   delivery  - that subscription's last_receipt_at advanced (the device's
 *               service worker handled the push and reported it);
 *   accept    - the device joined the call room (the partner receives its
 *               camera and microphone);
 *   banner    - the person's own report of whether the call banner appeared
 *               on the device screen. Only this records a visible banner:
 *               dispatch, a worker receipt and joining the room do not.
 *
 * Cleanup removes the partner, the thread, its call rows and notifications,
 * the push_outbox rows for these calls, and ONLY the Apple push subscription
 * the account created for this test (created at or after DEVICE_SINCE).
 */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
    APP_ORIGIN, sleep, until, clients, assertLiveRevision, createProbeUser,
    createConversation, cleanup, cleanupFailed, audioPeak, videos, remoteFrameSignature,
    signatureDistance, callOpen, incomingOpen, openDevice,
} from './messenger-calls-lib.mjs';

const RESULT_DIR = 'test-results/messenger-calls-device';
const APPLE_PUSH = /^https:\/\/web\.push\.apple\.com\//;
const RECEIPT_PREFIX = '[CALL_RECEIPT]';

export const PROMPTS = {
    hello: 'Call verification partner here. Open the menu and tap Turn On Notifications (then Allow), come back to this chat and reply READY.',
    leave: 'Thanks. Now leave the app: go to the Home Screen or lock the screen. I will video-call in 30 seconds. If a call banner appears, tap it, then tap Accept.',
    banner: 'Did a call banner appear on the Home Screen or Lock Screen when I called? Reply BANNER YES or BANNER NO.',
    noPush: 'No push subscription from this device was found, so the push step is skipped. Keep this chat open and reply CALL to be called now.',
    retry: 'The call was not answered. Open this chat and reply CALL to be called again while the app is open.',
    callBack: 'Last step: tap the video camera icon at the top of this chat to call me. I will answer and hang up after about 20 seconds.',
    done: 'Verification finished. Thank you. You can close the app.',
};

export const DEVICE_KINDS = { iphone: 'iPhone', ipad: 'iPad' };
const ELEVATED = new Set(['god', 'admin', 'venue_owner']);

/** Only an ordinary, recently created account the person controls may be the callee. */
export function deviceAccountRefusal(profile, now = Date.now()) {
    if (!profile) return 'No account with that email';
    if (ELEVATED.has(profile.role) || !['user', 'player'].includes(profile.role)) return `Refused: role ${profile.role} is elevated; use an ordinary account you created for this test`;
    if (profile.is_horse) return 'Refused: a horse account cannot hold a device';
    if (/@call-probe\.example\.com$/i.test(profile.email || '')) return 'Refused: a probe account cannot hold a device';
    if (!profile.created_at || now - new Date(profile.created_at).getTime() > 30 * 86400000) return 'Refused: use an account created for this test in the last 30 days';
    return null;
}

/** Parse the person's own report of the banner. */
export function bannerAnswer(text) {
    const m = /\bbanner\s+(yes|no)\b/i.exec(text || '');
    return m ? m[1].toLowerCase() : null;
}

export function iosVersion(userAgent) {
    const match = /(?:iPhone|CPU) OS (\d+)_(\d+)(?:_(\d+))?/.exec(userAgent || '');
    const safari = /Version\/([\d.]+)/.exec(userAgent || '');
    return { ios: match ? [match[1], match[2], match[3]].filter(Boolean).join('.') : null, safari: safari ? safari[1] : null };
}

/** Scene changes in a signature timeline: a camera flip shows as a large jump. */
export function sceneChanges(samples, threshold = 35) {
    const changes = [];
    for (let i = 1; i < samples.length; i++) {
        const a = samples[i - 1], b = samples[i];
        if (!a.signature || !b.signature) continue;
        const distance = signatureDistance(a.signature, b.signature);
        if (distance >= threshold || a.signature.size !== b.signature.size) changes.push({ atSecond: b.t, distance: Math.round(distance), from: a.signature.size, to: b.signature.size });
    }
    return changes;
}

/**
 * A cancelled earlier run cannot clean up after itself, and its partner would
 * sit in the test account's inbox beside the new one. Remove only earlier
 * conductor partners: probe email domain, probe flag, partner name, created
 * more than 20 minutes ago. Everything else is untouched.
 */
export const STALE_PARTNER_MS = 20 * 60000;
export function isStalePartner(user, now = Date.now()) {
    return Boolean(user?.email?.endsWith('@call-probe.example.com') && /^messenger-call-probe-dev-/.test(user.email)
        && user.user_metadata?.messenger_call_probe === true && now - new Date(user.created_at).getTime() > STALE_PARTNER_MS);
}
async function removeStalePartners(admin) {
    const removed = [];
    for (let page = 1; page <= 20; page++) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
        if (error || !data?.users?.length) break;
        for (const user of data.users.filter(u => isStalePartner(u))) {
            const { data: parts } = await admin.from('social_conversation_participants').select('conversation_id').eq('user_id', user.id);
            const convs = (parts || []).map(p => p.conversation_id);
            if (convs.length) {
                await admin.from('social_messages').delete().in('conversation_id', convs);
                await admin.from('social_conversation_participants').delete().in('conversation_id', convs);
                await admin.from('social_conversations').delete().in('id', convs);
            }
            await admin.from('pending_calls').delete().or(`caller_id.eq.${user.id},callee_id.eq.${user.id}`);
            await admin.from('notifications').delete().or(`user_id.eq.${user.id},actor_id.eq.${user.id}`);
            await admin.from('push_outbox').delete().eq('recipient_user_id', user.id);
            const { error: delError } = await admin.auth.admin.deleteUser(user.id);
            await admin.from('profiles').delete().eq('id', user.id);
            removed.push({ created: user.created_at, threads: convs.length, deleted: !delError });
        }
        if (data.users.length < 1000) break;
    }
    return removed;
}

async function main() {
    for (const name of ['DEVICE_USER_EMAIL', 'DEVICE_KIND', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'MESSENGER_EXPECTED_SHA', 'DEVICE_SINCE']) assert.ok(process.env[name]?.trim(), `${name} is required`);
    const D = DEVICE_KINDS[process.env.DEVICE_KIND.trim().toLowerCase()];
    assert.ok(D, 'DEVICE_KIND must be iphone or ipad');
    const since = new Date(process.env.DEVICE_SINCE);
    assert.ok(!Number.isNaN(since.getTime()) && since < new Date(), 'DEVICE_SINCE must be a past ISO time');
    const waitMinutes = Math.min(Math.max(Number(process.env.DEVICE_WAIT_MINUTES) || 30, 5), 300);
    mkdirSync(RESULT_DIR, { recursive: true });

    const report = { suite: 'messenger-calls-device', deviceKind: D, startedAt: new Date().toISOString(), since: since.toISOString(), checks: [], device: null, push: null, cleanup: null };
    const check = (name, ok, evidence) => { report.checks.push({ name, ok: Boolean(ok), evidence }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); };
    const created = { users: [], conversations: [] };
    const deviceSubscriptions = new Set();
    let othersBefore = [];
    const outboxIds = new Set();
    const sb = await clients();
    const { admin } = sb;
    let chrome;
    // GitHub cancels with SIGINT, then SIGTERM. Turn the first signal into an
    // error inside the run so the finally block below still cleans up.
    let cancelled = null;
    let finished = false;
    const finish = async () => {
        if (finished) return;
        finished = true;
        await chrome?.close().catch(() => {});
        report.cleanup = await cleanup(admin, created, async () => {
            const result = {};
            if (outboxIds.size) result.devicePushOutbox = (await admin.from('push_outbox').delete().in('id', [...outboxIds])).error?.message || 'ok';
            if (created.users.length) result.testAccountCallNotifications = (await admin.from('notifications').delete().in('actor_id', created.users)).error?.message || 'ok';
            if (deviceSubscriptions.size) {
                const ids = [...deviceSubscriptions];
                const { error } = await admin.from('push_subscriptions').delete().in('id', ids);
                const { data: left } = await admin.from('push_subscriptions').select('id').in('id', ids);
                result.deviceSubscription = !error && !(left || []).length ? 'ok' : `NOT REMOVED: ${error?.message || 'still present'}`;
            }
            // Put back any other account's subscription the test switched off.
            // Only rows on the test enrolment's own endpoint: those are the ones
            // the one-account-per-endpoint rule switched off because of us.
            const ours = new Set(report.device?.endpoint ? [report.device.endpoint] : []);
            const affected = othersBefore.filter(o => ours.has(o.endpoint));
            if (affected.length) {
                const { data: now } = await admin.from('push_subscriptions').select('id').in('id', affected.map(o => o.id)).eq('is_active', false);
                const restore = (now || []).map(r => r.id);
                if (restore.length) {
                    const { error } = await admin.from('push_subscriptions').update({ is_active: true }).in('id', restore);
                    result.restoredOtherSubscriptions = error ? `NOT RESTORED: ${error.message}` : 'ok';
                }
            }
            return result;
        });
        report.finishedAt = new Date().toISOString();
        if (report.device) delete report.device.endpoint;
        writeFileSync(`${RESULT_DIR}/result.json`, JSON.stringify(report, null, 2));
        console.log(JSON.stringify({ device: report.device, push: report.push, checks: report.checks.map(c => `${c.ok ? 'PASS' : 'FAIL'} ${c.name}`), cleanup: report.cleanup, error: report.error }, null, 2));
        };
    const onSignal = signal => {
        cancelled = signal;
        report.error = `Cancelled (${signal})`;
        finish().finally(() => process.exit(1));
    };
    process.once('SIGINT', onSignal);
    process.once('SIGTERM', onSignal);
    try {
        report.health = await assertLiveRevision();
        const email = process.env.DEVICE_USER_EMAIL.trim().toLowerCase();
        const { data: profile } = await admin.from('profiles').select('id, role, is_horse, email, created_at').ilike('email', email).maybeSingle();
        const refusal = deviceAccountRefusal(profile);
        if (refusal) throw new Error(refusal);
        const A = profile.id;
        report.account = { role: profile.role, createdAt: profile.created_at };
        // Every other account's live Apple subscription, so the test can prove
        // it changed none of them (one account per endpoint: if a second Home
        // Screen icon shared the device endpoint, enrolling the test account
        // would switch the owner's row off) and restore any it did.
        othersBefore = ((await admin.from('push_subscriptions').select('id, user_id, endpoint').eq('is_active', true).neq('user_id', A).like('endpoint', 'https://web.push.apple.com/%')).data || []);
        report.stalePartnersRemoved = await removeStalePartners(admin);
        const B = await createProbeUser(sb, created, 'dev', 'Call Verification Partner');
        const conversationId = await createConversation(admin, created, A, B.id);
        const post = async content => {
            const now = new Date().toISOString();
            await admin.from('social_messages').insert({ conversation_id: conversationId, sender_id: B.id, content, message_type: 'text' });
            await admin.from('social_conversations').update({ last_message_at: now, last_message_preview: content.slice(0, 120) }).eq('id', conversationId);
        };
        const messagesFromA = async after => (await admin.from('social_messages').select('content, created_at').eq('conversation_id', conversationId).eq('sender_id', A).gt('created_at', after).order('created_at')).data || [];
        const waitForReply = async (pattern, after, minutes) => until(async () => (await messagesFromA(after)).find(m => pattern.test(m.content || '')), { timeout: minutes * 60000, interval: 2000, message: `No reply matching ${pattern} within ${minutes} minutes` });
        const deviceSubscription = async () => {
            const { data } = await admin.from('push_subscriptions').select('id, endpoint, user_agent, device_label, platform, is_active, created_at, last_used_at, last_receipt_at').eq('user_id', A).eq('is_active', true).gte('created_at', since.toISOString()).order('created_at', { ascending: false });
            const rows = (data || []).filter(row => APPLE_PUSH.test(row.endpoint || ''));
            rows.forEach(row => deviceSubscriptions.add(row.id));
            return rows[0] || null;
        };

        const { chromium } = await import('playwright');
        chrome = await chromium.launch({ headless: true, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
        report.partnerBrowser = `Chromium ${chrome.version()} (headless, synthetic camera and microphone)`;
        const { page } = await openDevice(chrome, B.session, { viewport: { width: 1280, height: 800 } }, { grantMedia: true });
        await page.goto(`${APP_ORIGIN}/hub/messenger?conversation=${conversationId}`, { waitUntil: 'domcontentloaded' });
        await page.getByLabel('Start Video Call', { exact: true }).waitFor({ timeout: 60000 });

        // ── 0. Ready ──────────────────────────────────────────────────────
        const helloAt = new Date().toISOString();
        await post(PROMPTS.hello);
        console.log(`Waiting up to ${waitMinutes} minutes for READY from the ${D}`);
        const ready = await waitForReply(/\bready\b/i, helloAt, waitMinutes);
        check(`${D}: real keyboard outside a call, message typed on the device reached the partner`, true, { at: ready.created_at });

        const sub = await deviceSubscription();
        report.device = sub ? { subscriptionId: sub.id, endpoint: sub.endpoint, userAgent: sub.user_agent, label: sub.device_label, platform: sub.platform, ...iosVersion(sub.user_agent), enrolledAt: sub.created_at } : null;
        if (sub) {
            const stillActive = new Set(((await admin.from('push_subscriptions').select('id').in('id', othersBefore.map(o => o.id)).eq('is_active', true)).data || []).map(r => r.id));
            const switchedOff = othersBefore.filter(o => !stillActive.has(o.id));
            const sharedEndpoint = othersBefore.some(o => o.endpoint === sub.endpoint);
            report.isolation = { otherAppleSubscriptions: othersBefore.length, switchedOff: switchedOff.length, sharedEndpoint };
            check(`${D}: separate Home Screen icon has its own push endpoint and no other account's subscription was switched off`, !sharedEndpoint && switchedOff.length === 0, report.isolation);
        }

        const receiptsSince = async (after, senderId) => ((await admin.from('social_messages').select('sender_id, content').eq('conversation_id', conversationId).like('content', `${RECEIPT_PREFIX}%`).gt('created_at', after)).data || [])
            .map(r => ({ sender: r.sender_id === senderId ? 'expected' : r.sender_id === A ? 'device' : 'partner', status: JSON.parse(r.content.slice(RECEIPT_PREFIX.length)).status }));

        const placeCall = async () => {
            await page.getByLabel('Start Video Call', { exact: true }).click();
            return new Date().toISOString();
        };
        const connected = async ms => until(async () => { const v = await videos(page); return v.remote >= 1 ? v : null; }, { timeout: ms, interval: 500 }).catch(() => null);

        // ── 1. Push: dispatch, delivery, accept ───────────────────────────
        let callStart = null;
        let joined = null;
        if (sub) {
            await post(PROMPTS.leave);
            await sleep(30000);
            const before = await deviceSubscription();
            callStart = await placeCall();
            joined = await connected(55000);
            const after = (await admin.from('push_subscriptions').select('last_used_at, last_receipt_at, last_failure_reason').eq('id', sub.id).maybeSingle()).data;
            const { data: outbox } = await admin.from('push_outbox').select('id, status, failure_reason, sent_at, created_at').eq('recipient_user_id', A).eq('event', 'incoming_call').gte('created_at', callStart);
            (outbox || []).forEach(row => outboxIds.add(row.id));
            const advanced = (x, y) => Boolean(y && (!x || new Date(y) > new Date(x)) && new Date(y) >= new Date(callStart));
            report.push = {
                dispatch: { outbox: (outbox || []).map(r => ({ status: r.status, failure: r.failure_reason, sentAt: r.sent_at })), subscriptionLastUsedAdvanced: advanced(before?.last_used_at, after?.last_used_at), lastFailure: after?.last_failure_reason || null },
                delivery: { lastReceiptAdvanced: advanced(before?.last_receipt_at, after?.last_receipt_at), lastReceiptAt: after?.last_receipt_at || null },
                accept: { deviceJoined: Boolean(joined), partnerView: joined },
            };
            check(`${D} server acceptance: incoming-call push sent to its subscription (not proof of a banner)`, report.push.dispatch.outbox.some(r => r.status === 'sent') && report.push.dispatch.subscriptionLastUsedAdvanced, report.push.dispatch);
            check(`${D} worker receipt: the service worker handled the push and reported it (not proof of a visible banner)`, report.push.delivery.lastReceiptAdvanced, report.push.delivery);
            check(`${D} accept: the device opened the call and joined the room (not proof of a visible banner)`, Boolean(joined), report.push.accept);
            const bell = ((await admin.from('notifications').select('id').eq('user_id', A).eq('type', 'incoming_call').gte('created_at', callStart)).data || []).length;
            check('One incoming-call notification for the ringing call (bell row)', bell <= 1 && (outbox || []).length === 1, { bellRowsNow: bell, incomingCallPushes: (outbox || []).length });
            if (!joined) {
                await until(async () => !(await callOpen(page)), { timeout: 30000 }).catch(() => {});
                await sleep(3000);
                report.unansweredPushCallReceipts = await receiptsSince(callStart, B.id);
            }
        }
        if (!joined) {
            const askedAt = new Date().toISOString();
            await post(sub ? PROMPTS.retry : PROMPTS.noPush);
            await waitForReply(/\bcall\b/i, askedAt, 10);
            await sleep(3000);
            callStart = await placeCall();
            joined = await connected(60000);
            check(`${D} foreground call: answered from the ringing screen`, Boolean(joined), joined);
        }

        // ── 2. Media, camera switch, minimize + keyboard, restore, hang up ─
        if (joined) {
            const samples = [];
            const t0 = Date.now();
            let lastMessageCheck = callStart;
            const typedDuringCall = [];
            while (Date.now() - t0 < 8 * 60000) {
                if (!(await callOpen(page))) break;
                const view = await videos(page);
                const signature = await remoteFrameSignature(page).catch(() => null);
                const audio = await audioPeak(page, 1000).catch(() => ({ streams: 0, peak: 0 }));
                samples.push({ t: Math.round((Date.now() - t0) / 1000), remoteVideo: view.remote, size: view.remoteSize, audioStreams: audio.streams, peak: Number(audio.peak.toFixed(4)), signature });
                for (const m of await messagesFromA(lastMessageCheck)) { typedDuringCall.push({ atSecond: Math.round((new Date(m.created_at) - t0) / 1000), text: String(m.content).slice(0, 80) }); lastMessageCheck = m.created_at; }
                await sleep(1000);
            }
            const endedByIphone = !(await callOpen(page));
            const audible = samples.filter(s => s.peak >= 0.01).length;
            const flips = sceneChanges(samples);
            const firstTyped = typedDuringCall[0];
            const afterTyped = firstTyped ? samples.filter(s => s.t >= firstTyped.atSecond - 10) : [];
            report.media = { seconds: samples.at(-1)?.t || 0, samples: samples.map(({ signature, ...rest }) => rest), sceneChanges: flips, typedDuringCall, endedByIphone };
            check(`${D} two-way media: the partner received the device camera`, samples.some(s => s.remoteVideo >= 1 && s.size), { sizes: [...new Set(samples.map(s => s.size).filter(Boolean))] });
            check(`${D} two-way media: the partner heard the device microphone`, audible > 0, { audibleSeconds: audible, maxPeak: Math.max(0, ...samples.map(s => s.peak)) });
            check(`${D} camera switch:`+' the partner saw the scene change when the camera flipped', flips.length >= 1, { sceneChanges: flips });
            check(`${D} minimized call with the real keyboard:`+' a message typed during the call reached the partner', Boolean(firstTyped), { typedDuringCall });
            check(`${D} minimize and restore kept the call:`+' audio and video stayed connected from typing to hang-up', afterTyped.length > 0 && afterTyped.every(s => s.audioStreams >= 1 && s.remoteVideo >= 1), { samplesAfterTyping: afterTyped.length, gaps: afterTyped.filter(s => !(s.audioStreams >= 1 && s.remoteVideo >= 1)).map(s => s.t) });
            check(`${D} hang-up closed the partner call screen`, endedByIphone, null);
            await sleep(6000);
            const receipts = await receiptsSince(callStart, B.id);
            check('Exactly one receipt for the answered call, written by the caller', receipts.length === 1 && receipts[0].sender === 'expected' && receipts[0].status === 'completed', { receipts });
            const leftover = ((await admin.from('notifications').select('id').eq('user_id', A).eq('type', 'incoming_call').gte('created_at', callStart)).data || []).length;
            const rawPush = ((await admin.from('push_outbox').select('id').eq('recipient_user_id', A).like('body', '%[CALL_RECEIPT]%').gte('created_at', callStart)).data || []).length;
            check('The ringing notification is cleared and no raw receipt push reached the phone', leftover === 0 && rawPush === 0, { ringingRowsLeft: leftover, rawReceiptPushes: rawPush });
        }

        // ── 2b. What the person actually saw ─────────────────────────────
        if (sub) {
            const bannerAskedAt = new Date().toISOString();
            await post(PROMPTS.banner);
            const reply = await waitForReply(/\bbanner\s+(yes|no)\b/i, bannerAskedAt, 10).catch(() => null);
            const seen = reply ? bannerAnswer(reply.content) : null;
            report.push.visibleBanner = { observedBy: 'person holding the device', answer: seen || 'no answer', at: reply?.created_at || null };
            check(`${D} visible banner: the person reports the call banner appeared on screen`, seen === 'yes', report.push.visibleBanner);
        }

        // ── 3. The device calls the partner ───────────────────────────────
        const askedAt = new Date().toISOString();
        await post(PROMPTS.callBack);
        const rang = await until(() => incomingOpen(page), { timeout: 10 * 60000, interval: 1000 }).then(() => true, () => false);
        check(`${D} as caller: the partner rang`, rang, null);
        if (rang) {
            await page.getByRole('button', { name: 'Accept Call', exact: true }).click();
            const view = await connected(40000);
            const audio = view ? await audioPeak(page, 3000) : null;
            check(`${D} as caller: the partner received the device camera and microphone`, Boolean(view) && audio?.streams >= 1, { view, audio });
            await sleep(15000);
            const end = page.getByLabel('End Call', { exact: true });
            if (await end.count()) await end.first().click().catch(() => {});
            await sleep(6000);
            const receipts = await receiptsSince(askedAt, A);
            check(`Exactly one receipt for the ${D} call, written by the ${D}`, receipts.length === 1 && receipts[0].sender === 'expected' && receipts[0].status === 'completed', { receipts });
        }
        await post(PROMPTS.done);
        await sleep(2000);
    } catch (error) {
        report.error = cancelled ? `Cancelled (${cancelled})` : String(error?.message || error).slice(0, 300);
        console.log(`ERROR ${report.error}`);
    } finally {
        await finish();
    }
    if (report.error || cleanupFailed(report.cleanup) || report.checks.some(c => !c.ok)) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    if (process.argv.includes('--self-test')) {
        assert.deepEqual(iosVersion('Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Mobile/15E148 Safari/604.1'), { ios: '26.1', safari: '26.1' });
        const flat = { size: '640x480', grid: Array(64).fill(100) };
        const other = { size: '640x480', grid: Array(64).fill(20) };
        assert.equal(sceneChanges([{ t: 0, signature: flat }, { t: 2, signature: flat }, { t: 4, signature: other }]).length, 1);
        assert.ok(Object.values(PROMPTS).every(p => !/[\u{1F300}-\u{1FAFF}]/u.test(p)));
        const old = new Date(Date.now() - 30 * 60000).toISOString();
        assert.equal(isStalePartner({ email: 'messenger-call-probe-dev-1-ab@call-probe.example.com', user_metadata: { messenger_call_probe: true }, created_at: old }), true);
        assert.equal(isStalePartner({ email: 'messenger-call-probe-dev-1-ab@call-probe.example.com', user_metadata: { messenger_call_probe: true }, created_at: new Date().toISOString() }), false);
        assert.equal(isStalePartner({ email: 'daniel@smarter.poker', user_metadata: { messenger_call_probe: true }, created_at: old }), false);
        assert.equal(isStalePartner({ email: 'messenger-call-probe-ntc-1-ab@call-probe.example.com', user_metadata: { messenger_call_probe: true }, created_at: old }), false);
        const recent = new Date().toISOString();
        assert.equal(deviceAccountRefusal({ role: 'user', is_horse: false, email: 'me+calltest@example.org', created_at: recent }), null);
        assert.match(deviceAccountRefusal({ role: 'god', is_horse: false, email: 'x@example.org', created_at: recent }), /elevated/);
        assert.match(deviceAccountRefusal({ role: 'admin', is_horse: false, email: 'x@example.org', created_at: recent }), /elevated/);
        assert.match(deviceAccountRefusal({ role: 'user', is_horse: true, email: 'x@example.org', created_at: recent }), /horse/);
        assert.match(deviceAccountRefusal({ role: 'user', is_horse: false, email: 'x@example.org', created_at: '2025-01-01T00:00:00Z' }), /30 days/);
        assert.match(deviceAccountRefusal(null), /No account/);
        assert.equal(bannerAnswer('banner yes'), 'yes');
        assert.equal(bannerAnswer('BANNER NO thanks'), 'no');
        assert.equal(bannerAnswer('ready'), null);
        console.log('messenger-calls-device self-test passed');
    } else {
        await main();
    }
}

/*
 * Shared helpers for the focused call verification suites
 * (messenger-calls-webkit.mjs, messenger-calls-device.mjs). The established
 * messenger-calls-live.mjs keeps its own copy so its passing evidence is not
 * disturbed.
 *
 * Throwaway identities follow the signup probe's pattern: created with the
 * service role, RFC 2606 example.com address (never `.invalid`, which
 * fn_ca_is_cert_account hides from real inboxes), tagged in user_metadata and
 * hard-deleted, confirmed gone.
 */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { APP_ORIGIN, AUTH_ORIGIN } from './messenger-live-configuration.mjs';

export { APP_ORIGIN, AUTH_ORIGIN };
export const PROBE_DOMAIN = 'call-probe.example.com';
export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function until(fn, { timeout = 15000, interval = 250, message = 'Timed out' } = {}) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
        try { const value = await fn(); if (value) return value; } catch { /* keep polling */ }
        await sleep(interval);
    }
    throw new Error(message);
}

export function requireEnv(env, names) {
    for (const name of names) assert.ok(env[name]?.trim(), `${name} is required; no account or credential fallback is allowed`);
    assert.equal(env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, ''), AUTH_ORIGIN, 'Unexpected authentication origin');
    assert.match(env.MESSENGER_EXPECTED_SHA, /^[0-9a-f]{40}$/i, 'Expected deployed SHA must be a full commit');
}

export async function clients() {
    const { createClient } = await import('@supabase/supabase-js');
    const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
    return {
        createClient,
        admin: createClient(AUTH_ORIGIN, process.env.SUPABASE_SERVICE_ROLE_KEY, options),
        anon: () => createClient(AUTH_ORIGIN, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, options),
        options,
    };
}

export async function assertLiveRevision() {
    const health = await (await fetch(`${APP_ORIGIN}/api/health`, { cache: 'no-store', signal: AbortSignal.timeout(20000) })).json();
    assert.equal(health.commitSha, process.env.MESSENGER_EXPECTED_SHA, 'Live revision differs from expected protected revision');
    return health;
}

export async function signInTestAccount(anon) {
    const signed = await anon().auth.signInWithPassword({ email: process.env.TEST_USER_EMAIL, password: process.env.TEST_USER_PASSWORD });
    assert.ok(!signed.error && signed.data?.session?.access_token, 'Configured test account authentication failed; no fallback account was used');
    assert.equal(signed.data.session.user.email?.toLowerCase(), process.env.TEST_USER_EMAIL.toLowerCase(), 'Authenticated identity differs from configured test account');
    return signed.data.session;
}

export function probeEmail(role, now = Date.now(), random = randomBytes(4).toString('hex')) {
    assert.match(role, /^[a-z]{1,8}$/, 'Invalid probe role');
    return `messenger-call-probe-${role}-${now}-${random}@${PROBE_DOMAIN}`;
}

export async function createProbeUser({ admin, anon }, created, role, displayName) {
    const email = probeEmail(role);
    const password = `${randomBytes(24).toString('base64url')}aA1!`;
    const username = `callprobe_${role}_${randomBytes(3).toString('hex')}`;
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { messenger_call_probe: true, username } });
    assert.ok(!error && data?.user?.id, `Throwaway ${role} could not be created`);
    created.users.push(data.user.id);
    await until(async () => (await admin.from('profiles').select('id').eq('id', data.user.id).maybeSingle()).data, { timeout: 20000, message: `Throwaway ${role} profile was not created` });
    const { error: profileError } = await admin.from('profiles').update({ username, display_name: displayName }).eq('id', data.user.id);
    assert.ok(!profileError, `Throwaway ${role} profile could not be named`);
    const signed = await anon().auth.signInWithPassword({ email, password });
    assert.ok(!signed.error && signed.data?.session?.access_token, `Throwaway ${role} could not sign in`);
    return { id: data.user.id, session: signed.data.session, name: displayName };
}

export async function createConversation(admin, created, a, b, firstMessage = null) {
    const { data, error } = await admin.from('social_conversations')
        .insert({ is_group: false, is_request: false, last_message_at: new Date().toISOString(), last_message_preview: firstMessage?.content || 'Call Verification' })
        .select('id').maybeSingle();
    assert.ok(!error && data?.id, 'Synthetic conversation could not be created');
    created.conversations.push(data.id);
    const { error: partError } = await admin.from('social_conversation_participants').insert([{ conversation_id: data.id, user_id: a }, { conversation_id: data.id, user_id: b }]);
    assert.ok(!partError, 'Synthetic conversation participants could not be added');
    if (firstMessage) {
        const { error: messageError } = await admin.from('social_messages').insert({ conversation_id: data.id, sender_id: firstMessage.senderId, content: firstMessage.content, message_type: 'text' });
        assert.ok(!messageError, 'Synthetic conversation could not be seeded');
    }
    return data.id;
}

/** Remove everything a run created, then the throwaway users, confirmed gone. */
export async function cleanup(admin, created, extra = async () => ({})) {
    const result = {};
    try {
        const users = created.users;
        if (created.conversations.length) {
            result.messages = (await admin.from('social_messages').delete().in('conversation_id', created.conversations)).error?.message || 'ok';
            result.participants = (await admin.from('social_conversation_participants').delete().in('conversation_id', created.conversations)).error?.message || 'ok';
            result.conversations = (await admin.from('social_conversations').delete().in('id', created.conversations)).error?.message || 'ok';
        }
        Object.assign(result, await extra());
        if (users.length) {
            const list = users.join(',');
            result.pendingCalls = (await admin.from('pending_calls').delete().or(`caller_id.in.(${list}),callee_id.in.(${list})`)).error?.message || 'ok';
            result.notifications = (await admin.from('notifications').delete().or(`user_id.in.(${list}),actor_id.in.(${list})`)).error?.message || 'ok';
            result.pushOutbox = (await admin.from('push_outbox').delete().in('recipient_user_id', users)).error?.message || 'ok';
            for (const [index, id] of users.entries()) {
                const { error } = await admin.auth.admin.deleteUser(id);
                const { data } = await admin.auth.admin.getUserById(id);
                result[`user_${index}`] = !error && !data?.user?.id ? 'deleted' : `NOT DELETED: ${error?.message || 'still present'}`;
                await admin.from('profiles').delete().eq('id', id);
            }
        }
    } catch (error) {
        result.error = String(error?.message || error).slice(0, 200);
    }
    return result;
}
export const cleanupFailed = result => Object.values(result).some(value => typeof value === 'string' && value !== 'ok' && value !== 'deleted');

// ── Page probes ───────────────────────────────────────────────────────────
export async function audioPeak(page, ms = 3000) {
    return page.evaluate(async duration => {
        const els = [...document.querySelectorAll('audio')].filter(a => a.srcObject && a.srcObject.getAudioTracks().length);
        if (!els.length) return { streams: 0, peak: 0 };
        const ctx = new AudioContext();
        try { await ctx.resume(); } catch { /* headless */ }
        const analysers = els.map(a => { const source = ctx.createMediaStreamSource(a.srcObject); const analyser = ctx.createAnalyser(); analyser.fftSize = 2048; source.connect(analyser); return analyser; });
        const buffer = new Float32Array(2048);
        let peak = 0;
        const end = performance.now() + duration;
        while (performance.now() < end) {
            for (const analyser of analysers) { analyser.getFloatTimeDomainData(buffer); for (const value of buffer) peak = Math.max(peak, Math.abs(value)); }
            await new Promise(resolve => setTimeout(resolve, 40));
        }
        await ctx.close();
        return { streams: els.length, peak };
    }, ms);
}

export async function videos(page) {
    return page.evaluate(() => {
        const playing = [...document.querySelectorAll('video')].filter(v => v.videoWidth > 0 && v.readyState >= 2 && !v.paused);
        const local = playing.filter(v => getComputedStyle(v).transform !== 'none');
        const remote = playing.filter(v => getComputedStyle(v).transform === 'none');
        return { total: playing.length, local: local.length, remote: remote.length, remoteSize: remote[0] ? `${remote[0].videoWidth}x${remote[0].videoHeight}` : null };
    });
}

/** A coarse signature of the remote video frame: 8x8 mean luminance grid. */
export async function remoteFrameSignature(page) {
    return page.evaluate(() => {
        const video = [...document.querySelectorAll('video')].find(v => v.videoWidth > 0 && getComputedStyle(v).transform === 'none');
        if (!video) return null;
        const canvas = document.createElement('canvas');
        canvas.width = 8; canvas.height = 8;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, 8, 8);
        const data = ctx.getImageData(0, 0, 8, 8).data;
        const grid = [];
        for (let i = 0; i < data.length; i += 4) grid.push(Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]));
        return { size: `${video.videoWidth}x${video.videoHeight}`, grid };
    });
}
export const signatureDistance = (a, b) => (a && b ? a.grid.reduce((sum, value, i) => sum + Math.abs(value - b.grid[i]), 0) / a.grid.length : 0);

export async function callStatus(page) {
    return page.evaluate(() => {
        const host = document.querySelector('[role="dialog"][aria-label*="Call With"], [role="region"][aria-label^="Call With"]');
        const all = [...(host?.querySelectorAll('[role="status"]') || [])].map(el => el.textContent?.trim() || '').filter(Boolean);
        return all.sort((x, y) => x.length - y.length)[0] || null;
    });
}
export const callOpen = page => page.locator('[role="dialog"][aria-label*="Call With"]').count().then(n => n > 0);
export const incomingOpen = page => page.getByRole('button', { name: 'Accept Call', exact: true }).count().then(n => n > 0);

export async function openDevice(browser, session, contextOptions, { grantMedia = false, initScript = null } = {}) {
    const context = await browser.newContext({ ...contextOptions, serviceWorkers: 'block' });
    if (grantMedia) await context.grantPermissions(['camera', 'microphone'], { origin: APP_ORIGIN });
    await context.addInitScript(({ s }) => {
        localStorage.setItem('smarter-poker-auth', JSON.stringify(s));
        localStorage.setItem(`sp_firstrun_notif_v2_${s.user.id}`, String(Date.now()));
        sessionStorage.setItem('social-intro-seen', 'true');
    }, { s: session });
    if (initScript) await context.addInitScript(initScript);
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    return { context, page };
}

/**
 * Delivery helpers for the daily digest and the critical pager: Resend email,
 * Twilio SMS, provider spend, and the signed "view online" link.
 * Every network call is bounded and returns a result object; nothing throws.
 */
import crypto from 'crypto';

const trim = (v) => (typeof v === 'string' ? v.trim() : '');

export function digestRecipients() {
    const raw = trim(process.env.DAILY_DIGEST_TO) || 'Daniel@bekavactrading.com';
    return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

export function digestFrom() {
    const addr = trim(process.env.RESEND_FROM_EMAIL) || 'alerts@smarter.poker';
    return `Smarter.Poker <${addr}>`;
}

export async function sendEmail({ to, subject, html, text, idempotencyKey, fetchImpl = fetch }) {
    const apiKey = trim(process.env.RESEND_API_KEY);
    if (!apiKey) return { ok: false, error: 'RESEND_API_KEY not configured' };
    let lastError = '';
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            const res = await fetchImpl('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                    ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
                },
                signal: AbortSignal.timeout(15000),
                body: JSON.stringify({ from: digestFrom(), to, subject, html, text }),
            });
            const body = await res.json().catch(() => ({}));
            if (res.ok && body?.id) return { ok: true, id: body.id };
            lastError = `resend ${res.status}: ${JSON.stringify(body).slice(0, 300)}`;
            if (res.status >= 400 && res.status < 500 && res.status !== 429) break;
        } catch (err) {
            lastError = `resend threw: ${String(err?.message || err).slice(0, 200)}`;
        }
        await new Promise((r) => setTimeout(r, 800 * attempt));
    }
    return { ok: false, error: lastError };
}

export function ownerPhone() {
    const raw = trim(process.env.DIGEST_ALERT_PHONE) || trim(process.env.MY_PHONE_NUMBER);
    if (!raw) return null;
    const digits = raw.replace(/\D/g, '');
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
    return digits ? `+${digits}` : null;
}

export async function sendSms(body, { fetchImpl = fetch } = {}) {
    const sid = trim(process.env.TWILIO_ACCOUNT_SID);
    const token = trim(process.env.TWILIO_AUTH_TOKEN);
    const from = trim(process.env.TWILIO_PHONE_NUMBER);
    const to = ownerPhone();
    if (!sid || !token || !from) return { ok: false, error: 'Twilio not configured' };
    if (!to) return { ok: false, error: 'No owner phone configured' };
    try {
        const res = await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
            method: 'POST',
            headers: {
                Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            signal: AbortSignal.timeout(15000),
            body: new URLSearchParams({ To: to, From: from, Body: String(body).slice(0, 600) }).toString(),
        });
        const json = await res.json().catch(() => ({}));
        if (res.ok && json?.sid) return { ok: true, id: json.sid };
        return { ok: false, error: `twilio ${res.status}: ${String(json?.message || '').slice(0, 200)}` };
    } catch (err) {
        return { ok: false, error: `twilio threw: ${String(err?.message || err).slice(0, 200)}` };
    }
}

/** Yesterday's spend from Twilio and Vercel. A provider that cannot be read says so. */
export async function providerSpend(day, { fetchImpl = fetch } = {}) {
    const items = [];
    const sid = trim(process.env.TWILIO_ACCOUNT_SID);
    const token = trim(process.env.TWILIO_AUTH_TOKEN);
    if (sid && token) {
        try {
            const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Usage/Records/Daily.json?Category=totalprice&StartDate=${day}&EndDate=${day}`;
            const res = await fetchImpl(url, {
                headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}` },
                signal: AbortSignal.timeout(10000),
            });
            const json = await res.json().catch(() => ({}));
            const rec = (json?.usage_records || [])[0];
            items.push({ label: 'Twilio (SMS)', value: res.ok ? Number(rec?.price || 0) : null, note: res.ok ? '' : `HTTP ${res.status}` });
        } catch (err) {
            items.push({ label: 'Twilio (SMS)', value: null, note: 'Not reachable' });
        }
    } else {
        items.push({ label: 'Twilio (SMS)', value: null, note: 'Not configured' });
    }

    const vToken = trim(process.env.VERCEL_TOKEN);
    const teamId = trim(process.env.VERCEL_TEAM_ID) || 'team_SVD8r7AOPH065G3usBxVvrBc';
    if (vToken) {
        try {
            const from = `${day}T00:00:00.000Z`;
            const toDate = new Date(Date.parse(from) + 86400000).toISOString();
            const res = await fetchImpl(`https://api.vercel.com/v1/billing/charges?teamId=${teamId}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(toDate)}`, {
                headers: { Authorization: `Bearer ${vToken}` },
                signal: AbortSignal.timeout(10000),
            });
            if (!res.ok) {
                items.push({ label: 'Vercel', value: null, note: `HTTP ${res.status}` });
            } else {
                // FOCUS rows, newline-delimited JSON; sum BilledCost
                const raw = await res.text();
                let total = 0;
                let rows = 0;
                for (const line of raw.split('\n')) {
                    const t = line.trim();
                    if (!t) continue;
                    try {
                        const r = JSON.parse(t);
                        const c = Number(r.BilledCost ?? r.billedCost ?? r.EffectiveCost ?? 0);
                        if (Number.isFinite(c)) { total += c; rows++; }
                    } catch { /* skip non-JSON lines */ }
                }
                items.push({ label: 'Vercel', value: Math.round(total * 100) / 100, note: rows ? '' : 'No charges reported' });
            }
        } catch (err) {
            items.push({ label: 'Vercel', value: null, note: 'Not reachable' });
        }
    } else {
        items.push({ label: 'Vercel', value: null, note: 'Not configured' });
    }
    items.push({ label: 'Resend (Email)', value: null, note: 'Flat plan, no daily billing API' });
    items.push({ label: 'Supabase', value: null, note: 'Flat compute tier, see Capacity above' });
    return { items };
}

/* ── Signed "view online" link: day + expiry, HMAC with the cron secret ── */
function viewKey() {
    const secret = trim(process.env.DIGEST_VIEW_SECRET) || trim(process.env.CRON_SECRET);
    if (!secret) return null;
    return crypto.createHash('sha256').update(`sp-daily-digest-view:${secret}`).digest();
}

export function signViewToken(day, ttlDays = 45, now = Date.now()) {
    const key = viewKey();
    if (!key) return null;
    const exp = Math.floor(now / 1000) + ttlDays * 86400;
    const payload = `${day}.${exp}`;
    const sig = crypto.createHmac('sha256', key).update(payload).digest('base64url');
    return `${payload}.${sig}`;
}

export function verifyViewToken(token, now = Date.now()) {
    const key = viewKey();
    if (!key || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [day, exp, sig] = parts;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^\d+$/.test(exp)) return null;
    const expected = crypto.createHmac('sha256', key).update(`${day}.${exp}`).digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    if (Number(exp) * 1000 < now) return null;
    return day;
}

export function viewUrlFor(day) {
    const t = signViewToken(day);
    if (!t) return null;
    const base = trim(process.env.DIGEST_PUBLIC_BASE_URL) || 'https://smarter.poker';
    return `${base}/api/digest/view?t=${encodeURIComponent(t)}`;
}

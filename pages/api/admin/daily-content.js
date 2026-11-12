/**
 * /api/admin/daily-content — Daily Content Engine dashboard data + pause switches
 * ═══════════════════════════════════════════════════════════════════════════
 * Gate 3 (Implementation I-1) of the Smarter.Poker daily content engine.
 * Everything here is PRIVATE: the engine renders dry-run editions only and no
 * destination is connected. This route shows what the worker produced and lets
 * an admin flip pause switches.
 *
 * Auth — identical posture to /api/admin/diamond-liability:
 *   - x-admin-secret header matching ADMIN_ROUTE_SECRET (curl / scripts), OR
 *   - Bearer token whose user has profiles.is_admin = true
 * The data client is ALWAYS service-role. The daily_content_* tables have RLS
 * on with no policies and no anon/authenticated grants, so nothing here can be
 * read with the anon key.
 *
 * GET  ?days=7 (1..14)
 *   { generatedAt, days, pauses[], destinations[], editions[], jobs, events[] }
 * POST { action: 'set_pause', scope, paused, reason }
 *   scope = 'global' | 'destination:<name>' | 'series:<slot>'
 *   Pausing is always allowed. Turning the GLOBAL pause OFF is refused with 409
 *   while every destination is disabled: publishing requires Gate 4 approval.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/apiErrorHandler';

const BUCKET = 'daily-content';
const SIGNED_URL_SECONDS = 3600;
const DESTINATIONS = ['internal_feed', 'facebook', 'instagram', 'youtube'];
const SLOTS = ['today', 'top10', 'feature', 'tonight'];
const GATE4_MESSAGE = 'Publishing requires Gate 4 approval';

function validScope(scope) {
    if (scope === 'global') return true;
    const [kind, name] = String(scope || '').split(':');
    if (kind === 'destination') return DESTINATIONS.includes(name);
    if (kind === 'series') return SLOTS.includes(name);
    return false;
}

async function authorize(req, res, url, anonKey, srKey) {
    const envSecret = process.env.ADMIN_ROUTE_SECRET;
    const hasAdminSecret = !!envSecret && req.headers['x-admin-secret'] === envSecret;
    if (hasAdminSecret) return { actor: 'admin-secret' };

    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Auth token required' });
        return null;
    }
    const sb = createClient(url, anonKey, { auth: { persistSession: false } });
    const { data: userData, error: uErr } = await sb.auth.getUser(auth.slice(7));
    if (uErr || !userData?.user) {
        res.status(401).json({ error: 'Invalid or expired token' });
        return null;
    }
    const gate = createClient(url, srKey, { auth: { persistSession: false } });
    const { data: profile } = await gate
        .from('profiles')
        .select('is_admin, username')
        .eq('id', userData.user.id)
        .maybeSingle();
    if (profile?.is_admin !== true) {
        res.status(403).json({ error: 'Forbidden - admin only' });
        return null;
    }
    return { actor: profile.username || userData.user.id };
}

async function readDashboard(adm, days) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const [pausesQ, destQ, edQ, jobsQ, eventsQ] = await Promise.all([
        adm.from('daily_content_pauses').select('scope, paused, reason, set_by, set_at').order('scope'),
        adm.from('daily_content_destinations')
            .select('destination, enabled, connection_state, daily_cap, account_ref, notes, updated_at')
            .order('destination'),
        adm.from('daily_content_editions')
            .select('id, edition_date, slot, revision, family, snapshot_id, status, status_reason, headline, caption, slot_at, expires_at, dry_run, created_at, updated_at')
            .gte('edition_date', since)
            .order('edition_date', { ascending: false })
            .order('slot_at', { ascending: true })
            .limit(200),
        adm.from('daily_content_jobs')
            .select('id, job_key, kind, edition_date, slot, state, attempts, max_attempts, run_after, lease_owner, lease_expires_at, last_error, dry_run, updated_at')
            .gte('edition_date', since)
            .order('updated_at', { ascending: false })
            .limit(500),
        adm.from('daily_content_events')
            .select('id, at, actor, entity, entity_id, event, detail')
            .order('at', { ascending: false })
            .limit(50),
    ]);
    for (const q of [pausesQ, destQ, edQ, jobsQ, eventsQ]) {
        if (q.error) throw new Error(q.error.message);
    }

    const editions = edQ.data || [];
    const editionIds = editions.map((e) => e.id);
    const snapshotIds = [...new Set(editions.map((e) => e.snapshot_id).filter(Boolean))];

    const [snapQ, rendQ, postQ] = await Promise.all([
        snapshotIds.length
            ? adm.from('daily_content_snapshots')
                .select('id, snapshot_key, revision, sha256, completeness, taken_at')
                // in-list: bounded by the editions query's limit(200)
                .in('id', snapshotIds)
            : Promise.resolve({ data: [], error: null }),
        editionIds.length
            ? adm.from('daily_content_renders')
                .select('edition_id, kind, storage_path, width, height, duration_s, sha256, bytes')
                // in-list: bounded by the editions query's limit(200)
                .in('edition_id', editionIds)
            : Promise.resolve({ data: [], error: null }),
        editionIds.length
            ? adm.from('daily_content_posts')
                .select('edition_id, destination, state, state_reason, scheduled_for, expires_at, remote_url, published_at, dry_run')
                // in-list: bounded by the editions query's limit(200)
                .in('edition_id', editionIds)
            : Promise.resolve({ data: [], error: null }),
    ]);
    for (const q of [snapQ, rendQ, postQ]) {
        if (q.error) throw new Error(q.error.message);
    }

    const snapById = new Map((snapQ.data || []).map((s) => [s.id, s]));
    const renders = rendQ.data || [];
    const signed = new Map();
    if (renders.length) {
        const paths = renders.map((r) => r.storage_path);
        const { data: urls } = await adm.storage.from(BUCKET).createSignedUrls(paths, SIGNED_URL_SECONDS);
        for (const u of urls || []) {
            if (u?.path && u?.signedUrl) signed.set(u.path, u.signedUrl);
        }
    }

    const shaped = editions.map((e) => ({
        ...e,
        snapshot: e.snapshot_id ? snapById.get(e.snapshot_id) || null : null,
        renders: renders
            .filter((r) => r.edition_id === e.id)
            .map((r) => ({
                kind: r.kind,
                width: r.width,
                height: r.height,
                duration_s: r.duration_s,
                sha256: r.sha256,
                bytes: r.bytes,
                signedUrl: signed.get(r.storage_path) || null,
            })),
        posts: (postQ.data || [])
            .filter((p) => p.edition_id === e.id)
            .map(({ edition_id: _id, ...p }) => p),
    }));

    const jobs = jobsQ.data || [];
    const counts = {};
    for (const j of jobs) counts[j.state] = (counts[j.state] || 0) + 1;

    return {
        generatedAt: new Date().toISOString(),
        days,
        pauses: pausesQ.data || [],
        destinations: destQ.data || [],
        editions: shaped,
        jobs: { counts, recent: jobs.slice(0, 30) },
        events: eventsQ.data || [],
    };
}

async function setPause(adm, actor, body, res) {
    const { scope, paused, reason } = body || {};
    if (!validScope(scope) || typeof paused !== 'boolean') {
        return res.status(400).json({ error: 'scope must be global, destination:<name> or series:<slot>; paused must be boolean' });
    }
    const cleanReason = String(reason || '').trim().slice(0, 300) || (paused ? 'Paused from dashboard' : 'Cleared from dashboard');

    if (scope === 'global' && paused === false) {
        const { data: dests, error: dErr } = await adm.from('daily_content_destinations').select('enabled');
        if (dErr) return res.status(500).json({ error: `Failed to read destinations: ${dErr.message}` });
        const anyEnabled = (dests || []).some((d) => d.enabled === true);
        if (!anyEnabled) {
            return res.status(409).json({ error: GATE4_MESSAGE });
        }
    }

    const row = { scope, paused, reason: cleanReason, set_by: actor, set_at: new Date().toISOString() };
    const { error: upErr } = await adm.from('daily_content_pauses').upsert(row, { onConflict: 'scope' });
    if (upErr) return res.status(500).json({ error: `Failed to set pause: ${upErr.message}` });

    const { error: evErr } = await adm.from('daily_content_events').insert({
        actor,
        entity: 'pause',
        entity_id: scope,
        event: paused ? 'pause_set' : 'pause_cleared',
        detail: { reason: cleanReason },
    });
    if (evErr) return res.status(500).json({ error: `Pause saved but event log failed: ${evErr.message}` });

    return res.status(200).json({ ok: true, pause: row });
}

export default async function handler(req, res) {
    const isWrite = req.method === 'POST';
    if (!applyRateLimit(req, res, isWrite ? LIMITS.write : LIMITS.read)) return;
    res.setHeader('Cache-Control', 'no-store');

    try {
        if (req.method !== 'GET' && req.method !== 'POST') {
            res.setHeader('Allow', 'GET, POST');
            return res.status(405).json({ error: 'Method not allowed' });
        }

        const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
        const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
        const srKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
        if (!url || !anonKey || !srKey) {
            return res.status(500).json({ error: 'Server misconfigured (missing Supabase env)' });
        }

        const who = await authorize(req, res, url, anonKey, srKey);
        if (!who) return undefined;

        // Data client: always service-role.
        const adm = createClient(url, srKey, { auth: { persistSession: false } });

        if (isWrite) {
            const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body;
            if (body?.action !== 'set_pause') {
                return res.status(400).json({ error: 'Unknown action' });
            }
            return setPause(adm, who.actor, body, res);
        }

        const days = Math.min(14, Math.max(1, parseInt(req.query?.days, 10) || 7));
        const payload = await readDashboard(adm, days);
        return res.status(200).json(payload);
    } catch (err) {
        try { reportApiError(err, req); } catch (_e) { /* never mask the original error */ }
        return res.status(500).json({ error: err?.message || 'Internal error' });
    }
}

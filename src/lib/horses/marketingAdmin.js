/**
 * /api/horses/marketing-admin - the Marketing tab's one route (Dan, 2026-11-18).
 *
 * GET  ?section=overview  settings, contact and player counts, every campaign with its stats
 *      ?section=contacts  paged contact list (q, tag, status)
 *      ?section=funnel    signup -> played -> still signing in, by signup week
 *      ?section=preview&id=<campaign>  the rendered email, for the preview pane
 * POST { action, ... }    import_contacts, save_campaign, test_send, approve,
 *                         pause, resume, cancel, suppress, unsuppress,
 *                         update_contact, save_settings
 *
 * The DATABASE owns every rule that matters (sp_marketing_* functions,
 * migration 20261118170500): a campaign cannot be approved without a test send
 * and a mailing address, recipients are materialised at approval minus every
 * suppression and every player who turned email off, and sending is capped per
 * campaign and globally. This file validates input, calls those functions and
 * files an audit row for every write.
 */
import { auditOperatorAction } from './operatorAudit.js';
import { badRequest, notFound, conflict } from './apiEnvelope.js';
import { int, enumOf, text, paging, searchTerm, uuid, bool } from './validate.js';
import { campaignEmail, sendBlockers } from '../marketing/template.mjs';
import { sendCampaignTest } from '../marketing/runner.mjs';

export const AUDIENCES = ['contacts', 'real_players', 'lapsed_players', 'active_players'];
export const CONSENT_BASES = ['existing_relationship', 'opt_in', 'imported_unverified'];
const CONTACT_STATUSES = ['active', 'unsubscribed', 'bounced', 'complained', 'invalid'];
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const tagList = (v) => (Array.isArray(v) ? v : String(v || '').split(','))
    .map((t) => String(t).trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, ''))
    .filter(Boolean).slice(0, 20);

function rpcError(error, fallback) {
    const msg = String(error?.message || fallback || 'Request failed');
    // Business-rule refusals raised by the functions (55000 / P0002 / 22023) are safe to show.
    if (['55000', 'P0002', '22023'].includes(error?.code)) return conflict(msg.charAt(0).toUpperCase() + msg.slice(1), 'marketing_rule');
    return Object.assign(new Error(msg), { status: 500 });
}

export function validateCampaign(body) {
    const slug = String(body.slug || '').trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{2,60}$/.test(slug)) throw badRequest('Slug Must Be 3-61 Lowercase Letters, Digits Or Dashes', 'bad_slug');
    const ctaUrl = String(body.cta_url || 'https://smarter.poker/hub/club-arena/').trim();
    let host = '';
    try { host = new URL(ctaUrl).hostname; } catch { /* handled below */ }
    if (!/^https:\/\//.test(ctaUrl) || !(host === 'smarter.poker' || host.endsWith('.smarter.poker'))) {
        throw badRequest('The Button Must Link To A smarter.poker Page', 'bad_cta_url');
    }
    const audience = enumOf(body.audience, AUDIENCES);
    if (!audience) throw badRequest('Choose An Audience', 'bad_audience');
    const row = {
        slug,
        name: text(body.name, { max: 120 }),
        subject: text(body.subject, { max: 150 }),
        preheader: body.preheader ? text(body.preheader, { max: 200 }) : null,
        headline: text(body.headline, { max: 150 }),
        body: text(body.body, { max: 6000 }),
        cta_label: text(body.cta_label || 'Play Now', { max: 40 }),
        cta_url: ctaUrl,
        promo_code: body.promo_code ? String(body.promo_code).trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20) || null : null,
        audience,
        audience_tags: audience === 'contacts' ? tagList(body.audience_tags) : [],
        lapsed_days: int(body.lapsed_days, { min: 1, max: 365, fallback: 14 }),
        daily_cap: int(body.daily_cap, { min: 1, max: 10000, fallback: 100 }),
    };
    for (const k of ['name', 'subject', 'headline', 'body', 'cta_label']) {
        if (!row[k]) throw badRequest(`Campaign ${k.replace('_', ' ')} Is Required`, 'missing_field');
    }
    return row;
}

async function loadCampaign(db, id) {
    const cid = uuid(id);
    if (!cid) throw badRequest('Campaign Id Is Required', 'bad_id');
    const { data, error } = await db.from('sp_marketing_campaigns').select('*').eq('id', cid).maybeSingle();
    if (error) throw rpcError(error);
    if (!data) throw notFound('Campaign Not Found');
    return data;
}

async function loadSettings(db) {
    const { data, error } = await db.from('sp_marketing_settings')
        .select('sending_enabled, postal_address, from_name, from_email, reply_to, global_daily_cap, complaint_pause_rate, bounce_pause_rate, webhook_connected_at')
        .eq('id', 1).maybeSingle();
    if (error) throw rpcError(error);
    return data || {};
}

export function makeMarketingAdminHandler(deps = {}) {
    const audit = deps.audit || auditOperatorAction;
    const sendEmailImpl = deps.sendEmail || (async (opts) => (await import('../dailyDigest/delivery.mjs')).sendEmail(opts));
    const bulk = deps.bulkConfig || (async () => (await import('../dailyDigest/delivery.mjs')).bulkEmailConfig());

    return async function marketingAdminHandler({ req, op, db, method, query, body }) {
        if (method === 'GET') {
            const section = enumOf(query.section, ['overview', 'contacts', 'funnel', 'preview'], { fallback: 'overview' });
            if (section === 'overview') {
                const { data, error } = await db.rpc('fn_sp_marketing_overview');
                if (error) throw rpcError(error);
                return { section, overview: data };
            }
            if (section === 'funnel') {
                const { data, error } = await db.rpc('fn_sp_marketing_funnel', { p_weeks: int(query.weeks, { min: 1, max: 52, fallback: 8 }) });
                if (error) throw rpcError(error);
                return { section, funnel: data || [] };
            }
            if (section === 'preview') {
                const c = await loadCampaign(db, query.id);
                const settings = await loadSettings(db);
                const sample = { email: op.user.email || 'preview@smarter.poker', display_name: 'Jason Trezak' };
                const msg = campaignEmail(c, sample, settings, {});
                return { section, subject: msg.subject, html: msg.html, text: msg.text, blockers: sendBlockers(c, settings) };
            }
            const { limit, offset } = paging(query, { defaultLimit: 50, max: 200 });
            let q = db.from('sp_marketing_contacts')
                .select('id, email, full_name, agent_name, phone, external_id, downlines, source, consent_basis, tags, sheet_color, notes, status, user_id, converted_at, created_at', { count: 'exact' })
                .order('downlines', { ascending: false, nullsFirst: false }).order('created_at', { ascending: true })
                .range(offset, offset + limit - 1);
            const term = searchTerm(query.q);
            if (term) q = q.or(`email.ilike.%${term}%,full_name.ilike.%${term}%,agent_name.ilike.%${term}%,phone.ilike.%${term}%`);
            const tag = tagList(query.tag)[0];
            if (tag) q = q.contains('tags', [tag]);
            const status = enumOf(query.status, [...CONTACT_STATUSES, 'converted']);
            if (status === 'converted') q = q.not('user_id', 'is', null);
            else if (status) q = q.eq('status', status);
            const { data, error, count } = await q;
            if (error) throw rpcError(error);
            return { section, rows: data || [], total: count ?? null, limit, offset };
        }

        const action = enumOf(body.action, ['import_contacts', 'save_campaign', 'test_send', 'approve', 'pause', 'resume',
            'cancel', 'suppress', 'unsuppress', 'update_contact', 'save_settings']);
        if (!action) throw badRequest('Unknown Action', 'bad_action');

        if (action === 'import_contacts') {
            const rows = Array.isArray(body.rows) ? body.rows.slice(0, 5000) : null;
            if (!rows || !rows.length) throw badRequest('Nothing To Import', 'empty_import');
            const consent = enumOf(body.consent_basis, CONSENT_BASES);
            if (!consent) throw badRequest('Say Why We May Email These People', 'bad_consent');
            const source = text(body.source, { max: 120 });
            if (!source) throw badRequest('Name The Source Of This List', 'bad_source');
            const clean = rows.map((r) => ({
                email: String(r?.email || '').trim().toLowerCase(),
                full_name: String(r?.full_name || '').slice(0, 120),
                agent_name: String(r?.agent_name || '').slice(0, 80),
                phone: String(r?.phone || '').slice(0, 40),
                external_id: String(r?.external_id || '').slice(0, 40),
                downlines: /^\d{1,6}$/.test(String(r?.downlines || '')) ? String(r.downlines) : '',
                notes: String(r?.notes || '').slice(0, 500),
            }));
            const { data, error } = await db.rpc('fn_sp_marketing_import_contacts', {
                p_rows: clean, p_source: source, p_consent_basis: consent, p_tags: tagList(body.tags), p_actor: op.user.id,
            });
            if (error) throw rpcError(error);
            await audit(op, req, { action: 'marketing.import_contacts', targetType: 'marketing_contacts', targetId: source,
                after: { ...data, already_players_emails: undefined }, details: { rows: clean.length, consent, tags: tagList(body.tags) } });
            return { result: data };
        }

        if (action === 'save_campaign') {
            const row = validateCampaign(body.campaign || {});
            if (body.campaign?.id) {
                const existing = await loadCampaign(db, body.campaign.id);
                if (existing.status !== 'draft') throw conflict('Only A Draft Can Be Edited', 'not_draft');
                const { error } = await db.from('sp_marketing_campaigns')
                    .update({ ...row, test_sent_at: null, test_sent_to: null, updated_at: new Date().toISOString() }).eq('id', existing.id);
                if (error) throw rpcError(error);
                await audit(op, req, { action: 'marketing.update_campaign', targetType: 'marketing_campaign', targetId: existing.id, before: { subject: existing.subject }, after: { subject: row.subject } });
                return { id: existing.id };
            }
            const { data, error } = await db.from('sp_marketing_campaigns').insert({ ...row, created_by: op.user.id }).select('id').maybeSingle();
            if (error) {
                if (error.code === '23505') throw conflict('That Slug Is Already Used', 'slug_taken');
                throw rpcError(error);
            }
            await audit(op, req, { action: 'marketing.create_campaign', targetType: 'marketing_campaign', targetId: data?.id, after: { slug: row.slug, audience: row.audience } });
            return { id: data?.id };
        }

        if (action === 'test_send') {
            const c = await loadCampaign(db, body.id);
            const to = String(op.user.email || '').trim().toLowerCase();
            if (!EMAIL_RE.test(to)) throw badRequest('Your Operator Account Has No Email To Test With', 'no_operator_email');
            const settings = await loadSettings(db);
            const cfg = await bulk();
            const res = await sendCampaignTest(c, settings, to, {
                sendEmail: sendEmailImpl, displayName: '', apiKey: cfg?.apiKey || null, bulkAddr: cfg?.addr || null,
            });
            if (!res?.ok) throw Object.assign(new Error(`Test send failed: ${String(res?.error || 'unknown').slice(0, 200)}`), { status: 502 });
            await db.from('sp_marketing_campaigns').update({ test_sent_at: new Date().toISOString(), test_sent_to: to }).eq('id', c.id);
            await audit(op, req, { action: 'marketing.test_send', targetType: 'marketing_campaign', targetId: c.id, details: { to } });
            return { sentTo: to, providerId: res.id || null };
        }

        if (action === 'approve') {
            const c = await loadCampaign(db, body.id);
            const { data, error } = await db.rpc('fn_sp_marketing_campaign_approve', { p_campaign_id: c.id, p_actor: op.user.id });
            if (error) throw rpcError(error);
            await audit(op, req, { action: 'marketing.approve_campaign', targetType: 'marketing_campaign', targetId: c.id, before: { status: c.status }, after: { status: 'sending', ...data } });
            return { result: data };
        }

        if (action === 'pause' || action === 'resume' || action === 'cancel') {
            const c = await loadCampaign(db, body.id);
            const from = { pause: ['sending'], resume: ['paused'], cancel: ['draft', 'sending', 'paused'] }[action];
            if (!from.includes(c.status)) throw conflict(`A ${c.status} Campaign Cannot Be ${action === 'pause' ? 'Paused' : action === 'resume' ? 'Resumed' : 'Cancelled'}`, 'bad_transition');
            const next = { pause: 'paused', resume: 'sending', cancel: 'cancelled' }[action];
            const patch = { status: next, updated_at: new Date().toISOString(), paused_reason: action === 'pause' ? 'operator' : null };
            const { error } = await db.from('sp_marketing_campaigns').update(patch).eq('id', c.id).eq('status', c.status);
            if (error) throw rpcError(error);
            await audit(op, req, { action: `marketing.${action}_campaign`, targetType: 'marketing_campaign', targetId: c.id, before: { status: c.status }, after: { status: next } });
            return { status: next };
        }

        if (action === 'suppress' || action === 'unsuppress') {
            const email = String(body.email || '').trim().toLowerCase();
            if (!EMAIL_RE.test(email)) throw badRequest('Enter A Valid Email', 'bad_email');
            const { data, error } = action === 'suppress'
                ? await db.rpc('fn_sp_marketing_suppress', { p_email: email, p_reason: 'operator', p_source: `operator:${op.user.id}`, p_campaign_id: null })
                : await db.rpc('fn_sp_marketing_unsuppress', { p_email: email });
            if (error) throw rpcError(error);
            if (action === 'unsuppress' && !data) throw conflict('Only An Unsubscribe Or Operator Block Can Be Lifted. Bounces And Spam Complaints Stay.', 'not_liftable');
            await audit(op, req, { action: `marketing.${action}`, targetType: 'email', targetId: email });
            return { ok: !!data };
        }

        if (action === 'update_contact') {
            const id = uuid(body.id);
            if (!id) throw badRequest('Contact Id Is Required', 'bad_id');
            const patch = { updated_at: new Date().toISOString() };
            if (body.tags !== undefined) patch.tags = tagList(body.tags);
            if (body.notes !== undefined) patch.notes = String(body.notes || '').slice(0, 1000) || null;
            const { error } = await db.from('sp_marketing_contacts').update(patch).eq('id', id);
            if (error) throw rpcError(error);
            await audit(op, req, { action: 'marketing.update_contact', targetType: 'marketing_contact', targetId: id, after: patch });
            return { ok: true };
        }

        // save_settings
        const s = body.settings || {};
        const patch = { updated_at: new Date().toISOString(), updated_by: op.user.id };
        if (s.postal_address !== undefined) patch.postal_address = String(s.postal_address || '').trim().slice(0, 300) || null;
        if (s.from_name !== undefined) patch.from_name = text(s.from_name, { max: 60 }) || 'Smarter.Poker';
        if (s.from_email !== undefined) {
            const fe = String(s.from_email || '').trim().toLowerCase();
            if (!/^[a-z0-9._%+-]+@mail\.smarter\.poker$/.test(fe)) throw badRequest('The From Address Must Be On mail.smarter.poker', 'bad_from');
            patch.from_email = fe;
        }
        if (s.reply_to !== undefined) {
            const rt = String(s.reply_to || '').trim().toLowerCase();
            if (!EMAIL_RE.test(rt)) throw badRequest('Enter A Valid Reply-To Address', 'bad_reply_to');
            patch.reply_to = rt;
        }
        if (s.global_daily_cap !== undefined) patch.global_daily_cap = int(s.global_daily_cap, { min: 0, max: 50000, fallback: 300 });
        if (s.sending_enabled !== undefined) patch.sending_enabled = bool(s.sending_enabled, { fallback: true });
        const before = await loadSettings(db);
        const { error } = await db.from('sp_marketing_settings').update(patch).eq('id', 1);
        if (error) throw rpcError(error);
        await audit(op, req, { action: 'marketing.save_settings', targetType: 'marketing_settings', targetId: '1', before, after: patch });
        return { ok: true };
    };
}

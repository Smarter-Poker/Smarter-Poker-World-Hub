/**
 * Marketing - contacts, campaigns, the do-not-email list and the retention
 * funnel, in one /horses tab (Dan, 2026-11-18).
 *
 * Every rule that protects a send lives in the database (migration
 * 20261118170500): a campaign must be test-sent and the mailing address set
 * before it can be approved, approval materialises recipients minus every
 * suppression, and sending is capped per campaign and in total. This panel is
 * the controls and the evidence. Route: /api/horses/marketing-admin.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ConfirmDialog from './ConfirmDialog';
import Modal from './Modal';
import Pager from './Pager';
import { hasPermission } from './operatorPermissions';
import { rowsToContacts } from '../../lib/marketing/csv.mjs';
import s from './MarketingPanel.module.css';

const API_URL = '/api/horses/marketing-admin';
const SECTIONS = [['campaigns', 'Campaigns'], ['contacts', 'Contacts'], ['import', 'Import'], ['funnel', 'Retention Funnel'], ['settings', 'Settings']];
const AUDIENCE_LABEL = {
  contacts: 'Contacts (Not Yet Players)',
  real_players: 'Every Real Player',
  lapsed_players: 'Lapsed Players',
  active_players: 'Active Players',
};
const CONSENT_LABEL = {
  existing_relationship: 'Existing Relationship (Agents, Club Members, People We Know)',
  opt_in: 'They Signed Up For Email',
  imported_unverified: 'Unverified List (Not Sendable Until Reviewed)',
};
const EMPTY_CAMPAIGN = {
  slug: '', name: '', subject: '', preheader: '', headline: '', body: '', cta_label: 'Play Now',
  cta_url: 'https://smarter.poker/hub/club-arena/', promo_code: '', audience: 'contacts', audience_tags: '', lapsed_days: 14, daily_cap: 100,
  signup_chips: 0, signup_chips_budget: 0,
};
const n = (v) => (v === null || v === undefined ? '-' : Number(v).toLocaleString('en-US'));
const pct = (a, b) => (b ? `${Math.round((Number(a) / Number(b)) * 100)}%` : '-');
const when = (v) => (v ? new Date(v).toLocaleString() : '-');

function Notice({ tone, children }) {
  return <div className={`${s.notice} ${tone === 'ok' ? s.ok : tone === 'err' ? s.err : ''}`} role={tone === 'err' ? 'alert' : 'status'}>{children}</div>;
}

function Plate({ title, right, children }) {
  return (
    <section className={s.plate}>
      <div className={s.headRow}><h3 className={s.chrome}>{title}</h3>{right}</div>
      <div className={s.rail} />
      {children}
    </section>
  );
}

function CampaignCard({ c, canWrite, onEdit, onPreview, onTest, onApprove, onAction, busy }) {
  return (
    <article className={s.plate}>
      <div className={s.headRow}>
        <h4 className={s.cardTitle}>{c.name}</h4>
        <span className={`${s.badge} ${s[`badge_${c.status}`] || ''}`}>{c.status}</span>
      </div>
      <p className={s.meta}>{c.subject}</p>
      <p className={s.meta}>
        Audience: {AUDIENCE_LABEL[c.audience] || c.audience}
        {c.audience_tags?.length ? ` Tagged ${c.audience_tags.join(', ')}` : ''}
        {c.audience === 'lapsed_players' || c.audience === 'active_players' ? ` (${c.lapsed_days} Days)` : ''}. Daily Cap {n(c.daily_cap)}.
        {c.paused_reason ? ` Paused: ${c.paused_reason.replace(/_/g, ' ')}.` : ''}
        {Number(c.signup_chips) > 0 ? ` Signup Offer: ${n(c.signup_chips)} Chips From The Midway Union Promo Wallet.` : ''}
      </p>
      <div className={s.stats}>
        {[['Recipients', c.recipients], ['Sent', c.sent], ['Delivered', c.delivered], ['Clicked', c.clicked],
          ['Signups', c.signups], ['Bounced', c.bounced], ['Spam', c.complained], ['Unsubscribed', c.unsubscribed],
          ...(Number(c.signup_chips) > 0 ? [['Chips Paid', c.chips_paid], ['Players Paid', c.chips_awarded_players], ['Chips Waiting', c.chips_waiting], ['Budget', c.signup_chips_budget]] : [])].map(([label, value]) => (
          <div className={s.stat} key={label}><span className={s.statValue}>{n(value)}</span><span className={s.statLabel}>{label}</span></div>
        ))}
      </div>
      <p className={s.meta}>
        {c.test_sent_at ? `Test Sent To ${c.test_sent_to} ${when(c.test_sent_at)}.` : 'No Test Send Yet.'}
        {c.approved_at ? ` Approved ${when(c.approved_at)}.` : ''} {c.pending ? `${n(c.pending)} Waiting To Send.` : ''}
      </p>
      <div className={s.actions}>
        <button type="button" className={s.pillBtn} onClick={() => onPreview(c)}>Preview</button>
        {c.status === 'draft' ? <>
          <button type="button" className={s.pillBtn} disabled={!canWrite || busy} onClick={() => onEdit(c)}>Edit</button>
          <button type="button" className={s.pillBtn} disabled={!canWrite || busy} onClick={() => onTest(c)}>Send Test To Me</button>
          <button type="button" className={`${s.pillBtn} ${s.pillLit}`} disabled={!canWrite || busy || !c.test_sent_at} onClick={() => onApprove(c)}>Approve And Send</button>
        </> : null}
        {c.status === 'sending' ? <button type="button" className={`${s.pillBtn} ${s.pillWarn}`} disabled={!canWrite || busy} onClick={() => onAction('pause', c)}>Pause</button> : null}
        {c.status === 'paused' ? <button type="button" className={`${s.pillBtn} ${s.pillLit}`} disabled={!canWrite || busy} onClick={() => onAction('resume', c)}>Resume</button> : null}
        {['draft', 'sending', 'paused'].includes(c.status) ? <button type="button" className={`${s.pillBtn} ${s.pillDanger}`} disabled={!canWrite || busy} onClick={() => onAction('cancel', c)}>Cancel</button> : null}
      </div>
    </article>
  );
}

function CampaignForm({ initial, tags, onSave, onClose, busy }) {
  const [f, setF] = useState(() => ({ ...EMPTY_CAMPAIGN, ...initial, audience_tags: Array.isArray(initial?.audience_tags) ? initial.audience_tags.join(', ') : (initial?.audience_tags || '') }));
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal title={initial?.id ? `Edit ${initial.name}` : 'New Campaign'} onClose={busy ? undefined : onClose} wide sticky={busy} blockEscape={busy}>
      <form className={s.form} onSubmit={(e) => { e.preventDefault(); onSave(f); }}>
        <div className={`${s.form} ${s.formTwo}`}>
          <label className={s.label}>Internal Name<input className={s.input} required maxLength={120} value={f.name} onChange={set('name')} /></label>
          <label className={s.label}>Slug<input className={s.input} required pattern="[a-z0-9][a-z0-9-]{2,60}" value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })} disabled={!!initial?.id} /><span className={s.hint}>Used In Links And Reports. Lowercase, Digits And Dashes.</span></label>
        </div>
        <label className={s.label}>Subject Line<input className={s.input} required maxLength={150} value={f.subject} onChange={set('subject')} /></label>
        <label className={s.label}>Preview Text<input className={s.input} maxLength={200} value={f.preheader} onChange={set('preheader')} /><span className={s.hint}>The Grey Line Inboxes Show After The Subject.</span></label>
        <label className={s.label}>Headline<input className={s.input} required maxLength={150} value={f.headline} onChange={set('headline')} /></label>
        <label className={s.label}>Message<textarea className={s.textarea} required maxLength={6000} value={f.body} onChange={set('body')} /><span className={s.hint}>Blank Line Between Paragraphs. Merge Fields: {'{{first_name}}'}, {'{{name}}'}, {'{{promo_code}}'}.</span></label>
        <div className={`${s.form} ${s.formTwo}`}>
          <label className={s.label}>Button Label<input className={s.input} required maxLength={40} value={f.cta_label} onChange={set('cta_label')} /></label>
          <label className={s.label}>Button Link<input className={s.input} required type="url" value={f.cta_url} onChange={set('cta_url')} /><span className={s.hint}>Must Be A smarter.poker Page.</span></label>
          <label className={s.label}>Promo Code (Optional)<input className={s.input} maxLength={20} value={f.promo_code} onChange={(e) => setF({ ...f, promo_code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })} /></label>
          <label className={s.label}>Audience<select className={s.select} value={f.audience} onChange={set('audience')}>{Object.entries(AUDIENCE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          {f.audience === 'contacts' ? <label className={s.label}>Only Contacts Tagged<input className={s.input} list="marketing-tags" value={f.audience_tags} onChange={set('audience_tags')} /><span className={s.hint}>Comma Separated. Blank Means Every Active Contact.</span><datalist id="marketing-tags">{tags.map((t) => <option key={t.tag} value={t.tag} />)}</datalist></label> : null}
          {f.audience === 'lapsed_players' || f.audience === 'active_players' ? <label className={s.label}>{f.audience === 'lapsed_players' ? 'Not Seen For At Least (Days)' : 'Seen Within (Days)'}<input className={s.input} type="number" min="1" max="365" value={f.lapsed_days} onChange={set('lapsed_days')} /></label> : null}
          <label className={s.label}>Daily Cap<input className={s.input} type="number" min="1" max="10000" value={f.daily_cap} onChange={set('daily_cap')} /><span className={s.hint}>Most Emails This Campaign Sends In Any 24 Hours.</span></label>
          {f.audience === 'contacts' ? <>
            <label className={s.label}>Signup Chips<input className={s.input} type="number" min="0" max="100" value={f.signup_chips} onChange={set('signup_chips')} /><span className={s.hint}>Paid From The Midway Union Promo Wallet When Someone This Campaign Emailed Signs Up With That Same Confirmed Address. Topped Up Against The Welcome-Back, Never Paid Twice.</span></label>
            <label className={s.label}>Chip Budget (Total)<input className={s.input} type="number" min="0" max="100000" value={f.signup_chips_budget} onChange={set('signup_chips_budget')} /><span className={s.hint}>No More Than This Is Ever Paid For This Campaign.</span></label>
          </> : null}
        </div>
        <div className={s.actions}>
          <button type="button" className={s.pillBtn} onClick={onClose} disabled={busy}>Close</button>
          <button type="submit" className={`${s.pillBtn} ${s.pillLit}`} disabled={busy}>{busy ? 'Saving' : 'Save Draft'}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function MarketingPanel({ authFetch, showNotification, permissions }) {
  const canWrite = hasPermission(permissions, 'content.write');
  const [section, setSection] = useState('campaigns');
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null);
  const [preview, setPreview] = useState(null);
  const [approve, setApprove] = useState(null);
  const seq = useRef(0);

  const notify = useCallback((m, t) => showNotification?.(m, t), [showNotification]);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    setLoading(true); setError('');
    try {
      const body = await authFetch(`${API_URL}?section=overview`);
      if (mine === seq.current) setOverview(body.overview || null);
    } catch (e) {
      if (mine === seq.current) setError(e.message || 'Marketing Could Not Be Read');
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [authFetch]);
  useEffect(() => { load(); return () => { seq.current += 1; }; }, [load]);

  const post = useCallback(async (payload, okMessage) => {
    setBusy(true);
    try {
      const body = await authFetch(API_URL, { method: 'POST', body: JSON.stringify(payload) });
      if (okMessage) notify(typeof okMessage === 'function' ? okMessage(body) : okMessage);
      await load();
      return body;
    } catch (e) {
      notify(e.message || 'Request Failed', 'error');
      return null;
    } finally {
      setBusy(false);
    }
  }, [authFetch, load, notify]);

  const openPreview = useCallback(async (c) => {
    try {
      const body = await authFetch(`${API_URL}?section=preview&id=${encodeURIComponent(c.id)}`);
      setPreview({ campaign: c, ...body });
    } catch (e) { notify(e.message || 'Preview Failed', 'error'); }
  }, [authFetch, notify]);

  const o = overview || {};
  const settings = o.settings || {};
  const tags = o.contacts?.tags || [];
  const kpis = [
    ['Contacts To Reach', o.contacts?.active], ['Converted To Players', o.contacts?.converted], ['Real Players', o.players?.real],
    ['Lapsed 14 Days', o.players?.lapsed_14d], ['Sent Last 24h', o.sent_24h], ['Do Not Email', o.suppressions],
  ];

  return (
    <section className="marketing-panel" aria-labelledby="marketing-title">
      <Plate title="Marketing" right={<div className={s.actions}><img src="/email/smarter-poker-logo.jpg" alt="Smarter.Poker" width={56} height={56} className={s.logo} /><button type="button" className={s.pillBtn} onClick={load} disabled={loading}>Refresh</button></div>}>
        <h2 id="marketing-title" className={s.meta}>Contacts, Campaigns, Unsubscribes And Retention. Every Send Is Test-Sent, Approved, Capped And Logged.</h2>
        {error ? <Notice tone="err">{error}</Notice> : null}
        <div className={s.kpis}>
          {kpis.map(([label, value]) => <div className={s.kpi} key={label}><span className={s.kpiValue}>{loading && !overview ? '...' : n(value)}</span><span className={s.kpiLabel}>{label}</span></div>)}
        </div>
      </Plate>

      {overview && !String(settings.postal_address || '').trim() ? <Notice>Set The Mailing Address In Settings Before Any Campaign Can Send. US Law (CAN-SPAM) Requires It In Every Promotional Email.</Notice> : null}
      {overview && settings.sending_enabled === false ? <Notice tone="err">Sending Is Switched Off. Approved Campaigns Wait Until It Is Back On.</Notice> : null}
      {overview && !settings.webhook_connected ? <Notice>Bounce And Spam Tracking Connects Itself On The Next Hourly Run.</Notice> : null}

      <nav className={s.subnav} aria-label="Marketing Sections">
        {SECTIONS.map(([id, label]) => (
          <button key={id} type="button" className={`${s.pillBtn} ${section === id ? s.pillLit : ''}`} aria-pressed={section === id} onClick={() => setSection(id)}>{label}</button>
        ))}
      </nav>

      {section === 'campaigns' ? (
        <Plate title="Campaigns" right={<button type="button" className={`${s.pillBtn} ${s.pillLit}`} disabled={!canWrite} onClick={() => setEditing({})}>New Campaign</button>}>
          {!canWrite ? <Notice>Content Write Permission Is Required To Draft Or Send.</Notice> : null}
          {overview && !(o.campaigns || []).length ? <p className={s.meta}>No Campaigns Yet.</p> : null}
          <div className={s.cards}>
            {(o.campaigns || []).map((c) => (
              <CampaignCard key={c.id} c={c} canWrite={canWrite} busy={busy}
                onEdit={setEditing} onPreview={openPreview}
                onTest={(x) => post({ action: 'test_send', id: x.id }, (b) => `Test Sent To ${b.sentTo}`)}
                onApprove={setApprove}
                onAction={(action, x) => post({ action, id: x.id }, `Campaign ${action === 'pause' ? 'Paused' : action === 'resume' ? 'Resumed' : 'Cancelled'}`)} />
            ))}
          </div>
        </Plate>
      ) : null}

      {section === 'contacts' ? <ContactsSection authFetch={authFetch} tags={tags} canWrite={canWrite} post={post} /> : null}
      {section === 'import' ? <ImportSection canWrite={canWrite} post={post} busy={busy} /> : null}
      {section === 'funnel' ? <FunnelSection authFetch={authFetch} /> : null}
      {section === 'settings' ? <SettingsSection settings={settings} canWrite={canWrite} post={post} busy={busy} /> : null}

      {editing ? <CampaignForm initial={editing} tags={tags} busy={busy} onClose={() => setEditing(null)}
        onSave={async (f) => { const r = await post({ action: 'save_campaign', campaign: { ...f, id: editing.id } }, 'Draft Saved. Send A Test Before Approving.'); if (r) setEditing(null); }} /> : null}

      {preview ? (
        <Modal title={`Preview: ${preview.subject}`} onClose={() => setPreview(null)} wide>
          {preview.blockers?.length ? <Notice>{preview.blockers.join(' ')}</Notice> : null}
          <iframe title="Email Preview" className={s.preview} sandbox="" srcDoc={preview.html} />
        </Modal>
      ) : null}

      {approve ? (
        <ConfirmDialog title={`Send ${approve.name}?`} confirmLabel="Approve And Send" busy={busy} requireTyped="SEND"
          onCancel={() => setApprove(null)}
          onConfirm={async () => { const r = await post({ action: 'approve', id: approve.id }, (b) => `Approved: ${n(b.result?.pending)} Will Be Emailed, ${n(b.result?.suppressed)} Skipped As Do Not Email.`); if (r) setApprove(null); }}>
          <p>This Emails {AUDIENCE_LABEL[approve.audience]}{approve.audience_tags?.length ? ` Tagged ${approve.audience_tags.join(', ')}` : ''}, Up To {n(approve.daily_cap)} A Day, Starting On The Next Hourly Run. Anyone Who Unsubscribed, Bounced Or Reported Spam Is Skipped. Sending Pauses Itself If Spam Reports Or Bounces Spike.</p>
        </ConfirmDialog>
      ) : null}
    </section>
  );
}

function ContactsSection({ authFetch, tags, canWrite, post }) {
  const [q, setQ] = useState('');
  const [tag, setTag] = useState('');
  const [status, setStatus] = useState('');
  const [offset, setOffset] = useState(0);
  const [body, setBody] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const seq = useRef(0);
  const LIMIT = 50;
  const qs = useMemo(() => new URLSearchParams({ section: 'contacts', limit: String(LIMIT), offset: String(offset), ...(q ? { q } : {}), ...(tag ? { tag } : {}), ...(status ? { status } : {}) }).toString(), [q, tag, status, offset]);
  const load = useCallback(async () => {
    const mine = ++seq.current; setLoading(true); setErr('');
    try { const b = await authFetch(`${API_URL}?${qs}`); if (mine === seq.current) setBody(b); }
    catch (e) { if (mine === seq.current) setErr(e.message || 'Contacts Could Not Be Read'); }
    finally { if (mine === seq.current) setLoading(false); }
  }, [authFetch, qs]);
  useEffect(() => { load(); return () => { seq.current += 1; }; }, [load]);
  const rows = body?.rows || [];
  return (
    <Plate title="Contacts">
      <div className={`${s.form} ${s.formTwo}`}>
        <label className={s.label}>Search<input className={s.input} value={q} placeholder="Name, Agent, Email Or Phone" onChange={(e) => { setOffset(0); setQ(e.target.value); }} /></label>
        <label className={s.label}>Tag<select className={s.select} value={tag} onChange={(e) => { setOffset(0); setTag(e.target.value); }}><option value="">All Tags</option>{tags.map((t) => <option key={t.tag} value={t.tag}>{t.tag} ({t.count})</option>)}</select></label>
        <label className={s.label}>Status<select className={s.select} value={status} onChange={(e) => { setOffset(0); setStatus(e.target.value); }}><option value="">All</option>{['active', 'converted', 'unsubscribed', 'bounced', 'complained', 'invalid'].map((v) => <option key={v} value={v}>{v}</option>)}</select></label>
      </div>
      {err ? <Notice tone="err">{err}</Notice> : null}
      <div className={`${s.well} ${s.scroll}`} style={{ marginTop: 12 }}>
        <table className={s.table}>
          <thead><tr><th scope="col">Name</th><th scope="col">Agent</th><th scope="col">Email</th><th scope="col">Phone</th><th scope="col">Downlines</th><th scope="col">Tags</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.full_name || '-'}</td><td>{r.agent_name || '-'}{r.external_id ? ` #${r.external_id}` : ''}</td>
                <td>{r.email || '-'}</td><td>{r.phone || '-'}</td><td>{n(r.downlines)}</td>
                <td>{(r.tags || []).join(', ') || '-'}</td>
                <td>{r.user_id ? 'Converted' : r.status}</td>
                <td>{r.email && r.status === 'active' && !r.user_id ? <button type="button" className={s.pillBtn} disabled={!canWrite} onClick={async () => { await post({ action: 'suppress', email: r.email }, 'Added To Do Not Email'); load(); }}>Do Not Email</button> : null}
                  {r.email && r.status === 'unsubscribed' ? <button type="button" className={s.pillBtn} disabled={!canWrite} onClick={async () => { await post({ action: 'unsuppress', email: r.email }, 'Email Allowed Again'); load(); }}>Allow Email</button> : null}</td>
              </tr>
            ))}
            {!loading && !rows.length ? <tr><td colSpan={8}>No Contacts Match.</td></tr> : null}
          </tbody>
        </table>
      </div>
      <Pager offset={offset} limit={LIMIT} count={rows.length} total={body?.total ?? null} hasMore={body?.total != null ? offset + rows.length < body.total : rows.length === LIMIT} loading={loading} noun="Contacts" onPrevious={() => setOffset(Math.max(0, offset - LIMIT))} onNext={() => setOffset(offset + LIMIT)} />
    </Plate>
  );
}

function ImportSection({ canWrite, post, busy }) {
  const [raw, setRaw] = useState('');
  const [source, setSource] = useState('');
  const [consent, setConsent] = useState('existing_relationship');
  const [tagText, setTagText] = useState('');
  const [result, setResult] = useState(null);
  const parsed = useMemo(() => rowsToContacts(raw), [raw]);
  return (
    <Plate title="Import Contacts">
      <div className={s.form}>
        <label className={s.label}>Paste From Google Sheets, Excel Or A CSV<textarea className={s.textarea} value={raw} onChange={(e) => setRaw(e.target.value)} placeholder="Copy the rows with their header row (Email, Name, Agent Name, Phone, Downlines, Number) and paste here. A plain list of emails also works." /><span className={s.hint}>{raw ? `${parsed.contacts.length} Contacts Found, ${parsed.skipped} Rows Without An Email Or Phone Skipped. People Who Are Already Players Are Left Out Automatically.` : 'Nothing Pasted Yet.'}</span></label>
        <div className={`${s.form} ${s.formTwo}`}>
          <label className={s.label}>Where This List Came From<input className={s.input} value={source} onChange={(e) => setSource(e.target.value)} placeholder="Midway Master Contacts" maxLength={120} /></label>
          <label className={s.label}>Why We May Email Them<select className={s.select} value={consent} onChange={(e) => setConsent(e.target.value)}>{Object.entries(CONSENT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className={s.label}>Tags<input className={s.input} value={tagText} onChange={(e) => setTagText(e.target.value)} placeholder="midway-agent" /><span className={s.hint}>Comma Separated. Campaigns Can Target A Tag.</span></label>
        </div>
        <div className={s.actions}>
          <button type="button" className={`${s.pillBtn} ${s.pillLit}`} disabled={!canWrite || busy || !parsed.contacts.length || !source.trim()}
            onClick={async () => { const b = await post({ action: 'import_contacts', rows: parsed.contacts, source, consent_basis: consent, tags: tagText }, 'Import Finished'); if (b) { setResult(b.result); setRaw(''); } }}>
            Import {parsed.contacts.length || ''} Contacts
          </button>
        </div>
        {result ? <Notice tone="ok">Added {n(result.inserted)}, Updated {n(result.updated)}, Already Players {n(result.already_players)}, Invalid {n(result.invalid)}.</Notice> : null}
      </div>
    </Plate>
  );
}

function FunnelSection({ authFetch }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let live = true;
    authFetch(`${API_URL}?section=funnel&weeks=12`).then((b) => { if (live) setRows(b.funnel || []); }).catch((e) => { if (live) setErr(e.message || 'Funnel Could Not Be Read'); });
    return () => { live = false; };
  }, [authFetch]);
  const Bar = ({ a, b }) => <div className={s.bar} title={pct(a, b)}><div className={s.barFill} style={{ width: b ? `${Math.min(100, (a / b) * 100)}%` : 0 }} /></div>;
  return (
    <Plate title="Retention Funnel">
      <p className={s.meta}>Real Players By Signup Week. Played Means At Least One Hand Or Tournament. Seen After Means They Signed In Again After That Long. A Week Too Young To Measure Shows A Dash.</p>
      {err ? <Notice tone="err">{err}</Notice> : null}
      <div className={`${s.well} ${s.scroll}`}>
        <table className={s.table}>
          <thead><tr><th scope="col">Week Of</th><th scope="col">Signed Up</th><th scope="col">Played</th><th scope="col">Seen After 1 Day</th><th scope="col">Seen After 7 Days</th><th scope="col">Seen After 30 Days</th><th scope="col">Active Last 7 Days</th></tr></thead>
          <tbody>
            {(rows || []).map((r) => (
              <tr key={r.week}>
                <td>{r.week}</td><td>{n(r.signed_up)}</td>
                {[r.played, r.seen_after_1d, r.seen_after_7d, r.seen_after_30d, r.seen_last_7d].map((v, i) => (
                  <td key={i}>{v === null || v === undefined ? '-' : <>{n(v)} ({pct(v, r.signed_up)})<Bar a={v} b={r.signed_up} /></>}</td>
                ))}
              </tr>
            ))}
            {rows && !rows.length ? <tr><td colSpan={7}>No Real Player Signups In This Window.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </Plate>
  );
}

function SettingsSection({ settings, canWrite, post, busy }) {
  const [f, setF] = useState(settings);
  useEffect(() => { setF(settings); }, [settings]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Plate title="Settings">
      <form className={s.form} onSubmit={(e) => { e.preventDefault(); post({ action: 'save_settings', settings: { postal_address: f.postal_address || '', from_name: f.from_name, from_email: f.from_email, reply_to: f.reply_to, global_daily_cap: f.global_daily_cap, sending_enabled: f.sending_enabled } }, 'Settings Saved'); }}>
        <label className={s.label}>Mailing Address (Printed In Every Email)<input className={s.input} value={f.postal_address || ''} onChange={set('postal_address')} placeholder="Street, City, State ZIP" /><span className={s.hint}>Required By CAN-SPAM. A PO Box Or Registered Agent Address Is Fine.</span></label>
        <div className={`${s.form} ${s.formTwo}`}>
          <label className={s.label}>From Name<input className={s.input} value={f.from_name || ''} onChange={set('from_name')} /></label>
          <label className={s.label}>From Address<input className={s.input} value={f.from_email || ''} onChange={set('from_email')} /><span className={s.hint}>Must Be On mail.smarter.poker, The Verified Sending Domain.</span></label>
          <label className={s.label}>Replies Go To<input className={s.input} value={f.reply_to || ''} onChange={set('reply_to')} /></label>
          <label className={s.label}>Most Emails Per Day, All Campaigns<input className={s.input} type="number" min="0" max="50000" value={f.global_daily_cap ?? 300} onChange={set('global_daily_cap')} /><span className={s.hint}>Keep It Low While The Sending Domain Builds Reputation.</span></label>
          <label className={s.label}>Sending<select className={s.select} value={f.sending_enabled === false ? 'off' : 'on'} onChange={(e) => setF({ ...f, sending_enabled: e.target.value === 'on' })}><option value="on">On</option><option value="off">Off (Everything Waits)</option></select></label>
        </div>
        <p className={s.meta}>Bounce And Spam Tracking: {settings.webhook_connected ? `Connected ${when(settings.webhook_connected_at)}` : 'Not Connected Yet'}. A Campaign Pauses Itself At {Math.round(Number(settings.complaint_pause_rate || 0.003) * 1000) / 10}% Spam Reports Or {Math.round(Number(settings.bounce_pause_rate || 0.05) * 100)}% Bounces.</p>
        <div className={s.actions}><button type="submit" className={`${s.pillBtn} ${s.pillLit}`} disabled={!canWrite || busy}>Save Settings</button></div>
      </form>
    </Plate>
  );
}

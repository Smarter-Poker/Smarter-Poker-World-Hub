/**
 * /horses/hg-moderation — Platform-staff Home Games moderation surface
 * 4 tabs: Reports · Appeals · Onboarding lookup · GDPR scrub
 * Admin-gated (admin|superadmin|god).
 */
import { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { getAccessToken } from '../../src/lib/authUtils';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const sb = createClient(SUPABASE_URL, SUPABASE_ANON);

const TABS = ['Reports', 'Appeals', 'Onboarding', 'GDPR Scrub'];

const RESOLVE_ACTIONS = [
  { value: 'dismiss', label: 'Dismiss' },
  { value: 'hide_content', label: 'Hide Content' },
  { value: 'delete_content', label: 'Delete Content' },
  { value: 'warn_author', label: 'Warn Author' },
  { value: 'strike_author', label: 'Strike Author' },
  { value: 'ban_author', label: 'Ban Author' },
];

function useAuthBearer() {
  const [token, setToken] = useState(null);
  useEffect(() => { setToken(getAccessToken()); }, []);
  return token;
}

async function apiFetch(path, token, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

// ── Reports Tab ────────────────────────────────────────────────────────────
function ReportsTab({ token }) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [status, setStatus] = useState('pending');
  const [resolving, setResolving] = useState(null); // report object
  const [action, setAction] = useState('dismiss');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setErr('');
    try {
      const d = await apiFetch(`/api/horses/hg-reports?status=${status}&limit=100`, token);
      setReports(d.reports || []);
    } catch (e) { setErr(e.message); }
    setLoading(false);
  }, [token, status]);

  useEffect(() => { load(); }, [load]);

  const handleResolve = async () => {
    setSubmitting(true);
    try {
      await apiFetch('/api/horses/hg-reports', token, {
        method: 'PATCH',
        body: { report_id: resolving.id, action, moderator_note: note },
      });
      setResolving(null); setNote(''); setAction('dismiss');
      load();
    } catch (e) { alert(e.message); }
    setSubmitting(false);
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
        <select value={status} onChange={e => setStatus(e.target.value)} style={S.select}>
          <option value="pending">Pending</option>
          <option value="resolved">Resolved</option>
          <option value="">All</option>
        </select>
        <button onClick={load} style={S.btn}>Refresh</button>
      </div>
      {err && <div style={S.err}>{err}</div>}
      {loading ? <div style={S.dim}>Loading…</div> : reports.length === 0 ? (
        <div style={S.empty}>No reports found.</div>
      ) : (
        <table style={S.table}>
          <thead><tr>{['ID','Type','Category','Reporter','Author','Status','Date',''].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
          <tbody>
            {reports.map(r => (
              <tr key={r.id} style={S.tr}>
                <td style={S.td}><code style={{ fontSize: 11 }}>{r.id?.slice(0,8)}</code></td>
                <td style={S.td}>{r.reported_type}</td>
                <td style={S.td}><span style={{ color: ['illegal','self_harm','doxxing'].includes(r.reason_category) ? '#f87171' : '#94a3b8', fontWeight: 700 }}>{r.reason_category}</span></td>
                <td style={S.td}>{r.reporter_name || '—'}</td>
                <td style={S.td}>{r.content_author_name || '—'}</td>
                <td style={S.td}>{r.status}</td>
                <td style={S.td}>{r.created_at?.slice(0,10)}</td>
                <td style={S.td}>{r.status === 'pending' && <button style={S.btnSm} onClick={() => { setResolving(r); setAction('dismiss'); setNote(''); }}>Review</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {resolving && (
        <div style={S.backdrop} onClick={e => { if (e.target === e.currentTarget) setResolving(null); }}>
          <div style={S.modal}>
            <h3 style={{ margin: '0 0 12px', color: '#e2e8f0' }}>Resolve Report</h3>
            <p style={{ fontSize: 13, color: '#94a3b8', margin: '0 0 4px' }}>Category: <strong style={{ color: '#f87171' }}>{resolving.reason_category}</strong></p>
            <p style={{ fontSize: 13, color: '#94a3b8', margin: '0 0 16px' }}>{resolving.reason_text}</p>
            <label style={S.label}>Action
              <select value={action} onChange={e => setAction(e.target.value)} style={{ ...S.select, width: '100%', marginTop: 4 }}>
                {RESOLVE_ACTIONS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
            </label>
            <label style={S.label}>Moderator Note (optional)
              <textarea value={note} onChange={e => setNote(e.target.value)} maxLength={2000} rows={3} style={S.textarea} />
            </label>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button style={S.btnGhost} onClick={() => setResolving(null)}>Cancel</button>
              <button style={S.btnPrimary} onClick={handleResolve} disabled={submitting}>{submitting ? 'Saving…' : 'Submit'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Appeals Tab ────────────────────────────────────────────────────────────
function AppealsTab({ token }) {
  const [appeals, setAppeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [status, setStatus] = useState('pending');
  const [reviewing, setReviewing] = useState(null);
  const [decision, setDecision] = useState('approved');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setErr('');
    try {
      const d = await apiFetch(`/api/horses/hg-appeals?status=${status}&limit=100`, token);
      setAppeals(d.appeals || []);
    } catch (e) { setErr(e.message); }
    setLoading(false);
  }, [token, status]);

  useEffect(() => { load(); }, [load]);

  const handleReview = async () => {
    setSubmitting(true);
    try {
      await apiFetch('/api/horses/hg-appeals', token, {
        method: 'PATCH',
        body: { appeal_id: reviewing.out_appeal_id, decision, reviewer_note: note },
      });
      setReviewing(null); setNote(''); setDecision('approved');
      load();
    } catch (e) { alert(e.message); }
    setSubmitting(false);
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <select value={status} onChange={e => setStatus(e.target.value)} style={S.select}>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="denied">Denied</option>
          <option value="">All</option>
        </select>
        <button onClick={load} style={S.btn}>Refresh</button>
      </div>
      {err && <div style={S.err}>{err}</div>}
      {loading ? <div style={S.dim}>Loading…</div> : appeals.length === 0 ? (
        <div style={S.empty}>No appeals found.</div>
      ) : (
        <table style={S.table}>
          <thead><tr>{['Appeal ID','Group','User','Ban Reason','Days Pending','Status',''].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
          <tbody>
            {appeals.map(a => (
              <tr key={a.out_appeal_id} style={S.tr}>
                <td style={S.td}><code style={{ fontSize: 11 }}>{a.out_appeal_id?.slice(0,8)}</code></td>
                <td style={S.td}>{a.out_group_name}</td>
                <td style={S.td}>{a.out_user_display}</td>
                <td style={S.td}>{a.out_ban_reason}</td>
                <td style={S.td}>{a.out_days_pending}</td>
                <td style={S.td}>{a.out_status}</td>
                <td style={S.td}>{a.out_status === 'pending' && <button style={S.btnSm} onClick={() => { setReviewing(a); setDecision('approved'); setNote(''); }}>Review</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {reviewing && (
        <div style={S.backdrop} onClick={e => { if (e.target === e.currentTarget) setReviewing(null); }}>
          <div style={S.modal}>
            <h3 style={{ margin: '0 0 12px', color: '#e2e8f0' }}>Review Ban Appeal</h3>
            <p style={{ fontSize: 13, color: '#94a3b8', margin: '0 0 4px' }}>User: <strong style={{ color: '#e2e8f0' }}>{reviewing.out_user_display}</strong></p>
            <p style={{ fontSize: 13, color: '#94a3b8', margin: '0 0 4px' }}>Appeal: {reviewing.out_appeal_text}</p>
            <label style={S.label}>Decision
              <select value={decision} onChange={e => setDecision(e.target.value)} style={{ ...S.select, width: '100%', marginTop: 4 }}>
                <option value="approved">Approve (Unban)</option>
                <option value="denied">Deny</option>
              </select>
            </label>
            <label style={S.label}>Note (optional)
              <textarea value={note} onChange={e => setNote(e.target.value)} maxLength={2000} rows={3} style={S.textarea} />
            </label>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button style={S.btnGhost} onClick={() => setReviewing(null)}>Cancel</button>
              <button style={S.btnPrimary} onClick={handleReview} disabled={submitting}>{submitting ? 'Saving…' : 'Submit'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Onboarding Tab ─────────────────────────────────────────────────────────
function OnboardingTab({ token }) {
  const [userId, setUserId] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const lookup = async () => {
    if (!userId.trim()) return;
    setLoading(true); setErr(''); setResult(null);
    try {
      const d = await apiFetch(`/api/horses/hg-onboarding-status?userId=${encodeURIComponent(userId.trim())}`, token);
      setResult(d.status);
    } catch (e) { setErr(e.message); }
    setLoading(false);
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input value={userId} onChange={e => setUserId(e.target.value)} placeholder="User UUID" style={{ ...S.select, flex: 1 }} />
        <button onClick={lookup} style={S.btn} disabled={loading}>{loading ? '…' : 'Look Up'}</button>
      </div>
      {err && <div style={S.err}>{err}</div>}
      {result && (
        <div style={{ background: 'rgba(15,23,42,.6)', border: '1px solid rgba(148,163,184,.12)', borderRadius: 10, padding: 16 }}>
          <pre style={{ color: '#e2e8f0', fontSize: 13, margin: 0, whiteSpace: 'pre-wrap' }}>{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}

// ── GDPR Tab ───────────────────────────────────────────────────────────────
function GdprTab({ token }) {
  const [userId, setUserId] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState('');

  const handleErase = async () => {
    if (!confirmed) { alert('Check the confirmation box first.'); return; }
    if (!window.confirm(`IRREVERSIBLE: Anonymize all Home Games content for user ${userId}?`)) return;
    setLoading(true); setErr(''); setResult(null);
    try {
      const d = await apiFetch('/api/horses/hg-gdpr-erase', token, {
        method: 'POST',
        body: { userId, confirmed: true },
      });
      setResult(d.counts);
    } catch (e) { setErr(e.message); }
    setLoading(false);
  };

  return (
    <div>
      <div style={{ background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 8, padding: 12, marginBottom: 20, fontSize: 13, color: '#fca5a5' }}>
        ⚠ GDPR Erasure — Irreversible. Anonymizes all Home Games posts, messages, and profile data for the target user. Use only on verified DPO/legal request.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 500 }}>
        <label style={S.label}>Target User UUID
          <input value={userId} onChange={e => setUserId(e.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" style={{ ...S.select, width: '100%', marginTop: 4 }} />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#94a3b8', fontSize: 13, cursor: 'pointer' }}>
          <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />
          I confirm this action is authorized and irreversible
        </label>
        <button onClick={handleErase} disabled={loading || !userId || !confirmed} style={{ ...S.btnPrimary, background: 'rgba(239,68,68,.7)', maxWidth: 200 }}>
          {loading ? 'Erasing…' : 'Erase User Content'}
        </button>
      </div>
      {err && <div style={S.err}>{err}</div>}
      {result && (
        <div style={{ marginTop: 16, background: 'rgba(16,185,129,.08)', border: '1px solid rgba(16,185,129,.3)', borderRadius: 8, padding: 12 }}>
          <div style={{ color: '#6ee7b7', fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Erasure Complete</div>
          <pre style={{ color: '#e2e8f0', fontSize: 13, margin: 0 }}>{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────
export default function HgModerationPage() {
  const router = useRouter();
  const token = useAuthBearer();
  const [tab, setTab] = useState(0);
  const [authChecked, setAuthChecked] = useState(false);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const { data: { user } } = await sb.auth.getUser(token);
        if (!user) { router.replace('/auth/login?redirect=/horses/hg-moderation'); return; }
        const { data: profile } = await sb.from('profiles').select('role').eq('id', user.id).maybeSingle();
        if (!profile || !['admin', 'superadmin', 'god'].includes(profile.role)) {
          setAuthChecked(true); setAuthed(false); return;
        }
        setAuthed(true); setAuthChecked(true);
      } catch { setAuthChecked(true); setAuthed(false); }
    })();
  }, [token, router]);

  if (!authChecked) return <div style={{ minHeight: '100vh', background: '#050810', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>Verifying access…</div>;
  if (!authed) return <div style={{ minHeight: '100vh', background: '#050810', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f87171', fontSize: 18 }}>403 — Admin access required</div>;

  return (
    <>
      <Head>
        <title>HG Moderation | Horses</title>
      </Head>
      <div style={{ minHeight: '100vh', background: '#050810', color: '#e2e8f0', fontFamily: 'Inter,-apple-system,sans-serif', padding: '24px 20px 80px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 4px', color: '#e2e8f0' }}>Home Games Moderation</h1>
          <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 24px' }}>Platform-staff surface — all escalation categories, cross-group actions, GDPR tools</p>

          {/* Tab bar */}
          <div style={{ display: 'flex', gap: 2, marginBottom: 24, background: 'rgba(255,255,255,.04)', borderRadius: 10, padding: 4, width: 'fit-content' }}>
            {TABS.map((t, i) => (
              <button key={t} onClick={() => setTab(i)} style={{ padding: '8px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, transition: 'all .15s', background: tab === i ? 'rgba(139,92,246,.25)' : 'transparent', color: tab === i ? '#c4b5fd' : '#94a3b8' }}>{t}</button>
            ))}
          </div>

          <div style={{ background: 'rgba(15,23,42,.55)', border: '1px solid rgba(148,163,184,.1)', borderRadius: 14, padding: 20 }}>
            {tab === 0 && <ReportsTab token={token} />}
            {tab === 1 && <AppealsTab token={token} />}
            {tab === 2 && <OnboardingTab token={token} />}
            {tab === 3 && <GdprTab token={token} />}
          </div>
        </div>
      </div>
    </>
  );
}

// ── Shared styles ──────────────────────────────────────────────────────────
const S = {
  select: { background: 'rgba(15,23,42,.8)', border: '1px solid rgba(148,163,184,.2)', borderRadius: 8, color: '#e2e8f0', padding: '8px 12px', fontSize: 13, outline: 'none' },
  btn: { padding: '8px 16px', background: 'rgba(139,92,246,.2)', border: '1px solid rgba(139,92,246,.4)', borderRadius: 8, color: '#c4b5fd', fontSize: 13, fontWeight: 700, cursor: 'pointer' },
  btnSm: { padding: '4px 12px', background: 'rgba(139,92,246,.2)', border: '1px solid rgba(139,92,246,.4)', borderRadius: 6, color: '#c4b5fd', fontSize: 12, fontWeight: 700, cursor: 'pointer' },
  btnPrimary: { padding: '10px 20px', background: 'rgba(139,92,246,.8)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' },
  btnGhost: { padding: '10px 20px', background: 'transparent', border: '1px solid rgba(148,163,184,.2)', borderRadius: 8, color: '#94a3b8', fontSize: 13, fontWeight: 700, cursor: 'pointer' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { textAlign: 'left', padding: '10px 12px', color: '#64748b', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, borderBottom: '1px solid rgba(148,163,184,.1)' },
  td: { padding: '10px 12px', borderBottom: '1px solid rgba(148,163,184,.06)', color: '#cbd5e1', verticalAlign: 'middle' },
  tr: {},
  err: { background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 8, padding: '10px 14px', color: '#fca5a5', fontSize: 13, marginBottom: 12 },
  empty: { textAlign: 'center', padding: 40, color: '#475569', fontSize: 14 },
  dim: { textAlign: 'center', padding: 40, color: '#475569' },
  backdrop: { position: 'fixed', inset: 0, background: 'rgba(5,8,16,.8)', backdropFilter: 'blur(6px)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 },
  modal: { background: 'linear-gradient(180deg,#152036,#0d1626)', border: '1px solid rgba(148,163,184,.16)', borderRadius: 16, padding: 24, maxWidth: 480, width: '100%', color: '#fff' },
  label: { display: 'block', marginBottom: 14, fontSize: 13, color: '#94a3b8', fontWeight: 600 },
  textarea: { width: '100%', boxSizing: 'border-box', padding: '10px 12px', background: 'rgba(0,0,0,.3)', border: '1px solid rgba(148,163,184,.18)', borderRadius: 8, color: '#fff', fontFamily: 'inherit', fontSize: 14, resize: 'vertical', minHeight: 72, marginTop: 4 },
};

/**
 * /horses/hg-moderation — Platform-staff Home Games moderation surface
 * 4 tabs: Reports · Appeals · Onboarding lookup · GDPR scrub
 * Admin-gated (admin|superadmin|god).
 *
 * Colour: smarter.poker / Club Arena palette. Cyan #00d4ff is THE accent and
 * also means SUCCESS / ACTIVE. No purples, no greens.
 */
import { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { supabase } from '../../src/lib/supabase';
import { getAuthUser, getFreshAccessToken } from '../../src/lib/authUtils';

const TABS = ['Reports', 'Appeals', 'Onboarding', 'GDPR Scrub'];

const RESOLVE_ACTIONS = [
  { value: 'dismiss', label: 'Dismiss' },
  { value: 'hide_content', label: 'Hide Content' },
  { value: 'delete_content', label: 'Delete Content' },
  { value: 'warn_author', label: 'Warn Author' },
  { value: 'strike_author', label: 'Strike Author' },
  { value: 'ban_author', label: 'Ban Author' },
];

/**
 * Resolves the bearer token from the SHARED supabase client and keeps it fresh.
 *
 * The previous version read the token once from storage inside a mount effect.
 * If the session had not hydrated by first paint the token stayed null forever,
 * every tab's load() returned early, and the page sat on "Verifying access…"
 * with no error. getSession() is awaited, and onAuthStateChange keeps the token
 * current across silent refreshes and sign-out.
 */
function useAuthBearer() {
  const [token, setToken] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;

    // getFreshAccessToken reads storage and refreshes only when the token is
    // near expiry. The argument-less client session read is banned
    // repo-wide by pre-commit CHECK C.
    getFreshAccessToken()
      .then((t) => {
        if (!active) return;
        setToken(t || null);
        setReady(true);
      })
      .catch(() => {
        if (active) setReady(true);
      });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setToken(session?.access_token || null);
      setReady(true);
    });

    return () => {
      active = false;
      listener?.subscription?.unsubscribe();
    };
  }, []);

  return { token, ready };
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
  const [modalErr, setModalErr] = useState('');

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
    setSubmitting(true); setModalErr('');
    try {
      await apiFetch('/api/horses/hg-reports', token, {
        method: 'PATCH',
        body: { report_id: resolving.id, action, moderator_note: note },
      });
      setResolving(null); setNote(''); setAction('dismiss');
      load();
    } catch (e) { setModalErr(e.message); }
    setSubmitting(false);
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
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
        <div style={S.tableWrap}>
          <table style={S.table}>
            <thead><tr>{['ID','Type','Category','Reporter','Author','Status','Date',''].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
            <tbody>
              {reports.map(r => (
                <tr key={r.id}>
                  <td style={S.td}><code style={{ fontSize: 11 }}>{r.id?.slice(0,8)}</code></td>
                  <td style={S.td}>{r.reported_type}</td>
                  <td style={S.td}><span style={{ color: ['illegal','self_harm','doxxing'].includes(r.reason_category) ? '#ef4444' : '#9ca3af', fontWeight: 700 }}>{r.reason_category}</span></td>
                  <td style={S.td}>{r.reporter_name || '—'}</td>
                  <td style={S.td}>{r.content_author_name || '—'}</td>
                  <td style={S.td}>{r.status}</td>
                  <td style={S.td}>{r.created_at?.slice(0,10)}</td>
                  <td style={S.td}>{r.status === 'pending' && <button style={S.btnSm} onClick={() => { setResolving(r); setAction('dismiss'); setNote(''); setModalErr(''); }}>Review</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {resolving && (
        <div style={S.backdrop} onClick={e => { if (e.target === e.currentTarget) setResolving(null); }}>
          <div style={S.modal}>
            <h3 style={{ margin: '0 0 12px', color: '#f3f4f6' }}>Resolve Report</h3>
            <p style={{ fontSize: 13, color: '#9ca3af', margin: '0 0 4px' }}>Category: <strong style={{ color: '#ef4444' }}>{resolving.reason_category}</strong></p>
            <p style={{ fontSize: 13, color: '#9ca3af', margin: '0 0 16px' }}>{resolving.reason_text}</p>
            {modalErr && <div style={S.err}>{modalErr}</div>}
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
  const [modalErr, setModalErr] = useState('');

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
    setSubmitting(true); setModalErr('');
    try {
      await apiFetch('/api/horses/hg-appeals', token, {
        method: 'PATCH',
        body: { appeal_id: reviewing.out_appeal_id, decision, reviewer_note: note },
      });
      setReviewing(null); setNote(''); setDecision('approved');
      load();
    } catch (e) { setModalErr(e.message); }
    setSubmitting(false);
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
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
        <div style={S.tableWrap}>
          <table style={S.table}>
            <thead><tr>{['Appeal ID','Group','User','Ban Reason','Days Pending','Status',''].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
            <tbody>
              {appeals.map(a => (
                <tr key={a.out_appeal_id}>
                  <td style={S.td}><code style={{ fontSize: 11 }}>{a.out_appeal_id?.slice(0,8)}</code></td>
                  <td style={S.td}>{a.out_group_name}</td>
                  <td style={S.td}>{a.out_user_display}</td>
                  <td style={S.td}>{a.out_ban_reason}</td>
                  <td style={S.td}>{a.out_days_pending}</td>
                  <td style={S.td}>{a.out_status}</td>
                  <td style={S.td}>{a.out_status === 'pending' && <button style={S.btnSm} onClick={() => { setReviewing(a); setDecision('approved'); setNote(''); setModalErr(''); }}>Review</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {reviewing && (
        <div style={S.backdrop} onClick={e => { if (e.target === e.currentTarget) setReviewing(null); }}>
          <div style={S.modal}>
            <h3 style={{ margin: '0 0 12px', color: '#f3f4f6' }}>Review Ban Appeal</h3>
            <p style={{ fontSize: 13, color: '#9ca3af', margin: '0 0 4px' }}>User: <strong style={{ color: '#f3f4f6' }}>{reviewing.out_user_display}</strong></p>
            <p style={{ fontSize: 13, color: '#9ca3af', margin: '0 0 4px' }}>Appeal: {reviewing.out_appeal_text}</p>
            {modalErr && <div style={S.err}>{modalErr}</div>}
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
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <input value={userId} onChange={e => setUserId(e.target.value)} placeholder="User UUID" style={{ ...S.select, flex: 1, minWidth: 180 }} />
        <button onClick={lookup} style={S.btn} disabled={loading}>{loading ? '…' : 'Look Up'}</button>
      </div>
      {err && <div style={S.err}>{err}</div>}
      {result && (
        <div style={{ background: '#0d1520', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 16, overflowX: 'auto' }}>
          <pre style={{ color: '#f3f4f6', fontSize: 13, margin: 0, whiteSpace: 'pre-wrap' }}>{JSON.stringify(result, null, 2)}</pre>
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
    if (!confirmed) { setErr('Check The Confirmation Box First.'); return; }
    // Deliberate destructive-action guard — this one stays a native confirm.
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
      <div style={{ background: 'rgba(239,68,68,.12)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 8, padding: 12, marginBottom: 20, fontSize: 13, color: '#ef4444' }}>
        WARNING — GDPR Erasure Is Irreversible. Anonymizes all Home Games posts, messages, and profile data for the target user. Use only on verified DPO/legal request.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 500 }}>
        <label style={S.label}>Target User UUID
          <input value={userId} onChange={e => setUserId(e.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" style={{ ...S.select, width: '100%', boxSizing: 'border-box', marginTop: 4 }} />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#9ca3af', fontSize: 13, cursor: 'pointer' }}>
          <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} style={{ accentColor: '#00d4ff' }} />
          I confirm this action is authorized and irreversible
        </label>
        <button onClick={handleErase} disabled={loading || !userId || !confirmed} style={{ ...S.btnPrimary, background: '#ef4444', color: '#f3f4f6', maxWidth: 200 }}>
          {loading ? 'Erasing…' : 'Erase User Content'}
        </button>
      </div>
      {err && <div style={{ ...S.err, marginTop: 16, marginBottom: 0 }}>{err}</div>}
      {result && (
        <div style={{ marginTop: 16, background: 'rgba(0,212,255,0.12)', border: '1px solid rgba(0,212,255,0.30)', borderRadius: 8, padding: 12, overflowX: 'auto' }}>
          <div style={{ color: '#00d4ff', fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Erasure Complete</div>
          <pre style={{ color: '#f3f4f6', fontSize: 13, margin: 0 }}>{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────
export default function HgModerationPage() {
  const router = useRouter();
  const { token, ready } = useAuthBearer();
  const [tab, setTab] = useState(0);
  const [authChecked, setAuthChecked] = useState(false);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    if (!ready) return;
    if (!token) {
      router.replace('/auth/login?redirect=/horses/hg-moderation');
      return;
    }
    let active = true;
    (async () => {
      try {
        const user = getAuthUser();
        if (!active) return;
        if (!user?.id) { router.replace('/auth/login?redirect=/horses/hg-moderation'); return; }
        const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
        if (!active) return;
        if (!profile || !['admin', 'superadmin', 'god'].includes(profile.role)) {
          setAuthChecked(true); setAuthed(false); return;
        }
        setAuthed(true); setAuthChecked(true);
      } catch { if (active) { setAuthChecked(true); setAuthed(false); } }
    })();
    return () => { active = false; };
  }, [token, ready, router]);

  if (!authChecked) return <div style={{ minHeight: '100vh', background: '#0a0e17', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}>Verifying access…</div>;
  if (!authed) return <div style={{ minHeight: '100vh', background: '#0a0e17', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444', fontSize: 18 }}>403 — Admin access required</div>;

  return (
    <>
      <Head>
        <title>HG Moderation | Horses</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <div style={{ minHeight: '100vh', background: '#0a0e17', color: '#f3f4f6', fontFamily: 'Inter,-apple-system,sans-serif', padding: '24px 20px 80px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
            <button onClick={() => router.push('/horses')} style={S.backBtn}>&larr; Back to Horses</button>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 4px', color: '#f3f4f6' }}>Home Games Moderation</h1>
          <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 24px' }}>Platform-staff surface — all escalation categories, cross-group actions, GDPR tools</p>

          {/* Tab bar */}
          <div style={{ display: 'flex', gap: 2, marginBottom: 24, background: 'rgba(255,255,255,.04)', borderRadius: 10, padding: 4, width: 'fit-content', maxWidth: '100%', flexWrap: 'wrap' }}>
            {TABS.map((t, i) => (
              <button key={t} onClick={() => setTab(i)} style={{ padding: '8px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, transition: 'all .15s', background: tab === i ? 'rgba(0,212,255,0.12)' : 'transparent', color: tab === i ? '#00d4ff' : '#9ca3af' }}>{t}</button>
            ))}
          </div>

          <div style={{ background: 'rgba(17,24,39,.55)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 20 }}>
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
// Palette: bg #0a0e17 / panel #111827 / elevated #1f2937 / inset #0d1520
//          accent #00d4ff (also SUCCESS) · danger #ef4444 · text #f3f4f6/#9ca3af/#6b7280
const S = {
  select: { background: '#0d1520', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, color: '#f3f4f6', padding: '8px 12px', fontSize: 13, outline: 'none' },
  btn: { padding: '8px 16px', background: 'rgba(0,212,255,0.12)', border: '1px solid rgba(0,212,255,0.30)', borderRadius: 8, color: '#00d4ff', fontSize: 13, fontWeight: 700, cursor: 'pointer' },
  btnSm: { padding: '4px 12px', background: 'rgba(0,212,255,0.12)', border: '1px solid rgba(0,212,255,0.30)', borderRadius: 6, color: '#00d4ff', fontSize: 12, fontWeight: 700, cursor: 'pointer' },
  btnPrimary: { padding: '10px 20px', background: '#00d4ff', border: 'none', borderRadius: 8, color: '#0a0e17', fontSize: 13, fontWeight: 700, cursor: 'pointer' },
  btnGhost: { padding: '10px 20px', background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, color: '#9ca3af', fontSize: 13, fontWeight: 700, cursor: 'pointer' },
  backBtn: { padding: '6px 14px', background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, color: '#9ca3af', fontSize: 12, fontWeight: 700, cursor: 'pointer' },
  tableWrap: { overflowX: 'auto', WebkitOverflowScrolling: 'touch' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { textAlign: 'left', padding: '10px 12px', color: '#6b7280', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, borderBottom: '1px solid rgba(255,255,255,0.08)', whiteSpace: 'nowrap' },
  td: { padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#f3f4f6', verticalAlign: 'middle' },
  err: { background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.30)', borderRadius: 8, padding: '10px 14px', color: '#ef4444', fontSize: 13, marginBottom: 12 },
  empty: { textAlign: 'center', padding: 40, color: '#6b7280', fontSize: 14 },
  dim: { textAlign: 'center', padding: 40, color: '#6b7280' },
  backdrop: { position: 'fixed', inset: 0, background: 'rgba(10,14,23,.8)', backdropFilter: 'blur(6px)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 },
  modal: { background: 'linear-gradient(180deg,#1f2937,#111827)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 16, padding: 24, maxWidth: 480, width: '100%', color: '#f3f4f6' },
  label: { display: 'block', marginBottom: 14, fontSize: 13, color: '#9ca3af', fontWeight: 600 },
  textarea: { width: '100%', boxSizing: 'border-box', padding: '10px 12px', background: '#0d1520', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, color: '#f3f4f6', fontFamily: 'inherit', fontSize: 14, resize: 'vertical', minHeight: 72, marginTop: 4 },
};

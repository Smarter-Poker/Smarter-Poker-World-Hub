/**
 * /horses/hg-moderation - Platform-staff Home Games moderation surface
 * 4 tabs: Reports · Appeals · Onboarding lookup · GDPR scrub
 * Admin-gated (admin|superadmin|god).
 *
 * Colour: every value comes from T (src/lib/horsesAdminTokens.js), which is
 * var() strings resolved by horses.module.css on `.tokenScope`. That class is
 * on every root this file can return; a new root without it renders
 * uncoloured. Cyan is THE accent and also means SUCCESS / ACTIVE. No purples,
 * no greens, and no raw hex in this file.
 *
 * 2026-08-26: moderators can no longer act blind. The Review modal now loads
 * the reported content itself (GET /api/horses/hg-reports?id=<uuid>, backed by
 * get_home_content_report_detail) and the destructive actions stay disabled
 * until that content has actually been seen - either rendered, or explicitly
 * reported as no longer existing.
 */
import { useState, useEffect, useCallback, useRef, useId } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { supabase } from '../../src/lib/supabase';
import { getAuthUser, getFreshAccessToken } from '../../src/lib/authUtils';
import { T } from '../../src/lib/horsesAdminTokens';
import styles from './horses.module.css';

const TABS = ['Reports', 'Appeals', 'Onboarding', 'GDPR Scrub'];

const PAGE_SIZE = 50;

const RESOLVE_ACTIONS = [
  { value: 'dismiss', label: 'Dismiss' },
  { value: 'hide_content', label: 'Hide Content' },
  { value: 'delete_content', label: 'Delete Content' },
  { value: 'warn_author', label: 'Warn Author' },
  { value: 'strike_author', label: 'Strike Author' },
  { value: 'ban_author', label: 'Ban Author' },
];

// Inline styles cannot express :focus-visible or a media query, and this page
// is inline-styled throughout. One small stylesheet covers both.
const PAGE_CSS = `
.hgm-root select:focus,
.hgm-root input:focus,
.hgm-root textarea:focus,
.hgm-root button:focus,
.hgm-root summary:focus {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.hgm-root select:focus:not(:focus-visible),
.hgm-root input:focus:not(:focus-visible),
.hgm-root textarea:focus:not(:focus-visible),
.hgm-root button:focus:not(:focus-visible),
.hgm-root summary:focus:not(:focus-visible) {
  outline: none;
}
.hgm-root select:focus-visible,
.hgm-root input:focus-visible,
.hgm-root textarea:focus-visible,
.hgm-root button:focus-visible,
.hgm-root summary:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
@media (max-width: 640px) {
  .hgm-page { padding: 16px 12px 64px !important; }
  .hgm-panel { padding: 14px !important; }
  .hgm-modal { padding: 16px !important; }
}
`;

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

// ── Accessible modal shell ─────────────────────────────────────────────────
// role/aria-modal/accessible name, Escape to close, focus moved to the first
// control on open and returned to the opener on close, Tab kept inside.
const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

function Modal({ title, onClose, children }) {
  const boxRef = useRef(null);
  const closeRef = useRef(onClose);
  const titleId = useId();

  useEffect(() => { closeRef.current = onClose; }, [onClose]);

  useEffect(() => {
    const opener = typeof document !== 'undefined' ? document.activeElement : null;
    const box = boxRef.current;
    const first = box?.querySelector(FOCUSABLE);
    if (first) first.focus();
    else box?.focus();

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current?.();
        return;
      }
      if (e.key !== 'Tab' || !boxRef.current) return;
      const items = Array.from(boxRef.current.querySelectorAll(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement
      );
      if (items.length === 0) return;
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      if (opener && typeof opener.focus === 'function') opener.focus();
    };
  }, []);

  return (
    <div style={S.backdrop} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="hgm-modal"
        style={S.modal}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h3 id={titleId} style={{ margin: '0 0 12px', color: T.text }}>{title}</h3>
        {children}
      </div>
    </div>
  );
}

// ── Pager ──────────────────────────────────────────────────────────────────
/**
 * Previous / Next over an offset the route already accepts, plus the one line
 * that makes a truncated queue distinguishable from a complete one.
 *
 * `total` may be null: hg-appeals did not return one for a while, and a list
 * whose route has not caught up must still be usable. When it is null the
 * range is stated without a denominator rather than an invented one, and Next
 * falls back to the same honest heuristic the flagged-hands table uses - a
 * full page MIGHT have more behind it.
 */
function Pager({ offset, count, total, pageSize, onOffset, busy, noun }) {
  const knowTotal = Number.isFinite(total);
  const first = count === 0 ? 0 : offset + 1;
  const last = offset + count;
  const hasPrev = offset > 0;
  const hasMore = knowTotal ? last < total : count === pageSize;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 16 }}>
      <button
        type="button"
        style={{ ...S.btnGhost, opacity: hasPrev && !busy ? 1 : 0.5, cursor: hasPrev && !busy ? 'pointer' : 'not-allowed' }}
        disabled={!hasPrev || busy}
        onClick={() => onOffset(Math.max(0, offset - pageSize))}
      >
        Previous
      </button>
      <button
        type="button"
        style={{ ...S.btnGhost, opacity: hasMore && !busy ? 1 : 0.5, cursor: hasMore && !busy ? 'pointer' : 'not-allowed' }}
        disabled={!hasMore || busy}
        onClick={() => onOffset(offset + pageSize)}
      >
        Next
      </button>
      <span aria-live="polite" style={{ fontSize: 13, color: T.muted }}>
        {count === 0
          ? `No ${noun} On This Page`
          : knowTotal
            ? `Showing ${first}-${last} Of ${total}`
            : `Showing ${first}-${last} (Total Not Reported By The Route)`}
      </span>
    </div>
  );
}

// ── Key/value rendering ────────────────────────────────────────────────────
/**
 * A definition list instead of JSON.stringify.
 *
 * Onboarding status and the GDPR erase counts were both dumped as raw JSON.
 * That is readable to whoever wrote the RPC and to nobody else, and it is the
 * shape an operator has to read under time pressure on a legal request. The
 * keys become sentence labels, values render as text, and the full payload
 * stays one click away because the labelled view is lossy by design: a nested
 * object is summarised, and the Raw disclosure is where you check it.
 */
function labelize(key) {
  return String(key)
    .replace(/^out_/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

function renderValue(value) {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return value.toLocaleString();
  if (Array.isArray(value)) return value.length === 0 ? 'None' : `${value.length} Entries (See Raw)`;
  if (typeof value === 'object') return `${Object.keys(value).length} Fields (See Raw)`;
  const str = String(value);
  return str === '' ? '-' : str;
}

function KeyValueRows({ data, rawLabel }) {
  const entries = data && typeof data === 'object' && !Array.isArray(data) ? Object.entries(data) : [];
  return (
    <div>
      {entries.length === 0 ? (
        <div style={{ fontSize: 13, color: T.muted }}>The Response Carried No Fields.</div>
      ) : (
        <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'minmax(140px, max-content) 1fr', gap: '6px 16px' }}>
          {entries.map(([k, v]) => (
            <div key={k} style={{ display: 'contents' }}>
              <dt style={{ fontSize: 12, color: T.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {labelize(k)}
              </dt>
              <dd style={{ margin: 0, fontSize: 13, color: T.text, wordBreak: 'break-word' }}>{renderValue(v)}</dd>
            </div>
          ))}
        </dl>
      )}
      <details style={{ marginTop: 12 }}>
        <summary style={{ cursor: 'pointer', fontSize: 12, color: T.muted, minHeight: 44, display: 'flex', alignItems: 'center' }}>
          {rawLabel}
        </summary>
        <pre style={{ margin: '8px 0 0', color: T.text, fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
          {JSON.stringify(data, null, 2)}
        </pre>
      </details>
    </div>
  );
}

// ── Reported content rendering ─────────────────────────────────────────────
// get_home_content_report_detail returns a per-type snapshot. These are the
// human-readable fields for each reported_type it knows about.
function snapshotBody(reportedType, snap) {
  if (!snap) return '';
  switch (reportedType) {
    case 'post':
    case 'comment':
      return snap.content || '';
    case 'review':
      return snap.review_text || '';
    case 'game':
      return [snap.title, snap.description].filter(Boolean).join('\n\n');
    case 'group':
      return [snap.name, snap.description].filter(Boolean).join('\n\n');
    case 'member':
      return [
        snap.role ? `Role: ${snap.role}` : null,
        snap.status ? `Status: ${snap.status}` : null,
        snap.flake_strikes != null ? `Flake strikes: ${snap.flake_strikes}` : null,
        snap.ban_reason ? `Ban reason: ${snap.ban_reason}` : null,
      ].filter(Boolean).join('\n');
    default:
      return '';
  }
}

function snapshotMedia(snap) {
  if (!snap) return [];
  const urls = [];
  if (Array.isArray(snap.image_urls)) urls.push(...snap.image_urls.filter(Boolean));
  if (snap.video_url) urls.push(snap.video_url);
  return urls;
}

/**
 * The whole point of this block: the moderator sees what they are acting on
 * BEFORE the action select is usable. Three terminal states - rendered,
 * "no longer exists", or a load failure. Only the first two release the
 * actions; a failure keeps them locked and offers a retry.
 */
function ReportedContentPanel({ reportedType, loading, error, detail, onRetry }) {
  const snap = detail?.content_snapshot || null;
  const body = snapshotBody(reportedType, snap);
  const media = snapshotMedia(snap);

  return (
    <section style={S.contentBox} aria-live="polite" aria-busy={loading ? 'true' : 'false'}>
      <div style={S.contentHead}>
        Reported Content{reportedType ? ` (${reportedType})` : ''}
      </div>

      {loading && <div style={S.contentDim}>Loading The Reported Content…</div>}

      {!loading && error && (
        <div>
          <div role="alert" style={S.err}>Could Not Load The Reported Content: {error}</div>
          <button type="button" style={S.btnSm} onClick={onRetry}>Retry</button>
          <p style={S.gateNote}>
            Actions Stay Disabled Until The Content Loads. Do Not Resolve A Report You Have Not Read.
          </p>
        </div>
      )}

      {!loading && !error && detail && !snap && (
        <div style={S.contentGone}>
          Content Unavailable - The Reported Item Is No Longer In The Database (Already Deleted,
          Purged, Or Of An Unrecognised Type). There Is Nothing Left To Hide Or Delete.
        </div>
      )}

      {!loading && !error && snap && (
        <div>
          <div style={S.contentMeta}>
            {snap.created_at ? <span>Posted {String(snap.created_at).slice(0, 10)}</span> : null}
            {snap.author_id || snap.reviewer_id || snap.host_id || snap.owner_id || snap.user_id ? (
              <span>
                Author <code style={{ fontSize: 11 }}>
                  {String(snap.author_id || snap.reviewer_id || snap.host_id || snap.owner_id || snap.user_id).slice(0, 8)}
                </code>
              </span>
            ) : null}
            {snap.is_hidden ? <span style={{ color: T.danger, fontWeight: 700 }}>Already Hidden</span> : null}
          </div>

          {body ? (
            <blockquote style={S.contentQuote}>{body}</blockquote>
          ) : (
            <div style={S.contentDim}>This Item Carries No Text Body.</div>
          )}

          {media.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 12, color: T.muted, marginBottom: 4 }}>Attached Media ({media.length})</div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: T.dim, wordBreak: 'break-all' }}>
                {media.map((u, i) => <li key={i}>{u}</li>)}
              </ul>
            </div>
          )}

          <details style={{ marginTop: 10 }}>
            <summary style={{ cursor: 'pointer', fontSize: 12, color: T.muted }}>Raw Content Record</summary>
            <pre style={{ margin: '8px 0 0', fontSize: 11, color: T.dim, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              {JSON.stringify(snap, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </section>
  );
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

  // Reported-content detail, fetched when the Review modal opens.
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailErr, setDetailErr] = useState('');
  const [total, setTotal] = useState(null);
  // The route pages with limit/offset and returns `total`. The queue used to
  // ask for 100 and stop there, so row 101 was unreachable and only a count
  // hinted it existed.
  const [offset, setOffset] = useState(0);
  // Monotonic request token. loadDetail had no sequence guard: open report A
  // (slow), close it or open report B, and A's response still landed, flipping
  // contentSeen true while the panel showed a DIFFERENT report's content. That
  // defeats the one guarantee this modal exists to make -- that a moderator has
  // actually seen what they are acting on before the destructive actions
  // unlock. Every setState below is gated on still being the newest request.
  const detailReq = useRef(0);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setErr('');
    try {
      const d = await apiFetch(
        `/api/horses/hg-reports?status=${status}&limit=${PAGE_SIZE}&offset=${offset}`,
        token
      );
      // Defensive unwrap. The route now returns a real array (it used to pass
      // through the jsonb envelope from list_home_content_reports, which made
      // reports.map throw and white-screened this tab -- the default one -- on
      // every load). Keeping the shape check here means an older cached bundle
      // or a future RPC change degrades to an empty queue instead of a crash.
      setReports(Array.isArray(d.reports) ? d.reports : (d.reports?.reports ?? []));
      setTotal(d.total ?? null);
    } catch (e) { setErr(e.message); }
    setLoading(false);
  }, [token, status, offset]);

  useEffect(() => { load(); }, [load]);

  // A status change is a different queue, so it starts at the top. Without
  // this, switching filters on page 4 lands on page 4 of the new queue, which
  // is usually empty and reads as "no reports".
  const changeStatus = (next) => { setOffset(0); setStatus(next); };

  // GET /api/horses/hg-reports?id=<uuid> responds
  //   { success: true, report: { success, report, content_snapshot } }
  // where the inner object is the raw jsonb from get_home_content_report_detail.
  const loadDetail = useCallback(async (reportId) => {
    if (!token || !reportId) return;
    const mine = ++detailReq.current;
    setDetailLoading(true); setDetailErr(''); setDetail(null);
    try {
      const d = await apiFetch(`/api/horses/hg-reports?id=${encodeURIComponent(reportId)}`, token);
      if (detailReq.current !== mine) return;
      const payload = d.report || null;
      if (!payload) throw new Error('Empty response from the report detail endpoint');
      setDetail(payload);
    } catch (e) {
      if (detailReq.current !== mine) return;
      setDetailErr(e.message || 'Request failed');
    }
    if (detailReq.current !== mine) return;
    setDetailLoading(false);
  }, [token]);

  const openReview = (r) => {
    setResolving(r);
    setAction('dismiss');
    setNote('');
    setModalErr('');
    loadDetail(r.id);
  };

  const closeReview = () => {
    // Invalidate any in-flight detail request so it cannot land after the modal
    // is gone and unlock the gate behind the operator's back.
    detailReq.current += 1;
    setResolving(null);
    setDetail(null);
    setDetailErr('');
    setDetailLoading(false);
  };

  const handleResolve = async () => {
    setSubmitting(true); setModalErr('');
    try {
      await apiFetch('/api/horses/hg-reports', token, {
        method: 'PATCH',
        body: { report_id: resolving.id, action, moderator_note: note },
      });
      setResolving(null); setNote(''); setAction('dismiss');
      setDetail(null); setDetailErr('');
      load();
    } catch (e) { setModalErr(e.message); }
    setSubmitting(false);
  };

  // The moderator has seen the content once it has rendered, or once the
  // endpoint has told us plainly that the content no longer exists.
  const contentSeen = !detailLoading && !detailErr && detail !== null;

  return (
    <div>
      <h2 style={S.srOnly}>Content Reports</h2>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <select
          value={status}
          onChange={e => changeStatus(e.target.value)}
          style={S.select}
          aria-label="Filter reports by status"
        >
          <option value="pending">Pending</option>
          {/* 'resolved' is not a value this column ever holds. The check
              constraint allows pending | hidden_pending_review | reviewed |
              actioned | dismissed, and resolve_home_content_report writes
              'actioned' or 'dismissed'. The old option matched zero rows and
              read as an empty queue. */}
          <option value="actioned">Actioned</option>
          <option value="dismissed">Dismissed</option>
          <option value="hidden_pending_review">Hidden, Pending Review</option>
          <option value="">All</option>
        </select>
        <button onClick={load} style={S.btn}>Refresh</button>
        {/* The whole-queue size, next to the range the pager states. A full
            page and a truncated queue used to look identical. */}
        {total !== null && (
          <span style={{ ...S.dim, padding: 0, fontSize: 13 }}>
            {`${total} ${total === 1 ? 'Report' : 'Reports'} In This Queue`}
          </span>
        )}
      </div>
      {err && <div role="alert" style={S.err}>{err}</div>}
      {loading ? <div style={S.dim}>Loading…</div> : reports.length === 0 ? (
        <div style={S.empty}>No Reports Found.</div>
      ) : (
        <div style={S.tableWrap}>
          <table style={S.table}>
            <caption style={S.srOnly}>Home Games Content Reports, Newest First. The Last Column Opens A Review Dialog.</caption>
            <thead><tr>{['ID','Type','Category','Reporter','Author','Status','Date','Review'].map(h => <th key={h} scope="col" style={S.th}>{h === 'Review' ? <span style={S.srOnly}>Review</span> : h}</th>)}</tr></thead>
            <tbody>
              {reports.map(r => (
                <tr key={r.id}>
                  <td style={S.td}><code style={{ fontSize: 11 }}>{r.id?.slice(0,8)}</code></td>
                  <td style={S.td}>{r.reported_type}</td>
                  <td style={S.td}><span style={{ color: ['illegal','self_harm','doxxing'].includes(r.reason_category) ? T.danger : T.dim, fontWeight: 700 }}>{r.reason_category}</span></td>
                  <td style={S.td}>{r.reporter_name || '-'}</td>
                  <td style={S.td}>{r.content_author_name || '-'}</td>
                  <td style={S.td}>{r.status}</td>
                  <td style={S.td}>{r.created_at?.slice(0,10)}</td>
                  <td style={S.td}>{r.status === 'pending' && <button type="button" style={S.btnSm} onClick={() => openReview(r)}>Review</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pager
        offset={offset}
        count={reports.length}
        total={total}
        pageSize={PAGE_SIZE}
        onOffset={setOffset}
        busy={loading}
        noun="Reports"
      />

      {resolving && (
        <Modal title="Resolve Report" onClose={closeReview}>
          <p style={{ fontSize: 13, color: T.dim, margin: '0 0 4px' }}>Reporter Category: <strong style={{ color: T.danger }}>{resolving.reason_category}</strong></p>
          <p style={{ fontSize: 13, color: T.dim, margin: '0 0 16px' }}>{resolving.reason_text}</p>

          <ReportedContentPanel
            reportedType={resolving.reported_type}
            loading={detailLoading}
            error={detailErr}
            detail={detail}
            onRetry={() => loadDetail(resolving.id)}
          />

          {modalErr && <div role="alert" style={S.err}>{modalErr}</div>}
          <label style={S.label}>Action
            <select
              value={action}
              onChange={e => setAction(e.target.value)}
              disabled={!contentSeen}
              style={{ ...S.select, width: '100%', marginTop: 4, opacity: contentSeen ? 1 : 0.5 }}
            >
              {RESOLVE_ACTIONS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
          </label>
          <label style={S.label}>Moderator Note (Optional)
            <textarea value={note} onChange={e => setNote(e.target.value)} maxLength={2000} rows={3} style={S.textarea} />
          </label>
          {!contentSeen && (
            <p style={S.gateNote}>
              {detailLoading ? 'Waiting for the reported content…' : 'Load the reported content before resolving this report.'}
            </p>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <button type="button" style={S.btnGhost} onClick={closeReview}>Cancel</button>
            <button
              type="button"
              style={{ ...S.btnPrimary, opacity: (submitting || !contentSeen) ? 0.5 : 1 }}
              onClick={handleResolve}
              disabled={submitting || !contentSeen}
            >
              {submitting ? 'Saving…' : 'Submit'}
            </button>
          </div>
        </Modal>
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
  const [offset, setOffset] = useState(0);
  // The list route accepts limit/offset and returns `total` alongside the
  // legacy `appeals` field. `total` is read defensively because this page
  // shipped against a version of the route that did not send one; the pager
  // states an honest range either way rather than inventing a denominator.
  const [total, setTotal] = useState(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setErr('');
    try {
      const d = await apiFetch(
        `/api/horses/hg-appeals?status=${status}&limit=${PAGE_SIZE}&offset=${offset}`,
        token
      );
      setAppeals(d.appeals || d.rows || []);
      setTotal(Number.isFinite(d.total) ? d.total : null);
    } catch (e) { setErr(e.message); }
    setLoading(false);
  }, [token, status, offset]);

  useEffect(() => { load(); }, [load]);

  // A different status is a different queue; start it at the top.
  const changeStatus = (next) => { setOffset(0); setStatus(next); };

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
      <h2 style={S.srOnly}>Ban Appeals</h2>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <select
          value={status}
          onChange={e => changeStatus(e.target.value)}
          style={S.select}
          aria-label="Filter appeals by status"
        >
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="denied">Denied</option>
          <option value="">All</option>
        </select>
        <button onClick={load} style={S.btn}>Refresh</button>
        {total !== null && (
          <span style={{ ...S.dim, padding: 0, fontSize: 13 }}>
            {`${total} ${total === 1 ? 'Appeal' : 'Appeals'} In This Queue`}
          </span>
        )}
      </div>
      {err && <div role="alert" style={S.err}>{err}</div>}
      {loading ? <div style={S.dim}>Loading…</div> : appeals.length === 0 ? (
        <div style={S.empty}>No Appeals Found.</div>
      ) : (
        <div style={S.tableWrap}>
          <table style={S.table}>
            <caption style={S.srOnly}>Home Games Ban Appeals. The Last Column Opens A Review Dialog.</caption>
            <thead><tr>{['Appeal ID','Group','User','Ban Reason','Days Pending','Status','Review'].map(h => <th key={h} scope="col" style={S.th}>{h === 'Review' ? <span style={S.srOnly}>Review</span> : h}</th>)}</tr></thead>
            <tbody>
              {appeals.map(a => (
                <tr key={a.out_appeal_id}>
                  <td style={S.td}><code style={{ fontSize: 11 }}>{a.out_appeal_id?.slice(0,8)}</code></td>
                  <td style={S.td}>{a.out_group_name}</td>
                  <td style={S.td}>{a.out_user_display}</td>
                  <td style={S.td}>{a.out_ban_reason}</td>
                  <td style={S.td}>{a.out_days_pending}</td>
                  <td style={S.td}>{a.out_status}</td>
                  <td style={S.td}>{a.out_status === 'pending' && <button type="button" style={S.btnSm} onClick={() => { setReviewing(a); setDecision('approved'); setNote(''); setModalErr(''); }}>Review</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pager
        offset={offset}
        count={appeals.length}
        total={total}
        pageSize={PAGE_SIZE}
        onOffset={setOffset}
        busy={loading}
        noun="Appeals"
      />

      {reviewing && (
        <Modal title="Review Ban Appeal" onClose={() => setReviewing(null)}>
          <p style={{ fontSize: 13, color: T.dim, margin: '0 0 4px' }}>User: <strong style={{ color: T.text }}>{reviewing.out_user_display}</strong></p>
          <p style={{ fontSize: 13, color: T.dim, margin: '0 0 4px' }}>Appeal: {reviewing.out_appeal_text}</p>
          {modalErr && <div role="alert" style={S.err}>{modalErr}</div>}
          <label style={S.label}>Decision
            <select value={decision} onChange={e => setDecision(e.target.value)} style={{ ...S.select, width: '100%', marginTop: 4 }}>
              <option value="approved">Approve (Unban)</option>
              <option value="denied">Deny</option>
            </select>
          </label>
          <label style={S.label}>Note (Optional)
            <textarea value={note} onChange={e => setNote(e.target.value)} maxLength={2000} rows={3} style={S.textarea} />
          </label>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <button type="button" style={S.btnGhost} onClick={() => setReviewing(null)}>Cancel</button>
            <button type="button" style={S.btnPrimary} onClick={handleReview} disabled={submitting}>{submitting ? 'Saving…' : 'Submit'}</button>
          </div>
        </Modal>
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
      <h2 style={S.srOnly}>Onboarding Lookup</h2>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          value={userId}
          onChange={e => setUserId(e.target.value)}
          placeholder="User UUID"
          aria-label="User UUID to look up"
          style={{ ...S.select, flex: 1, minWidth: 180 }}
        />
        <button onClick={lookup} style={S.btn} disabled={loading}>{loading ? '…' : 'Look Up'}</button>
      </div>
      {err && <div role="alert" style={S.err}>{err}</div>}
      {result && (
        <div style={{ background: T.inset, border: `1px solid ${T.line}`, borderRadius: 10, padding: 16, overflowX: 'auto' }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: T.accent, marginBottom: 10 }}>
            Onboarding Status
          </div>
          <KeyValueRows data={result} rawLabel="Raw Onboarding Payload" />
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
    // Deliberate destructive-action guard - this one stays a native confirm.
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
      <h2 style={S.srOnly}>GDPR Scrub</h2>
      <div style={{ background: T.dangerWash, border: `1px solid ${T.dangerLine}`, borderRadius: 8, padding: 12, marginBottom: 20, fontSize: 13, color: T.danger }}>
        WARNING - GDPR Erasure Is Irreversible. Anonymizes All Home Games Posts, Messages, And Profile Data For The Target User. Use Only On Verified DPO/Legal Request.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 500 }}>
        <label style={S.label}>Target User UUID
          <input
            value={userId}
            onChange={e => setUserId(e.target.value)}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            aria-label="Target user UUID for GDPR erasure"
            style={{ ...S.select, width: '100%', boxSizing: 'border-box', marginTop: 4 }}
          />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: T.dim, fontSize: 13, cursor: 'pointer', minHeight: 44 }}>
          <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} style={{ accentColor: T.accent, width: 20, height: 20 }} />
          I Confirm This Action Is Authorized And Irreversible
        </label>
        <button onClick={handleErase} disabled={loading || !userId || !confirmed} style={{ ...S.btnPrimary, background: T.danger, color: T.text, maxWidth: 200 }}>
          {loading ? 'Erasing…' : 'Erase User Content'}
        </button>
      </div>
      {err && <div style={{ ...S.err, marginTop: 16, marginBottom: 0 }}>{err}</div>}
      {result && (
        <div style={{ marginTop: 16, background: T.accentSoft, border: `1px solid ${T.accentLine}`, borderRadius: 8, padding: 12, overflowX: 'auto' }}>
          <div style={{ color: T.accent, fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Erasure Complete</div>
          {/* One labelled row per table touched. This is the receipt for a
              legal request, so the counts have to be readable without
              anyone parsing JSON; Raw stays for the record itself. */}
          <KeyValueRows data={result} rawLabel="Raw Erasure Counts" />
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
  // A failed role lookup is not a denial. Kept separate so the page can say
  // which of the two happened.
  const [authFailure, setAuthFailure] = useState('');

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
        const { data: profile, error: roleErr } = await supabase
          .from('profiles').select('role').eq('id', user.id).maybeSingle();
        if (!active) return;
        // `error` used to be discarded here. An RLS regression or a dropped
        // connection yielded profile === null, which is indistinguishable from
        // "not an admin" -- so a genuine superadmin was shown a hard 403 with
        // no retry and no hint that anything had gone wrong. Say which it is.
        if (roleErr) {
          setAuthFailure(roleErr.message || 'Role lookup failed');
          setAuthChecked(true); setAuthed(false); return;
        }
        if (!profile || !['admin', 'superadmin', 'god'].includes(profile.role)) {
          setAuthChecked(true); setAuthed(false); return;
        }
        setAuthed(true); setAuthChecked(true);
      } catch (e) {
        if (active) {
          setAuthFailure(e?.message || 'Role lookup failed');
          setAuthChecked(true); setAuthed(false);
        }
      }
    })();
    return () => { active = false; };
  }, [token, ready, router]);

  if (!authChecked) return <div className={styles.tokenScope} style={{ minHeight: '100vh', background: T.page, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.dim }}>Verifying Access…</div>;
  if (!authed && authFailure) return (
    <div className={styles.tokenScope} style={{ minHeight: '100vh', background: T.page, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24, textAlign: 'center' }}>
      <div role="alert" style={{ color: T.danger, fontSize: 18, fontWeight: 700 }}>Could Not Verify Your Role</div>
      <div style={{ color: T.dim, fontSize: 14, maxWidth: 480 }}>
        {authFailure}. This Is A Failed Check, Not A Refusal - Your Access Has Not Changed.
      </div>
      <button onClick={() => router.reload()} style={{ background: T.accent, color: T.page, border: 'none',
        padding: '10px 20px', borderRadius: 6, cursor: 'pointer', fontWeight: 700, minHeight: 44 }}>Retry</button>
    </div>
  );
  if (!authed) return <div className={styles.tokenScope} style={{ minHeight: '100vh', background: T.page, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.danger, fontSize: 18 }}>403 - Admin Access Required</div>;

  return (
    <>
      <Head>
        <title>HG Moderation | Horses</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <style>{PAGE_CSS}</style>
      <div className={`hgm-root hgm-page ${styles.tokenScope}`} style={{ minHeight: '100vh', background: T.page, color: T.text, fontFamily: 'Inter,-apple-system,sans-serif', padding: '24px 20px 80px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
            <button onClick={() => router.push('/horses')} style={S.backBtn}>&larr; Back To Horses</button>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 4px', color: T.text }}>Home Games Moderation</h1>
          <p style={{ fontSize: 13, color: T.muted, margin: '0 0 24px' }}>Platform-Staff Surface - All Escalation Categories, Cross-Group Actions, GDPR Tools</p>

          {/* Tab bar */}
          <div role="tablist" aria-label="Moderation sections" style={{ display: 'flex', gap: 2, marginBottom: 24, background: T.surfaceTint, borderRadius: 10, padding: 4, width: 'fit-content', maxWidth: '100%', flexWrap: 'wrap' }}>
            {TABS.map((t, i) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === i}
                onClick={() => setTab(i)}
                style={{ padding: '8px 18px', minHeight: 44, borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, transition: 'all .15s', background: tab === i ? T.accentSoft : 'transparent', color: tab === i ? T.accent : T.dim }}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="hgm-panel" style={{ background: T.panelSheer, border: `1px solid ${T.line}`, borderRadius: 14, padding: 20 }}>
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
// Palette: T.page / T.panel / T.elevated / T.inset for surfaces, T.accent
// (which is also SUCCESS), T.danger, and T.text / T.dim / T.muted for copy.
// The hex behind each of those lives in horses.module.css and only there.
// Focus rings live in PAGE_CSS (inline styles cannot express :focus-visible).
const S = {
  select: { background: T.inset, border: `1px solid ${T.lineStrong}`, borderRadius: 8, color: T.text, padding: '8px 12px', fontSize: 13, minHeight: 44 },
  btn: { padding: '8px 16px', minHeight: 44, background: T.accentSoft, border: `1px solid ${T.accentLine}`, borderRadius: 8, color: T.accent, fontSize: 13, fontWeight: 700, cursor: 'pointer' },
  btnSm: { padding: '4px 12px', minHeight: 44, background: T.accentSoft, border: `1px solid ${T.accentLine}`, borderRadius: 6, color: T.accent, fontSize: 12, fontWeight: 700, cursor: 'pointer' },
  btnPrimary: { padding: '10px 20px', minHeight: 44, background: T.accent, border: 'none', borderRadius: 8, color: T.page, fontSize: 13, fontWeight: 700, cursor: 'pointer' },
  btnGhost: { padding: '10px 20px', minHeight: 44, background: 'transparent', border: `1px solid ${T.lineStrong}`, borderRadius: 8, color: T.dim, fontSize: 13, fontWeight: 700, cursor: 'pointer' },
  backBtn: { padding: '6px 14px', minHeight: 44, background: 'transparent', border: `1px solid ${T.lineStrong}`, borderRadius: 8, color: T.dim, fontSize: 12, fontWeight: 700, cursor: 'pointer' },
  tableWrap: { overflowX: 'auto', WebkitOverflowScrolling: 'touch' },
  table: { width: '100%', minWidth: 760, borderCollapse: 'collapse', fontSize: 13 },
  th: { textAlign: 'left', padding: '10px 12px', color: T.muted, fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, borderBottom: `1px solid ${T.line}`, whiteSpace: 'nowrap' },
  td: { padding: '10px 12px', borderBottom: `1px solid ${T.line}`, color: T.text, verticalAlign: 'middle' },
  err: { background: T.dangerWash, border: `1px solid ${T.dangerLine}`, borderRadius: 8, padding: '10px 14px', color: T.danger, fontSize: 13, marginBottom: 12 },
  empty: { textAlign: 'center', padding: 40, color: T.muted, fontSize: 14 },
  dim: { textAlign: 'center', padding: 40, color: T.muted },
  backdrop: { position: 'fixed', inset: 0, background: T.pageOverlay, backdropFilter: 'blur(6px)', zIndex: 200, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 20, overflowY: 'auto' },
  modal: { background: `linear-gradient(180deg, ${T.elevated}, ${T.panel})`, border: `1px solid ${T.lineStrong}`, borderRadius: 16, padding: 24, maxWidth: 480, width: '100%', color: T.text, maxHeight: 'calc(100vh - 40px)', overflowY: 'auto' },
  label: { display: 'block', marginBottom: 14, fontSize: 13, color: T.dim, fontWeight: 600 },
  textarea: { width: '100%', boxSizing: 'border-box', padding: '10px 12px', background: T.inset, border: `1px solid ${T.lineStrong}`, borderRadius: 8, color: T.text, fontFamily: 'inherit', fontSize: 14, resize: 'vertical', minHeight: 72, marginTop: 4 },
  srOnly: { position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 },
  // Reported-content block
  contentBox: { background: T.inset, border: `1px solid ${T.accentLine}`, borderRadius: 10, padding: 14, margin: '0 0 16px' },
  contentHead: { fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: T.accent, marginBottom: 8 },
  contentDim: { fontSize: 13, color: T.muted },
  contentGone: { fontSize: 13, color: T.muted, lineHeight: 1.5 },
  contentMeta: { display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 11, color: T.muted, marginBottom: 8 },
  contentQuote: { margin: 0, padding: '8px 12px', borderLeft: `3px solid ${T.accentLine}`, background: T.surfaceTint, borderRadius: 4, color: T.text, fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 260, overflowY: 'auto' },
  gateNote: { fontSize: 12, color: T.muted, margin: '0 0 12px' },
};

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { getAccessToken, getAuthUser } from '../../lib/authUtils';
import { createLatestRequestGuard } from '../../lib/latestRequestGuard.mjs';
import { createReelAccountScope } from '../../lib/reelAccountScope.mjs';
import { supabase } from '../../lib/supabase';
import VideoLibraryConsole, {
  ConsoleCopy,
  ConsoleDataRow,
} from '../video-library/console/VideoLibraryConsole';
import styles from './VideoCreatorRightsConsole.module.css';

const CREATOR_ENDPOINT = '/api/video-rights/portal';
const ADMIN_ENDPOINT = '/api/video-rights/moderation';
const CREATOR_TABS = Object.freeze([
  ['sources', 'Sources'],
  ['submissions', 'Submissions'],
  ['attribution', 'Attribution'],
  ['clip_reviews', 'Clip Reviews'],
  ['cases', 'Cases'],
]);
const ADMIN_TABS = Object.freeze([
  ['claims', 'Source Claims'],
  ['submissions', 'Master Submissions'],
  ['attribution', 'Attribution Updates'],
  ['clips', 'Clip Reviews'],
  ['reports', 'Reports'],
  ['takedowns', 'Takedowns'],
]);

function clean(value) {
  return typeof value === 'string' ? value.trim() : value;
}

function list(snapshot, ...keys) {
  for (const key of keys) if (Array.isArray(snapshot?.[key])) return snapshot[key];
  return [];
}

function rowId(row) {
  return row?.id || row?.claim_id || row?.submission_id || row?.candidate_id || row?.case_id;
}

function statusOf(row) {
  return String(row?.status || row?.review_status || row?.lifecycle_status || 'pending')
    .replaceAll('_', ' ');
}

function titleOf(row) {
  return row?.title || row?.source_name || row?.channel_name || row?.video_title
    || row?.display_name || row?.provider_source_id || 'Rights Record';
}

function formatDate(value) {
  if (!value) return 'Not Recorded';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'Not Recorded' : parsed.toLocaleDateString();
}

function StatusPill({ status }) {
  const normalized = String(status || 'pending').toLowerCase().replaceAll(' ', '_');
  return <span className={styles.status} data-status={normalized}>{String(status || 'Pending')}</span>;
}

function EmptyState({ children }) {
  return <div className={styles.empty} role="status"><span className={styles.emptySignal} aria-hidden="true" /><p>{children}</p></div>;
}

function RecordCard({ row, children }) {
  return (
    <article className={styles.record}>
      <div className={styles.recordCap} aria-hidden="true"><span /><span /><span /></div>
      <div className={styles.recordHeading}>
        <div><small>{row?.record_type || row?.provider || 'Rights Ledger'}</small><h3>{titleOf(row)}</h3></div>
        <StatusPill status={statusOf(row)} />
      </div>
      <div className={styles.readout}>
        <ConsoleDataRow label="Reference" value={rowId(row) || 'Pending'} valueInk="blue" />
        <ConsoleDataRow label="Updated" value={formatDate(row?.updated_at || row?.created_at)} />
      </div>
      {row?.attribution_name || row?.attribution_url ? (
        <p className={styles.detail}>{row.attribution_name || row.attribution_url}</p>
      ) : null}
      {row?.reason || row?.decision_reason || row?.last_failure_code ? (
        <p className={styles.detail}>{row.reason || row.decision_reason || row.last_failure_code}</p>
      ) : null}
      {children}
    </article>
  );
}

function ActionButton({ danger = false, children, ...props }) {
  return <button type="button" className={danger ? styles.dangerAction : styles.action} {...props}>{children}</button>;
}

function Field({ label, children, wide = false }) {
  return <label className={wide ? styles.wideField : styles.field}><span>{label}</span>{children}</label>;
}

function CreatorSources({ rows, mutate, busy }) {
  const [draft, setDraft] = useState({ content_source_id: '', provider_channel_id: '', evidence_kind: 'provider_verification', evidence_reference: '' });
  const submit = event => {
    event.preventDefault();
    mutate('submit_claim', draft).then(ok => {
      if (ok) setDraft({ content_source_id: '', provider_channel_id: '', evidence_kind: 'provider_verification', evidence_reference: '' });
    });
  };
  return <>
    <form className={styles.formBay} onSubmit={submit}>
      <div className={styles.sectionHeading}><span>01</span><div><h2>Claim A Source</h2><p>Connect the exact channel you control. Every claim remains pending until its proof is reviewed.</p></div></div>
      <div className={styles.fieldGrid}>
        <Field label="Registered Source ID"><input required value={draft.content_source_id} onChange={event => setDraft(current => ({ ...current, content_source_id: event.target.value }))} /></Field>
        <Field label="Provider Channel ID"><input required value={draft.provider_channel_id} onChange={event => setDraft(current => ({ ...current, provider_channel_id: event.target.value }))} /></Field>
        <Field label="Evidence Type"><select value={draft.evidence_kind} onChange={event => setDraft(current => ({ ...current, evidence_kind: event.target.value }))}><option value="provider_verification">Provider Verification</option><option value="ownership_document">Ownership Document</option><option value="creator_authorization">Creator Authorization</option></select></Field>
        <Field label="Evidence Reference"><input required value={draft.evidence_reference} onChange={event => setDraft(current => ({ ...current, evidence_reference: event.target.value }))} /></Field>
      </div>
      <ActionButton disabled={busy}>Submit Source Claim</ActionButton>
    </form>
    <RecordList rows={rows} empty="No source claims yet. Submit a channel above to begin verification." />
  </>;
}

function CreatorSubmissions({ rows, mutate, busy }) {
  const [draft, setDraft] = useState({ source_claim_id: '', video_id: '', youtube_video_id: '', upload_ticket_id: '', title: '', attribution_name: '', attribution_url: '', disclosure_kind: 'organic', sponsor_name: '', rights_status: 'embed_only', permitted_uses: 'embed_display', territories: 'worldwide', valid_until: '' });
  const [uploadState, setUploadState] = useState('');
  const reserveAndUpload = async event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!draft.source_claim_id || !draft.video_id) {
      setUploadState('Enter an approved source claim and library video before choosing a source master.');
      return;
    }
    setUploadState('Reserving encrypted source-master upload...');
    const reservation = await mutate('reserve_upload', { source_claim_id: draft.source_claim_id, video_id: draft.video_id, mime_type: file.type, byte_size: file.size }, { refresh: false, returnBody: true });
    if (!reservation?.signedUrl || !reservation?.uploadTicketId) { setUploadState('Upload reservation failed. Retry with the same file.'); return; }
    try {
      setUploadState('Uploading source master...');
      const response = await fetch(reservation.signedUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
      if (!response.ok) throw new Error('upload failed');
      setDraft(current => ({ ...current, upload_ticket_id: reservation.uploadTicketId, youtube_video_id: '', rights_status: current.rights_status === 'embed_only' ? 'owned' : current.rights_status, permitted_uses: current.permitted_uses.includes('native_clip') ? current.permitted_uses : `${current.permitted_uses},native_clip` }));
      setUploadState('Source master uploaded. Submit the rights record below to place it in review.');
    } catch {
      setUploadState('Source master upload was interrupted. Choose the file again to resume with a new reservation.');
    }
  };
  const submit = async event => {
    event.preventDefault();
    if (busy) return;
      const ok = await mutate('submit_submission', {
        ...draft,
        source_claim_id: draft.source_claim_id || null,
        video_id: draft.video_id || null,
        youtube_video_id: draft.youtube_video_id || null,
        upload_ticket_id: draft.upload_ticket_id || null,
        sponsor_name: draft.sponsor_name || null,
        permitted_uses: draft.permitted_uses.split(',').map(clean).filter(Boolean),
        territories: draft.territories.split(',').map(clean).filter(Boolean),
        valid_until: draft.valid_until || null,
      });
      if (ok) {
        setDraft({ source_claim_id: '', video_id: '', youtube_video_id: '', upload_ticket_id: '', title: '', attribution_name: '', attribution_url: '', disclosure_kind: 'organic', sponsor_name: '', rights_status: 'embed_only', permitted_uses: 'embed_display', territories: 'worldwide', valid_until: '' });
      }
  };
  return <>
    <form className={styles.formBay} onSubmit={submit}>
      <div className={styles.sectionHeading}><span>02</span><div><h2>Submit Creator Media</h2><p>Submit one exact YouTube identity or one reserved source-master upload ticket for review.</p></div></div>
      <div className={styles.fieldGrid}>
        <Field label="Approved Source Claim ID"><input value={draft.source_claim_id} onChange={event => setDraft(current => ({ ...current, source_claim_id: event.target.value }))} /></Field>
        <Field label="Library Video ID"><input value={draft.video_id} onChange={event => setDraft(current => ({ ...current, video_id: event.target.value }))} /></Field>
        <Field label="YouTube Video ID"><input value={draft.youtube_video_id} onChange={event => setDraft(current => ({ ...current, youtube_video_id: event.target.value }))} /></Field>
        <Field label="Source Master Upload Ticket"><input value={draft.upload_ticket_id} onChange={event => setDraft(current => ({ ...current, upload_ticket_id: event.target.value }))} /></Field>
        <Field label="Source Master File"><input type="file" accept="video/mp4,video/quicktime,video/webm" disabled={busy} onChange={reserveAndUpload} /></Field>
        <Field label="Title" wide><input required minLength={3} value={draft.title} onChange={event => setDraft(current => ({ ...current, title: event.target.value }))} /></Field>
        <Field label="Creator Attribution"><input required value={draft.attribution_name} onChange={event => setDraft(current => ({ ...current, attribution_name: event.target.value }))} /></Field>
        <Field label="Attribution URL"><input required type="url" value={draft.attribution_url} onChange={event => setDraft(current => ({ ...current, attribution_url: event.target.value }))} /></Field>
        <Field label="Disclosure"><select value={draft.disclosure_kind} onChange={event => setDraft(current => ({ ...current, disclosure_kind: event.target.value }))}><option value="organic">Organic</option><option value="sponsored">Sponsored</option><option value="promotional">Promotional</option><option value="generated">Generated</option><option value="community">Community Submitted</option></select></Field>
        <Field label="Sponsor Name"><input value={draft.sponsor_name} onChange={event => setDraft(current => ({ ...current, sponsor_name: event.target.value }))} /></Field>
        <Field label="Rights Basis"><select value={draft.rights_status} onChange={event => setDraft(current => ({ ...current, rights_status: event.target.value }))}><option value="embed_only">Embed Only</option><option value="owned">Owned</option><option value="licensed">Licensed</option><option value="user_authorized">User Authorized</option></select></Field>
        <Field label="Permitted Uses"><input required value={draft.permitted_uses} onChange={event => setDraft(current => ({ ...current, permitted_uses: event.target.value }))} /></Field>
        <Field label="Territories"><input required value={draft.territories} onChange={event => setDraft(current => ({ ...current, territories: event.target.value }))} /></Field>
        <Field label="Rights Expire"><input type="date" value={draft.valid_until} onChange={event => setDraft(current => ({ ...current, valid_until: event.target.value }))} /></Field>
      </div>
      {uploadState ? <p className={styles.detail} role="status">{uploadState}</p> : null}
      <ActionButton disabled={busy}>Submit Media For Review</ActionButton>
    </form>
    <RecordList rows={rows} empty="No source master submissions are attached to this account." />
  </>;
}

function CreatorAttribution({ rows, mutate, busy }) {
  const [drafts, setDrafts] = useState({});
  if (!rows.length) return <EmptyState>No verified creator sources are ready for attribution controls.</EmptyState>;
  return <div className={styles.records}>{rows.map(row => {
    const id = rowId(row);
    const draft = drafts[id] || { attribution_name: row.attribution_name || '', attribution_url: row.attribution_url || '' };
    return <RecordCard key={id} row={row}>
      <div className={styles.fieldGrid}>
        <Field label="Creator Name"><input value={draft.attribution_name} onChange={event => setDrafts(current => ({ ...current, [id]: { ...draft, attribution_name: event.target.value } }))} /></Field>
        <Field label="Creator URL"><input type="url" value={draft.attribution_url} onChange={event => setDrafts(current => ({ ...current, [id]: { ...draft, attribution_url: event.target.value } }))} /></Field>
      </div>
      <ActionButton disabled={busy} onClick={() => mutate('request_attribution_update', { attribution_record_id: id, ...draft })}>Request Attribution Update</ActionButton>
    </RecordCard>;
  })}</div>;
}

function CreatorClipReviews({ rows, mutate, busy }) {
  if (!rows.length) return <EmptyState>No clips are waiting for your review.</EmptyState>;
  return <div className={styles.records}>{rows.map(row => <RecordCard key={rowId(row)} row={row}>
    {row.preview_url || row.embed_url ? <div className={styles.preview}><iframe src={row.preview_url || row.embed_url} title={`Clip Review: ${titleOf(row)}`} loading="lazy" allow="encrypted-media; picture-in-picture" referrerPolicy="strict-origin-when-cross-origin" /></div> : null}
    <ConsoleDataRow label="Clip Window" value={`${row.clip_start_seconds ?? '--'}s To ${row.clip_end_seconds ?? '--'}s`} />
    {row.creator_review ? <ConsoleDataRow label="Creator Decision" value={row.creator_review.decision} valueInk={row.creator_review.decision === 'approved' ? 'green' : 'red'} /> : <div className={styles.actions}>
      <ActionButton disabled={busy} onClick={() => mutate('review_clip', { candidate_id: rowId(row), version: row.version, decision: 'approved' })}>Approve Clip</ActionButton>
      <ActionButton danger disabled={busy} onClick={() => mutate('review_clip', { candidate_id: rowId(row), version: row.version, decision: 'rejected', reason: 'Creator rejected this proposed clip.' })}>Reject Clip</ActionButton>
    </div>}
  </RecordCard>)}</div>;
}

function CreatorCases({ rows, mutate, busy }) {
  const [draft, setDraft] = useState({ target_id: '', reason: 'rights_revoked', details: '' });
  const submit = event => {
    event.preventDefault();
    mutate('request_takedown', draft).then(ok => { if (ok) setDraft({ target_id: '', reason: 'rights_revoked', details: '' }); });
  };
  return <>
    <form className={styles.formBay} onSubmit={submit}>
      <div className={styles.sectionHeading}><span>05</span><div><h2>Open A Rights Case</h2><p>Request an attribution correction, rights revocation, or complete takedown. Public delivery is removed by the moderation decision, not by this browser.</p></div></div>
      <div className={styles.fieldGrid}>
        <Field label="Reel, Video, Or Source ID"><input required value={draft.target_id} onChange={event => setDraft(current => ({ ...current, target_id: event.target.value }))} /></Field>
        <Field label="Case Type"><select value={draft.reason} onChange={event => setDraft(current => ({ ...current, reason: event.target.value }))}><option value="rights_revoked">Rights Revoked</option><option value="copyright">Copyright Or Rights</option><option value="incorrect_attribution">Incorrect Attribution</option><option value="unlabeled_sponsored">Sponsored Media Not Labeled</option><option value="unlabeled_generated">Generated Media Not Labeled</option></select></Field>
        <Field label="Case Details" wide><textarea required minLength={10} value={draft.details} onChange={event => setDraft(current => ({ ...current, details: event.target.value }))} /></Field>
      </div>
      <ActionButton danger disabled={busy}>Submit Rights Case</ActionButton>
    </form>
    <RecordList rows={rows} empty="No open or historical rights cases for this account." />
  </>;
}

function RecordList({ rows, empty }) {
  if (!rows.length) return <EmptyState>{empty}</EmptyState>;
  return <div className={styles.records}>{rows.map(row => <RecordCard key={rowId(row)} row={row} />)}</div>;
}

function CreatorPanel({ tab, snapshot, mutate, busy }) {
  if (tab === 'sources') return <CreatorSources rows={list(snapshot, 'claims', 'sources')} mutate={mutate} busy={busy} />;
  if (tab === 'submissions') return <CreatorSubmissions rows={list(snapshot, 'submissions', 'masters')} mutate={mutate} busy={busy} />;
  if (tab === 'attribution') return <CreatorAttribution rows={list(snapshot, 'attributions', 'sources')} mutate={mutate} busy={busy} />;
  if (tab === 'clip_reviews') return <CreatorClipReviews rows={list(snapshot, 'clip_reviews', 'clips', 'candidates')} mutate={mutate} busy={busy} />;
  return <CreatorCases rows={list(snapshot, 'cases', 'takedowns')} mutate={mutate} busy={busy} />;
}

function AdminPanel({ tab, snapshot, mutate, busy }) {
  const rows = tab === 'claims' ? list(snapshot, 'claims')
    : tab === 'submissions' ? list(snapshot, 'submissions', 'masters')
      : tab === 'attribution' ? list(snapshot, 'attribution_requests')
        : tab === 'clips' ? list(snapshot, 'clip_reviews', 'clips')
        : tab === 'reports' ? list(snapshot, 'reports') : list(snapshot, 'takedowns', 'cases');
  if (!rows.length) return <EmptyState>No {tab.replaceAll('_', ' ')} require review.</EmptyState>;
  return <div className={styles.records}>{rows.map(row => <AdminReviewCard key={rowId(row)} row={row} tab={tab} mutate={mutate} busy={busy} />)}</div>;
}

function AdminReviewCard({ row, tab, mutate, busy }) {
  const [reason, setReason] = useState('');
  const reviewAction = tab === 'claims' ? 'review_claim'
    : tab === 'submissions' ? 'review_submission'
      : tab === 'attribution' ? 'review_attribution'
        : tab === 'clips' ? 'review_clip' : 'resolve_report';
  const payload = decision => ({ id: rowId(row), version: row.version, decision, reason: clean(reason) });
  return <RecordCard row={row}>
    <div className={styles.auditGrid}>
      <ConsoleDataRow label="Creator" value={row.creator_name || row.claimant_name || row.user_id || 'Account Bound'} />
      <ConsoleDataRow label="Risk" value={row.priority || row.risk || 'Standard'} valueInk={row.priority === 'urgent' ? 'red' : 'gold'} />
      <ConsoleDataRow label="Evidence" value={row.evidence_kind || row.report_reason || row.reason || 'Review Required'} />
    </div>
    <Field label="Decision Reason" wide><textarea required minLength={10} value={reason} onChange={event => setReason(event.target.value)} placeholder="Record the evidence behind this decision" /></Field>
    <div className={styles.actions}>
      <ActionButton disabled={busy || clean(reason).length < 10} onClick={() => mutate(reviewAction, payload('approved'))}>Approve</ActionButton>
      <ActionButton danger disabled={busy || clean(reason).length < 10} onClick={() => mutate(reviewAction, payload('rejected'))}>Reject</ActionButton>
      {tab === 'reports' || tab === 'takedowns' ? <ActionButton danger disabled={busy || clean(reason).length < 10} onClick={() => mutate('apply_takedown', { ...payload('applied') })}>Take Down Everywhere</ActionButton> : null}
    </div>
  </RecordCard>;
}

export default function VideoCreatorRightsConsole({ mode = 'creator' }) {
  const admin = mode === 'admin';
  const tabs = admin ? ADMIN_TABS : CREATOR_TABS;
  const endpoint = admin ? ADMIN_ENDPOINT : CREATOR_ENDPOINT;
  const [tab, setTab] = useState(tabs[0][0]);
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState('');
  const requestGuardRef = useRef(null);
  const accountScopeRef = useRef(null);
  const userRef = useRef(null);
  const mutationRef = useRef(false);
  if (!requestGuardRef.current) requestGuardRef.current = createLatestRequestGuard();
  if (!accountScopeRef.current) accountScopeRef.current = createReelAccountScope();

  const bindUser = useCallback(nextUser => {
    const next = nextUser?.id ? nextUser : null;
    const binding = accountScopeRef.current.bind(next?.id);
    userRef.current = next;
    if (binding.changed) {
      requestGuardRef.current.abort();
      setSnapshot(null);
      setError('');
    }
    setUser(next);
  }, []);

  const load = useCallback(async () => {
    const owner = accountScopeRef.current.capture(userRef.current?.id);
    const request = requestGuardRef.current.begin();
    if (!request) return;
    setLoading(true);
    setError('');
    try {
      if (!owner.ownerId) throw Object.assign(new Error('Sign in to open this rights console.'), { status: 401 });
      const token = getAccessToken();
      if (!token) throw Object.assign(new Error('Your session must be refreshed.'), { status: 401 });
      const response = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: request.signal });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw Object.assign(new Error(body.error || 'The rights console could not be loaded.'), { status: response.status });
      if (!request.isCurrent() || !owner.isCurrent()) return;
      if ((body.ownerId || body.owner_id) && (body.ownerId || body.owner_id) !== owner.ownerId) throw new Error('Rights response owner mismatch.');
      setSnapshot(body);
    } catch (loadError) {
      if (loadError?.name === 'AbortError' || !request.isCurrent() || !owner.isCurrent()) return;
      setError(loadError?.message || 'The rights console could not be loaded.');
      setSnapshot(null);
    } finally {
      if (request.isCurrent() && owner.isCurrent()) setLoading(false);
      request.finish();
    }
  }, [endpoint]);

  const mutate = useCallback(async (action, values = {}, options = {}) => {
    if (mutationRef.current) return null;
    const owner = accountScopeRef.current.capture(userRef.current?.id);
    if (!owner.ownerId || !owner.isCurrent()) return null;
    mutationRef.current = true;
    setMutating(true);
    setError('');
    try {
      const token = getAccessToken();
      if (!token) throw new Error('Your session must be refreshed.');
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, operationId: crypto.randomUUID(), ownerId: owner.ownerId, ...values }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'The rights operation did not complete.');
      if (!owner.isCurrent()) return null;
      if (options.refresh !== false) await load();
      return options.returnBody ? body : true;
    } catch (mutationError) {
      if (owner.isCurrent()) setError(mutationError?.message || 'The rights operation did not complete.');
      return null;
    } finally {
      mutationRef.current = false;
      if (owner.isCurrent()) setMutating(false);
    }
  }, [endpoint, load]);

  useEffect(() => {
    bindUser(getAuthUser());
    setAuthReady(true);
    const auth = supabase.auth.onAuthStateChange((event, session) => bindUser(event === 'SIGNED_OUT' ? null : session?.user || getAuthUser()));
    const storage = event => {
      if (event.key === 'smarter-poker-auth' || (event.key?.startsWith('sb-') && event.key?.endsWith('-auth-token'))) bindUser(getAuthUser());
    };
    window.addEventListener('storage', storage);
    return () => {
      requestGuardRef.current.abort();
      auth.data.subscription?.unsubscribe();
      window.removeEventListener('storage', storage);
    };
  }, [bindUser]);

  useEffect(() => { if (authReady) load(); }, [authReady, load, user?.id]);

  const counts = useMemo(() => ({
    sources: list(snapshot, 'claims', 'sources').length,
    reviews: list(snapshot, 'clip_reviews', 'clips', 'candidates').length,
    cases: list(snapshot, 'cases', 'takedowns', 'reports').length,
  }), [snapshot]);

  const signedOut = authReady && !user;
  return <div className={styles.stage} data-mode={mode}>
    <VideoLibraryConsole
      titleAs="h1"
      eyebrow={admin ? 'Trust And Safety Operations' : 'Creator Rights Network'}
      title={admin ? 'Rights Moderation' : 'Creator Studio'}
      titleId="video-rights-console-title"
      subtitle={admin ? 'Claims, Evidence, Reports, Revocations, And Global Takedowns' : 'Claim Sources, Submit Masters, Review Clips, And Control Attribution'}
      pill={loading ? 'Synchronizing' : mutating ? 'Committing' : error ? 'Attention Required' : 'Ledger Online'}
      pillInk={error ? 'red' : mutating ? 'gold' : 'green'}
      foot="plates"
      plates={{
        secondary: { label: admin ? 'Editorial Command' : 'My Reels', onClick: () => { window.location.href = admin ? '/hub/admin/video-editorial' : '/hub/reels/my-reels'; }, ink: 'silver' },
        primary: { label: 'Refresh Ledger', onClick: load, disabled: loading || mutating, ink: 'white' },
      }}
      aria-labelledby="video-rights-console-title"
    >
      <div className={styles.signalDeck}>
        <ConsoleDataRow label={admin ? 'Review Queue' : 'Source Claims'} value={counts.sources} valueInk="blue" />
        <ConsoleDataRow label="Clip Reviews" value={counts.reviews} valueInk="gold" />
        <ConsoleDataRow label="Rights Cases" value={counts.cases} valueInk={counts.cases ? 'red' : 'green'} />
      </div>
      <nav className={styles.tabs} aria-label={admin ? 'Rights moderation queues' : 'Creator rights sections'}>
        {tabs.map(([id, label], index) => <button type="button" key={id} aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}><span>{String(index + 1).padStart(2, '0')}</span>{label}</button>)}
      </nav>
      {error ? <div className={styles.alert} role="alert"><b>Console Signal Interrupted</b><span>{error}</span>{!signedOut ? <ActionButton onClick={load}>Retry Connection</ActionButton> : null}</div> : null}
      {signedOut ? <div className={styles.empty}><p>Sign in to open your account-bound creator rights ledger.</p><Link href={`/auth/login?redirect=${encodeURIComponent(admin ? '/hub/admin/video-rights-moderation' : '/hub/reels/creator')}`}>Sign In</Link></div>
        : loading && !snapshot ? <div className={styles.loading} role="status"><span /><span /><span /><p>Reading The Authoritative Rights Ledger</p></div>
          : snapshot ? admin
            ? <AdminPanel tab={tab} snapshot={snapshot} mutate={mutate} busy={mutating} />
            : <CreatorPanel tab={tab} snapshot={snapshot} mutate={mutate} busy={mutating} />
            : null}
    </VideoLibraryConsole>
  </div>;
}

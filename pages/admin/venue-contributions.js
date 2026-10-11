import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getSessionToken } from '../../src/lib/authUtils';
import { PokerNearMePanelShell } from '../../src/components/poker-near-me/PokerNearMeConsole';
import { ContributionButton, ContributionField, ContributionWriteState, useContributionWrite } from '../../src/components/poker-near-me/VenueContributions';
import { readContributionJson } from '../../src/components/poker-near-me/venueContributionClient.mjs';
import styles from '../../src/components/poker-near-me/VenueContributions.module.css';

export default function VenueContributionReview() {
  const router = useRouter();
  const venueFilter = typeof router.query.venue_id === 'string' && /^[1-9][0-9]*$/.test(router.query.venue_id) ? router.query.venue_id : '';
  const [queue, setQueue] = useState({ claims: [], corrections: [], has_more: false });
  const [status, setStatus] = useState('pending');
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [reason, setReason] = useState('');
  const [source, setSource] = useState('');
  const [action, setAction] = useState('reject');
  const sequence = useRef(0);

  const load = useCallback(async () => {
    const current = ++sequence.current;
    setLoading(true); setError('');
    setQueue({ claims: [], corrections: [], has_more: false });
    setSelected(null);
    const token = getSessionToken();
    if (!token) { setLoading(false); setError('Sign in with a staff account to read venue contributions.'); return; }
    try {
      const response = await fetch(`/api/admin/venue-contributions?status=${encodeURIComponent(status)}&offset=${offset}${venueFilter ? `&venue_id=${venueFilter}` : ''}`, {
        credentials: 'include', cache: 'no-store', headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await readContributionJson(response);
      if (current !== sequence.current) return;
      setQueue({ claims: payload.claims || [], corrections: payload.corrections || [], has_more: payload.has_more === true });
      setSelected(null); setSource(''); setReason('');
    } catch (failure) { if (current === sequence.current) setError(failure.message || 'The review queue could not be read.'); }
    finally { if (current === sequence.current) setLoading(false); }
  }, [offset, status, venueFilter]);

  useEffect(() => { load(); return () => { sequence.current++; }; }, [load]);
  const writer = useContributionWrite('staff-venue-review', load);
  const blocked = loading || writer.busy || Boolean(writer.pending);
  const items = [...queue.claims.map((row) => ({ ...row, kind: 'claim' })), ...queue.corrections.map((row) => ({ ...row, kind: 'correction' }))];

  function select(item) {
    setSelected(item); setReason(''); setSource(item.submitted_source_url || item.source_url || '');
    setAction(item.status === 'approved' ? 'revoke' : item.kind === 'claim' ? 'approve' : 'apply');
  }

  return <div className={styles.page}>
    <Head><title>Venue Contribution Review | Smarter Poker</title><meta name="robots" content="noindex,nofollow" /></Head>
    <main className={styles.main}>
      <PokerNearMePanelShell as="header" className={styles.surface} bodyClassName={styles.body}>
        <h1 className={styles.title}>Venue Contribution Review</h1>
        <p className={styles.copy}>Review Sourced Ownership Claims And Venue Corrections. Staff Authorization And The Platform MFA Challenge Are Required For Queue Access And Every Decision. Applying A Correction Uses The Authoritative Venue-Integrity Transaction.</p>
        <div className={styles.actions}><Link className={styles.button} href="/admin/venue-integrity">Venue Integrity</Link><Link className={styles.button} href="/hub/poker-near-me/lobby">Poker Near Me</Link><Link className={styles.button} href="/auth/login?redirect=%2Fadmin%2Fvenue-contributions">Staff Sign In</Link></div>
        <ContributionField label="Queue Status"><select className={styles.control} value={status} disabled={writer.busy || Boolean(writer.pending)} onChange={(event) => { setStatus(event.target.value); setOffset(0); }}><option value="pending">Awaiting Review</option><option value="approved">Approved Claims</option><option value="applied">Applied Corrections</option><option value="rejected">Rejected</option><option value="revoked">Revoked Claims</option><option value="all">All Contributions</option></select></ContributionField>
        <ContributionWriteState writer={writer} />
        {loading && <p role="status" className={styles.notice}>Reading The Private Review Queue...</p>}
        {error && <p role="alert" className={`${styles.notice} ${styles.error}`}>{error} Complete The Admin MFA Challenge If Requested, Then Retry.</p>}
        <ContributionButton disabled={blocked} onClick={load}>Refresh Queue</ContributionButton>
      </PokerNearMePanelShell>
      {!loading && !error && items.length === 0 && <PokerNearMePanelShell as="section" className={styles.surface} bodyClassName={styles.body}><h2 className={styles.title}>No Contributions In This Queue</h2><p className={styles.copy}>Choose Another Status To Review Earlier Decisions.</p></PokerNearMePanelShell>}
      {!error && <div className={styles.queue}>{items.map((item) => <PokerNearMePanelShell key={`${item.kind}:${item.id}`} className={styles.surface} bodyClassName={styles.body}>
        <h2 className={styles.title}>{item.kind === 'claim' ? 'Venue Management Claim' : 'Venue Correction'}</h2>
        <div className={styles.receipt}><span>Venue: <Link className={styles.link} href={`/hub/venues/${item.venue_id}`}>{item.venue_id}</Link></span><span>Status: {item.status}</span><span>Receipt: {item.id}</span><span>Revision: {item.updated_at || 'Unavailable'}</span>
          {item.kind === 'claim' ? <><span>Contact: {item.claimant_name || item.contact_name}</span><span>Claimant Role: {item.claimant_title || item.role || 'Not Provided'}</span><span>Email: {item.claimant_email || item.contact_email}</span>{(item.claimant_phone || item.contact_phone) && <span>Phone: {item.claimant_phone || item.contact_phone}</span>}<span>Submitted Evidence URL: {item.submitted_source_url || 'Not Provided'}</span><span>Evidence: {item.claimant_notes || item.notes || 'No Evidence Notes Recorded'}</span></> : <><span>Category: {item.category}</span><span>Evidence Source: {item.source_url}</span><span>Explanation: {item.notes}</span><pre className={styles.proposal}>{JSON.stringify(item.proposal, null, 2)}</pre></>}
          {item.review_reason && <span>Review Reason: {item.review_reason}</span>}
        </div>
        {(['pending', 'under_review'].includes(item.status) || (item.kind === 'claim' && item.status === 'approved')) && <ContributionButton disabled={blocked || !item.updated_at} onClick={() => select(item)}>Review Contribution</ContributionButton>}
      </PokerNearMePanelShell>)}</div>}
      {!error && <div className={styles.actions}><ContributionButton disabled={blocked || offset === 0} onClick={() => setOffset((current) => Math.max(0, current - 50))}>Previous Results</ContributionButton><ContributionButton disabled={blocked || !queue.has_more} onClick={() => setOffset((current) => current + 50)}>Next Results</ContributionButton></div>}
      {selected && <PokerNearMePanelShell as="section" className={styles.surface} bodyClassName={styles.body}>
        <h2 className={styles.title}>Review Venue {selected.venue_id}</h2>
        <p className={styles.copy}>Confirm Independent Evidence Before Approving Or Applying. Rejection And Revocation Retain The Original Record And Audit Trail. A Stale Revision Is Refused, Not Silently Overwritten.</p>
        <form className={styles.form} onSubmit={(event) => { event.preventDefault(); writer.submit('/api/admin/venue-contributions', { kind: selected.kind, id: selected.id, payload: { action, reason, source_url: source, expected_updated_at: selected.updated_at } }); }}>
          <ContributionField label="Decision"><select className={styles.control} value={action} disabled={blocked} onChange={(event) => setAction(event.target.value)}>{selected.status === 'approved' ? <option value="revoke">Revoke This Claim</option> : <><option value={selected.kind === 'claim' ? 'approve' : 'apply'}>{selected.kind === 'claim' ? 'Approve Claim' : 'Apply Verified Correction'}</option><option value="reject">Reject Contribution</option></>}</select></ContributionField>
          <ContributionField label="Independent Verification Source URL"><input className={styles.control} type="url" required maxLength={1000} value={source} onChange={(event) => setSource(event.target.value)} disabled={blocked} /></ContributionField>
          <ContributionField label="Decision Reason"><textarea className={`${styles.control} ${styles.textarea}`} required minLength={12} maxLength={2000} value={reason} onChange={(event) => setReason(event.target.value)} disabled={blocked} /></ContributionField>
          <div className={styles.actions}><ContributionButton primary type="submit" disabled={blocked}>{writer.busy ? 'Recording Decision...' : 'Record Review Decision'}</ContributionButton><ContributionButton disabled={blocked} onClick={() => setSelected(null)}>Cancel Review</ContributionButton></div>
        </form>
      </PokerNearMePanelShell>}
    </main>
  </div>;
}

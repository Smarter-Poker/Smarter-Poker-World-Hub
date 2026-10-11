import { cloneElement, useCallback, useEffect, useId, useRef, useState } from 'react';
import { getAuthUser, getSessionToken } from '../../lib/authUtils';
import { PokerNearMePanelShell } from './PokerNearMeConsole';
import {
  contributionPendingKey, loadPendingContribution, newContributionOperationId,
  readContributionJson, readContributionOperation, savePendingContribution, sendContributionRequest,
} from './venueContributionClient.mjs';
import styles from './VenueContributions.module.css';

export function ContributionButton({ primary = false, className = '', ...props }) {
  return <button type="button" className={`${styles.button} ${primary ? styles.primary : ''} ${className}`} {...props} />;
}

export function ContributionField({ label, children }) {
  const id = useId();
  const control = cloneElement(children, { id });
  return <div className={styles.field}><label htmlFor={id}>{label}</label>{children.type === 'textarea'
    ? <PokerNearMePanelShell as="div" bodyClassName={styles.textareaBody}>{control}</PokerNearMePanelShell>
    : <span className={styles.well}>{control}</span>}</div>;
}

/** Account-scoped recovery is explicit. Never automatically replay an unknown write. */
export function useContributionWrite(context, onConfirmed) {
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [retryable, setRetryable] = useState(false);
  const keyRef = useRef(null);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const confirmedRef = useRef(onConfirmed);
  confirmedRef.current = onConfirmed;

  useEffect(() => {
    mounted.current = true;
    const restore = () => {
      keyRef.current = contributionPendingKey(getAuthUser()?.id, context);
      setError(''); setNotice(''); setRetryable(false);
      setPending(loadPendingContribution(sessionStorage, keyRef.current));
    };
    restore();
    const changed = (event) => { if (!event.key || event.key === 'smarter-poker-auth') restore(); };
    window.addEventListener('storage', changed);
    return () => { mounted.current = false; window.removeEventListener('storage', changed); };
  }, [context]);

  const finish = useCallback(async (receipt, request) => {
    const key = contributionPendingKey(request.account_id, request.context);
    if (key) sessionStorage.removeItem(key);
    if (!mounted.current || keyRef.current !== key || getAuthUser()?.id !== request.account_id) return;
    setPending(null);
    setRetryable(false);
    setError('');
    setNotice(`Request ${receipt.operation_id} was recorded. Its current status is shown below.`);
    await confirmedRef.current?.(receipt);
  }, []);

  const submit = useCallback(async (url, body, method = 'POST') => {
    if (inFlight.current || pending) return;
    const token = getSessionToken();
    if (!token) { setError('Sign in before submitting a venue contribution.'); return; }
    const key = contributionPendingKey(getAuthUser()?.id, context);
    if (!key) { setError('Your account identity could not be read. Sign in again before submitting.'); return; }
    keyRef.current = key;
    let request;
    try { request = { url, method, account_id: getAuthUser().id, context, body: { ...body, operation_id: newContributionOperationId() } }; }
    catch (failure) { setError(failure.message); return; }
    // Persist the operation identity before the write, never any token.
    try { savePendingContribution(sessionStorage, keyRef.current, request); }
    catch (_) { setError('This browser cannot retain the request receipt. Enable session storage before submitting.'); return; }
    inFlight.current = true; setBusy(true); setError(''); setNotice(''); setRetryable(false);
    try {
      const receipt = await sendContributionRequest(request, token);
      await finish(receipt, request);
    } catch (failure) {
      if (!mounted.current || keyRef.current !== key || getAuthUser()?.id !== request.account_id) return;
      if (failure.confirmedRefusal) {
        if (keyRef.current) sessionStorage.removeItem(keyRef.current);
        setError(failure.message);
      } else {
        setPending(request);
        setError('The result is not confirmed. Check the original request before submitting anything else.');
      }
    } finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  }, [context, finish, pending]);

  const check = useCallback(async () => {
    if (!pending || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError('');
    try {
      const receipt = await readContributionOperation(pending.body.operation_id, getSessionToken());
      if (receipt) await finish(receipt, pending);
      else { setRetryable(true); setError('No committed receipt was found. You may retry only the original request, with its unchanged ID and details.'); }
    } catch (failure) { setError(failure.message || 'The original request could not be checked.'); }
    finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  }, [finish, pending]);

  const retryOriginal = useCallback(async () => {
    if (!pending || !retryable || inFlight.current || getAuthUser()?.id !== pending.account_id) return;
    inFlight.current = true; setBusy(true); setError(''); setRetryable(false);
    try { await finish(await sendContributionRequest(pending, getSessionToken()), pending); }
    catch (failure) { setError(failure.message || 'The original request is still unconfirmed. Check its status again.'); }
    finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  }, [finish, pending, retryable]);

  return { busy, pending, error, notice, submit, check, retryable, retryOriginal };
}

export function ContributionWriteState({ writer }) {
  return <>
    {writer.error && <p role="alert" className={`${styles.notice} ${styles.error}`}>{writer.error}</p>}
    {writer.notice && <p role="status" className={styles.notice}>{writer.notice}</p>}
    {writer.pending && <div className={styles.receipt}>
      <span>Unconfirmed Request: {writer.pending.body.operation_id}</span>
      <ContributionButton onClick={writer.check} disabled={writer.busy}>Check Request Status</ContributionButton>
      {writer.retryable && <ContributionButton onClick={writer.retryOriginal} disabled={writer.busy}>Retry Original Request</ContributionButton>}
    </div>}
  </>;
}

const EMPTY_CLAIM = { contact_name: '', contact_email: '', contact_phone: '', role: 'manager', verification_notes: '', source_url: '' };
const CORRECTION_FIELDS = {
  details: [['name', 'Venue Name'], ['phone', 'Phone'], ['website', 'Website'], ['about', 'Description']],
  location: [['address', 'Street Address'], ['city', 'City'], ['state', 'State'], ['latitude', 'Latitude'], ['longitude', 'Longitude']],
  closure: [],
  schedule: [['game_name', 'Game Name'], ['start_time', 'Start Time'], ['end_time', 'End Time'], ['notes', 'Schedule Notes']],
};

function safeSource(value) {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; }
  catch (_) { return null; }
}

export default function VenueContributions({ venue, onAccessChange }) {
  const venueId = Number(venue.id);
  const [access, setAccess] = useState(null);
  const [loading, setLoading] = useState(true);
  const [readError, setReadError] = useState('');
  const [mode, setMode] = useState(null);
  const [claim, setClaim] = useState(EMPTY_CLAIM);
  const [category, setCategory] = useState('details');
  const [changes, setChanges] = useState({});
  const [source, setSource] = useState('');
  const [reason, setReason] = useState('');
  const [signedIn, setSignedIn] = useState(false);
  const sequence = useRef(0);
  const accessCallback = useRef(onAccessChange);
  accessCallback.current = onAccessChange;

  const load = useCallback(async () => {
    const current = ++sequence.current;
    const token = getSessionToken();
    setSignedIn(Boolean(token));
    setAccess(null); accessCallback.current?.(null);
    if (!token) { setLoading(false); setReadError(''); return; }
    setLoading(true); setReadError('');
    try {
      const response = await fetch(`/api/poker/venue-contributions?venue_id=${venueId}`, {
        cache: 'no-store', credentials: 'include', headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await readContributionJson(response);
      if (current !== sequence.current) return;
      if (!payload.access || Number(payload.access.venue_id) !== venueId) throw new Error('Venue permissions could not be confirmed.');
      setAccess(payload.access); accessCallback.current?.(payload.access);
    } catch (failure) { if (current === sequence.current) setReadError(failure.message || 'Venue permissions could not be loaded.'); }
    finally { if (current === sequence.current) setLoading(false); }
  }, [venueId]);

  useEffect(() => {
    load();
    const changed = (event) => { if (!event.key || event.key === 'smarter-poker-auth') load(); };
    window.addEventListener('storage', changed);
    return () => { sequence.current++; window.removeEventListener('storage', changed); };
  }, [load]);

  const writer = useContributionWrite(`venue:${venueId}`, async () => { setMode(null); setClaim(EMPTY_CLAIM); setChanges({}); setReason(''); setSource(''); await load(); });
  const ownClaim = access?.claim;
  const canSubmit = signedIn && !loading && !readError && !writer.busy && !writer.pending;
  const login = `/auth/login?redirect=${encodeURIComponent(`/hub/venues/${venueId}#venue-contributions`)}`;
  const revision = access?.revision || null;

  async function submitClaim(event) {
    event.preventDefault();
    await writer.submit('/api/poker/venue-contributions', { kind: 'claim', venue_id: venueId, payload: claim });
  }
  async function submitCorrection(event) {
    event.preventDefault();
    const proposal = Object.fromEntries(Object.entries(changes).filter(([, value]) => String(value).trim()));
    if (category === 'location') for (const field of ['latitude', 'longitude']) proposal[field] = Number(proposal[field]);
    if (category === 'schedule') { proposal.action = 'create'; proposal.day_of_week = proposal.day_of_week || 'monday'; }
    await writer.submit('/api/poker/venue-contributions', {
      kind: 'correction', venue_id: venueId,
      payload: { category, proposal, source_url: source, notes: reason, expected_revision: revision },
    });
  }

  return <PokerNearMePanelShell as="section" id="venue-contributions" className={styles.surface} bodyClassName={styles.body}>
    <h2 className={styles.title}>Keep This Venue Accurate</h2>
    <p className={styles.copy}>Share A Sourced Correction Or Request Venue-Management Access. Changes Stay Pending Until Reviewed. A Schedule Is A Published Plan, Not Proof Of Games Running Now.</p>
    <dl className={styles.essentials}>
      <dt>Website</dt><dd>{safeSource(venue.website) ? <a className={styles.link} href={safeSource(venue.website)} target="_blank" rel="noopener noreferrer">Venue Website</a> : 'Not Confirmed'}</dd>
      <dt>Phone</dt><dd>{venue.phone || 'Not Confirmed'}</dd>
      <dt>Directory Review</dt><dd>{venue.location_integrity_verified_at || venue.last_verified_at ? <time>{venue.location_integrity_verified_at || venue.last_verified_at}</time> : 'Verification Date Unavailable'}</dd>
      <dt>Management</dt><dd>{access?.is_claimed ? 'Venue Management Claim Approved' : 'Management Verification Not Confirmed'}</dd>
    </dl>
    {loading && <p role="status" className={styles.notice}>Reading Your Venue Permissions...</p>}
    {readError && <><p role="alert" className={`${styles.notice} ${styles.error}`}>{readError}</p><ContributionButton onClick={load}>Retry Permissions</ContributionButton></>}
    {!signedIn && !loading && <a className={`${styles.button} ${styles.primary}`} href={login}>Sign In To Contribute</a>}
    {ownClaim && <div className={styles.receipt}><strong>Your Claim: {ownClaim.status}</strong><span>Claim Receipt: {ownClaim.id}</span>{ownClaim.rejection_reason && <span>Review Note: {ownClaim.rejection_reason}</span>}</div>}
    {signedIn && <div className={styles.actions}>
      <ContributionButton disabled={!canSubmit} onClick={() => setMode('correction')}>Suggest A Correction</ContributionButton>
      <ContributionButton disabled={!canSubmit || ['pending', 'under_review', 'approved'].includes(ownClaim?.status)} onClick={() => setMode('claim')}>Claim This Venue</ContributionButton>
    </div>}
    <ContributionWriteState writer={writer} />
    {mode === 'claim' && <form className={styles.form} onSubmit={submitClaim}>
      <h3 className={styles.title}>Request Venue Access</h3>
      <p className={styles.copy}>Provide Evidence Of Your Association. No Verification Email Or Text Is Sent By This Form, And Submitting Does Not Grant Editing Access.</p>
      <div className={styles.grid}>
        {[['contact_name', 'Your Name', 'text', 120], ['contact_email', 'Contact Email', 'email', 254], ['contact_phone', 'Contact Phone', 'tel', 40], ['source_url', 'Verification Source URL', 'url', 1000]].map(([name, label, type, maxLength]) => <ContributionField key={name} label={label}><input className={styles.control} type={type} minLength={name === 'contact_name' ? 2 : undefined} maxLength={maxLength} required={name !== 'contact_phone'} value={claim[name]} onChange={(event) => setClaim({ ...claim, [name]: event.target.value })} /></ContributionField>)}
        <ContributionField label="Your Role"><select className={styles.control} value={claim.role} onChange={(event) => setClaim({ ...claim, role: event.target.value })}><option value="owner">Owner</option><option value="manager">Manager</option><option value="staff">Staff</option></select></ContributionField>
      </div>
      <ContributionField label="Verification Notes"><textarea className={`${styles.control} ${styles.textarea}`} required maxLength={2000} value={claim.verification_notes} onChange={(event) => setClaim({ ...claim, verification_notes: event.target.value })} /></ContributionField>
      <div className={styles.actions}><ContributionButton primary type="submit" disabled={!canSubmit}>{writer.busy ? 'Recording...' : 'Submit Claim'}</ContributionButton><ContributionButton disabled={writer.busy || Boolean(writer.pending)} onClick={() => setMode(null)}>Cancel</ContributionButton></div>
    </form>}
    {mode === 'correction' && <form className={styles.form} onSubmit={submitCorrection}>
      <h3 className={styles.title}>Suggest A Sourced Correction</h3>
      <ContributionField label="Correction Category"><select className={styles.control} value={category} onChange={(event) => { setCategory(event.target.value); setChanges(event.target.value === 'closure' ? { is_active: false } : {}); }}><option value="details">Venue Details</option><option value="location">Location</option><option value="closure">Opening Or Closure</option><option value="schedule">Recurring Schedule</option></select></ContributionField>
      {category === 'closure' && <ContributionField label="Proposed Venue Status"><select className={styles.control} value={String(changes.is_active)} onChange={(event) => setChanges({ is_active: event.target.value === 'true' })}><option value="false">No Longer Active</option><option value="true">Active</option></select></ContributionField>}
      {category === 'schedule' && <ContributionField label="Proposed Day"><select className={styles.control} value={changes.day_of_week || 'monday'} onChange={(event) => setChanges({ ...changes, day_of_week: event.target.value })}>{SCHEDULE_DAYS.map((day) => <option key={day} value={day}>{day[0].toUpperCase() + day.slice(1)}</option>)}</select></ContributionField>}
      <div className={styles.grid}>{CORRECTION_FIELDS[category].map(([name, label]) => <ContributionField key={name} label={`Proposed ${label}`}><input className={styles.control} type={name.endsWith('_time') ? 'time' : ['latitude', 'longitude'].includes(name) ? 'number' : 'text'} step={['latitude', 'longitude'].includes(name) ? 'any' : undefined} required={category === 'location' || (category === 'schedule' && name === 'game_name')} minLength={name === 'name' || name === 'game_name' ? 2 : undefined} maxLength={name === 'game_name' ? 120 : name === 'name' ? 200 : name === 'about' || name === 'notes' ? 2000 : 1000} value={changes[name] ?? ''} onChange={(event) => setChanges({ ...changes, [name]: event.target.value })} /></ContributionField>)}</div>
      <ContributionField label="Evidence Source URL"><input className={styles.control} type="url" required maxLength={1000} value={source} onChange={(event) => setSource(event.target.value)} /></ContributionField>
      <ContributionField label="Reason For The Correction"><textarea className={`${styles.control} ${styles.textarea}`} required maxLength={2000} value={reason} onChange={(event) => setReason(event.target.value)} /></ContributionField>
      <div className={styles.actions}><ContributionButton primary type="submit" disabled={!canSubmit || !revision || !Object.values(changes).some((value) => String(value).trim())}>{writer.busy ? 'Recording...' : 'Submit Correction'}</ContributionButton><ContributionButton disabled={writer.busy || Boolean(writer.pending)} onClick={() => setMode(null)}>Cancel</ContributionButton></div>
    </form>}
    {access?.corrections?.length > 0 && <><h3 className={styles.title}>Your Correction Requests</h3><ul className={styles.list}>{access.corrections.map((item) => <li className={styles.receipt} key={item.id}><strong>{item.category}: {item.status}</strong><span>Receipt: {item.id}</span>{item.review_reason && <span>Review Note: {item.review_reason}</span>}</li>)}</ul></>}
  </PokerNearMePanelShell>;
}

const SCHEDULE_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const EMPTY_SCHEDULE = { day_of_week: 'monday', game_name: '', start_time: '', end_time: '', notes: '', source_url: '' };

export function VenueScheduleEditor({ venueId, schedule, onChanged }) {
  const [form, setForm] = useState(EMPTY_SCHEDULE);
  const [editing, setEditing] = useState(null);
  const writer = useContributionWrite(`schedule:${venueId}`, async () => { setEditing(null); setForm(EMPTY_SCHEDULE); await onChanged(); });
  const entries = Object.values(schedule || {}).flat();
  const blocked = writer.busy || Boolean(writer.pending);
  const setField = (name, value) => setForm((current) => ({ ...current, [name]: value }));
  return <div className={styles.form}>
    <p className={styles.copy}>Publish A Sourced Recurring Schedule. These Entries Do Not Claim That A Table Is Currently Running. Times Use The Venue&apos;S Local Clock; An Earlier End Time Means The Following Day.</p>
    <ContributionWriteState writer={writer} />
    <ContributionField label="Schedule Source URL"><input className={styles.control} required type="url" maxLength={1000} value={form.source_url} onChange={(event) => setField('source_url', event.target.value)} /></ContributionField>
    <p className={styles.copy}>For Older Entries Without A Recorded Source, Provide A Source Above Before Removing Them.</p>
    {entries.length > 0 && <ul className={styles.list}>{entries.map((entry) => <li key={entry.id} className={styles.receipt}>
      <strong>{entry.day_of_week || SCHEDULE_DAYS.find((day) => schedule?.[day]?.includes(entry))}: {entry.game_name}</strong>
      {entry.source_url && safeSource(entry.source_url) && <a className={styles.link} href={safeSource(entry.source_url)} target="_blank" rel="noopener noreferrer">Schedule Source</a>}
      <span>Updated: {entry.updated_at || 'Revision Unavailable'}</span>
      <div className={styles.actions}>
        <ContributionButton disabled={blocked || !entry.updated_at} onClick={() => { setEditing(entry); setForm({ ...EMPTY_SCHEDULE, ...entry, day_of_week: entry.day_of_week || SCHEDULE_DAYS.find((day) => schedule?.[day]?.includes(entry)), start_time: entry.start_time || '', end_time: entry.end_time || '', notes: entry.notes || '', source_url: entry.source_url || '' }); }}>Edit Entry</ContributionButton>
        <ContributionButton disabled={blocked || !entry.updated_at || !safeSource(entry.source_url || form.source_url)} onClick={() => writer.submit('/api/poker/venue-schedules', { venue_id: Number(venueId), id: entry.id, expected_updated_at: entry.updated_at, source_url: entry.source_url || form.source_url, reason: 'Venue Manager Removed A Recurring Schedule Entry' }, 'DELETE')}>Remove Entry</ContributionButton>
      </div>
    </li>)}</ul>}
    <form className={styles.form} onSubmit={(event) => { event.preventDefault(); writer.submit('/api/poker/venue-schedules', { ...form, venue_id: Number(venueId), ...(editing ? { id: editing.id, expected_updated_at: editing.updated_at } : {}) }); }}>
      <h3 className={styles.title}>{editing ? 'Edit Schedule Entry' : 'Add Schedule Entry'}</h3>
      <div className={styles.grid}>
        <ContributionField label="Day"><select className={styles.control} value={form.day_of_week} onChange={(event) => setField('day_of_week', event.target.value)}>{SCHEDULE_DAYS.map((day) => <option key={day} value={day}>{day[0].toUpperCase() + day.slice(1)}</option>)}</select></ContributionField>
        <ContributionField label="Game"><input className={styles.control} required minLength={2} maxLength={120} value={form.game_name} onChange={(event) => setField('game_name', event.target.value)} /></ContributionField>
        <ContributionField label="Start Time"><input className={styles.control} type="time" value={form.start_time} onChange={(event) => setField('start_time', event.target.value)} /></ContributionField>
        <ContributionField label="End Time"><input className={styles.control} type="time" value={form.end_time} onChange={(event) => setField('end_time', event.target.value)} /></ContributionField>
      </div>
      <ContributionField label="Notes"><textarea className={`${styles.control} ${styles.textarea}`} maxLength={2000} value={form.notes} onChange={(event) => setField('notes', event.target.value)} /></ContributionField>
      <div className={styles.actions}><ContributionButton primary type="submit" disabled={blocked || !safeSource(form.source_url)}>{writer.busy ? 'Recording...' : editing ? 'Save Schedule Entry' : 'Add Schedule Entry'}</ContributionButton>{editing && <ContributionButton disabled={blocked} onClick={() => { setEditing(null); setForm(EMPTY_SCHEDULE); }}>Cancel Edit</ContributionButton>}</div>
    </form>
  </div>;
}
